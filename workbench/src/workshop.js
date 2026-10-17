import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import { createHearth } from "./hearth.js";
import { createForest } from "./forest.js";
import { railcarMaterial, boxProjection } from "./railcar-materials.js";

// The 1890 private railcar (workbench/scripts/railcar/export.py, manifest v2).
// Light is baked in Cycles: a denoised irradiance lightmap and an emission map
// per group, RGBM-encoded. Surfaces are not: each mesh is one Blender material,
// shaded from its source textures at full resolution (railcar-materials.js),
// so wood grain, damask, carpet and book spines stay as crisp as the renders.
const BASE = "../assets/railcar/export/";
const url = (name) => new URL(BASE + name, import.meta.url).href;
const GROUPS = ["architecture", "furnishings", "desk"];
// Calibrated against output/railcar/renders/r12-hero.png from the matching
// /?hero view (same camera, same AgX view LUT): measured region colours of the
// walls, wainscot, bookcase, curtains, desk front and leather agree within a
// few sRGB levels. The URL overrides exist for re-calibration after a rebake.
function tuning(name, fallback) {
  const raw = new URLSearchParams(globalThis.location?.search || "").get(name);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
// ?lm= Cycles diffuse bake → three lightMap. (π would be the textbook factor;
// the pure bake matches the render's walls at 0.7.)
export const LIGHTMAP_INTENSITY = tuning("lm", 0.7);
// ?env= reflection probe on the baked dielectrics. The probe is a neutral
// studio, not the dark car, so it is kept to a faint polish.
const ROOM_ENV = tuning("env", 0.08);
// ?probe= strength of the room's own reflection probe on car materials.
const ROOM_PROBE = tuning("probe", 1.0);
// ?varnish= share of the probe on non-metals (varnish, cloth, paper).
const ROOM_DIELECTRIC = tuning("varnish", 0.35);
// ?spec= live-light glints on the car away from the desk. The jewellery lights
// are aimed at the desk; at full strength they streak the velvet curtains and
// wainscot far more than Cycles does. The desk keeps full glints. The walls
// take none: the key light put a soft white highlight on the varnished panel
// between the windows that the Cycles render does not have.
const ROOM_SPECULAR = tuning("spec", 0.3);
const WALL_SPECULAR = tuning("wallspec", 0);

function dataTexture(loader, name) {
  return loader.loadAsync(url(name)).then((t) => {
    // Baked on glTF UVs: no flip, no colour transform, no mip blending
    // across the packed islands.
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    return t;
  });
}

function glassMaterial(source) {
  const n = source.name.toLowerCase();
  const spirit = /whisky|cognac/.test(n);
  const gin = /gin\b/.test(n);
  const gem = /gem|diamond|amethyst/.test(n);
  const tint = source.color ? source.color.clone() : new THREE.Color(1, 1, 1);
  // Cheap, honest glass: env reflection + tinted transparency, no extra
  // transmission render pass (which would cost a full scene redraw).
  if (spirit) {
    return new THREE.MeshStandardMaterial({
      name: source.name,
      color: tint.multiplyScalar(0.9),
      roughness: 0.03,
      metalness: 0,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 1.6,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
  }
  // Clear glass and stones have no diffuse body: lit as a tinted diffuser
  // (the old opacity blend) the desk lights turned the inkwells, lamp chimney
  // and papered diamonds solid white. Here the surface only adds its
  // reflections, and the scene behind is multiplied by the per-surface
  // transmittance (blendColor), so the black ink reads through the crystal.
  const body = gin ? tint.lerp(new THREE.Color(1, 1, 1), 0.3) : gem ? tint : tint.lerp(new THREE.Color(1, 1, 1), 0.6);
  // Rays cross two surfaces of a solid and four of a hollow vessel.
  const perSurface = gem ? 0.5 : 0.25;
  const material = new THREE.MeshStandardMaterial({
    name: source.name,
    color: "#000000",
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ConstantColorFactor,
  });
  material.blendColor.setRGB(body.r ** perSurface, body.g ** perSurface, body.b ** perSurface);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      "gl_FragColor = vec4(outgoingLight, 1.0);",
    );
  };
  material.customProgramCacheKey = () => "railcar-glass-v1";
  return material;
}

export async function buildWorkshop(scene, surfaces, renderer, host) {
  // Loading progress for the poster screen (GLTF + texture loaders share it).
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) =>
    host?.dispatchEvent(new CustomEvent("loadprogress", { detail: { loaded, total } }));
  const gltf = new GLTFLoader();
  const images = new THREE.TextureLoader();
  const manifest = await fetch(url("railcar-manifest.json")).then((r) => r.json());
  const [groups, glass, paintings, sky, windows] = await Promise.all([
    Promise.all(
      GROUPS.map(async (g) => {
        const info = manifest.groups[g];
        const [asset, light, emit] = await Promise.all([
          gltf.loadAsync(url(info.file)),
          dataTexture(images, info.light),
          dataTexture(images, info.emit),
        ]);
        return { g, info, asset, light, emit };
      }),
    ),
    gltf.loadAsync(url("railcar-glass.glb")),
    gltf.loadAsync(url("railcar-paintings.glb")),
    images.loadAsync(url(manifest.sky)).then((t) => {
      t.colorSpace = THREE.NoColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      return t;
    }),
    manifest.windows ? gltf.loadAsync(url(manifest.windows.file)) : null,
  ]);
  const roomMaterials = new Set();
  const deskMaterials = new Set();
  const textures = [];
  const cache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const car = new THREE.Group();
  car.name = "1890 private railcar — Cycles baked light, full-resolution materials";
  const room = manifest.room;
  const PROBE_AT = new THREE.Vector3(0, 2.2, 7);
  const box = boxProjection(
    PROBE_AT,
    new THREE.Vector3(room.x[0], room.floor, room.back_wall_z),
    new THREE.Vector3(room.x[1], room.ceiling, room.front_wall_z),
  );
  for (const { g, info, asset, light, emit } of groups) {
    textures.push(light, emit);
    const ctx = {
      base: new URL(BASE, import.meta.url).href,
      loader: images,
      cache,
      aniso: maxAniso,
      light,
      emit,
      rgbm: manifest.rgbmRange,
      lightIntensity: LIGHTMAP_INTENSITY,
      // Bind the probe explicitly: with scene.environment alone, three replaces
      // envMapIntensity by scene.environmentIntensity (0.55) on every material.
      envMap: surfaces.environment.texture,
      metalEnv: 0.55,
      roomEnv: ROOM_ENV,
      // Diffuse light is already in the bake: live lights may add glints
      // (specular) but must not light the room a second time.
      specular: g === "desk" ? 1 : g === "architecture" ? WALL_SPECULAR : ROOM_SPECULAR,
      box,
    };
    const made = new Map();
    asset.scene.traverse((o) => {
      if (!o.isMesh) return;
      const full = o.userData.name || o.parent?.userData.name || o.name;
      const matName = full.slice(full.indexOf("|") + 1);
      const spec = info.materials[matName];
      if (!spec) {
        console.warn("railcar: no material recipe for", full);
        return;
      }
      if (!made.has(matName)) made.set(matName, railcarMaterial(matName, spec, ctx));
      o.material?.dispose?.();
      o.material = made.get(matName);
      o.material.side = g === "architecture" ? THREE.DoubleSide : THREE.FrontSide;
      o.castShadow = false;
      o.receiveShadow = g === "desk";
      o.matrixAutoUpdate = false;
      o.updateMatrix();
      roomMaterials.add(o.material);
      if (g === "desk") deskMaterials.add(o.material);
    });
    car.add(asset.scene);
  }
  for (const t of cache.values()) textures.push(t);
  glass.scene.traverse((o) => {
    if (o.isMesh) {
      const old = o.material;
      o.material = glassMaterial(old);
      old.dispose();
      o.renderOrder = 2;
      o.castShadow = false;
    }
  });
  car.add(glass.scene);
  // Window glazing: reflection-only glass, so the sconces and the warm room
  // show faintly in the panes over the forest, as in the Cycles renders.
  windows?.scene.traverse((o) => {
    if (o.isMesh) {
      const old = o.material;
      o.material = glassMaterial(old);
      old.dispose();
      o.renderOrder = 2;
    }
  });
  if (windows) car.add(windows.scene);
  paintings.scene.traverse((o) => {
    if (o.isMesh && o.material.map) {
      const map = o.material.map;
      map.anisotropy = maxAniso;
      o.material.dispose();
      // Lit by their brass picture lights (baked into the frames); the canvas
      // keeps its full-resolution image instead of sharing the atlas.
      o.material = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(0.78, 0.7, 0.6) });
    }
  });
  car.add(paintings.scene);
  scene.add(car);

  textures.push(sky);
  const forest = createForest(scene, manifest.room, sky, manifest.rgbmRange);

  // Velvet working pad under the ring (live object, unchanged).
  const padMaterial = surfaces.velvet.clone();
  padMaterial.onBeforeCompile = surfaces.velvet.onBeforeCompile;
  padMaterial.customProgramCacheKey = surfaces.velvet.customProgramCacheKey;
  padMaterial.color.set("#d3c7ae");
  padMaterial.sheenColor.set("#ddccb0");
  padMaterial.sheen = 0.6;
  padMaterial.normalScale.set(0.12, 0.12);
  const shape = new THREE.Shape();
  const w = 1.35,
    d = 1.1,
    r = 0.18;
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.015,
    bevelSegments: 3,
    curveSegments: 8,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.Mesh(geo, padMaterial);
  mat.position.set(0, -1.39, 0.25);
  mat.receiveShadow = true;
  scene.add(mat);

  // Dusk through the windows: a dim, cool key for the live objects only.
  const sun = new THREE.DirectionalLight("#cfd8ff", 0.25);
  sun.position.set(-5, 6, -12);
  sun.target.position.set(0, -1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 0.5, far: 35 });
  sun.shadow.normalBias = 0.002;
  sun.shadow.bias = -0.0002;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);

  // Open fire on the left end bulkhead (live volume; its glow is baked).
  const fire = manifest.fire || [-25.0, -7.0, 8.5];
  const hearth = createHearth(scene, {
    position: new THREE.Vector3(fire[0] - 0.1, fire[1] - 1.05, fire[2]),
    rotationY: Math.PI / 2,
    scale: 1.45,
    props: false,
  });

  // Room probe: the car's own reflections. The studio probe (for the jewellery)
  // made mirrors, brass and varnish reflect a bright neutral studio; Cycles
  // reflects the dark panelled room. One cube capture at load from the middle
  // of the car, prefiltered for roughness, replaces it on every car material.
  const probeTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  const probe = new THREE.CubeCamera(0.1, 120, probeTarget);
  probe.position.copy(PROBE_AT);
  scene.add(probe);
  probe.update(renderer, scene);
  scene.remove(probe);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomProbe = pmrem.fromCubemap(probeTarget.texture).texture;
  pmrem.dispose();
  probeTarget.dispose();
  textures.push(roomProbe);
  // Metals, mirrors and gilt reflect it fully; for varnish and cloth a
  // single-point probe over-reflects (no parallax, no occlusion), so less.
  for (const m of roomMaterials) {
    m.envMap = roomProbe;
    m.envMapIntensity = (m.metalness > 0.5 || m.userData.metallic ? 1 : ROOM_DIELECTRIC) * ROOM_PROBE;
  }
  car.traverse((o) => {
    if (o.isMesh && o.renderOrder === 2 && o.material.envMap !== undefined) {
      const m = o.material;
      m.envMap = roomProbe;
      m.envMapIntensity = m.envMapIntensity > 1 ? 1.4 : 1;
      const previous = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        previous.call(m, shader, r);
        box.patch(shader);
      };
      const key = m.customProgramCacheKey.bind(m);
      m.customProgramCacheKey = () => key() + "|box";
      m.needsUpdate = true;
    }
  });

  if (new URLSearchParams(globalThis.location?.search || "").has("debug")) globalThis.__railcar = { car, scene, renderer };
  const focusTargets = new THREE.Group();
  scene.add(focusTargets);
  focusTargets.attach(car);
  return {
    mat,
    sun,
    focusTargets,
    room: manifest.room,
    needsAnimation: (camera) => hearth.needsAnimation(camera) || forest.needsAnimation(camera),
    causticReceivers: [mat.material, ...deskMaterials],
    animate(t, motion) {
      hearth.animate(t, motion);
      forest.animate(t, motion);
    },
    dispose() {
      for (const t of textures) t.dispose();
      forest.dispose();
      hearth.dispose();
    },
  };
}

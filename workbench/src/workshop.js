import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "../vendor/addons/loaders/HDRLoader.js";
import { createHearth } from "./hearth.js";
import { createForest } from "./forest.js";

// The 1890 private railcar. Everything static is baked in Cycles
// (workbench/scripts/railcar/export.py): a colour atlas in each GLB plus a
// denoised irradiance lightmap and an emission map per group. At runtime the
// whole car is ~40 lightmapped draw calls, so the frame budget stays with the
// live jewellery, the fire volume and the moving forest outside.
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
// ?spec= live-light glints on the car away from the desk. The jewellery lights
// are aimed at the desk; at full strength they streak the velvet curtains and
// wainscot far more than Cycles does. The desk keeps full glints.
const ROOM_SPECULAR = tuning("spec", 0.3);

function hdr(loader, name) {
  return loader.loadAsync(url(name)).then((t) => {
    t.flipY = false;
    t.channel = 0;
    t.mapping = THREE.UVMapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
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
  return new THREE.MeshStandardMaterial({
    name: source.name,
    color: spirit ? tint.multiplyScalar(0.9) : gem ? tint : tint.lerp(new THREE.Color(1, 1, 1), 0.6),
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: spirit ? 0.82 : gin ? 0.25 : gem ? 0.65 : 0.16,
    envMapIntensity: gem ? 2.2 : 1.6,
    depthWrite: spirit,
    side: THREE.DoubleSide,
  });
}

export async function buildWorkshop(scene, surfaces, renderer) {
  const gltf = new GLTFLoader();
  const hdrLoader = new HDRLoader();
  const manifest = await fetch(url("railcar-manifest.json")).then((r) => r.json());
  const [groups, glass, paintings] = await Promise.all([
    Promise.all(
      GROUPS.map(async (g) => {
        const [asset, light, emit] = await Promise.all([
          gltf.loadAsync(url(`railcar-${g}.glb`)),
          hdr(hdrLoader, `railcar-${g}-light.hdr`),
          hdr(hdrLoader, `railcar-${g}-emit.hdr`),
        ]);
        return { g, asset, light, emit };
      }),
    ),
    gltf.loadAsync(url("railcar-glass.glb")),
    gltf.loadAsync(url("railcar-paintings.glb")),
  ]);
  const roomMaterials = new Set();
  const textures = [];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const car = new THREE.Group();
  car.name = "1890 private railcar — Cycles baked lighting";
  for (const { g, asset, light, emit } of groups) {
    textures.push(light, emit);
    const specular = g === "desk" ? 1 : ROOM_SPECULAR;
    asset.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      m.lightMap = light;
      m.lightMapIntensity = LIGHTMAP_INTENSITY;
      m.emissive.set("#ffffff");
      m.emissiveMap = emit;
      m.emissiveIntensity = 1;
      // Metals and polish read through the reflection probe; diffuse light is baked.
      // Bind the probe explicitly: with scene.environment alone, three replaces
      // envMapIntensity by scene.environmentIntensity (0.55) on every material.
      m.envMap = surfaces.environment.texture;
      m.envMapIntensity = m.metalness > 0.5 ? 0.55 : ROOM_ENV;
      m.side = g === "architecture" ? THREE.DoubleSide : THREE.FrontSide;
      // Diffuse light is already in the bake: live lights may add glints
      // (specular) but must not light the room a second time.
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <lights_fragment_end>",
          // Env diffuse (iblIrradiance) is also already in the bake.
          "iblIrradiance = vec3(0.0);\n#include <lights_fragment_end>\n  reflectedLight.directDiffuse = vec3(0.0);\n" +
            `  reflectedLight.directSpecular *= ${specular.toFixed(3)};`,
        );
      };
      m.customProgramCacheKey = () => `railcar-baked-v3-${specular}`;
      if (m.map) m.map.anisotropy = maxAniso;
      o.castShadow = false;
      o.receiveShadow = g === "desk";
      o.matrixAutoUpdate = false;
      o.updateMatrix();
      roomMaterials.add(m);
    });
    car.add(asset.scene);
  }
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

  const forest = createForest(scene, manifest.room);

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

  const focusTargets = new THREE.Group();
  scene.add(focusTargets);
  focusTargets.attach(car);
  return {
    mat,
    sun,
    focusTargets,
    room: manifest.room,
    needsAnimation: (camera) => hearth.needsAnimation(camera) || forest.needsAnimation(camera),
    causticReceivers: [mat.material, ...roomMaterials],
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

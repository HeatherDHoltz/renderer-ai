import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import { createHearth } from "./hearth.js";
import { createNightForest } from "./night-forest.js";
import { railcarMaterial, boxProjection } from "./railcar-materials.js";
import { loadBakedRoom, renderRoute } from "./baked-room.js";
import { makeFacetMaterial, convexFacetHull } from "./gem-optics.js";
import { examinationLights, bindExaminationLights } from "./examination-light.js";
import { loadFloatResponse } from "./float-response.js";
import { loadRoomAsset } from "./room-asset.js";
import { assetStream } from "./asset-stream.js";
import { patchProbeOcclusion } from "./probe-occlusion.js";
import { createAreaCaseShadows } from "./area-case-shadows.js";
import { batchCaseShadows } from "./shadow-batch.js";
import { createRoomInteractions } from "./room-interactions.js";

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
// Neutral diffuse receivers store E/π; three's lightMap expects irradiance E.
// Rechecked against the matching r17 camera with reflections off: at π the
// apron is 25/4/0 vs Cycles 27/5/0, clock 29/5/0 vs 34/6/0. The clock uses
// its authored-scene subset rebake (see RAILCAR_REVIEW.md), not the merged bake.
export const LIGHTMAP_INTENSITY = tuning("lm", Math.PI);
// ?env= reflection probe on the baked dielectrics. The probe is a neutral
// studio, not the dark car, so it is kept to a faint polish.
const ROOM_ENV = tuning("env", 0.08);
// ?probe= strength of the room's own reflection probe on car materials.
const ROOM_PROBE = tuning("probe", 1.0);
// ?varnish= share of the probe on non-metals (varnish, cloth, paper).
// At 0.35 it greyed the varnished walls ~20 levels above r16; 0.12 keeps a polish.
const ROOM_DIELECTRIC = tuning("varnish", 0.12);
// ?spec= live-light glints on the car away from the desk. The jewellery lights
// are aimed at the desk; at full strength they streak the velvet curtains and
// wainscot far more than Cycles does. The desk keeps full glints. The walls
// take none: the key light put a soft white highlight on the varnished panel
// between the windows that the Cycles render does not have.
const ROOM_SPECULAR = tuning("spec", 0.3);
const WALL_SPECULAR = tuning("wallspec", 0);
// ?deskspec= live-light glints on the desk's metals (brass, nickel, gilt).
// Cycles' examination lamp never shows in reflections, so at full strength it
// laid a white glare on the desk rail (158 vs 139 sRGB, desaturated).
const DESK_SPECULAR = tuning("deskspec", 0.15);
// ?leatherspec= the leather top's sheen. Cycles' leather reads lighter and
// greyer than its green albedo because of its coat; 0.45 matches r16
// (70,80,68 vs 69,75,64).
const LEATHER_SPECULAR = tuning("leatherspec", 0.45);

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

function clockDoorMaterial(source) {
  // Keep the flat pane's attenuation without the probe's white streaks.
  // Two interfaces: each applies sqrt(tint) and the normal-incidence Fresnel
  // transmission. This is a thin-pane approximation, with no refraction or
  // reflected image; it does not need a transmission render pass.
  const ior = source.ior || 1.5;
  const fresnel = ((ior - 1) / (ior + 1)) ** 2;
  const material = new THREE.MeshBasicMaterial({
    name: source.name + " — transmission only",
    color: "#000000",
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.ConstantColorFactor,
  });
  material.blendColor.setRGB(
    Math.sqrt(source.color.r) * (1 - fresnel),
    Math.sqrt(source.color.g) * (1 - fresnel),
    Math.sqrt(source.color.b) * (1 - fresnel),
  );
  material.userData.transmissionOnly = true;
  return material;
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

async function roomJSON(name) {
  const stream = await assetStream(url(name));
  return new Response(name.endsWith('.gz') ? stream.pipeThrough(new DecompressionStream('gzip')) : stream).json();
}

export async function buildWorkshop(scene, surfaces, renderer, host) {
  // Browser-owned foreground is not part of the authored room's lighting.
  const foregroundForProbe = scene.children.filter(o=>!o.isLight);
  // Loading progress for the poster screen (GLTF + texture loaders share it).
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) =>
    host?.dispatchEvent(new CustomEvent("loadprogress", { detail: { loaded, total } }));
  const gltf = new GLTFLoader();
  const images = new THREE.TextureLoader();
  const manifestResponse = await fetch(url("railcar-manifest.json"));
  if (!manifestResponse.ok) throw new Error(`Room manifest: ${manifestResponse.status}`);
  const manifestText = await manifestResponse.text();
  const manifest = JSON.parse(manifestText);
  const manifestHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(manifestText)))]
    .map(v=>v.toString(16).padStart(2,'0')).join('');
  if (host) {host.dataset.roomManifest=manifestHash;host.dataset.roomSource=manifest.source?.sha256 || '';}
  const liveAuthoring = manifest.liveAuthoring
    ? await fetch(url(manifest.liveAuthoring)).then((r) => {
        if (!r.ok) throw new Error("Edited-room live material metadata could not load");
        return r.json();
      }) : null;
  const [groups, glass, paintings, sky, windows, interactionMetadata, interactiveProps, lampLighting] = await Promise.all([
    Promise.all(
      GROUPS.map(async (g) => {
        const info = manifest.groups[g];
        const [asset, light, emit] = await Promise.all([
          loadRoomAsset(gltf, url(info.file)),
          dataTexture(images, info.light),
          dataTexture(images, info.emit),
        ]);
        const responses = new Map(await Promise.all([...new Set(Object.values(info.materials)
          .map((m) => m.bakedResponse).filter(Boolean))].map(async (file) =>
            [file, await loadFloatResponse(url(file))])));
        return { g, info, asset, light, emit, responses };
      }),
    ),
    loadRoomAsset(gltf, url(manifest.glass?.file || "railcar-glass.glb")),
    gltf.loadAsync(url("railcar-paintings.glb")),
    null, // (exterior sky is drawn by night-forest.js)
    // Window glazing reflections read as white smudges over the forest; Heather
    // asked for no reflections that don't add anything. Kept in the export.
    null,
    roomJSON(manifest.interactions?.metadata || "railcar-interactions.json"),
    loadRoomAsset(gltf, url(manifest.interactions?.props || "railcar-interactive-props.glb")),
    fetch(url("student-lamp-lighting.json")).then(r => { if (!r.ok) throw new Error("Student lamp lighting missing"); return r.json(); }),
  ]);
  const probeOccluders = manifest.probeOccluders && tuning('probeocclusion', 1) > 0
    ? await fetch(url(manifest.probeOccluders)).then(r=>{
        if(!r.ok)throw new Error('Local reflection bounds could not load');
        return r.json();
      }) : null;
  const lampOn = { value: 1 }, fireBoost = { value: 0 };
  const lampMaps = new Map(await Promise.all(Object.entries(lampLighting).map(async ([g, v]) => [g, await dataTexture(images, v.file)])));
  const materialContexts = new Map(), movingMaterialCache = new Map();
  const roomMaterials = new Set();
  const additionalMaterials = new Set();
  const deskMaterials = new Set();
  const textures = [...lampMaps.values()];
  const cache = new Map();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const paintingInfo = manifest.paintingLighting
    ? await fetch(url(manifest.paintingLighting)).then((r) => {
      if (!r.ok) throw new Error(`Painting lighting: ${r.status}`);
      return r.json();
    }) : {};
  const paintingMaps = new Map(await Promise.all(Object.entries(paintingInfo)
    .map(async ([name, record]) => [name, await dataTexture(images, record.file)])));
  textures.push(...paintingMaps.values());
  const car = new THREE.Group();
  const baked = await loadBakedRoom(new URL(BASE, import.meta.url), gltf, images,
    manifest.appearance || (new URLSearchParams(globalThis.location?.search || "").get("room") === "cycles"
      ? "appearance/appearance.json" : null));
  if (baked) {
    car.add(baked.group);
    textures.push(...baked.textures);
  }
  car.name = "1890 private railcar — Cycles baked light, full-resolution materials";
  const room = manifest.room;
  const PROBE_AT = new THREE.Vector3(0, 2.2, 7);
  const DESK_PROBE_AT = new THREE.Vector3(0, 1.0, 1);
  const probeMin = new THREE.Vector3(room.x[0], room.floor, room.back_wall_z);
  const probeMax = new THREE.Vector3(room.x[1], room.ceiling, room.front_wall_z);
  const deskBox = boxProjection(DESK_PROBE_AT, probeMin, probeMax);
  const box = boxProjection(
    PROBE_AT,
    new THREE.Vector3(room.x[0], room.floor, room.back_wall_z),
    new THREE.Vector3(room.x[1], room.ceiling, room.front_wall_z),
  );
  for (const { g, info, asset, light, emit, responses } of groups) {
    textures.push(...responses.values());
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
      lightRange: info.lightRange ?? manifest.rgbmRange,
      // Source lighting already owns contrast. Default to an identity transfer;
      // the diagnostic override is retained for comparing earlier captures.
      shadowFloor: tuning("shadowfloor", 1),
      responses,
      interactive: { lampOn, fireBoost, lampMap: lampMaps.get(g), lampRange: lampLighting[g].range, firePosition: new THREE.Vector3(...(manifest.fire || [-25, -7, 8.5])).add(new THREE.Vector3(2.5,.6,0)) },
      roomEnv: ROOM_ENV,
      probeDielectric: ROOM_DIELECTRIC,
      // Diffuse light is already in the bake: live lights may add glints
      // (specular) but must not light the room a second time.
      specular: g === "desk" ? DESK_SPECULAR : g === "architecture" ? WALL_SPECULAR : ROOM_SPECULAR,
      // On the desk only metal catches the lamps' glints; leather keeps its sheen;
      // woodwork and paper take none (their glare is not in the Cycles render).
      specularFor: (name, kind, metallic) =>
        g !== "desk" ? null : /leather/.test(name) ? LEATHER_SPECULAR : metallic ? DESK_SPECULAR : 0,
      box: g === "desk" ? deskBox : box,
    };
    materialContexts.set(g, ctx);
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
      if (baked?.replacements.has(`${g}|${matName}`)) {
        o.visible = false;
        o.userData.renderRoute = "replaced_by_baked_room";
        return;
      }
      if (!made.has(matName)) made.set(matName, railcarMaterial(matName, spec, ctx));
      o.material?.dispose?.();
      o.material = made.get(matName);
      o.userData.renderRoute = renderRoute(matName, spec);
      o.material.userData.renderRoute = o.userData.renderRoute;
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
      const objectName = o.userData.name || o.name;
      if (/^inkwell[ _]/.test(objectName)) {
        // These vessels are beside the viewer: retain the source crystal IOR
        // and use actual scene transmission rather than an alpha overlay.
        o.material = new THREE.MeshPhysicalMaterial({
          name: old.name, color: old.color, roughness: old.roughness,
          metalness: 0, ior: old.ior || 1.56, transmission: 1,
          thickness: 0.18, attenuationDistance: Infinity,
          envMapIntensity: 0.35, side: THREE.DoubleSide,
        });
      } else o.material = /trunk[ _]door[ _]glass/.test(objectName)
        ? clockDoorMaterial(old) : glassMaterial(old);
      o.userData.renderRoute = o.material.userData.renderRoute = "live_glass";
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
      const materialName = o.material.name;
      const map = o.material.map;
      map.anisotropy = maxAniso;
      o.material.dispose();
      // Keep the full original painting image; multiply by its actual Cycles
      // illumination rather than treating it as a uniformly bright poster.
      const record = paintingInfo[materialName];
      const material = new THREE.MeshBasicMaterial({ map,
        color: record ? 0xffffff : new THREE.Color(0.12, 0.10, 0.08) });
      if (record) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.paintingLight = { value: paintingMaps.get(materialName) };
          shader.uniforms.paintingRange = { value: record.range };
          shader.fragmentShader = "uniform sampler2D paintingLight;\nuniform float paintingRange;\n" + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
            vec4 paintingIrradiance = texture2D(paintingLight, vMapUv);
            outgoingLight *= paintingIrradiance.rgb * paintingIrradiance.a * paintingRange;
            #include <opaque_fragment>`);
        };
        material.customProgramCacheKey = () => 'cycles-native-painting-light-v1';
      }
      o.material = material;
      additionalMaterials.add(material);
    }
  });
  car.add(paintings.scene);
  scene.add(car);

  // Night forest: four layers of real (Poly Haven) firs and pines passing
  // the windows; see night-forest.js.
  const forest = await createNightForest(scene, manifest.room, new URL(BASE, import.meta.url).href,
    new THREE.Vector3(0, 2.947605, 7.339474));
  // Velvet working pad under the ring (live object, unchanged).
  const padMaterial = surfaces.velvet.clone();
  padMaterial.onBeforeCompile = surfaces.velvet.onBeforeCompile;
  padMaterial.customProgramCacheKey = surfaces.velvet.customProgramCacheKey;
  padMaterial.color.set("#8a857d"); // dove grey; scene.setBackground() picks the swatch
  padMaterial.sheenColor.set("#b3ada3");
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
  if (probeOccluders) patchProbeOcclusion(roomMaterials, probeOccluders.boxes);
  const probeTarget = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
  const probe = new THREE.CubeCamera(0.1, 120, probeTarget);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hiddenForProbe = [...foregroundForProbe, mat];
  glass.scene.traverse(o=>{if(o.isMesh)hiddenForProbe.push(o)});
  car.traverse(o=>{if(o.isMesh&&/mirror/i.test(o.material?.name || ''))hiddenForProbe.push(o)});
  const visibility = hiddenForProbe.map(o=>o.visible);
  for(const o of hiddenForProbe)o.visible=false;
  // Capture baked room radiance without feeding studio/environment reflections
  // back into the probes. Source photographs and baked lamp emission remain.
  for(const m of roomMaterials)m.envMapIntensity=0;
  let roomProbe,deskProbe;
  try {
    probe.position.copy(PROBE_AT);scene.add(probe);probe.update(renderer,scene);
    roomProbe=pmrem.fromCubemap(probeTarget.texture).texture;
    probe.position.copy(DESK_PROBE_AT);probe.update(renderer,scene);
    deskProbe=pmrem.fromCubemap(probeTarget.texture).texture;
  } finally {
    hiddenForProbe.forEach((o,i)=>{o.visible=visibility[i]});scene.remove(probe);
  }
  pmrem.dispose();
  probeTarget.dispose();
  textures.push(roomProbe, deskProbe);
  // Metals, mirrors and gilt reflect it fully; for varnish and cloth a
  // single-point probe over-reflects (no parallax, no occlusion), so less.
  for (const m of roomMaterials) {
    m.envMap = deskMaterials.has(m) ? deskProbe : roomProbe;
    // A UV material's metalness=1 is a map multiplier, not proof every
    // pixel is metal. The shader blends dielectric/metal probe strength using
    // its actual sampled metalnessFactor (leather/carpet stay dielectric).
    m.envMapIntensity = ROOM_PROBE;
  }
  car.traverse((o) => {
    if (o.isMesh && o.renderOrder === 2 && !o.material.userData.transmissionOnly && o.material.envMap !== undefined) {
      const m = o.material;
      const center = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const nearDesk = Math.abs(center.x) < 9 && center.y > -2 && center.z > -6.5 && center.z < 4.8;
      m.envMap = nearDesk ? deskProbe : roomProbe;
      m.envMapIntensity = 0.35;
      const previous = m.onBeforeCompile;
      m.onBeforeCompile = (shader, r) => {
        previous.call(m, shader, r);
        (nearDesk ? deskBox : box).patch(shader);
      };
      const key = m.customProgramCacheKey.bind(m);
      m.customProgramCacheKey = () => key() + "|box";
      m.needsUpdate = true;
    }
  });

  const fixturesAt = (point) => [...interactionMetadata.fixtures].sort((a,b) =>
    new THREE.Vector3(...a.position).distanceToSquared(point) - new THREE.Vector3(...b.position).distanceToSquared(point)).slice(0,8);
  const interactions = createRoomInteractions({ car, props: interactiveProps.scene, metadata: interactionMetadata,
    lampUniform: lampOn, fireUniform: fireBoost, hearth,
    propMaterial(material) {
      if (material.name === 'gramophone rosewood') {
        const spec = { ...manifest.groups.desk.materials['Heather — balance warm rosewood'] };
        delete spec.bakedResponse; delete spec.bakedResponseMode;
        const m = railcarMaterial(material.name, spec, { ...materialContexts.get('desk'), live:true,
          liveLight:.42, envMap:roomProbe, metalEnv:.8, roomEnv:.2, specular:.12, box, fixtureSources:fixturesAt(new THREE.Vector3(-23,-1,-3.1)) });
        return m;
      }
      material.envMap = roomProbe;
      material.envMapIntensity = material.metalness > .5 ? .9 : .12;
      return null;
    },
    liveMaterial(material, objectName) {
      const g = objectName.startsWith('safe ') || objectName === 'globe' ? 'furnishings' : 'desk';
      const name = material.name, key = g + '|' + name;
      if (movingMaterialCache.has(key)) return movingMaterialCache.get(key);
      const recipe = manifest.groups[g].materials[name];
      if (!recipe) throw new Error('Missing moving material: ' + key);
      const spec = { ...recipe }; delete spec.bakedResponse; delete spec.bakedResponseMode;
      const materialContext = { ...materialContexts.get(g), live: true, liveLight: .42,
        envMap: g === 'desk' ? deskProbe : roomProbe, metalEnv: 1, roomEnv: .45, specular: .42,
        fixtureSources:fixturesAt(new THREE.Vector3(...interactionMetadata.objects[objectName].center)) };
      const moving = railcarMaterial(name, spec, materialContext);
      movingMaterialCache.set(key, moving); return moving;
    },
  });
  if (new URLSearchParams(globalThis.location?.search || "").has("debug")) globalThis.__railcar = { car, scene, renderer, manifest, manifestHash, interactions };
  const focusTargets = new THREE.Group();
  let areaCaseShadows;
  let caseShadowBatch;
  scene.add(focusTargets);
  focusTargets.attach(car);
  return {
    mat,
    sun,
    interactions,
    interactionTargets: interactions.targets,
    focusTargets,
    room: manifest.room,
    configureBench(objects, { environment, light, orbit }) {
      if (liveAuthoring?.cameraObstacles && orbit) orbit.obstacles = liveAuthoring.cameraObstacles;
      if (liveAuthoring?.wood) {
        const liveTextureCache = new Map();
        const wood = railcarMaterial("Heather's live case rosewood", liveAuthoring.wood, {
          base: new URL(BASE, import.meta.url).href, loader: images, cache: liveTextureCache,
          aniso: maxAniso, rgbm: manifest.rgbmRange, live: true, liveLight: 0.42,
          envMap: deskProbe, roomEnv: 0.42, metalEnv: 1, specular: 0.42, box: deskBox,
        });
        additionalMaterials.add(wood);
        textures.push(...liveTextureCache.values());
        for (const [id, entry] of Object.entries(objects.cases)) {
          const base = entry.root.getObjectByName(`${id} case base`);
          const old = base?.material;
          if (old) entry.root.traverse((o) => {
            if (o.isMesh && o.material === old) o.material = wood;
          });
          entry.root.traverse((o) => {
            if (o.isMesh && o.material !== wood && o.material.envMap !== undefined) {
              o.material.envMap = deskProbe;
              o.material.envMapIntensity = 1;
            }
          });
          const matrix = liveAuthoring.caseDelta?.[id];
          if (matrix) {
            entry.root.updateMatrix();
            entry.root.matrix.premultiply(new THREE.Matrix4().fromArray(matrix));
            entry.root.matrix.decompose(entry.root.position, entry.root.quaternion, entry.root.scale);
          }
        }
      }
      caseShadowBatch = batchCaseShadows(renderer, scene, { ...objects.cases, ...interactions.shadowRoots }, { enabled: tuning('shadowbatch', 1) > 0, spatial: tuning('casecull', 1) > 0 });
      if (tuning('caseshadows', 1) > 0) {
        areaCaseShadows = createAreaCaseShadows(renderer, caseShadowBatch, [mat.material, ...deskMaterials]);
        areaCaseShadows.update(true);
      }
      if (globalThis.__railcar) Object.assign(globalThis.__railcar, { areaCaseShadows, caseShadowBatch });
      // The small stones on Heather's diamond paper use the same twelve-bounce
      // optical renderer as the inspected gems, rather than transparent chips.
      glass.scene.traverse((o) => {
        if (!o.isMesh || !/loose[ _]brilliant|brilliant[ _]in[ _]tweezers/.test(o.name)) return;
        const old = o.material;
        // The authored stand-in has an internal cap at the girdle. Build its
        // closed outer boundary from the same vertices for solid ray tracing.
        const geometry = convexFacetHull(o.geometry);
        o.geometry.dispose();
        o.geometry = geometry;
        const material = makeFacetMaterial(o.geometry, environment);
        bindExaminationLights([material], examinationLights(light.position, false));
        o.material = material;
        o.layers.set(1);
        o.renderOrder = 0;
        o.userData.renderRoute = "custom_gem";
        o.onBeforeRender = (_renderer, _scene, camera) => material.userData.update(o, camera, light);
        additionalMaterials.add(material);
        old.dispose();
      });
    },
    needsAnimation: (camera) => interactions.needsAnimation(camera) || hearth.needsAnimation(camera) || forest.needsAnimation(camera),
    causticReceivers: [mat.material, ...deskMaterials],
    animate(t, motion, camera) {
      interactions.animate(t, motion, camera, renderer);
      const casesChanged = caseShadowBatch?.update();
      areaCaseShadows?.update(casesChanged);
      hearth.animate(t, motion);
      forest.animate(t, motion);
    },
    dispose() {
      interactions.dispose();
      areaCaseShadows?.dispose();
      caseShadowBatch?.dispose();
      for (const material of additionalMaterials) material.dispose();
      for (const t of textures) t.dispose();
      forest.dispose();
      hearth.dispose();
    },
  };
}

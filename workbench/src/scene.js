import { layerDepthGLSL } from "./layer-depth.js";
import { createGraphicsContext, graphicsOptions, WorkbenchStartupError } from "./startup.js";
import * as THREE from "../vendor/three.module.js";
import { RectAreaLightUniformsLib } from "../vendor/addons/lights/RectAreaLightUniformsLib.js";
import {
  readGemOBJ,
  solitaireGeometry,
  normalizeGem,
  inspectionFieldOfView,
  turnSpecimen,
  readSettingBinary,
} from "./geometry.js";

// Blender 5.2 "AgX - Medium High Contrast" view, baked by
// scripts/railcar/lut.py: log2-shaped scene-linear in, display sRGB out.
const VIEW_LUT = { size: 64, lo: -12.47393, hi: 12.5260688 };
async function loadViewLut() {
  const response = await fetch(
    new URL("../assets/railcar/agx-mhc-lut.bin", import.meta.url),
  );
  if (!response.ok) throw new Error(`View LUT: ${response.status}`);
  const n = VIEW_LUT.size;
  const lut = new THREE.Data3DTexture(
    new Uint8Array(await response.arrayBuffer()),
    n,
    n,
    n,
  );
  lut.format = THREE.RGBAFormat;
  lut.minFilter = lut.magFilter = THREE.LinearFilter;
  lut.wrapS = lut.wrapT = lut.wrapR = THREE.ClampToEdgeWrapping;
  lut.unpackAlignment = 1;
  lut.needsUpdate = true;
  return lut;
}

function tigerMaterial() {
  const uniforms = {
    fiberLight: { value: new THREE.Vector3(3, 4, 3) },
    fiberEye: { value: new THREE.Vector3(3, 3, 5) },
    fiberSoftness: { value: 0.024 },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: "#ae762b",
    // One polished dielectric boundary; a second glossy coat hid the fibers.
    roughness: 0.17,
    metalness: 0,
    clearcoat: 0,
    ior: 1.545,
    // Keep the dielectric body balance while the metal receives brighter cards.
    envMapIntensity: 0.39,
  });
  material.userData.fiberUniforms = uniforms;
  material.customProgramCacheKey = () => "jeweler-fiber-v1";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 stonePoint;
      varying vec3 stoneNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      stonePoint = position;
      stoneNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
      varying vec3 stonePoint;
      varying vec3 stoneNormal;
      uniform vec3 fiberLight;
      uniform vec3 fiberEye;
      uniform float fiberSoftness;
      float fiberSignal(float frequency, float coordinate) {
        float phase = frequency * coordinate;
        // Fade frequencies below pixel size to prevent moiré during orbit/zoom.
        return sin(phase) * (1.0-smoothstep(1.8,3.14,fwidth(phase)));
      }
      vec3 stoneColor(vec3 p) {
        float warp = p.x + 0.008*sin(p.z*7.0) + 0.002*sin(p.z*31.0 + p.x*11.0);
        float layers = 0.5 + 0.26*sin(warp*32.0) + 0.16*sin(warp*69.0 + 1.4);
        float threads = 0.5 + 0.34*fiberSignal(600.0,warp) + 0.15*fiberSignal(1500.0,warp + 0.0004*sin(p.z*40.0));
        float colorMix = clamp(layers * 0.68 + threads * 0.32, 0.0, 1.0);
        return mix(vec3(0.022,0.007,0.0015),vec3(0.32,0.145,0.028),colorMix);
      }
      float stoneBand(vec3 p, vec3 n) {
        vec3 viewDir = normalize(fiberEye-p);
        vec3 lightDir = normalize(fiberLight-p);
        vec3 halfDir = normalize(viewDir+lightDir);
        vec3 axis = normalize(vec3(0.015*cos(p.z*9.0),0.0,1.0));
        vec3 tangent = normalize(axis - n * dot(axis,n));
        vec3 across = normalize(cross(n,tangent));
        float nh = max(dot(n,halfDir),0.001);
        float along = dot(halfDir,tangent)/nh;
        float side = dot(halfDir,across)/nh;
        float band = exp(-along*along/fiberSoftness - side*side/0.8);
        float threads = 0.64 + 0.36*fiberSignal(800.0,p.x + 0.008*sin(p.z*10.0));
        return band * threads * smoothstep(0.0,0.35,dot(n,lightDir));
      }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = stoneColor(stonePoint);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // Effective directional scattering, intentionally not a volume simulation.
        totalEmissiveRadiance += vec3(0.85,0.49,0.12) * stoneBand(stonePoint,normalize(stoneNormal));`,
      );
  };
  return material;
}

import { loadSurfaces } from "./surfaces.js";
import { makeFacetMaterial, convexFacetHull } from "./gem-optics.js";
import {
  examinationLights,
  bindExaminationLights,
} from "./examination-light.js";
import { cachePointShadows } from "./point-shadow-cache.js";
import { createJewelryCache } from "./jewelry-cache.js";
import { createBloom } from "./bloom.js";
import { BenchOrbit } from "./orbit.js";
import { GEMS } from "./gems.js";
import { loadPreparedCuts } from "./prepared-cuts.js";
import { applyMetal } from "./metals.js";
import { specimenEnvironment } from "./reflections.js";
import { buildWorkshop, prepareWorkshop } from "./workshop.js";
import { prepareLightingWorkers } from "./float-response.js";
import { deliveryPlan } from "./room-details.js";
import { createCaustics } from "./caustics.js";
import { makeBenchObjects } from "./bench-objects.js";
import {
  ease,
  corridorPoint,
  loupeCorridor,
  advanceProgress,
  benchFraming,
  benchIntersections,
  LOUPE,
  eyepieceScale,
} from "./interaction.js";

export async function createWorkbench(host, onFatalError) {
  performance.mark("lj:startup");
  RectAreaLightUniformsLib.init();
  // Balanced rendering is now authorized: 25% fewer pixels along each axis.
  // ?scale=1 restores native pixels without changing geometry or gem optics.
  const scaleParam = Number(new URLSearchParams(location.search).get("scale"));
  const renderScale = scaleParam > 0 ? THREE.MathUtils.clamp(scaleParam, 0.5, 1) : 0.75;
  const aaParam = Number(new URLSearchParams(location.search).get("msaa"));
  const aaSamples = [1, 2, 4].includes(aaParam) ? aaParam : 4;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    // The screen pass is a full-screen quad; geometry AA lives in its targets.
    ...graphicsOptions,
    canvas,
    context: createGraphicsContext(canvas),
  });
  renderer.debug.onShaderError = () => onFatalError(
    new WorkbenchStartupError("shader-failed", "GPU material compilation failed"),
  );
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    onFatalError(new WorkbenchStartupError("graphics-interrupted", "Graphics context interrupted"));
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  // The post pass applies Blender's own view transform (AgX, Medium High
  // Contrast) from a baked LUT, so the browser grades like the Cycles renders.
  // Exposure is the renders' +1.1 stops; ?exp= overrides it (linear factor).
  const expParam = Number(new URLSearchParams(location.search).get("exp"));
  const viewExposure =
    Number.isFinite(expParam) && expParam > 0 ? expParam : 2 ** 1.1;
  await prepareLightingWorkers();
  const deliveryPromise=deliveryPlan();
  deliveryPromise.catch(()=>{});
  const cutsPromise = loadPreparedCuts();
  cutsPromise.catch(() => {});
  const viewLutPromise = loadViewLut();
  const surfacesPromise = loadSurfaces(renderer);
  const roomPreparation = prepareWorkshop(host, renderer.capabilities.getMaxAnisotropy(), renderer);
  // Attach rejection handlers immediately while independent startup work runs.
  surfacesPromise.catch(() => {});
  roomPreparation.catch(() => {});
  const viewLut = await viewLutPromise;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.transmissionResolutionScale = 0.75;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#120d0a");
  scene.fog = new THREE.Fog("#120d0a", 70, 160);
  const surfaces = await surfacesPromise;
  scene.environment = surfaces.environment.texture;
  scene.environmentIntensity = 0.55;
  const reflectionTarget = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
  });
  const reflectionCamera = new THREE.CubeCamera(0.04, 160, reflectionTarget);
  const reflectionGenerator = new THREE.PMREMGenerator(renderer);
  let reflectionFiltered = null,
    reflectionDirty = true,
    lastReflection = -Infinity,
    reflectionRevision = 0;
  // ?hero frames the bench exactly like output/railcar/renders/r12-hero.png
  // (Blender camera at the same seat, pitched 10° down) for lighting calibration.
  const heroView = new URLSearchParams(location.search).has("hero");
  // The regular orbit pivots on the centre of the live ring specimen.
  const benchTarget = heroView
    ? new THREE.Vector3(0, 2.6 - 6.6 * Math.tan(THREE.MathUtils.degToRad(10)), -0.2)
    : new THREE.Vector3(0, -1.08, 0.15);
  // Far plane reaches the Alps outside the windows (2.4 km of terrain at 10 cm units).
  const camera = new THREE.PerspectiveCamera(46, 1, 0.025, 3200);
  camera.position.set(0, 2.6, 6.4);
  camera.lookAt(benchTarget);
  camera.layers.enable(1);
  const inspectionCamera = new THREE.PerspectiveCamera(55 / 3, 1, 0.025, 180);
  inspectionCamera.position.set(0, 1.5, 2.7);
  inspectionCamera.lookAt(0, 0.55, 0.2);
  scene.add(inspectionCamera);
  const benchPosition = camera.position.clone();
  const benchQuaternion = camera.quaternion.clone();
  let benchFov = 46,
    orbitFov = 46;
  const orbit = new BenchOrbit(
    benchPosition,
    benchTarget,
  );
  let collectionReturn = null;
  // Lens shift for the seated view: the orbit still pivots on the ring, but the
  // frame is shifted up so the ring sits near the lower third and the window
  // wall (sill, curtains, sconces) is in view instead of the desk's front rail.
  // Eases to zero for case and loupe close-ups, whose framing is computed
  // for a centred lens; ?hero keeps the calibrated Cycles camera exactly.
  const shiftParam = Number(new URLSearchParams(location.search).get("shift"));
  const LENS_SHIFT = heroView ? 0 : Number.isFinite(shiftParam) && new URLSearchParams(location.search).has("shift") ? shiftParam : 0.15;
  let lensShift = LENS_SHIFT;
  let inspection = 0,
    inspectionDestination = 0,
    flight = null,
    hover = null,
    boxFlight = null,
    activeFocus = "desk",
    deskClose = false,
    pendingLoupe = false,
    pendingBox = null,
    surroundMix = 0;
  const metal = new THREE.MeshPhysicalMaterial({
    color: "#d5b374",
    metalness: 1,
    roughness: 0.14,
    anisotropy: 0.2,
    envMapIntensity: 1,
  });
  const spin = new THREE.Group(),
    root = new THREE.Group(),
    setting = new THREE.Group(),
    mount = new THREE.Group();
  spin.add(root);
  root.add(setting);
  setting.add(mount);
  scene.add(spin);
  const delivery=await deliveryPromise;
  const response = await Promise.all(
    ["cabochon.obj", delivery.ring?.initial || "solitaire-setting.mesh.gz", "solitaire-sample.obj"].map(
      async (name) => {
        const r = await fetch(new URL(`../assets/${name}`, import.meta.url));
        if (!r.ok) throw new Error("Jewelry mesh could not load");
        const decoded = name.endsWith(".gz")
          ? new Response(r.body.pipeThrough(new DecompressionStream("gzip"))) : r;
        return name.endsWith(".mesh.gz") ? decoded.arrayBuffer() : decoded.text();
      },
    ),
  );
  const shank = new THREE.BufferGeometry();
  let settingSource = readSettingBinary(response[1]);
  host.dataset.ringTriangles=String(settingSource.index.count/3);
  host.dataset.ringDetail=delivery.ring?'initial':'full';
  let ringDetailPromise;
  function requestRingDetail() {
    // The 123K band remains smooth even in the loupe. Keep the million-triangle
    // original as an explicit comparison: its fitting pass can stall animation.
    if(new URLSearchParams(location.search).get('ringdetail')!=='full')return;
    if(!delivery.ring || host.dataset.ringDetail==='ready' || ringDetailPromise)return;
    host.dataset.ringDetail='loading';
    ringDetailPromise=(async()=>{
      const r=await fetch(new URL('../assets/'+delivery.ring.detail,import.meta.url));
      if(!r.ok)throw new Error('Detailed ring could not load');
      const bytes=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const next=readSettingBinary(bytes);
      if(stopped){next.dispose();return;}
      settingSource.dispose();settingSource=next;
      updateMount();key.shadow.needsUpdate=true;workshop.sun.shadow.needsUpdate=true;
      jewelryDirty=true;invalidate();
      host.dataset.ringTriangles=String(next.index.count/3);host.dataset.ringDetail='ready';
    })().catch(()=>{host.dataset.ringDetail='retry';}).finally(()=>{ringDetailPromise=null;});
  }
  const band = new THREE.Mesh(shank, metal);
  band.castShadow = true;
  setting.add(band);
  const bandPick = new THREE.Mesh(
    new THREE.TorusGeometry(0.91, 0.12, 16, 80),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  setting.add(bandPick);
  const stone = new THREE.Mesh();
  stone.castShadow = true;
  root.add(stone);
  const cuts = await cutsPromise;
  const geometries = {
    tiger: normalizeGem(readGemOBJ(response[0], true), 1.38),
    shank: solitaireGeometry(response[2]),
  };
  for (const [id, gem] of Object.entries(GEMS))
    if (id !== "tiger") geometries[id] = cuts[gem.cut];
  const tiger = tigerMaterial();
  const materials = { tiger };
  for (const [id, gem] of Object.entries(GEMS))
    if (id !== "tiger")
      materials[id] = makeFacetMaterial(
        geometries[id],
        reflectionTarget.texture,
        gem,
      );
  const key = new THREE.PointLight("#fffefe", 100, 17, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00002;
  key.shadow.normalBias = 0.0015;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 17;
  key.shadow.autoUpdate = false;
  key.shadow.needsUpdate = true;
  scene.add(key);
  // The car itself is baked; these only light the live jewellery, cases and loupe.
  scene.add(new THREE.HemisphereLight("#e7ecf5", "#665549", 0.12));
  const benchBounce = new THREE.RectAreaLight("#fffaf4", 1.2, 7, 4);
  benchBounce.position.set(0, 2.0, 5);
  benchBounce.lookAt(0, -0.3, 0);
  scene.add(benchBounce);
  // Bright, neutral examination light over the cases so stone and metal colour read true.
  const collectionFill = new THREE.RectAreaLight("#fffaf2", 9, 8, 5);
  collectionFill.position.set(0, 5.5, 0.5);
  collectionFill.lookAt(0, -1, 0);
  scene.add(collectionFill);
  stone.onBeforeRender = (_r, _s, activeCamera) => {
    if (stone.material.userData.update) {
      stone.material.userData.update(stone, activeCamera, key);
      return;
    }
    if (stone.material !== tiger) return;
    stone.worldToLocal(
      tiger.userData.fiberUniforms.fiberEye.value.copy(
        activeCamera.getWorldPosition(new THREE.Vector3()),
      ),
    );
    stone.worldToLocal(
      tiger.userData.fiberUniforms.fiberLight.value.copy(key.position),
    );
  };
  let selectedGem = "tiger",
    selectedSetting = "ring",
    source = "penlight",
    angle = 45,
    height = 45,
    tool = "explore",
    auto = false,
    zoom = 3,
    selectedMetal = "gold",
    finishLevel = 14;
  const neutral = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.12, -0.3, 0),
  );
  spin.quaternion.copy(neutral);
  const support = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.21, 0.055, 96),
    surfaces.wood,
  );
  support.position.y = -1.35;
  support.receiveShadow = true;
  support.layers.set(1);
  support.layers.enable(2); // Also retain the support in specimen reflection captures.
  scene.add(support);
  const displayPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.11, 1, 24),
    metal,
  );
  displayPost.layers.set(1);
  displayPost.layers.enable(2);
  scene.add(displayPost);
  function updatePivot() {
    root.position.set(0, 0, 0);
    spin.scale.setScalar(0.24);
    spin.position.set(0, -1.08, 0.15);
    support.visible = true;
    support.position.y = selectedSetting === "loose" ? -1.3 : -1.35;
    displayPost.visible = false;
    displayPost.scale.y = Math.max(0.05, support.position.y - 0.075 + 1.35);
    displayPost.position.y = -1.35 + displayPost.scale.y / 2;
  }
  function updateMount() {
    for (const item of [...mount.children]) {
      mount.remove(item);
      item.geometry.dispose();
    }
    stone.geometry = geometries[selectedGem];
    stone.material = materials[selectedGem];
    const g = stone.geometry.boundingBox;
    // One continuous high-resolution solid replaces the old separate tubes.
    // The head deforms gently for each cut; the finger shank remains unchanged.
    const sx = g.max.x / 0.62,
      sz = g.max.z / 0.62;
    let girdle = 0.5332;
    const facets = materials[selectedGem].uniforms?.facets.value;
    if (facets) {
      const points = stone.geometry.attributes.position;
      let radius = 0,
        sum = 0,
        count = 0;
      for (let i = 0; i < points.count; i++)
        radius = Math.max(radius, Math.hypot(points.getX(i), points.getZ(i)));
      for (let i = 0; i < points.count; i++)
        if (Math.hypot(points.getX(i), points.getZ(i)) > radius * 0.995) {
          sum += points.getY(i);
          count++;
        }
      girdle = sum / count;
    }
    const next = solitaireGeometry(settingSource, (geometry) => {
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i),
          x = p.getX(i),
          z = p.getZ(i),
          blend = THREE.MathUtils.smoothstep(y, 0.6, 1.16);
        let fit = 1;
        // Step/cushion outlines extend beyond an ellipse at their corners.
        // Fit the entire connected head to the actual girdle support planes.
        if (facets && blend > 0) {
          const a = Math.atan2(z, x),
            ex = Math.cos(a) * sx,
            ez = Math.sin(a) * sz,
            ellipseRadius = Math.hypot(ex, ez),
            dx = ex / ellipseRadius,
            dz = ez / ellipseRadius;
          let radius = Infinity;
          for (const plane of facets) {
            const denominator = plane.x * dx + plane.z * dz;
            if (denominator > 1e-6)
              radius = Math.min(
                radius,
                -(plane.y * girdle + plane.w) / denominator,
              );
          }
          fit = radius / (0.62 * ellipseRadius);
        }
        p.setX(i, x * THREE.MathUtils.lerp(1, sx * fit, blend));
        p.setZ(i, z * THREE.MathUtils.lerp(1, sz * fit, blend));
        p.setY(
          i,
          y + (selectedGem === "tiger" ? -0.22 : girdle - 0.5332) * blend,
        );
      }
    });
    if (band.geometry !== shank) band.geometry.dispose();
    band.geometry = next;
    stone.position.set(0, selectedGem === "tiger" ? 0.98 : 0.7, 0);
    setting.visible = selectedSetting === "ring";
    if (selectedSetting === "loose") stone.position.y = 0.25 - g.max.y / 2;
    spin.traverse((o) => o.layers.set(1));
    reflectionDirty = true;
    updatePivot();
  }
  function updateLight() {
    reflectionDirty = true;
    key.position.set(
      THREE.MathUtils.clamp(angle / 100, -1, 1) * 3.2,
      2.1 + THREE.MathUtils.clamp((height - 8) / 77, 0, 1) * 1.7,
      1.2,
    );
    bindExaminationLights(
      Object.values(materials),
      examinationLights(key.position, source === "softbox"),
    );
    // Both modes retain geometric direct visibility. A shadowless rectangle
    // plus refracted photons would count the intercepted energy twice.
    key.intensity = source === "penlight" ? 100 : 65;
    key.shadow.radius = source === "softbox" ? 3 : 1;
    tiger.userData.fiberUniforms.fiberSoftness.value =
      source === "softbox" ? 0.11 : 0.014;
  }
  let objects,
    objectsMoving = false;
  performance.mark("lj:mount-start");
  updateMount();
  performance.measure("lj:initial-ring-fit", "lj:mount-start");
  updateLight();
  performance.mark("lj:workshop-start");
  const workshop = await buildWorkshop(scene, surfaces, renderer, host, roomPreparation, delivery);
  const onRoomDetail=()=>{reflectionDirty=true;jewelryDirty=true;invalidate();};
  host.addEventListener('roomdetail',onRoomDetail);
  performance.measure("lj:workshop-build", "lj:workshop-start");
  const caustics = createCaustics(renderer, workshop.causticReceivers, host);
  performance.mark("lj:bench-start");
  objects = makeBenchObjects(scene, geometries, materials, surfaces, key);
  workshop.configureBench(objects, { environment: reflectionTarget.texture, light: key, orbit });
  performance.measure("lj:bench-build", "lj:bench-start");
  const pointShadowCache = new URLSearchParams(location.search).get("shadowcache") !== "1"
    ? null : cachePointShadows(renderer, scene, key, spin);
  if (globalThis.__railcar) globalThis.__railcar.pointShadowCache = pointShadowCache;
  objects.select("gem", selectedGem);
  objects.select("metal", "gold");
  // Explicit opt-in diagnostics for matching Cycles/runtime poses in captures.
  if (globalThis.__railcar)
    Object.assign(globalThis.__railcar, { bench: objects, camera, orbit });
  const updateSpecimenEnvironment = specimenEnvironment(
    [metal, tiger, ...objects.reflectionMaterials],
    1.15,
  );
  function updateReflections(now) {
    if (!reflectionDirty || now - lastReflection < 100) return;
    scene.updateMatrixWorld(true);
    reflectionCamera.position.copy(
      stone.localToWorld(
        stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
      ),
    );
    reflectionCamera.update(renderer, scene);
    reflectionFiltered = reflectionGenerator.fromCubemap(
      reflectionTarget.texture,
      reflectionFiltered,
    );
    updateSpecimenEnvironment(reflectionFiltered.texture);
    key.shadow.needsUpdate = true;
    workshop.sun.shadow.needsUpdate = true;
    reflectionDirty = false;
    lastReflection = now;
    host.dataset.reflectionRevision = String(++reflectionRevision);
  }
  for (const [position, size, intensity] of [
    [[-3.8, 1.8, 4.2], [3.2, 3.8], 2.8],
    [[3.8, 0.6, 3.8], [2.7, 4], 2.2],
    [[0, 5, 2.2], [4.6, 2.3], 3.0],
  ]) {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(intensity, intensity * 0.96, intensity * 0.88),
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    card.position.set(...position);
    card.lookAt(0, -0.7, 0);
    card.layers.set(2);
    scene.add(card);
  }
  // Capture layers 0 and 2; the seated camera sees 0 and 1. Cards brighten metals
  // by reflecting actual white surfaces rather than adding emissive metal.
  reflectionCamera.layers.enable(2);
  reflectionDirty = true;
  const raycaster = new THREE.Raycaster();
  function pick(x, y) {
    if (boxFlight && boxFlight.progress < 1) return null;
    if (inspectionDestination || inspection > 0)
      return inspection === 1
        ? { kind: "jewelry", label: "Turn the stone · drag" }
        : null;
    scene.updateMatrixWorld(true);
    const hits = benchIntersections(raycaster, camera, x, y, [
      ...objects.targets,
      stone,
      ...(setting.visible ? [bandPick] : []),
      ...workshop.interactionTargets,
    ]);
    if (hits[0]) {
      const occluder = benchIntersections(raycaster, camera, x, y, [workshop.focusTargets])
        .find(h => h.object.material?.visible !== false);
      if (occluder && occluder.distance < hits[0].distance - .015 && occluder.object !== hits[0].object)
        return resolveAction(occluder.object.userData.action,occluder.point) || locationAction(occluder.point);
    }
    if (hits[0]?.object.userData.blockPointer) return null;
    if (!hits.length) {
      const surface=benchIntersections(raycaster,camera,x,y,[workshop.focusTargets,workshop.mat])
        .find(h=>h.object.material?.visible !== false);
      return surface ? locationAction(surface.point) : null;
    }
    return resolveAction(hits[0].object.userData.action || {kind:'jewelry',label:'Drag to turn the jewelry'},hits[0].point);

  }
  function resolveAction(action, point) {
    if (!action) return null;
    if (action.value === 'safe-door') action = workshop.interactions.state.safeGoal
      ? {kind:'room',value:'safe-control',label:'Push the safe door closed'}
      : {kind:'location',value:'safe',label:'Look at the safe'};
    if(action.value === 'weight-pan' && point) action=workshop.interactions.weightAt(point,'pan');
    if (!action) return null;
    let required;
    if (action.kind === 'room') required=({globe:'globe',poker:'fireplace','gramophone-tonearm':'gramophone','safe-control':'safe',lamp:'desk',cigar:'desk'})[action.value] || (action.value.startsWith('clock-') ? 'clock' : action.value.startsWith('weight-') ? 'desk' : null);
    else if (action.kind === 'gem') required='gems';
    else if (action.kind === 'metal') required='metals';
    else if (action.kind === 'jewelry' || action.kind === 'loupe') required='desk';
    if (required && activeFocus !== required) return {kind:'location',value:required,label:'Look at the '+({gems:'stone box',metals:'ring box'}[required] || required)};
    return action;
  }
  function locationAction(point) {
    if (activeFocus === 'desk') {
      const weight = workshop.interactions.weightAt(point);
      if (weight) return weight;
    }
    const id=workshop.interactions.locationAt(point);
    return id ? {kind:'location',value:id,label:`Look at ${id === 'desk' ? 'the desk' : 'the '+id}`} : null;
  }
  function releaseCollectionCamera() {
    if (!boxFlight) return;
    orbit.adopt(camera.position, boxFlight.center);
    orbitFov = camera.fov;
    boxFlight = null;
  }
  function focusBox(id) {
    const returning = !id;
    id = id || 'desk';
    if (!['desk','globe','gramophone','fireplace','safe','clock','gems','metals'].includes(id)) return;
    if (inspection > 0 || inspectionDestination) {
      pendingBox = returning ? 'home' : id;
      inspectionDestination = 0;
      invalidate();
      return;
    }
    const isCase = id === 'gems' || id === 'metals';
    workshop.details.request(id);
    if(id==='desk' && !returning)requestRingDetail();
    const view = id === 'desk' ? {position:returning ? benchPosition : benchPosition.clone().lerp(benchTarget,.22),quaternion:benchQuaternion,center:benchTarget,fov:benchFov}
      : isCase ? objects.boxView(id,camera.aspect) : workshop.interactions.locationView(id,camera.aspect);
    // Constrain the destination before flying, rather than snapping on the first orbit frame.
    view.position = orbit.constrainPosition(view.position.clone());
    const viewCamera = new THREE.PerspectiveCamera(); viewCamera.position.copy(view.position); viewCamera.lookAt(view.center);
    view.quaternion = viewCamera.quaternion.clone();
    activeFocus = id;
    deskClose = id === "desk" && !returning;
    host.dataset.focus = id;
    collectionReturn = null;
    boxFlight = {
      id,
      progress: 0,
      fromPosition: camera.position.clone(),
      fromQuaternion: camera.quaternion.clone(),
      fromFov: camera.fov,
      fromLensShift: lensShift,
      fov: view.fov || 40,
      position: view.position.clone(),
      quaternion: view.quaternion.clone(),
      center: view.center || new THREE.Vector3(0, 0.3, 0),
    };
    for (const [key, c] of Object.entries(objects.cases))
      if (c.destination !== (key === id ? 1 : 0))
        workshop.interactions.audio.sound('box', { group: `box-${key}` });
    objects.focusBox(isCase ? id : null);

    invalidate();
  }
  function prepareFlight() {
    orbit.adopt(camera.position, orbit.target);
    scene.updateMatrixWorld(true);
    const center = stone.localToWorld(
      stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
    );
    const position = center.clone().add(new THREE.Vector3(0, 0.285, 0.84));
    inspectionCamera.position.copy(position);
    inspectionCamera.lookAt(center);
    inspectionCamera.updateMatrixWorld(true);
    const eye = new THREE.Vector3(0, 0, -LOUPE.eyeDistance)
      .applyQuaternion(inspectionCamera.quaternion)
      .add(position);
    const bounds = new THREE.Box3().setFromObject(spin);
    flight = {
      center,
      position,
      quaternion: inspectionCamera.quaternion.clone(),
      points: loupeCorridor(objects.restPosition, eye, bounds),
      benchPosition: camera.position.clone(),
      benchQuaternion: camera.quaternion.clone(),
      benchFov: camera.fov,
    };
  }
  function updateCamera(dt) {
    if (inspection === 1 && inspectionDestination === 1 && flight) {
      const center = stone.localToWorld(
        stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
      );
      flight.center.lerp(center, 1 - Math.exp(-dt * 8));
      flight.position
        .copy(flight.center)
        .add(new THREE.Vector3(0, 0.285, 0.84));
      inspectionCamera.position.copy(flight.position);
      inspectionCamera.lookAt(flight.center);
      flight.quaternion.copy(inspectionCamera.quaternion);
      flight.points[flight.points.length - 1]
        .set(0, 0, -LOUPE.eyeDistance)
        .applyQuaternion(flight.quaternion)
        .add(flight.position);
    }
    if (boxFlight) {
      boxFlight.progress = advanceProgress(
        boxFlight.progress,
        1,
        dt,
        reduced.matches ? 0.55 : 1.4,
      );
      const t = ease(boxFlight.progress);
      camera.position.copy(boxFlight.fromPosition).lerp(boxFlight.position, t);
      camera.quaternion
        .copy(boxFlight.fromQuaternion)
        .slerp(boxFlight.quaternion, t);
      camera.fov = THREE.MathUtils.lerp(boxFlight.fromFov, boxFlight.fov, t);
      lensShift = THREE.MathUtils.lerp(boxFlight.fromLensShift, boxFlight.id === 'desk' ? LENS_SHIFT : 0, t);
      host.dataset.box = boxFlight.id || "returning";
      if (boxFlight.progress === 1) {
        orbit.station(camera.position, boxFlight.center);
        orbit.maxZoom = ['desk','fireplace'].includes(activeFocus) ? 2.25 : 1.25;
        orbitFov = boxFlight.fov;
        collectionReturn = null;
        boxFlight = null;
        host.dataset.box = activeFocus === 'gems' || activeFocus === 'metals' ? activeFocus : '';
        if (pendingLoupe) {
          pendingLoupe = false;
          prepareFlight();
          inspectionDestination = 1;
        }
      }
    } else if (inspection === 0 && inspectionDestination === 0) {
      orbit.update(camera, dt);
      camera.fov = orbitFov;
      lensShift = activeFocus === "desk" ? LENS_SHIFT : 0;
    } else if (flight) {
      // The tool visibly lifts first. The seated camera then leans toward it.
      const t = ease(THREE.MathUtils.clamp((inspection - 0.45) / 0.55, 0, 1));
      camera.position.copy(flight.benchPosition).lerp(flight.position, t);
      camera.quaternion
        .copy(flight.benchQuaternion)
        .slerp(flight.quaternion, t);
      camera.fov = THREE.MathUtils.lerp(
        flight.benchFov,
        inspectionFieldOfView(zoom),
        t,
      );
      lensShift = LENS_SHIFT * (1 - t);
    }
    if (lensShift > 1e-4 && width > 0 && heightPx > 0)
      camera.setViewOffset(width, heightPx, 0, -lensShift * heightPx, width, heightPx);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    if (flight) {
      const lens = objects.loupe;
      lens.position.copy(corridorPoint(flight.points, inspection));
      lens.quaternion
        .copy(objects.restQuaternion)
        .slerp(flight.quaternion, ease(inspection));
      const raised = ease(inspection);
      const size = THREE.MathUtils.lerp(
        LOUPE.restScale,
        eyepieceScale(inspectionFieldOfView(zoom), camera.aspect),
        raised,
      );
      lens.scale.set(
        size,
        size,
        THREE.MathUtils.lerp(LOUPE.restScale, LOUPE.depthScale, raised),
      );
      // Depth-only baffle: the magnified room behind the rim is never shaded.
      objects.baffleDepth.visible = inspection === 1;
      // The unmagnified surround fades in as the loupe reaches the eye.
      surroundMix = inspection > 0.88 ? ease((inspection - 0.88) / 0.12) : 0;
    } else surroundMix = 0;
    host.dataset.inspection = inspection.toFixed(3);
    host.dataset.viewYaw = orbit.spherical.theta.toFixed(4);
    host.dataset.viewRadius = orbit.spherical.radius.toFixed(4);
    host.dataset.viewTarget = orbit.target
      .toArray()
      .map((v) => v.toFixed(3))
      .join(",");
  }
  // Composite the native-resolution layers with depth occlusion before tone mapping.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(aaSamples, renderer.capabilities.maxSamples),
  });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const jewelryCache = createJewelryCache(renderer, scene, camera, target, { samples: aaSamples });
  const bloom = createBloom(renderer, {
    image: { value: target.texture },
    depthImage: { value: target.depthTexture },
    jewelry: { value: jewelryCache.texture },
    jewelryDepth: { value: jewelryCache.depth },
  });
  // ?bloom= strength of the glow around lamps, bulbs and fire (0 disables).
  const bloomParam = new URLSearchParams(location.search).get("bloom");
  const bloomStrength = bloomParam !== null && Number(bloomParam) >= 0 ? Number(bloomParam) : 0.05;
  let jewelryDirty = true;
  const blurSurround = new URLSearchParams(location.search).get("surround") === "blur";
  host.dataset.loupeSurround = blurSurround ? "blur" : "black";
  // Loupe surround: past the brass rim the eye sees the room unmagnified and
  // out of focus. A separate fixed-FOV render from the inspection eye is
  // blurred and cached; the post pass shows it wherever the loupe's baffle
  // mask is. Magnification changes only the main camera's FOV, so this
  // projection and its blur stay put while the lens interior zooms.
  const surroundCamera = new THREE.PerspectiveCamera(
    inspectionFieldOfView(1),
    1,
    0.025,
    3200,
  );
  // Include the unmagnified jewellery in the periphery; hide only the loupe
  // during this pass. Reflection cards (layer 2) remain invisible.
  surroundCamera.layers.set(0);
  surroundCamera.layers.enable(1);
  const surroundTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
  });
  // Coverage of the baffle (1) versus rim, body and aperture (0), multisampled
  // like the jewellery layer so the rim's silhouette blends cleanly.
  const surroundMask = new THREE.WebGLRenderTarget(1, 1, {
    samples: Math.min(aaSamples, renderer.capabilities.maxSamples),
  });
  const maskOpen = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    maskSolid = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
    });
  // Dual-filter blur; its depth follows the canvas height so the blur is a
  // constant fraction of the view at any pixel density.
  const BLUR_LEVELS = 7;
  const blurTarget = () =>
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  const blurDown = Array.from({ length: BLUR_LEVELS }, blurTarget),
    blurUp = Array.from({ length: BLUR_LEVELS - 1 }, blurTarget);
  let blurDepth = 2;
  const blurQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)),
    blurScene = new THREE.Scene();
  blurScene.add(blurQuad);
  const blurMaterial = (fragmentShader) =>
    new THREE.ShaderMaterial({
      uniforms: { source: { value: null }, texel: { value: new THREE.Vector2() } },
      vertexShader:
        "varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  const blurDownMaterial = blurMaterial(`uniform sampler2D source;uniform vec2 texel;varying vec2 vUV;
      void main(){vec3 c=texture2D(source,vUV).rgb*4.;
      c+=texture2D(source,vUV+texel*vec2(-1.,-1.)).rgb+texture2D(source,vUV+texel*vec2(1.,-1.)).rgb;
      c+=texture2D(source,vUV+texel*vec2(-1.,1.)).rgb+texture2D(source,vUV+texel*vec2(1.,1.)).rgb;
      gl_FragColor=vec4(c/8.,1.);}`);
  const blurUpMaterial = blurMaterial(`uniform sampler2D source;uniform vec2 texel;varying vec2 vUV;
      void main(){vec2 o=texel;
      vec3 c=texture2D(source,vUV+vec2(-2.*o.x,0.)).rgb+texture2D(source,vUV+vec2(2.*o.x,0.)).rgb;
      c+=texture2D(source,vUV+vec2(0.,2.*o.y)).rgb+texture2D(source,vUV+vec2(0.,-2.*o.y)).rgb;
      c+=(texture2D(source,vUV+o).rgb+texture2D(source,vUV-o).rgb+texture2D(source,vUV+vec2(o.x,-o.y)).rgb+texture2D(source,vUV+vec2(-o.x,o.y)).rgb)*2.;
      gl_FragColor=vec4(c/12.,1.);}`);
  function blurPass(material, source, target) {
    material.uniforms.source.value = source.texture;
    material.uniforms.texel.value.set(1 / source.width, 1 / source.height);
    blurQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(blurScene, postCamera);
  }
  function resizeSurround(w, h) {
    surroundMask.setSize(w, h);
    if (!blurSurround) {
      surroundTarget.setSize(1, 1);
      for (const t of [...blurDown, ...blurUp]) t.setSize(1, 1);
      surroundPose.length = 0;
      return;
    }
    surroundTarget.setSize(w, h);
    blurDepth = THREE.MathUtils.clamp(Math.round(Math.log2(h / 90)), 2, BLUR_LEVELS);
    let x = w,
      y = h;
    for (let i = 0; i < BLUR_LEVELS; i++) {
      x = Math.max(1, Math.round(x / 2));
      y = Math.max(1, Math.round(y / 2));
      blurDown[i].setSize(x, y);
      if (i < BLUR_LEVELS - 1) blurUp[i].setSize(x, y);
    }
    surroundPose.length = 0;
  }
  const surroundPose = [];
  let surroundAt = -Infinity,
    surroundRenders = 0;
  // Re-render only when the eye moves, the canvas resizes, or (at most 30 Hz)
  // when fire or forest are animating in view. Turning the stone and changing
  // magnification reuse the cached, blurred image.
  function renderSurround(now) {
    surroundCamera.position.copy(camera.position);
    surroundCamera.quaternion.copy(camera.quaternion);
    if (surroundCamera.aspect !== camera.aspect) {
      surroundCamera.aspect = camera.aspect;
      surroundCamera.updateProjectionMatrix();
    }
    if (camera.view?.enabled) {
      const v = camera.view;
      surroundCamera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    } else if (surroundCamera.view?.enabled) surroundCamera.clearViewOffset();
    surroundCamera.updateMatrixWorld(true);
    const pose = [
      ...surroundCamera.matrixWorld.elements,
      ...surroundCamera.projectionMatrix.elements,
    ];
    const posed =
      pose.length !== surroundPose.length ||
      pose.some((v, i) => Math.abs(v - surroundPose[i]) > 1e-5);
    const ambient =
      !reduced.matches &&
      now - surroundAt >= 1000 / 30 - 4 &&
      workshop.needsAnimation(surroundCamera);
    if (!posed && !ambient) return;
    surroundPose.splice(0, surroundPose.length, ...pose);
    surroundAt = now;
    renderer.setRenderTarget(surroundTarget);
    const loupeShown = objects.loupe.visible;
    objects.loupe.visible = false;
    try {
      renderer.render(scene, surroundCamera);
    } finally {
      objects.loupe.visible = loupeShown;
    }
    blurPass(blurDownMaterial, surroundTarget, blurDown[0]);
    for (let i = 1; i < blurDepth; i++)
      blurPass(blurDownMaterial, blurDown[i - 1], blurDown[i]);
    for (let i = blurDepth - 2; i >= 0; i--)
      blurPass(blurUpMaterial, i === blurDepth - 2 ? blurDown[blurDepth - 1] : blurUp[i + 1], blurUp[i]);
    host.dataset.surroundRenders = String(++surroundRenders);
  }
  // The loupe alone, with the baffle open and every brass/wood part solid.
  function renderSurroundMask() {
    const saved = [];
    objects.loupe.traverse((o) => {
      if (!o.isMesh) return;
      saved.push([o, o.material, o.visible]);
      if (o === objects.baffleDepth || o.material.visible === false)
        o.visible = false;
      else {
        o.material = o === objects.baffle ? maskOpen : maskSolid;
        if (o === objects.baffle) o.visible = true;
      }
    });
    const clear = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha();
    try {
      renderer.setClearColor(0, 1);
      renderer.setRenderTarget(surroundMask);
      renderer.render(objects.loupe, camera);
    } finally {
      for (const [o, material, shown] of saved) {
        o.material = material;
        o.visible = shown;
      }
      renderer.setClearColor(clear, alpha);
    }
  }
  const postScene = new THREE.Scene(),
    postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  postCamera.position.z = 1;
  const freezeGrain = new URLSearchParams(globalThis.location?.search || "").has("freezegrain");
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: target.texture },
      jewelry: { value: jewelryCache.texture },
      jewelryDepth: { value: jewelryCache.depth },
      depthImage: { value: target.depthTexture },
      viewLut: { value: viewLut },
      exposure: { value: viewExposure },
      bloom: { value: bloom.texture },
      bloomStrength: { value: bloomStrength },
      grainSeed: { value: 0 },
      surround: { value: blurUp[0].texture },
      surroundMask: { value: surroundMask.texture },
      surroundMix: { value: 0 },
      blackSurround: { value: blurSurround ? 0 : 1 },
    },
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
    vertexShader:
      "varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D image,depthImage,jewelry,jewelryDepth,bloom,surround,surroundMask;uniform highp sampler3D viewLut;uniform float exposure,bloomStrength,grainSeed,surroundMix,blackSurround;varying vec2 vUV;
      ${layerDepthGLSL}
      const float LO=${VIEW_LUT.lo},HI=${VIEW_LUT.hi},N=${VIEW_LUT.size}.;
      void main(){vec4 gem=texture2D(jewelry,vUV);float visible=layerVisibility(texture2D(jewelryDepth,vUV).r,texture2D(depthImage,vUV).r);
      vec3 color=texture2D(image,vUV).rgb*(1.-gem.a*visible)+gem.rgb*visible;
      if(surroundMix>0.)color=mix(color,blackSurround>.5?vec3(0.):texture2D(surround,vUV).rgb,texture2D(surroundMask,vUV).r*surroundMix);
      color+=texture2D(bloom,vUV).rgb*bloomStrength*(1.-texture2D(surroundMask,vUV).r*surroundMix);
      float vignette=1.-.12*pow(length((vUV-.5)*vec2(1.1,.85)),1.5);
      vec3 t=clamp((log2(max(color*vignette*exposure,vec3(exp2(LO))))-LO)/(HI-LO),0.,1.);
      vec3 display=texture(viewLut,(t*(N-1.)+.5)/N).rgb;
      // Fine film grain, strongest in the mid-tones, re-seeded per drawn frame.
      float g=fract(sin(dot(gl_FragCoord.xy+grainSeed,vec2(12.9898,78.233)))*43758.5453)-.5;
      display+=g*.018*(1.-abs(display*2.-1.));
      gl_FragColor=vec4(display,1.);
      }`,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));
  if (globalThis.__railcar) Object.assign(globalThis.__railcar, {
    surroundCamera, surroundTarget, surroundMask, blurredSurroundTarget: blurUp[0],
  });
  let width = 1,
    heightPx = 1,
    visible = true,
    stopped = false,
    scheduled = 0,
    lastDraw = 0,
    needsFrame = true,
    interactionUntil = 0,
    draws = 0,
    quality = "",
    ambientTimer = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function resize() {
    width = host.clientWidth;
    heightPx = host.clientHeight;
    if (width < 1 || heightPx < 1) return;
    setQuality(false, true);
    const framingPose = heroView
      ? { fov: 46, y: 2.6, z: 6.4 }
      : benchFraming(width / heightPx);
    benchFov = framingPose.fov;
    orbitFov = benchFov;
    benchPosition.set(0, framingPose.y, framingPose.z);
    const framing = new THREE.PerspectiveCamera();
    framing.position.copy(benchPosition);
    framing.lookAt(benchTarget);
    benchQuaternion.copy(framing.quaternion);
    if (flight) {
      flight.benchPosition.copy(benchPosition);
      flight.benchQuaternion.copy(benchQuaternion);
      flight.benchFov = benchFov;
    }
    if (collectionReturn) {
      collectionReturn.position.copy(benchPosition);
      collectionReturn.quaternion.copy(benchQuaternion);
      collectionReturn.center.copy(benchTarget);
      collectionReturn.fov = benchFov;
    }
    orbit.home(benchPosition, benchTarget);
    orbit.maxZoom = activeFocus === "desk" || activeFocus === "fireplace" ? 2.25 : 1.25;
    camera.aspect = width / heightPx;
    camera.fov = benchFov;
    camera.updateProjectionMatrix();
    inspectionCamera.aspect = width / heightPx;
    if (boxFlight || activeFocus !== "desk" || deskClose) focusBox(boxFlight?.id || activeFocus);
    updateOptics();
    invalidate();
  }
  function updateOptics() {
    inspectionCamera.fov = inspectionFieldOfView(zoom);
    inspectionCamera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    invalidate();
  });
  intersection.observe(host);
  function draw() {
    const surrounded = surroundMix > 0,
      maskDirty = jewelryDirty;
    if (surrounded && blurSurround) renderSurround(performance.now());
    // The room receives the specimen's live shadow and contains moving scenery.
    // Redraw it during every interaction as well as ambient animation.
    host.dataset.jewelryDraws = String(jewelryCache.render(jewelryDirty));
    host.dataset.roomRenders = String(jewelryCache.stats.roomRenders);
    host.dataset.roomReuses = String(jewelryCache.stats.roomReuses);
    jewelryDirty = false;
    // The mask follows the loupe exactly as the jewellery layer last drew it.
    if (surrounded && maskDirty) renderSurroundMask();
    postMaterial.uniforms.surroundMix.value = surroundMix;
    host.dataset.surround = surroundMix.toFixed(3);
    if (bloomStrength > 0) bloom.render();
    postMaterial.uniforms.grainSeed.value = freezeGrain ? 0 : (draws % 64) * 7.31;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
    host.dataset.draws = String(++draws);
  }
  function setQuality(moving, force = false) {
    const ratio = (devicePixelRatio || 1) * renderScale;
    if (!force && quality === ratio) return;
    quality = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, heightPx, false);
    target.setSize(Math.round(width * ratio), Math.round(heightPx * ratio));
    jewelryCache.resize(
      Math.round(width * ratio),
      Math.round(heightPx * ratio),
    );
    bloom.setSize(Math.round(width * ratio), Math.round(heightPx * ratio));
    resizeSurround(Math.round(width * ratio), Math.round(heightPx * ratio));
    jewelryDirty = true;
    host.dataset.renderQuality = renderScale === 1 ? "native" : "balanced";
    host.dataset.renderPixelRatio = String(ratio);
    needsFrame = true;
  }
  let fpsFrames = 0,
    fpsStart = performance.now(),
    fpsLabel = null;
  if (new URLSearchParams(location.search).has("fps")) {
    fpsLabel = document.createElement("div");
    fpsLabel.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:99;font:12px/1 ui-monospace,monospace;color:#f3e6c8;background:#0009;padding:4px 6px;border-radius:4px;pointer-events:none";
    document.body.append(fpsLabel);
  }
  function frame(now) {
    scheduled = 0;
    clearTimeout(ambientTimer);
    if (stopped || paused || !visible || document.hidden) return;
    const benchMoving = !boxFlight && inspection === 0 && orbit.moving;
    const aiming =
      inspection === 1 &&
      flight &&
      flight.center.distanceTo(
        stone.localToWorld(
          stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
        ),
      ) > 0.001;
    const moving =
      reflectionDirty ||
      workshop.interactions.moving ||
      aiming ||
      benchMoving ||
      auto ||
      objectsMoving ||
      (!inspectionDestination &&
        spin.position.distanceToSquared(new THREE.Vector3(0, -1.08, 0.15)) >
          1e-8) ||
      (boxFlight && boxFlight.progress < 1) ||
      Object.values(objects.cases).some((c) => c.progress !== c.destination) ||
      inspection !== inspectionDestination ||
      now < interactionUntil;
    setQuality(moving);
    // Ambient-only frames (fire, forest) hold 30 fps; interaction draws every vsync.
    const ambientOnly = !needsFrame && !moving && !objectsMoving && !caustics.settling;
    if (ambientOnly ? now - lastDraw > 1000 / 30 - 4 : needsFrame || now - lastDraw > 16) {
      if (auto && inspection === 0) {
        const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.min((now - lastDraw) / 1000, 0.1) * 0.22,
        );
        spin.quaternion.premultiply(q).normalize();
        key.shadow.needsUpdate = true;
        workshop.sun.shadow.needsUpdate = true;
      }
      const dt = Math.min((now - lastDraw) / 1000, 0.1);
      inspection = advanceProgress(
        inspection,
        inspectionDestination,
        dt,
        reduced.matches ? 0.65 : 2.4,
      );
      if (
        !inspectionDestination &&
        spin.position.distanceToSquared(new THREE.Vector3(0, -1.08, 0.15)) >
          1e-8
      ) {
        spin.position.lerp(
          new THREE.Vector3(0, -1.08, 0.15),
          1 - Math.exp(-dt * 8),
        );
        key.shadow.needsUpdate = true;
        workshop.sun.shadow.needsUpdate = true;
      }
      if (inspection === 0 && pendingBox) {
        const next = pendingBox;
        pendingBox = null;
        focusBox(next === "home" ? null : next);
      }
      if (moving || caustics.settling) jewelryDirty = true;
      updateCamera(dt);
      objectsMoving = objects.animate(dt, hover, !reduced.matches);
      if (
        boxFlight?.progress < 1 ||
        Object.values(objects.cases).some((c) => c.progress !== c.destination)
      ) {
        reflectionDirty = true;
        key.shadow.needsUpdate = true;
      }
      workshop.animate(now / 1000, !reduced.matches, camera);
      if (workshop.interactions.moving) {
        key.shadow.needsUpdate = true; workshop.sun.shadow.needsUpdate = true;
      }
      caustics.update(stone, key, source === "softbox", now);
      updateReflections(now);
      draw();
      needsFrame = false;
      lastDraw = now;
      // Frame-rate readout: data-fps on the host, and an overlay with ?fps.
      fpsFrames++;
      if (now - fpsStart >= 1000) {
        const fps = (fpsFrames * 1000) / (now - fpsStart);
        host.dataset.fps = fps.toFixed(1);
        if (fpsLabel) fpsLabel.textContent = `${fps.toFixed(0)} fps`;
        fpsFrames = 0;
        fpsStart = now;
      }
    }
    host.dataset.renderState =
      moving || objectsMoving || caustics.settling ? "settling" : "resting";
    if (moving || objectsMoving || caustics.settling) requestFrame();
    else if (!reduced.matches && workshop.needsAnimation(camera))
      // Wake a little before the 30 fps deadline: requestAnimationFrame then
      // lands on the next vsync. A full 33 ms timer plus the vsync wait gave 20 fps.
      ambientTimer = setTimeout(
        requestFrame,
        Math.max(0, lastDraw + 1000 / 30 - performance.now() - 8),
      );
  }
  function requestFrame() {
    if (!scheduled && !stopped) scheduled = requestAnimationFrame(frame);
  }
  function invalidate(shadows = true) {
    needsFrame = true;
    jewelryDirty = true;
    interactionUntil = performance.now() + 220;
    if (shadows) {
      key.shadow.needsUpdate = true;
      workshop.sun.shadow.needsUpdate = true;
    }
    requestFrame();
  }
  const wake = () => {
    if (!document.hidden) invalidate();
  };
  document.addEventListener("visibilitychange", wake);
  reduced.addEventListener("change", wake);
  performance.mark("lj:first-frame-start");
  resize();
  performance.measure("lj:first-frame", "lj:first-frame-start");
  performance.measure("lj:startup-through-first-frame", "lj:startup");
  let paused = false;
  return {
    renderer,
    scene,
    camera,
    inspectionCamera,
    pause(value) {
      paused = value;
      if (!value) invalidate();
    },
    setGem(value) {
      if (value === selectedGem) return;
      selectedGem = value;
      objects.select("gem", value);
      updateMount();
      invalidate();
    },
    setSetting(value) {
      if (value === selectedSetting) return;
      selectedSetting = value;
      updateMount();
      invalidate();
    },
    setMetal(value) {
      selectedMetal = value;
      applyMetal(metal, value, finishLevel);
      objects.select("metal", value, finishLevel);
      invalidate();
    },
    setFinish(value) {
      finishLevel = value;
      applyMetal(metal, selectedMetal, value);
      objects.select("metal", selectedMetal, value);
      invalidate();
    },
    setSource(value) {
      source = value;
      updateLight();
      invalidate();
    },
    setCaustics(value) {
      caustics.setEnabled(value);
      reflectionDirty = true;
      invalidate();
    },
    setLight(a, h) {
      angle = a;
      height = h;
      updateLight();
      invalidate();
    },
    setBackground(value) {
      reflectionDirty = true;
      // Dove grey is the default: ivory was the brightest large surface in the
      // frame, right behind the main stone. Ivory stays for grading colour.
      workshop.mat.material.color.set(
        { dove: "#8a857d", cream: "#d3c7ae", charcoal: "#242923" }[value] || "#31423a",
      );
      invalidate();
    },
    focusBox,
    focusLocation: focusBox,
    get focusState() { return { location:activeFocus, arrived:!boxFlight && inspection === 0, deskClose, pivot:orbit.target.toArray(), yawCenter:orbit.yawCenter }; },
    setTool(value) {
      if(value==='loupe')requestRingDetail();
      tool = value;
      if (boxFlight || collectionReturn || (["loupe","turn"].includes(value) && activeFocus !== "desk")) {
        pendingLoupe = value === "loupe";
        focusBox(null);
        return;
      }
      if (value === "loupe" && inspection === 0) prepareFlight();
      inspectionDestination = value === "loupe" ? 1 : 0;
      updateOptics();
      invalidate();
    },
    pick,
    activateRoom(id) {
      if (boxFlight || inspection || inspectionDestination) return 'Finish moving to the selected area first.';
      const location = ({safe:'safe',clock:'clock',gramophone:'gramophone',fireplace:'fireplace',globe:'globe',poker:'fireplace','gramophone-tonearm':'gramophone','safe-control':'safe',lamp:'desk',cigar:'desk'})[id] || (id.startsWith('clock-') ? 'clock' : id.startsWith('weight-') ? 'desk' : null);
      // Area selection and operation are separate clicks, including control shortcuts.
      if (['safe','clock','gramophone','fireplace','desk'].includes(id)) { focusBox(id === 'desk' ? null : id); return `Looking at the ${id}. Escape returns to the desk.`; }
      if (location && activeFocus !== location) { focusBox(location); return `Move to the ${location}, then click its control to interact.`; }
      const message = workshop.interactions.activate(id); reflectionDirty = true; invalidate(); return message;
    },
    setTrain(value) { workshop.interactions.audio.setTrain(value); },
    setSound(value) { workshop.interactions.audio.setEnabled(value); },
    unlockAudio() { workshop.interactions.audio.unlock(); },
    get roomState() { return workshop.interactions.state; },
    get deliveryState() { return {textures:workshop.details.state,ringTriangles:Number(host.dataset.ringTriangles),ringDetail:host.dataset.ringDetail}; },
    hover(action) {
      if (
        hover?.kind === action?.kind &&
        hover?.value === action?.value &&
        hover?.finish === action?.finish
      )
        return;
      hover = action;
      invalidate(false);
    },
    get transitioning() {
      return (
        inspection !== inspectionDestination ||
        !!(boxFlight && boxFlight.progress < 1)
      );
    },
    setLoupe(_x, _y, value) {
      if (zoom === value) return;
      zoom = value;
      updateOptics();
      invalidate();
    },
    setAutoTurn(value) {
      if (auto === value) return;
      auto = value;
      invalidate(false);
    },
    reset() {
      spin.quaternion.copy(neutral);
      orbit.home(benchPosition, benchTarget);
      orbit.maxZoom = 2.25;
      orbitFov = benchFov;
      collectionReturn = null;
      boxFlight = null;
      activeFocus = "desk"; deskClose = false; host.dataset.focus = "desk";
      pendingBox = null;
      pendingLoupe = false;
      for (const [key, c] of Object.entries(objects.cases))
        if (c.destination !== 0) workshop.interactions.audio.sound('box', { group: `box-${key}` });
      objects.focusBox(null);
      inspectionDestination = 0;
      if (flight) {
        flight.benchPosition.copy(benchPosition);
        flight.benchQuaternion.copy(benchQuaternion);
        flight.benchFov = benchFov;
      }
      host.dataset.box = "";
      updatePivot();
      invalidate();
    },
    rotate(dx, dy) {
      if (activeFocus !== "desk" && inspection === 0) return;
      if (inspection > 0 && inspection < 1) return;
      const center =
        inspection === 1
          ? stone.localToWorld(
              stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
            )
          : null;
      turnSpecimen(spin.quaternion, dx, dy);
      if (center) {
        scene.updateMatrixWorld(true);
        const next = stone.localToWorld(
          stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
        );
        spin.position.add(center.sub(next));
      }
      invalidate();
    },
    orbit(dx, dy) {
      if (
        inspection ||
        inspectionDestination ||
        (boxFlight && boxFlight.progress < 1)
      )
        return;
      releaseCollectionCamera();
      orbit.drag(dx, dy);
      invalidate(false);
    },
    zoom(factor) {
      if (inspection || inspectionDestination || boxFlight) return;
      orbit.zoom(factor);
      invalidate(false);
    },
    async photo() {
      setQuality(false);
      draw();
      return new Promise((resolve) =>
        renderer.domElement.toBlob(resolve, "image/png"),
      );
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(scheduled);
      clearTimeout(ambientTimer);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", wake);
      reduced.removeEventListener("change", wake);
      pointShadowCache?.dispose();
      workshop.dispose();
      host.removeEventListener('roomdetail',onRoomDetail);
      caustics.dispose();
      reflectionTarget.dispose();
      reflectionFiltered?.dispose();
      reflectionGenerator.dispose();
      surfaces.dispose();
      target.dispose();
      jewelryCache.dispose();
      postMaterial.dispose();
      for (const t of [surroundTarget, surroundMask, ...blurDown, ...blurUp])
        t.dispose();
      for (const m of [maskOpen, maskSolid, blurDownMaterial, blurUpMaterial])
        m.dispose();
      blurQuad.geometry.dispose();
      bloom.dispose();
      for (const material of Object.values(materials)) material.dispose();
      scene.traverse((o) => o.geometry?.dispose());
      settingSource.dispose();
      metal.dispose();
      renderer.dispose();
    },
  };
}

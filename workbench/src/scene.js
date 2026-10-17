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
import { createJewelryCache } from "./jewelry-cache.js";
import { BenchOrbit } from "./orbit.js";
import { GEMS } from "./gems.js";
import { cutGeometry } from "./cuts.js";
import { applyMetal } from "./metals.js";
import { specimenEnvironment } from "./reflections.js";
import { buildWorkshop } from "./workshop.js";
import { createCaustics } from "./caustics.js";
import { makeBenchObjects } from "./bench-objects.js";
import {
  ease,
  corridorPoint,
  loupeCorridor,
  advanceProgress,
  benchFraming,
  benchIntersections,
} from "./interaction.js";

export async function createWorkbench(host, onFatalError) {
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "default",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.transmissionResolutionScale = 0.75;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    onFatalError(new Error("Graphics context interrupted"));
  });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#120d0a");
  scene.fog = new THREE.Fog("#120d0a", 32, 65);
  const surfaces = await loadSurfaces(renderer);
  scene.environment = surfaces.environment.texture;
  scene.environmentIntensity = 0.55;
  const reflectionTarget = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
  });
  const reflectionCamera = new THREE.CubeCamera(0.04, 65, reflectionTarget);
  const reflectionGenerator = new THREE.PMREMGenerator(renderer);
  let reflectionFiltered = null,
    reflectionDirty = true,
    lastReflection = -Infinity,
    reflectionRevision = 0;
  const camera = new THREE.PerspectiveCamera(46, 1, 0.025, 70);
  camera.position.set(0, 2.6, 6.4);
  camera.lookAt(0, -0.15, -0.2);
  camera.layers.enable(1);
  const inspectionCamera = new THREE.PerspectiveCamera(55 / 3, 1, 0.025, 70);
  inspectionCamera.position.set(0, 1.5, 2.7);
  inspectionCamera.lookAt(0, 0.55, 0.2);
  scene.add(inspectionCamera);
  const benchPosition = camera.position.clone();
  const benchQuaternion = camera.quaternion.clone();
  let benchFov = 46,
    orbitFov = 46;
  const orbit = new BenchOrbit(
    benchPosition,
    new THREE.Vector3(0, -0.15, -0.2),
  );
  let collectionReturn = null;
  let inspection = 0,
    inspectionDestination = 0,
    flight = null,
    hover = null,
    boxFlight = null,
    pendingLoupe = false,
    pendingBox = null;
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
  const response = await Promise.all(
    ["cabochon.obj", "solitaire-setting.mesh.gz", "solitaire-sample.obj"].map(
      async (name) => {
        const r = await fetch(new URL(`../assets/${name}`, import.meta.url));
        if (!r.ok) throw new Error("Jewelry mesh could not load");
        return name.endsWith(".gz")
          ? new Response(
              r.body.pipeThrough(new DecompressionStream("gzip")),
            ).arrayBuffer()
          : r.text();
      },
    ),
  );
  const shank = new THREE.BufferGeometry();
  const settingSource = readSettingBinary(response[1]);
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
  const cuts = Object.fromEntries(
    ["brilliant", "step", "oval", "cushion"].map((k) => [k, cutGeometry(k)]),
  );
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
  scene.add(new THREE.HemisphereLight("#e7ecf5", "#665549", 0.28));
  const fill = new THREE.DirectionalLight("#f5f7ff", 0.32);
  fill.position.set(-3, 4, -2);
  scene.add(fill);
  const benchBounce = new THREE.RectAreaLight("#fffaf4", 1.2, 7, 4);
  benchBounce.position.set(0, 2.0, 5);
  benchBounce.lookAt(0, -0.3, 0);
  scene.add(benchBounce);
  const collectionFill = new THREE.RectAreaLight("#ffffff", 4, 7, 5);
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
  scene.add(support);
  const displayPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.11, 1, 24),
    metal,
  );
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
  updateMount();
  updateLight();
  const workshop = await buildWorkshop(scene, surfaces, renderer);
  const caustics = createCaustics(renderer, workshop.causticReceivers, host);
  objects = makeBenchObjects(scene, geometries, materials, surfaces, key);
  objects.select("gem", selectedGem);
  objects.select("metal", "gold");
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
  let zoomAnchor = null,
    zoomAt = -Infinity;
  const zoomPointer = new THREE.Vector2();
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
    ]);
    if (hits[0]?.object.userData.blockPointer) return null;
    return hits.length
      ? hits[0].object.userData.action || {
          kind: "jewelry",
          label:
            tool === "explore"
              ? "Jewelry · double-click to focus"
              : "Turn the jewelry · drag",
        }
      : null;
  }
  function releaseCollectionCamera() {
    if (!boxFlight) return;
    orbit.adopt(camera.position, boxFlight.center);
    orbitFov = camera.fov;
    boxFlight = null;
  }
  function focusPoint(x, y) {
    scene.updateMatrixWorld(true);
    const hits = benchIntersections(raycaster, camera, x, y, [
      workshop.focusTargets,
      spin,
      ...objects.targets,
      support,
      workshop.mat,
    ]);
    return hits.find((h) => !h.object.userData.blockPointer)?.point || null;
  }
  function focusBox(id) {
    if (inspection > 0 || inspectionDestination) {
      pendingBox = id;
      inspectionDestination = 0;
      invalidate();
      return;
    }
    const view = id
      ? objects.boxView(id, camera.aspect)
      : {
          position: collectionReturn?.position || benchPosition,
          quaternion: collectionReturn?.quaternion || benchQuaternion,
          center: collectionReturn?.center || orbit.target,
        };
    if (id && !collectionReturn)
      collectionReturn = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        center: orbit.target.clone(),
        fov: camera.fov,
      };
    boxFlight = {
      id,
      progress: 0,
      fromPosition: camera.position.clone(),
      fromQuaternion: camera.quaternion.clone(),
      fromFov: camera.fov,
      fov: id ? 40 : collectionReturn?.fov || benchFov,
      position: view.position.clone(),
      quaternion: view.quaternion.clone(),
      center: view.center || new THREE.Vector3(0, 0.3, 0),
    };
    objects.focusBox(id);

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
    const eye = new THREE.Vector3(0, 0, -0.198)
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
        .set(0, 0, -0.198)
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
      host.dataset.box = boxFlight.id || "returning";
      if (boxFlight.progress === 1 && !boxFlight.id) {
        orbit.adopt(camera.position, boxFlight.center);
        orbitFov = boxFlight.fov;
        collectionReturn = null;
        boxFlight = null;
        host.dataset.box = "";
        if (pendingLoupe) {
          pendingLoupe = false;
          prepareFlight();
          inspectionDestination = 1;
        }
      }
    } else if (inspection === 0 && inspectionDestination === 0) {
      orbit.update(camera, dt);
      camera.fov = orbitFov;
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
    }
    camera.updateProjectionMatrix();
    if (flight) {
      const lens = objects.loupe;
      lens.position.copy(corridorPoint(flight.points, inspection));
      lens.quaternion
        .copy(objects.restQuaternion)
        .slerp(flight.quaternion, ease(inspection));
      const scale =
        (0.78 *
          Math.min(1, camera.aspect) *
          Math.tan(THREE.MathUtils.degToRad(inspectionFieldOfView(zoom) / 2))) /
        Math.tan(THREE.MathUtils.degToRad(19));
      const size = 0.3 * THREE.MathUtils.lerp(1, scale, ease(inspection));
      lens.scale.set(size, size, 0.3);
      objects.baffleDepth.visible = inspection === 1;
      objects.baffle.visible = inspection > 0.88;
      objects.baffle.material.opacity = ease((inspection - 0.88) / 0.12);
    }
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
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const jewelryCache = createJewelryCache(renderer, scene, camera, target);
  let jewelryDirty = true;
  const postScene = new THREE.Scene(),
    postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  postCamera.position.z = 1;
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: target.texture },
      jewelry: { value: jewelryCache.texture },
      jewelryDepth: { value: jewelryCache.depth },
      depthImage: { value: target.depthTexture },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader:
      "varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D image,depthImage,jewelry,jewelryDepth;varying vec2 vUV;
      void main(){vec4 gem=texture2D(jewelry,vUV);float visible=step(texture2D(jewelryDepth,vUV).r,texture2D(depthImage,vUV).r+.000003);
      vec3 color=texture2D(image,vUV).rgb*(1.-gem.a*visible)+gem.rgb*visible;
      float vignette=1.-.12*pow(length((vUV-.5)*vec2(1.1,.85)),1.5);gl_FragColor=vec4(color*vignette,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial));
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
    const framingPose = benchFraming(width / heightPx);
    benchFov = framingPose.fov;
    orbitFov = benchFov;
    benchPosition.set(0, framingPose.y, framingPose.z);
    const framing = new THREE.PerspectiveCamera();
    framing.position.copy(benchPosition);
    framing.lookAt(0, -0.15, -0.2);
    benchQuaternion.copy(framing.quaternion);
    if (flight) {
      flight.benchPosition.copy(benchPosition);
      flight.benchQuaternion.copy(benchQuaternion);
      flight.benchFov = benchFov;
    }
    if (collectionReturn) {
      collectionReturn.position.copy(benchPosition);
      collectionReturn.quaternion.copy(benchQuaternion);
      collectionReturn.center.set(0, -0.15, -0.2);
      collectionReturn.fov = benchFov;
    }
    orbit.adopt(benchPosition, new THREE.Vector3(0, -0.15, -0.2));
    camera.aspect = width / heightPx;
    camera.fov = benchFov;
    camera.updateProjectionMatrix();
    inspectionCamera.aspect = width / heightPx;
    if (boxFlight) focusBox(boxFlight.id);
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
    host.dataset.jewelryDraws = String(jewelryCache.render(jewelryDirty));
    jewelryDirty = false;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
    host.dataset.draws = String(++draws);
  }
  function setQuality(moving, force = false) {
    const ratio = devicePixelRatio || 1;
    if (!force && quality === ratio) return;
    quality = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, heightPx, false);
    target.setSize(Math.round(width * ratio), Math.round(heightPx * ratio));
    jewelryCache.resize(
      Math.round(width * ratio),
      Math.round(heightPx * ratio),
    );
    jewelryDirty = true;
    host.dataset.renderQuality = "native";
    host.dataset.renderPixelRatio = String(ratio);
    needsFrame = true;
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
    if (needsFrame || now - lastDraw > 16) {
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
        focusBox(next);
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
      workshop.animate(now / 1000, !reduced.matches);
      caustics.update(stone, key, source === "softbox", now);
      updateReflections(now);
      draw();
      needsFrame = false;
      lastDraw = now;
    }
    host.dataset.renderState =
      moving || objectsMoving || caustics.settling ? "settling" : "resting";
    if (moving || objectsMoving || caustics.settling) requestFrame();
    else if (!reduced.matches && workshop.needsAnimation(camera))
      ambientTimer = setTimeout(requestFrame, 1000 / 24);
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
  resize();
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
      selectedGem = value;
      objects.select("gem", value);
      updateMount();
      invalidate();
    },
    setSetting(value) {
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
      workshop.mat.material.color.set(
        value === "cream"
          ? "#d3c7ae"
          : value === "charcoal"
            ? "#242923"
            : "#31423a",
      );
      invalidate();
    },
    focusBox,
    setTool(value) {
      tool = value;
      if (boxFlight || collectionReturn) {
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
      orbit.adopt(benchPosition, new THREE.Vector3(0, -0.15, -0.2));
      orbitFov = benchFov;
      collectionReturn = null;
      boxFlight = null;
      pendingBox = null;
      pendingLoupe = false;
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
      zoomAt = -Infinity;
      orbit.drag(dx, dy);
      invalidate(false);
    },
    focus(x, y) {
      if (
        inspection ||
        inspectionDestination ||
        (boxFlight && boxFlight.progress < 1)
      )
        return;
      const point = focusPoint(x, y);
      if (!point) return;
      releaseCollectionCamera();
      orbit.focus(point, 3.6);
      invalidate(false);
    },
    zoom(factor, x = 0.5, y = 0.5) {
      if (
        inspection ||
        inspectionDestination ||
        (boxFlight && boxFlight.progress < 1)
      )
        return;
      const now = performance.now();
      // Reuse a world-space gesture anchor instead of raycasting the entire
      // static room on every tiny trackpad delta.
      if (
        now - zoomAt > 150 ||
        zoomPointer.distanceToSquared(new THREE.Vector2(x, y)) > 0.0025
      ) {
        zoomAnchor = focusPoint(x, y);
        zoomPointer.set(x, y);
      }
      zoomAt = now;
      releaseCollectionCamera();
      orbit.zoom(factor, zoomAnchor);
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
      workshop.dispose();
      caustics.dispose();
      reflectionTarget.dispose();
      reflectionFiltered?.dispose();
      reflectionGenerator.dispose();
      surfaces.dispose();
      target.dispose();
      jewelryCache.dispose();
      postMaterial.dispose();
      for (const material of Object.values(materials)) material.dispose();
      scene.traverse((o) => o.geometry?.dispose());
      settingSource.dispose();
      metal.dispose();
      renderer.dispose();
    },
  };
}

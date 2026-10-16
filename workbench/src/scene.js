import * as THREE from "../vendor/three.module.js";
import { RectAreaLightUniformsLib } from "../vendor/addons/lights/RectAreaLightUniformsLib.js";
import {
  readGemOBJ,
  normalizeGem,
  inspectionFieldOfView,
  turnSpecimen,
} from "./geometry.js";

function tigerMaterial() {
  const uniforms = {
    fiberLight: { value: new THREE.Vector3(3, 4, 3) },
    fiberEye: { value: new THREE.Vector3(3, 3, 5) },
    fiberSoftness: { value: 0.024 },
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: "#ae762b",
    roughness: 0.31,
    metalness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.065,
    ior: 1.545,
    envMapIntensity: 0.8,
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
        float layers = 0.5 + 0.18*sin(warp*32.0) + 0.13*sin(warp*69.0 + 1.4);
        float threads = 0.5 + 0.34*fiberSignal(600.0,warp) + 0.15*fiberSignal(1500.0,warp + 0.0004*sin(p.z*40.0));
        float colorMix = clamp(layers * 0.4 + threads * 0.6, 0.0, 1.0);
        return mix(vec3(0.018,0.006,0.0015),vec3(0.24,0.105,0.022),colorMix);
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
import { applyMetal } from "./metals.js";
import { buildWorkshop } from "./workshop.js";
import { makeBenchObjects } from "./bench-objects.js";
import {
  ease,
  gazeOffset,
  corridorPoint,
  loupeCorridor,
  advanceProgress,
  lampControls,
  benchFraming,
} from "./interaction.js";

export async function createWorkbench(host, onFatalError) {
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.transmissionResolutionScale = 0.75;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    onFatalError(new Error("Graphics context interrupted"));
  });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#282b21");
  scene.fog = new THREE.Fog("#282b21", 18, 42);
  const surfaces = await loadSurfaces(renderer);
  scene.environment = surfaces.environment.texture;
  scene.environmentIntensity = 0.6;
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
  camera.lookAt(0, 0.3, -0.3);
  camera.layers.enable(1);
  const inspectionCamera = new THREE.PerspectiveCamera(55 / 3, 1, 0.025, 70);
  inspectionCamera.position.set(0, 1.5, 2.7);
  inspectionCamera.lookAt(0, 0.55, 0.2);
  scene.add(inspectionCamera);
  const benchPosition = camera.position.clone();
  const benchQuaternion = camera.quaternion.clone();
  let benchFov = 46;
  const gaze = new THREE.Vector2(),
    gazeTarget = new THREE.Vector2();
  let inspection = 0,
    inspectionDestination = 0,
    flight = null,
    hover = null;
  const metal = new THREE.MeshPhysicalMaterial({
    color: "#d5b374",
    metalness: 1,
    roughness: 0.14,
    anisotropy: 0.2,
    envMapIntensity: 1.1,
  });
  const spin = new THREE.Group(),
    root = new THREE.Group(),
    setting = new THREE.Group(),
    mount = new THREE.Group();
  spin.add(root);
  root.add(setting);
  setting.add(mount);
  scene.add(spin);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.91, 0.12, 32, 128),
    metal,
  );
  band.scale.z = 1.2;
  band.castShadow = true;
  setting.add(band);
  for (const x of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), metal);
    shoulder.scale.set(0.24, 0.15, 0.18);
    shoulder.position.set(x * 0.59, 0.73, 0);
    shoulder.castShadow = true;
    setting.add(shoulder);
  }
  const stone = new THREE.Mesh();
  stone.castShadow = true;
  root.add(stone);
  const response = await Promise.all(
    ["cabochon.obj", "emerald-step.obj", "diamond.obj"].map(async (name) => {
      const r = await fetch(new URL(`../assets/${name}`, import.meta.url));
      if (!r.ok) throw new Error("Gemstone could not load");
      return r.text();
    }),
  );
  const geometries = {
    tiger: normalizeGem(readGemOBJ(response[0], true), 1.38),
    emerald: normalizeGem(convexFacetHull(readGemOBJ(response[1])), 1.22),
    diamond: normalizeGem(readGemOBJ(response[2]), 1.24),
  };
  const tiger = tigerMaterial();
  const materials = {
    tiger,
    diamond: makeFacetMaterial(geometries.diamond, reflectionTarget.texture),
    emerald: makeFacetMaterial(geometries.emerald, reflectionTarget.texture, {
      ior: 1.577,
      dispersion: 0.006,
      absorption: [2.0, 0.14, 1.3],
    }),
  };
  const key = new THREE.PointLight("#fff3dc", 75, 17, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.012;
  key.shadow.camera.near = 0.1;
  key.shadow.camera.far = 17;
  key.shadow.autoUpdate = false;
  key.shadow.needsUpdate = true;
  scene.add(key);
  const softbox = new THREE.RectAreaLight("#fff0dc", 7, 3.2, 2.2);
  scene.add(softbox);
  scene.add(new THREE.HemisphereLight("#e8eee7", "#6d4e31", 0.28));
  const fill = new THREE.DirectionalLight("#e9efff", 0.28);
  fill.position.set(-3, 4, -2);
  scene.add(fill);
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
    tool = "turn",
    auto = false,
    zoom = 3,
    proximity = 0,
    selectedMetal = "gold",
    finishLevel = 14;
  const neutral = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.12, -0.3, 0),
  );
  spin.quaternion.copy(neutral);
  const support = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.62, 0.15, 64),
    surfaces.wood,
  );
  support.position.y = -1.16;
  support.receiveShadow = true;
  scene.add(support);
  const displayPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.11, 1, 24),
    metal,
  );
  scene.add(displayPost);
  function updatePivot() {
    root.position.set(0, -0.2, 0);
    spin.position.set(0, 0.2, 0);
    support.visible = true;
    support.position.y =
      selectedSetting === "loose" ? stone.position.y - 0.075 : -1.16;
    displayPost.visible = selectedSetting === "loose";
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
    if (selectedGem === "tiger") {
      const curve = new THREE.CatmullRomCurve3(
        Array.from(
          { length: 65 },
          (_, i) =>
            new THREE.Vector3(
              Math.cos((i / 64) * Math.PI * 2) * (g.max.x + 0.018),
              0.99,
              Math.sin((i / 64) * Math.PI * 2) * (g.max.z + 0.018),
            ),
        ),
        true,
      );
      mount.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 128, 0.035, 12, true),
          metal,
        ),
      );
      stone.position.set(0, 0.98, 0);
    } else {
      const baseY = 1.1,
        points = stone.geometry.attributes.position;
      let maxRadius = 0;
      for (let i = 0; i < points.count; i++)
        maxRadius = Math.max(
          maxRadius,
          Math.hypot(points.getX(i), points.getZ(i)),
        );
      let sum = 0,
        count = 0;
      for (let i = 0; i < points.count; i++)
        if (Math.hypot(points.getX(i), points.getZ(i)) > maxRadius * 0.995) {
          sum += points.getY(i);
          count++;
        }
      const girdle = sum / count,
        worldGirdle = baseY + girdle,
        planes = materials[selectedGem].uniforms.facets.value;
      function radiusAt(a, y) {
        const dx = Math.cos(a),
          dz = Math.sin(a);
        let r = Infinity;
        for (const p of planes) {
          const den = p.x * dx + p.z * dz;
          if (den > 1e-6) r = Math.min(r, -(p.y * y + p.w) / den);
        }
        return r;
      }
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const a = Math.atan2(z, x),
            r = radiusAt(a, girdle),
            dx = Math.cos(a),
            dz = Math.sin(a);
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(x * 0.55, 0.74, z * 0.035),
            new THREE.Vector3(
              x * 0.61,
              Math.min(1.25, worldGirdle - 0.25),
              z * 0.19,
            ),
            new THREE.Vector3(
              dx * (r + 0.035),
              worldGirdle - 0.05,
              dz * (r + 0.035),
            ),
            new THREE.Vector3(
              dx * (r - 0.04),
              worldGirdle + 0.06,
              dz * (r - 0.04),
            ),
          ]);
          const prong = new THREE.Mesh(
            new THREE.TubeGeometry(curve, 32, 0.028, 12, false),
            metal,
          );
          prong.castShadow = true;
          mount.add(prong);
          const tip = new THREE.Mesh(
            new THREE.SphereGeometry(0.029, 16, 12),
            metal,
          );
          tip.position.copy(curve.getPoint(1));
          mount.add(tip);
        }
      const y = girdle - 0.15,
        basketCurve = new THREE.CatmullRomCurve3(
          Array.from({ length: 65 }, (_, i) => {
            const a = (i / 64) * Math.PI * 2,
              r = radiusAt(a, y) + 0.025;
            return new THREE.Vector3(
              Math.cos(a) * r,
              baseY + y,
              Math.sin(a) * r,
            );
          }),
          true,
        );
      mount.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(basketCurve, 96, 0.022, 10, true),
          metal,
        ),
      );
      stone.position.set(0, baseY, 0);
    }
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
      -1,
    );
    objects?.setLamp(key.position);
    softbox.position.copy(key.position);
    softbox.lookAt(0, 0.7, 0);
    key.intensity = source === "penlight" ? 75 : 0;
    softbox.intensity = source === "softbox" ? 7 : 0;
    tiger.userData.fiberUniforms.fiberSoftness.value =
      source === "softbox" ? 0.11 : 0.014;
  }
  let objects;
  updateMount();
  updateLight();
  const workshop = await buildWorkshop(scene, surfaces);
  objects = makeBenchObjects(scene, geometries, materials, surfaces, key);
  objects.setLamp(key.position);
  objects.select("gem", selectedGem);
  objects.select("metal", "gold");
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
    scene.environment = reflectionFiltered.texture;
    key.shadow.needsUpdate = true;
    workshop.sun.shadow.needsUpdate = true;
    reflectionDirty = false;
    lastReflection = now;
    host.dataset.reflectionRevision = String(++reflectionRevision);
  }
  const raycaster = new THREE.Raycaster();
  const lampPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 1);
  const lampGrip = new THREE.Vector3();
  function lampPoint(x, y) {
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
    return raycaster.ray.intersectPlane(lampPlane, new THREE.Vector3());
  }
  function pick(x, y) {
    if (inspectionDestination || inspection > 0)
      return inspection === 1
        ? { kind: "jewelry", label: "Turn the stone · drag" }
        : null;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
    const hits = raycaster.intersectObjects(
      [
        ...objects.targets,
        stone,
        ...(setting.visible ? [band, ...mount.children] : []),
      ],
      true,
    );
    if (hits[0]?.object.userData.blockPointer) return null;
    return hits.length
      ? hits[0].object.userData.action || {
          kind: "jewelry",
          label: "Turn the jewelry · drag",
        }
      : null;
  }
  function prepareFlight() {
    scene.updateMatrixWorld(true);
    const center = stone.localToWorld(
      stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
    );
    const position = center.clone().add(new THREE.Vector3(0, 0.95, 2.8));
    inspectionCamera.position.copy(position);
    inspectionCamera.lookAt(center);
    inspectionCamera.updateMatrixWorld(true);
    const eye = new THREE.Vector3(0, 0, -0.66)
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
    };
  }
  function updateCamera(dt) {
    if (inspection === 1 && inspectionDestination === 1 && flight) {
      const center = stone.localToWorld(
        stone.geometry.boundingBox.getCenter(new THREE.Vector3()),
      );
      flight.center.lerp(center, 1 - Math.exp(-dt * 8));
      flight.position.copy(flight.center).add(new THREE.Vector3(0, 0.95, 2.8));
      inspectionCamera.position.copy(flight.position);
      inspectionCamera.lookAt(flight.center);
      flight.quaternion.copy(inspectionCamera.quaternion);
      flight.points[flight.points.length - 1]
        .set(0, 0, -0.66)
        .applyQuaternion(flight.quaternion)
        .add(flight.position);
    }
    gaze.x = THREE.MathUtils.damp(gaze.x, gazeTarget.x, 7, dt);
    gaze.y = THREE.MathUtils.damp(gaze.y, gazeTarget.y, 7, dt);
    if (inspection === 0 && inspectionDestination === 0) {
      const offset = reduced.matches
        ? new THREE.Vector2()
        : gazeOffset(gaze.x, gaze.y);
      const destination = benchPosition
        .clone()
        .add(
          new THREE.Vector3(
            reduced.matches ? 0 : gaze.x * 0.09,
            reduced.matches ? 0 : gaze.y * 0.035,
            -proximity,
          ),
        );
      camera.position.lerp(destination, 1 - Math.exp(-dt * 8));
      camera.quaternion
        .copy(benchQuaternion)
        .multiply(
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(-offset.y, -offset.x, 0, "YXZ"),
          ),
        );
      camera.fov = benchFov;
    } else if (flight) {
      // The tool visibly lifts first. The seated camera then leans toward it.
      const t = ease(THREE.MathUtils.clamp((inspection - 0.45) / 0.55, 0, 1));
      camera.position.copy(flight.benchPosition).lerp(flight.position, t);
      camera.quaternion
        .copy(flight.benchQuaternion)
        .slerp(flight.quaternion, t);
      camera.fov = THREE.MathUtils.lerp(
        benchFov,
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
      const size = THREE.MathUtils.lerp(1, scale, ease(inspection));
      lens.scale.set(size, size, 1);
      objects.baffle.visible = inspection > 0.88;
      objects.baffle.material.opacity = ease((inspection - 0.88) / 0.12);
    }
    host.dataset.inspection = inspection.toFixed(3);
    host.dataset.viewYaw = (reduced.matches ? 0 : gaze.x * 0.105).toFixed(4);
  }
  // A light depth-of-field pass: room props soften while the specimen stays crisp.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const postScene = new THREE.Scene(),
    postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  postCamera.position.z = 1;
  const postMaterial = new THREE.ShaderMaterial({
    uniforms: {
      image: { value: target.texture },
      depthImage: { value: target.depthTexture },
      pixel: { value: new THREE.Vector2() },
      focus: { value: 6.8 },
      clipRange: { value: new THREE.Vector2(0.025, 70) },
    },
    depthTest: false,
    depthWrite: false,
    vertexShader:
      "varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D image;uniform sampler2D depthImage;uniform vec2 pixel;uniform vec2 clipRange;uniform float focus;varying vec2 vUV;
      float linearDepth(float d){return clipRange.x*clipRange.y/(clipRange.y-d*(clipRange.y-clipRange.x));}
      void main(){float depth=linearDepth(texture2D(depthImage,vUV).x);float blur=depth<1.0?0.0:clamp(abs(depth-focus)/max(depth,1.0)*2.3,0.0,2.0);vec3 color=texture2D(image,vUV).rgb*2.0;float weight=2.0;
      for(int i=0;i<8;i++){float a=float(i)*0.78539816;vec2 uv=vUV+vec2(cos(a),sin(a))*pixel*blur;float sampleDepth=linearDepth(texture2D(depthImage,uv).x);float w=abs(sampleDepth-depth)<max(.3,depth*.08)?1.0:0.0;color+=texture2D(image,uv).rgb*w;weight+=w;}
      color/=weight;float vignette=1.0-.19*pow(length((vUV-.5)*vec2(1.1,.85)),1.5);gl_FragColor=vec4(color*vignette,1.0);
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
    needsFrame = true;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function resize() {
    width = host.clientWidth;
    heightPx = host.clientHeight;
    if (width < 1 || heightPx < 1) return;
    renderer.setSize(width, heightPx, false);
    const ratio = renderer.getPixelRatio();
    target.setSize(Math.round(width * ratio), Math.round(heightPx * ratio));
    postMaterial.uniforms.pixel.value.set(
      1 / (width * ratio),
      1 / (heightPx * ratio),
    );
    const framingPose = benchFraming(width / heightPx);
    benchFov = framingPose.fov;
    benchPosition.set(0, framingPose.y, framingPose.z);
    const framing = new THREE.PerspectiveCamera();
    framing.position.copy(benchPosition);
    framing.lookAt(0, 0.3, -0.3);
    benchQuaternion.copy(framing.quaternion);
    camera.aspect = width / heightPx;
    camera.fov = benchFov;
    camera.updateProjectionMatrix();
    inspectionCamera.aspect = width / heightPx;
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
    const active = camera;
    postMaterial.uniforms.focus.value =
      inspection > 0 && flight
        ? active.position.distanceTo(flight.center)
        : active.position.distanceTo(new THREE.Vector3(0, 0.3, 0));
    renderer.setRenderTarget(target);
    renderer.render(scene, active);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }
  function frame(now) {
    scheduled = 0;
    if (stopped || paused || !visible || document.hidden) return;
    const benchMoving =
      inspection === 0 &&
      camera.position.distanceTo(
        benchPosition
          .clone()
          .add(
            new THREE.Vector3(
              reduced.matches ? 0 : gaze.x * 0.09,
              reduced.matches ? 0 : gaze.y * 0.035,
              -proximity,
            ),
          ),
      ) > 0.001;
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
      !reduced.matches ||
      inspection !== inspectionDestination ||
      gaze.distanceTo(gazeTarget) > 0.001;
    if (needsFrame || now - lastDraw > 33) {
      if (auto && inspection === 0) {
        const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.min((now - lastDraw) / 1000, 0.05) * 0.22,
        );
        spin.quaternion.premultiply(q).normalize();
        key.shadow.needsUpdate = true;
        workshop.sun.shadow.needsUpdate = true;
      }
      const dt = Math.min((now - lastDraw) / 1000, 0.05);
      if (inspection !== inspectionDestination) key.shadow.needsUpdate = true;
      inspection = advanceProgress(
        inspection,
        inspectionDestination,
        dt,
        reduced.matches ? 0.65 : 2.4,
      );
      if (!inspectionDestination)
        spin.position.lerp(new THREE.Vector3(0, 0.2, 0), 1 - Math.exp(-dt * 8));
      updateCamera(dt);
      objects.animate(dt, hover, !reduced.matches);
      workshop.animate(now / 1000, !reduced.matches);
      updateReflections(now);
      draw();
      needsFrame = false;
      lastDraw = now;
    }
    if (moving) requestFrame();
  }
  function requestFrame() {
    if (!scheduled && !stopped) scheduled = requestAnimationFrame(frame);
  }
  function invalidate(shadows = true) {
    needsFrame = true;
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
          ? "#b9ad8d"
          : value === "charcoal"
            ? "#242923"
            : "#31423a",
      );
      invalidate();
    },
    setTool(value) {
      tool = value;
      if (value === "loupe" && inspection === 0) prepareFlight();
      inspectionDestination = value === "loupe" ? 1 : 0;
      updateOptics();
      invalidate();
    },
    pick,
    look(x, y) {
      if (inspection > 0 || inspectionDestination) return;
      gazeTarget.set(x * 2 - 1, y * 2 - 1);
      invalidate(false);
    },
    hover(action) {
      hover = action;
      invalidate(false);
    },
    holdLook() {
      gazeTarget.copy(gaze);
    },
    get transitioning() {
      return inspection !== inspectionDestination;
    },
    beginLampDrag(x, y) {
      const point = lampPoint(x, y);
      if (point) lampGrip.copy(key.position).sub(point);
    },
    dragLamp(x, y) {
      const point = lampPoint(x, y);
      if (point) {
        const controls = lampControls(point.add(lampGrip));
        angle = controls.angle;
        height = controls.height;
      }
      updateLight();
      invalidate();
      return { angle: Math.round(angle), height: Math.round(height) };
    },
    setLoupe(_x, _y, value) {
      zoom = value;
      updateOptics();
      invalidate();
    },
    setAutoTurn(value) {
      auto = value;
      invalidate();
    },
    reset() {
      spin.quaternion.copy(neutral);
      ((proximity = 0), (selectedMetal = "gold"), (finishLevel = 14));
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
    zoom(factor) {
      proximity = THREE.MathUtils.clamp(
        proximity + (factor < 1 ? 0.2 : -0.2),
        -0.4,
        1.3,
      );
      if (!inspection) updatePivot();
      invalidate();
    },
    async photo() {
      draw();
      return new Promise((resolve) =>
        renderer.domElement.toBlob(resolve, "image/png"),
      );
    },
    dispose() {
      stopped = true;
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", wake);
      reduced.removeEventListener("change", wake);
      workshop.dispose();
      reflectionTarget.dispose();
      reflectionFiltered?.dispose();
      reflectionGenerator.dispose();
      surfaces.dispose();
      target.dispose();
      postMaterial.dispose();
      for (const material of Object.values(materials)) material.dispose();
      scene.traverse((o) => o.geometry?.dispose());
      metal.dispose();
      renderer.dispose();
    },
  };
}

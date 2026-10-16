import * as THREE from "../vendor/three.module.js";
import { RectAreaLightUniformsLib } from "../vendor/addons/lights/RectAreaLightUniformsLib.js";
import {
  brilliantGeometry,
  readGemOBJ,
  normalizeGem,
  lightPosition,
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

function makeEnvironment(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color("#6c7267");
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(14, 12, 14),
    new THREE.MeshBasicMaterial({ color: "#434b40", side: THREE.BackSide }),
  );
  room.add(wall);
  const panels = [
    [
      [-4, 4, 2],
      [2.2, 5, 0.05],
      [6, 5.6, 4.4],
    ],
    [
      [4, 3, -2],
      [2.6, 5, 0.05],
      [3.7, 4.4, 4.9],
    ],
    [
      [0, 5, 0],
      [5, 0.05, 3],
      [4, 4, 3.5],
    ],
    [
      [0, 1, 5],
      [0.4, 5, 0.05],
      [4, 4, 3.6],
    ],
  ];
  for (const [position, scale, color] of panels) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(...scale),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setRGB(...color),
      }),
    );
    panel.position.set(...position);
    panel.lookAt(0, 0, 0);
    room.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(room, 0.035);
  generator.dispose();
  room.traverse((item) => {
    item.geometry?.dispose();
    item.material?.dispose();
  });
  return target;
}

import { buildWorkshop, makeEyepiece } from "./workshop.js";

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
  renderer.toneMappingExposure = 1.05;
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
  const environment = makeEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(46, 1, 0.025, 70);
  camera.position.set(0, 2.6, 6.4);
  camera.lookAt(0, 0.3, -0.3);
  const inspectionCamera = new THREE.PerspectiveCamera(55 / 3, 1, 0.025, 70);
  inspectionCamera.position.set(0, 1.5, 2.7);
  inspectionCamera.lookAt(0, 0.55, 0.2);
  scene.add(inspectionCamera);
  const eyepiece = makeEyepiece(inspectionCamera);
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
    ["cabochon.obj", "emerald-step.obj"].map(async (name) => {
      const r = await fetch(new URL(`../assets/${name}`, import.meta.url));
      if (!r.ok) throw new Error("Gemstone could not load");
      return r.text();
    }),
  );
  const geometries = {
    tiger: normalizeGem(readGemOBJ(response[0], true), 1.38),
    emerald: normalizeGem(readGemOBJ(response[1]), 1.22),
    diamond: normalizeGem(brilliantGeometry(), 1.24),
  };
  const tiger = tigerMaterial();
  const materials = {
    tiger,
    diamond: new THREE.MeshPhysicalMaterial({
      color: "#ffffff",
      metalness: 0,
      roughness: 0.025,
      transmission: 1,
      thickness: 1.15,
      ior: 2.33,
      dispersion: 0.32,
      attenuationColor: "#f2f8ff",
      attenuationDistance: 6,
      envMapIntensity: 1.2,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
    }),
    emerald: new THREE.MeshPhysicalMaterial({
      color: "#a5e4c7",
      metalness: 0,
      roughness: 0.045,
      transmission: 0.94,
      thickness: 1.25,
      ior: 1.57,
      attenuationColor: "#1a995b",
      attenuationDistance: 1.2,
      envMapIntensity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.035,
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
  scene.add(new THREE.HemisphereLight("#e8eee7", "#6d4e31", 1.25));
  const fill = new THREE.DirectionalLight("#e9efff", 1.25);
  fill.position.set(-3, 4, -2);
  scene.add(fill);
  stone.onBeforeRender = (_r, _s, activeCamera) => {
    if (stone.material !== tiger) return;
    stone.worldToLocal(
      tiger.userData.fiberUniforms.fiberEye.value.copy(activeCamera.position),
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
    proximity = 0;
  const neutral = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0.12, -0.3, 0),
  );
  spin.quaternion.copy(neutral);
  const support = new THREE.Mesh(
    new THREE.CylinderGeometry(0.52, 0.62, 0.15, 64),
    new THREE.MeshStandardMaterial({ color: "#6d5940", roughness: 0.75 }),
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
    const inspect = tool === "loupe";
    const g = stone.geometry.boundingBox;
    const center = inspect
      ? new THREE.Vector3(0, stone.position.y + g.max.y / 2, 0)
      : new THREE.Vector3(0, 0.2, 0);
    root.position.copy(center).negate();
    spin.position.copy(
      inspect
        ? new THREE.Vector3(0, 0.55, 0.2)
        : new THREE.Vector3(0, 0.2, proximity),
    );
    support.visible = !inspect;
    support.position.y =
      selectedSetting === "loose" ? stone.position.y - 0.075 : -1.16;
    displayPost.visible = !inspect && selectedSetting === "loose";
    displayPost.scale.y = Math.max(0.05, support.position.y - 0.075 + 1.35);
    displayPost.position.y = -1.35 + displayPost.scale.y / 2;
    eyepiece.visible = inspect;
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
      const baseY = 0.97,
        girdleY = baseY + g.max.y * 0.62;
      for (const x of [-1, 1])
        for (const z of [-1, 1]) {
          const prong = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.035, 0.25, 8, 12),
            metal,
          );
          prong.position.set(
            x * g.max.x * 0.72,
            girdleY - 0.025,
            z * g.max.z * 0.72,
          );
          prong.castShadow = true;
          mount.add(prong);
        }
      const basket = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.035, 12, 64),
        metal,
      );
      basket.rotation.x = Math.PI / 2;
      basket.position.y = 1.02;
      mount.add(basket);
      stone.position.set(0, baseY, 0);
    }
    setting.visible = selectedSetting === "ring";
    if (selectedSetting === "loose") stone.position.y = 0.25 - g.max.y / 2;
    updatePivot();
  }
  function updateLight() {
    key.position.copy(lightPosition(angle, height));
    softbox.position.copy(key.position);
    softbox.lookAt(0, 0.7, 0);
    key.intensity = source === "penlight" ? 75 : 0;
    softbox.intensity = source === "softbox" ? 7 : 0;
    tiger.userData.fiberUniforms.fiberSoftness.value =
      source === "softbox" ? 0.11 : 0.014;
  }
  updateMount();
  updateLight();
  const workshop = await buildWorkshop(scene);
  // A light depth-of-field pass: room props soften while the specimen stays crisp.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
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
    renderer.setSize(width, heightPx, false);
    const ratio = renderer.getPixelRatio();
    target.setSize(Math.round(width * ratio), Math.round(heightPx * ratio));
    postMaterial.uniforms.pixel.value.set(
      1 / (width * ratio),
      1 / (heightPx * ratio),
    );
    camera.aspect = width / heightPx;
    camera.fov = width < heightPx ? 54 : 46;
    camera.updateProjectionMatrix();
    inspectionCamera.aspect = width / heightPx;
    updateOptics();
    invalidate();
  }
  function updateOptics() {
    inspectionCamera.fov = inspectionFieldOfView(zoom);
    inspectionCamera.updateProjectionMatrix();
    const scale =
      (0.78 *
        Math.min(1, inspectionCamera.aspect) *
        Math.tan(THREE.MathUtils.degToRad(inspectionCamera.fov / 2))) /
      Math.tan(THREE.MathUtils.degToRad(19));
    eyepiece.scale.set(scale, scale, 1);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    invalidate();
  });
  intersection.observe(host);
  function draw() {
    const active = tool === "loupe" ? inspectionCamera : camera;
    postMaterial.uniforms.focus.value =
      tool === "loupe"
        ? active.position.distanceTo(new THREE.Vector3(0, 0.55, 0.2))
        : active.position.distanceTo(new THREE.Vector3(0, 0.3, 0));
    renderer.setRenderTarget(target);
    renderer.render(scene, active);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  }
  function frame(now) {
    scheduled = 0;
    if (stopped || paused || !visible || document.hidden) return;
    const moving = auto || !reduced.matches;
    if (needsFrame || now - lastDraw > 33) {
      if (auto) {
        const q = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.min((now - lastDraw) / 1000, 0.05) * 0.22,
        );
        spin.quaternion.premultiply(q).normalize();
        key.shadow.needsUpdate = true;
      }
      workshop.animate(now / 1000, !reduced.matches);
      draw();
      needsFrame = false;
      lastDraw = now;
    }
    if (moving) requestFrame();
  }
  function requestFrame() {
    if (!scheduled && !stopped) scheduled = requestAnimationFrame(frame);
  }
  function invalidate() {
    needsFrame = true;
    key.shadow.needsUpdate = true;
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
      updateMount();
      invalidate();
    },
    setSetting(value) {
      selectedSetting = value;
      updateMount();
      invalidate();
    },
    setMetal(value) {
      metal.color.set(value === "gold" ? "#d5b374" : "#d6dce1");
      invalidate();
    },
    setFinish(value) {
      metal.roughness = 0.065 + 0.005 * value;
      metal.anisotropy = 0.1 + 0.0075 * value;
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
      updatePivot();
      updateOptics();
      invalidate();
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
      proximity = 0;
      updatePivot();
      invalidate();
    },
    rotate(dx, dy) {
      turnSpecimen(spin.quaternion, dx, dy);
      invalidate();
    },
    zoom(factor) {
      proximity = THREE.MathUtils.clamp(
        proximity + (factor < 1 ? 0.2 : -0.2),
        -0.4,
        1.3,
      );
      updatePivot();
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
      environment.dispose();
      target.dispose();
      postMaterial.dispose();
      for (const material of Object.values(materials)) material.dispose();
      scene.traverse((o) => o.geometry?.dispose());
      metal.dispose();
      renderer.dispose();
    },
  };
}

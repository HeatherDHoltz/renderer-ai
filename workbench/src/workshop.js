import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "../vendor/addons/loaders/HDRLoader.js";

export async function buildWorkshop(scene, surfaces) {
  const [asset, irradiance, emission] = await Promise.all([
    new GLTFLoader().loadAsync(
      new URL("../assets/atelier/atelier.glb", import.meta.url).href,
    ),
    new HDRLoader().loadAsync(
      new URL("../assets/atelier/atelier-light.hdr", import.meta.url).href,
    ),
    new HDRLoader().loadAsync(
      new URL("../assets/atelier/atelier-emission.hdr", import.meta.url).href,
    ),
  ]);
  irradiance.flipY = false;
  irradiance.channel = 0;
  irradiance.mapping = THREE.UVMapping;
  const workshop = asset.scene;
  const roomMaterials = new Set();
  workshop.name = "Edwardian jeweler’s study — Cycles baked lighting";
  workshop.traverse((o) => {
    if (!o.isMesh) return;
    roomMaterials.add(o.material);
    o.material.lightMap = irradiance;
    o.material.lightMapIntensity = 2.1;
    o.material.envMapIntensity = 0.16;
    o.material.roughness = 0.56;
    o.material.side = THREE.DoubleSide;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  emission.flipY = false;
  emission.channel = 0;
  emission.mapping = THREE.UVMapping;
  workshop.traverse((o) => {
    if (o.isMesh) {
      o.material.emissive.set("#ffffff");
      o.material.emissiveMap = emission;
    }
  });
  scene.add(workshop);
  const exterior = new THREE.Mesh(
    new THREE.SphereGeometry(32, 48, 24),
    new THREE.MeshBasicMaterial({
      map: surfaces.forest,
      color: new THREE.Color(0.1, 0.14, 0.21),
      side: THREE.BackSide,
      fog: false,
    }),
  );
  exterior.position.set(-5, 3, -16);
  exterior.rotation.y = 1.4;
  scene.add(exterior);
  const padMaterial = new THREE.MeshPhysicalMaterial({
    color: "#aaa89c",
    roughness: 0.95,
    sheen: 0.6,
    sheenColor: "#78917b",
    sheenRoughness: 0.8,
  });
  const shape = new THREE.Shape();
  const w = 2.05,
    d = 1.7,
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
  mat.position.set(0, -1.39, 0.1);
  mat.receiveShadow = true;
  scene.add(mat);
  // Only the live task light is positional. Fixed window, shaded lamp and bounced firelight is
  // already in the atlas; this weak fill gives moving objects a soft key.
  const sun = new THREE.DirectionalLight("#e3ecff", 0.45);
  sun.position.set(-5, 6, -6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -9,
    right: 9,
    top: 8,
    bottom: -6,
    near: 0.5,
    far: 35,
  });
  sun.shadow.normalBias = 0.015;
  sun.shadow.bias = -0.0002;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);
  const hearth = new THREE.Group();
  hearth.name = "Cast-iron fireplace and low fire";
  hearth.position.set(2.15, -1.4, -6.95);
  scene.add(hearth);
  const charcoal = new THREE.MeshStandardMaterial({
    color: "#17110c",
    roughness: 0.98,
  });
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 0.95, 14),
      charcoal,
    );
    log.position.set((i - 2) * 0.3, 0.09 + (i % 2) * 0.08, 0);
    log.rotation.set(0, 0.25 * (i - 2), Math.PI / 2 - 0.12 * (i % 2));
    log.castShadow = true;
    hearth.add(log);
  }
  for (let i = 0; i < 19; i++) {
    const coal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.055 + (i % 3) * 0.012, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.34, 0.025) }),
    );
    coal.position.set(
      Math.sin(i * 4.7) * 0.91,
      0.04,
      Math.cos(i * 3.1) * 0.18 + 0.1,
    );
    coal.scale.y = 0.45;
    hearth.add(coal);
  }
  const fireUniforms = { time: { value: 0 } };
  const fireMaterial = new THREE.ShaderMaterial({
    uniforms: fireUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `uniform float time;varying vec2 fireUV;void main(){fireUV=uv;vec3 p=position;p.x*=1.-.78*uv.y;p.x+=sin(uv.y*8.+time*2.7+position.z*4.)*.075*uv.y;p.y+=sin(time*3.1+uv.x*5.)*.025*uv.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform float time;varying vec2 fireUV;void main(){float h=fireUV.y;float edge=abs(fireUV.x-.5)*2.;float curl=.68+.22*sin(h*18.-time*3.+fireUV.x*9.);float alpha=(1.-smoothstep(.12,.98,edge))*pow(max(0.,1.-h),.55)*curl*.30;vec3 color=mix(vec3(1.,.38,.025),vec3(.9,.035,.002),h)*5.;gl_FragColor=vec4(color,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
  for (let i = 0; i < 9; i++) {
    const plume = new THREE.Group();
    plume.position.set((i - 4) * 0.21, 0.07, 0.12 + Math.sin(i) * 0.08);
    hearth.add(plume);
    for (let j = 0; j < 3; j++) {
      const h = 0.48 + 0.35 * (0.5 + 0.5 * Math.sin(i * 2.8));
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(0.27, h, 6, 14),
        fireMaterial,
      );
      sheet.position.y = h / 2;
      sheet.rotation.y = (j * Math.PI) / 3 + 0.2 * i;
      plume.add(sheet);
    }
  }
  const fireLight = new THREE.PointLight("#ff8b38", 8, 7, 2);
  fireLight.position.set(2.15, -0.65, -6.75);
  scene.add(fireLight);
  return {
    mat,
    sun,
    causticReceivers: [mat.material, ...roomMaterials],
    animate(t, motion) {
      fireUniforms.time.value = motion ? t : 0;
      fireLight.intensity =
        8 *
        (motion
          ? 1 + 0.025 * Math.sin(t * 5.1) + 0.018 * Math.sin(t * 8.7)
          : 1);
    },
    dispose() {
      irradiance.dispose();
      emission.dispose();
      exterior.geometry.dispose();
      exterior.material.dispose();
      fireMaterial.dispose();
      charcoal.dispose();
    },
  };
}

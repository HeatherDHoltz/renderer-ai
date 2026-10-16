import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import { HDRLoader } from "../vendor/addons/loaders/HDRLoader.js";

export async function buildWorkshop(scene, surfaces) {
  const [asset, irradiance] = await Promise.all([
    new GLTFLoader().loadAsync(
      new URL("../assets/atelier/atelier.glb", import.meta.url).href,
    ),
    new HDRLoader().loadAsync(
      new URL("../assets/atelier/atelier-light.hdr", import.meta.url).href,
    ),
  ]);
  irradiance.flipY = false;
  irradiance.channel = 0;
  irradiance.mapping = THREE.UVMapping;
  const workshop = asset.scene;
  workshop.name = "Walnut and ivory atelier — Cycles baked lighting";
  workshop.traverse((o) => {
    if (!o.isMesh) return;
    o.material.lightMap = irradiance;
    o.material.lightMapIntensity = 0.85;
    o.material.envMapIntensity = 0.08;
    o.material.roughness = 0.72;
    o.material.side = THREE.DoubleSide;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  scene.add(workshop);
  const exterior = new THREE.Mesh(
    new THREE.SphereGeometry(32, 48, 24),
    new THREE.MeshBasicMaterial({
      map: surfaces.forest,
      side: THREE.BackSide,
      fog: false,
    }),
  );
  exterior.position.set(-5, 3, -16);
  exterior.rotation.y = 1.4;
  scene.add(exterior);
  const padMaterial = new THREE.MeshPhysicalMaterial({
    color: "#345b48",
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
  // Only the live task light is positional. Fixed window/shelf/candle light is
  // already in the atlas; this weak fill gives moving objects a soft key.
  const sun = new THREE.DirectionalLight("#e5edf3", 0.65);
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
  const flames = [];
  const amberGlass = new THREE.MeshPhysicalMaterial({
    color: "#b58a54",
    roughness: 0.15,
    metalness: 0,
    transmission: 0.65,
    thickness: 0.055,
    ior: 1.5,
    transparent: true,
    opacity: 0.7,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
  const waxMaterial = new THREE.MeshStandardMaterial({
    color: "#e8d4ac",
    roughness: 0.85,
  });
  for (const [x, z, h] of [
    [-6.55, -3.5, 0.48],
    [6.5, -4.8, 0.67],
  ]) {
    const vessel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.335, 0.335, h, 48, 1, true),
      amberGlass,
    );
    vessel.position.set(x, -1.4 + h / 2, z);
    scene.add(vessel);
    for (const y of [-1.4, -1.4 + h]) {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.335, 0.018, 8, 48),
        amberGlass,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, y, z);
      scene.add(rim);
    }
    const wax = new THREE.Mesh(
      new THREE.CylinderGeometry(0.282, 0.282, h - 0.1, 40),
      waxMaterial,
    );
    wax.position.set(x, -1.4 + (h - 0.1) / 2, z);
    scene.add(wax);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.5, 0.25) }),
    );
    flame.position.set(x, -1.3 + h, z);
    flame.scale.set(0.035, 0.1, 0.035);
    scene.add(flame);
    flames.push(flame);
  }
  return {
    mat,
    sun,
    animate(t, motion) {
      for (const [i, f] of flames.entries())
        f.scale.y = 0.1 * (motion ? 1 + 0.06 * Math.sin(t * 3.2 + i) : 1);
    },
    dispose() {
      irradiance.dispose();
      exterior.geometry.dispose();
      exterior.material.dispose();
    },
  };
}

import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";
import { createHearth } from "./hearth.js";
import { HDRLoader } from "../vendor/addons/loaders/HDRLoader.js";

export async function buildWorkshop(scene, surfaces, renderer) {
  const [asset, props, irradiance, emission] = await Promise.all([
    new GLTFLoader().loadAsync(
      new URL("../assets/atelier/atelier.gltf", import.meta.url).href,
    ),
    new GLTFLoader().loadAsync(
      new URL("../assets/atelier/study-props.glb", import.meta.url).href,
    ),
    new HDRLoader().loadAsync(
      new URL("../assets/atelier/atelier-light.hdr", import.meta.url).href,
    ),
    new HDRLoader().loadAsync(
      new URL("../assets/atelier/atelier-emission.hdr", import.meta.url).href,
    ),
  ]);
  irradiance.flipY = false;
  irradiance.channel = 1;
  irradiance.mapping = THREE.UVMapping;
  const workshop = asset.scene;
  const roomMaterials = new Set();
  workshop.name = "Edwardian jeweler’s study — Cycles baked lighting";
  workshop.traverse((o) => {
    if (!o.isMesh) return;
    roomMaterials.add(o.material);
    o.material.lightMap = irradiance;
    o.material.lightMapIntensity = 1.35;
    o.material.envMapIntensity = 0.35;
    if (o.material.name.startsWith("oiled walnut"))
      o.material.color.set("#5d3825");
    if (o.material.name.startsWith("walnut inset"))
      o.material.color.set("#67442d");
    if (o.material.name.startsWith("end grain"))
      o.material.color.set("#3b251a");
    // Preserve exported surface roughness, metalness and photographed normals.
    o.material.side = THREE.DoubleSide;
    // Architectural shadows are already baked. Avoid redrawing the static room
    // triangles into all six task-light shadow faces on each jewelry turn.
    o.castShadow = false;
    o.receiveShadow = true;
  });
  emission.flipY = false;
  emission.channel = 1;
  emission.mapping = THREE.UVMapping;
  workshop.traverse((o) => {
    if (o.isMesh) {
      o.material.emissive.set("#ffffff");
      o.material.emissiveMap = emission;
    }
  });
  scene.add(workshop);
  props.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
      o.material.envMapIntensity = 0.85;
      if (o.material.name.includes("clock_01_glass")) {
        o.material.opacity = 0.1;
        o.material.transparent = true;
        o.material.depthWrite = false;
        o.material.metalness = 0;
        o.material.roughness = 0.08;
      }
    }
  });
  scene.add(props.scene);
  for (const root of [workshop, props.scene])
    root.traverse((o) => {
      if (o.isMesh)
        for (const name of [
          "map",
          "normalMap",
          "roughnessMap",
          "metalnessMap",
        ]) {
          const texture = o.material[name];
          if (texture)
            texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
    });
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
  // Only the live task light is positional. Fixed window, shaded lamp and bounced firelight is
  // already in the atlas; this weak fill gives moving objects a soft key.
  const sun = new THREE.DirectionalLight("#e3ecff", 0.45);
  sun.position.set(-5, 6, -6);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -9,
    right: 9,
    top: 8,
    bottom: -6,
    near: 0.5,
    far: 35,
  });
  sun.shadow.normalBias = 0.002;
  sun.shadow.bias = -0.0002;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);
  const hearth = createHearth(scene);
  const focusTargets = new THREE.Group();
  scene.add(focusTargets);
  focusTargets.attach(workshop);
  focusTargets.attach(props.scene);
  return {
    mat,
    sun,
    focusTargets,
    needsAnimation: (camera) => hearth.needsAnimation(camera),
    causticReceivers: [mat.material, ...roomMaterials],
    animate(t, motion) {
      hearth.animate(t, motion);
    },
    dispose() {
      irradiance.dispose();
      emission.dispose();
      exterior.geometry.dispose();
      exterior.material.dispose();
      hearth.dispose();
    },
  };
}

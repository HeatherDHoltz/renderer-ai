import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";

export async function buildWorkshop(scene) {
  const workshop = new THREE.Group();
  workshop.name = "Rustic workshop";
  scene.add(workshop);
  const wood = new THREE.MeshStandardMaterial({
    color: "#4d3020",
    roughness: 0.85,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: "#34271e",
    roughness: 0.8,
  });
  const plaster = new THREE.MeshStandardMaterial({
    color: "#8a8065",
    roughness: 1,
  });
  const green = new THREE.MeshStandardMaterial({
    color: "#31423a",
    roughness: 0.95,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#a88948",
    metalness: 0.7,
    roughness: 0.38,
  });
  const ivory = new THREE.MeshStandardMaterial({
    color: "#e2d6b3",
    roughness: 0.92,
  });
  function box(size, position, material = wood) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    workshop.add(mesh);
    return mesh;
  }
  // An actual room, with modest materials so its silhouettes and light do the work.
  box([34, 20, 0.3], [0, 5, -11], plaster);
  box([0.3, 20, 28], [-17, 5, 0], plaster);
  box([0.3, 20, 28], [17, 5, 0], plaster);
  box([34, 5, 0.34], [0, -2.5, -10.7], green);
  box([34, 0.22, 0.45], [0, 0.05, -10.5], trim);
  box([34, 0.35, 0.7], [0, 11.5, -10.4], trim);
  for (const x of [-14, -9, 1, 14]) box([0.3, 15, 0.45], [x, 4, -10.45], trim);
  // Daylight, quietly cooling the warm candlelight.
  const sky = new THREE.MeshBasicMaterial({ color: "#99b7b4" });
  box([6.3, 7.5, 0.16], [-5.5, 5.5, -10.3], trim);
  box([5.7, 6.9, 0.1], [-5.5, 5.5, -10.15], sky);
  for (const x of [-8.5, -5.5, -2.5])
    box([0.18, 7.5, 0.3], [x, 5.5, -9.99], wood);
  for (const y of [2, 5.5, 9]) box([6.3, 0.18, 0.3], [-5.5, y, -9.98], wood);
  box([6.8, 0.3, 1.1], [-5.5, 1.9, -9.8], wood);
  const windowLight = new THREE.DirectionalLight("#d7e9ed", 2.6);
  windowLight.position.set(-7, 8, -5);
  windowLight.target.position.set(0, -1, 0);
  scene.add(windowLight, windowLight.target);

  const loader = new GLTFLoader();
  const cachedProps = new Map();
  async function prop(
    name,
    extent,
    position,
    rotation = 0,
    axis = "y",
    layFlat = false,
  ) {
    if (!cachedProps.has(name))
      cachedProps.set(
        name,
        loader.loadAsync(
          new URL(`../assets/props/${name}/model.gltf`, import.meta.url).href,
        ),
      );
    const model = (await cachedProps.get(name)).scene.clone(true);
    model.name = name;
    model.rotation.y = rotation;
    if (layFlat) model.rotation.x = -Math.PI / 2;
    model.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(extent / size[axis]);
    model.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(model);
    model.position.set(
      position[0] - (bounds.min.x + bounds.max.x) / 2,
      position[1] - bounds.min.y,
      position[2] - (bounds.min.z + bounds.max.z) / 2,
    );
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.envMapIntensity = 0.25;
          o.material.roughness = Math.max(0.55, o.material.roughness ?? 0.8);
          if (o.material.map) o.material.map.anisotropy = 2;
        }
      }
    });
    workshop.add(model);
    model.updateMatrixWorld(true);
    return model;
  }
  const table = await prop("WoodenTable_03", 28, [0, -10, -2], 0, "x");
  let tableBox = new THREE.Box3().setFromObject(table);
  table.position.y += -1.4 - tableBox.max.y;
  // Low tray on the working surface anchors the jewelry in the room.
  const mat = box([4.8, 0.12, 3.9], [0, -1.29, 0.05], green.clone());
  box([4.95, 0.13, 0.09], [0, -1.27, -1.94], brass);
  box([4.95, 0.13, 0.09], [0, -1.27, 2.04], brass);
  for (const x of [-2.44, 2.44])
    box([0.09, 0.13, 4.0], [x, -1.27, 0.05], brass);
  // Loose gem tray and a pair of hand tools, with no hands or avatar.
  const tray = box([2.3, 0.12, 1.7], [3.8, -1.25, 1.2], trim);
  box([2.06, 0.04, 1.46], [3.8, -1.16, 1.2], green);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12),
      new THREE.MeshPhysicalMaterial({
        color: ["#459f8d", "#d7c695", "#7c91ad", "#9c6461", "#c5cfcc"][i],
        metalness: 0.12,
        roughness: 0.18,
        clearcoat: 1,
      }),
    );
    g.position.set(
      3.16 + (i % 3) * 0.6,
      -1.02,
      0.86 + Math.floor(i / 3) * 0.63,
    );
    g.rotation.set(0.4, i, 0.2);
    workshop.add(g);
  }
  for (const sign of [-1, 1]) {
    const tool = box(
      [0.035, 0.035, 2.4],
      [-3.5 + sign * 0.06, -1.29, 1.1],
      brass,
    );
    tool.rotation.y = sign * 0.065 - 0.4;
  }
  await prop("wooden_hammer_01", 2.2, [-4, -1.35, -0.4], 0.6, "z", true);
  await prop("magnifying_glass_01", 2.3, [3.7, -1.3, -1.1], -0.35, "z", true);
  const shelf = await prop(
    "wooden_bookshelf_worn",
    13,
    [6.2, -4.5, -9.25],
    0,
    "y",
  );
  // Muted cloth-bound spines; the imported bookcase supplies the worn joinery.
  const bookColors = [
    "#3f5145",
    "#665743",
    "#8b7956",
    "#60443b",
    "#4a5554",
    "#aaa086",
  ];
  for (let level = 0; level < 4; level++) {
    let x = 3.05;
    for (let i = 0; i < 8; i++) {
      const bw = 0.32 + (i % 3) * 0.1,
        bh = 1.2 + ((i * 7 + level) % 5) * 0.12;
      const m = new THREE.MeshStandardMaterial({
        color: bookColors[(i + level) % bookColors.length],
        roughness: 1,
      });
      const shelfTop = -4.5 + [0.65, 0.95, 1.26, 1.65][level] * (13 / 2.063442);
      const book = box(
        [bw, bh, 1.0],
        [x + bw / 2, shelfTop + 0.03 + bh / 2, -8.55],
        m,
      );
      if (i === 7) book.rotation.z = -0.09;
      for (const dy of [-bh * 0.32, bh * 0.32])
        box(
          [bw * 0.85, 0.035, 0.015],
          [x + bw / 2, book.position.y + dy, -8.035],
          brass,
        );
      x += bw + 0.045;
    }
  }
  // A small botanical pot on the windowsill.
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.27, 0.55, 24),
    new THREE.MeshStandardMaterial({ color: "#9a7054", roughness: 1 }),
  );
  pot.position.set(-5.5, 2.33, -9.45);
  workshop.add(pot);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), green);
    leaf.scale.set(0.12, 0.7, 0.06);
    leaf.position.set(
      -5.5 + Math.sin(i) * 0.22,
      2.92,
      -9.45 + Math.cos(i) * 0.2,
    );
    leaf.rotation.z = Math.sin(i) * 0.55;
    workshop.add(leaf);
  }
  // Wall sketches use lines and paper geometry, rather than high-resolution art.
  box([2.35, 2.8, 0.16], [0.7, 4.8, -10.15], trim);
  box([2.12, 2.57, 0.04], [0.7, 4.8, -10.04], ivory);
  const drawingPoints = [
    [-0.05, 5.2, -10],
    [1.45, 5.2, -10],
    [1.7, 4.8, -10],
    [0.7, 3.95, -10],
    [-0.3, 4.8, -10],
    [-0.05, 5.2, -10],
    [0.7, 5.2, -10],
    [0.25, 4.8, -10],
    [0.7, 3.95, -10],
    [1.15, 4.8, -10],
    [0.7, 5.2, -10],
  ];
  const drawing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      drawingPoints.map((p) => new THREE.Vector3(...p)),
    ),
    new THREE.LineBasicMaterial({ color: "#6a654c" }),
  );
  workshop.add(drawing);

  const candles = [];
  for (const [x, z, height] of [
    [-3.8, -2.8, 2.7],
    [4.7, -4.4, 3.1],
  ]) {
    const candle = await prop(
      "wooden_candlestick",
      height,
      [x, -1.4, z],
      0,
      "y",
    );
    const bbox = new THREE.Box3().setFromObject(candle);
    const y = bbox.max.y + 0.12;
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(5, 2.3, 0.35),
        toneMapped: false,
      }),
    );
    flame.position.set(x, y, z);
    flame.scale.set(0.065, 0.19, 0.065);
    workshop.add(flame);
    const light = new THREE.PointLight("#ffba62", 32, 12, 2);
    light.position.set(x, y, z);
    scene.add(light);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const ctx = glowCanvas.getContext("2d"),
      gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "#ffe9baaa");
    gradient.addColorStop(0.15, "#ffb64b33");
    gradient.addColorStop(1, "#ff9f2200");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(glowCanvas),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    glow.position.copy(flame.position);
    glow.scale.set(1, 1, 1);
    workshop.add(glow);
    candles.push({ flame, light, glow });
  }
  return {
    mat,
    animate(time, motion = true) {
      candles.forEach(({ flame, light }, i) => {
        const flicker = motion
          ? 1 +
            0.055 * Math.sin(time * 7 + i * 4) +
            0.025 * Math.sin(time * 13 + i)
          : 1;
        flame.scale.y = 0.19 * flicker;
        light.intensity = 32 * flicker;
      });
    },
    dispose() {
      workshop.traverse((o) => {
        o.geometry?.dispose();
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          material?.map?.dispose();
          material?.dispose();
        }
      });
    },
  };
}

export function makeEyepiece(camera) {
  const group = new THREE.Group();
  group.name = "Physical inspection eyepiece";
  camera.add(group);
  const black = new THREE.MeshStandardMaterial({
    color: "#11130f",
    metalness: 0.28,
    roughness: 0.4,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: "#a88d52",
    metalness: 0.9,
    roughness: 0.24,
    envMapIntensity: 0.7,
  });
  const outside = new THREE.Mesh(new THREE.RingGeometry(0.265, 3, 96), black);
  outside.position.z = -0.66;
  group.add(outside);
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.264, 0.24, 0.14, 96, 1, true),
    new THREE.MeshStandardMaterial({
      color: "#36332a",
      metalness: 0.5,
      roughness: 0.32,
      side: THREE.DoubleSide,
    }),
  );
  tube.rotation.x = Math.PI / 2;
  tube.position.z = -0.71;
  group.add(tube);
  for (const [radius, z, thickness] of [
    [0.266, -0.648, 0.018],
    [0.24, -0.78, 0.009],
  ]) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius, thickness, 16, 96),
      brass,
    );
    rim.position.z = z;
    group.add(rim);
  }
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshPhysicalMaterial({
      color: "#f4f9f1",
      roughness: 0.03,
      metalness: 0,
      transparent: true,
      opacity: 0.035,
      clearcoat: 1,
      clearcoatRoughness: 0.025,
      depthWrite: false,
      envMapIntensity: 0.3,
    }),
  );
  lens.scale.set(0.239, 0.239, 0.009);
  lens.position.z = -0.792;
  group.add(lens);
  group.visible = false;
  return group;
}

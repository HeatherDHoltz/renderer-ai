import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/addons/loaders/GLTFLoader.js";

export async function buildWorkshop(scene, surfaces) {
  const workshop = new THREE.Group();
  workshop.name = "Rustic workshop";
  scene.add(workshop);
  const wood = surfaces.wood.clone();
  wood.color.set("#a48261");
  wood.roughness = 0.85;
  const trim = new THREE.MeshStandardMaterial({
    color: "#34271e",
    roughness: 0.8,
  });
  const plaster = surfaces.plaster;
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
  // An actual window opening: the light passes between its timber mullions.
  box([8.35, 20, 0.3], [-12.825, 5, -11], plaster);
  box([19.35, 20, 0.3], [7.325, 5, -11], plaster);
  box([6.3, 6.75, 0.3], [-5.5, -1.625, -11], plaster);
  box([6.3, 5.75, 0.3], [-5.5, 12.125, -11], plaster);
  box([0.3, 20, 28], [-17, 5, 0], plaster);
  box([0.3, 20, 28], [17, 5, 0], plaster);
  box([34, 5, 0.34], [0, -2.5, -10.7], green);
  box([34, 0.22, 0.45], [0, 0.05, -10.5], trim);
  box([34, 0.35, 0.7], [0, 11.5, -10.4], trim);
  for (const x of [-14, -9, 1, 14]) box([0.3, 15, 0.45], [x, 4, -10.45], trim);
  // Daylight, quietly cooling the warm candlelight.
  const exterior = new THREE.Mesh(
    new THREE.SphereGeometry(28, 48, 24),
    new THREE.MeshBasicMaterial({
      map: surfaces.forest,
      side: THREE.BackSide,
      fog: false,
    }),
  );
  exterior.position.set(-5.5, 3, -14);
  exterior.rotation.y = 1.4;
  workshop.add(exterior);
  const glass = box(
    [5.7, 6.9, 0.03],
    [-5.5, 5.5, -10.15],
    new THREE.MeshPhysicalMaterial({
      color: "#d8e3e1",
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: 0.13,
      clearcoat: 1,
      envMapIntensity: 0.4,
    }),
  );
  glass.castShadow = false;
  for (const x of [-8.5, -5.5, -2.5])
    box([0.18, 7.5, 0.3], [x, 5.5, -9.99], wood);
  for (const y of [2, 5.5, 9]) box([6.3, 0.18, 0.3], [-5.5, y, -9.98], wood);
  box([6.8, 0.3, 1.1], [-5.5, 1.9, -9.8], wood);
  const windowLight = new THREE.DirectionalLight("#dce7ef", 3.2);
  windowLight.position.set(-8, 10, -16);
  windowLight.castShadow = true;
  windowLight.shadow.mapSize.set(2048, 2048);
  Object.assign(windowLight.shadow.camera, {
    left: -15,
    right: 15,
    top: 15,
    bottom: -15,
    near: 0.5,
    far: 45,
  });
  windowLight.shadow.normalBias = 0.025;
  windowLight.shadow.bias = -0.0002;
  windowLight.shadow.radius = 2;
  windowLight.shadow.autoUpdate = false;
  windowLight.shadow.needsUpdate = true;
  windowLight.target.position.set(2, -1, 5);
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
          o.material.envMapIntensity = 0.6;
          if (name === "WoodenTable_03") {
            o.material.normalMap = surfaces.tableNormal;
            o.material.normalScale.set(0.6, 0.6);
            o.material.roughnessMap = surfaces.tableARM;
            o.material.aoMap = surfaces.tableARM;
            o.material.aoMapIntensity = 0.8;
          }
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
  const pad = surfaces.velvet.clone();
  pad.onBeforeCompile = surfaces.velvet.onBeforeCompile;
  pad.customProgramCacheKey = surfaces.velvet.customProgramCacheKey;
  pad.normalScale.set(0.12, 0.12);
  const mat = box([4.8, 0.12, 3.9], [0, -1.29, 0.05], pad);
  box([4.95, 0.13, 0.09], [0, -1.27, -1.94], brass);
  box([4.95, 0.13, 0.09], [0, -1.27, 2.04], brass);
  for (const x of [-2.44, 2.44])
    box([0.09, 0.13, 4.0], [x, -1.27, 0.05], brass);
  for (const sign of [-1, 1]) {
    const tool = box(
      [0.035, 0.035, 2.4],
      [-1.5 + sign * 0.06, -1.24, -1.6],
      brass,
    );
    tool.rotation.y = sign * 0.065 - 0.4;
  }
  await prop("wooden_hammer_01", 2.2, [-4, -1.35, -0.4], 0.6, "z", true);

  const pinShape = new THREE.Shape();
  pinShape.moveTo(-0.38, -0.7);
  pinShape.lineTo(0.38, -0.7);
  pinShape.lineTo(0.38, 0.5);
  pinShape.lineTo(0.15, 0.5);
  pinShape.lineTo(0, 0.1);
  pinShape.lineTo(-0.15, 0.5);
  pinShape.lineTo(-0.38, 0.5);
  pinShape.closePath();
  const pinGeo = new THREE.ExtrudeGeometry(pinShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.02,
    bevelSegments: 2,
    steps: 1,
  });
  pinGeo.rotateX(-Math.PI / 2);
  pinGeo.rotateY(Math.PI);
  const pin = new THREE.Mesh(pinGeo, surfaces.wood);
  pin.position.set(-0.45, -1.35, 2.5);
  pin.castShadow = true;
  pin.receiveShadow = true;
  workshop.add(pin);
  const steel = new THREE.MeshStandardMaterial({
    color: "#858e94",
    metalness: 1,
    roughness: 0.36,
  });
  const mandrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.16, 2.3, 32),
    steel,
  );
  mandrel.rotation.set(Math.PI / 2, 0, -0.32);
  mandrel.position.set(-1.8, -1.16, -2.0);
  mandrel.castShadow = true;
  workshop.add(mandrel);
  for (let i = 0; i < 11; i++) {
    const mark = new THREE.Mesh(
      new THREE.TorusGeometry(0.06 + i * 0.009, 0.003, 6, 32),
      trim,
    );
    mark.rotation.y = -0.32;
    mark.position.set(-1.8, -1.16, -3.0 + i * 0.18);
    workshop.add(mark);
  }
  const file = box([0.1, 0.06, 1.5], [-1.2, -1.22, 1.5], steel);
  file.rotation.y = -0.5;
  const fileHandle = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.07, 0.38, 8, 16),
    trim,
  );
  fileHandle.rotation.set(Math.PI / 2, 0, -0.5);
  fileHandle.position.set(-0.75, -1.16, 2.3);
  workshop.add(fileHandle);
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
    sun: windowLight,
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

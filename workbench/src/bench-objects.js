import * as THREE from "../vendor/three.module.js";

export function makeBenchObjects(scene, geometries, materials) {
  const group = new THREE.Group();
  group.name = "Touchable bench objects";
  scene.add(group);
  const targets = [],
    samples = [];
  const brass = new THREE.MeshStandardMaterial({
    color: "#a88d52",
    metalness: 0.85,
    roughness: 0.3,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: "#35271e",
    roughness: 0.8,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#141b17",
    roughness: 0.9,
  });
  // Repeatable tiny woven relief, generated locally, shared by both felt boxes.
  const size = 128,
    pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const noise = ((x * 73 + y * 131 + x * y * 19) % 97) / 97;
      pixels[y * size + x] = 105 + noise * 50 + Math.sin(x * 2.1 + y) * 14;
    }
  const weave = new THREE.DataTexture(pixels, size, size, THREE.RedFormat);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(9, 9);
  weave.needsUpdate = true;
  const felt = new THREE.MeshStandardMaterial({
    color: "#284c40",
    roughness: 1,
    bumpMap: weave,
    bumpScale: 0.012,
  });
  function mesh(geo, mat, position, parent = group) {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(...position);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(size, pos, mat, parent) {
    return mesh(new THREE.BoxGeometry(...size), mat, pos, parent);
  }
  function label(text, width, pos, parent = group) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#c6b68f";
    ctx.font = "500 27px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 63);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const p = mesh(
      new THREE.PlaneGeometry(width, width / 5.12),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
      pos,
      parent,
    );
    p.rotation.x = -Math.PI / 2;
    return p;
  }
  function tray(x, z, width, depth, title) {
    const t = new THREE.Group();
    t.position.set(x, -1.22, z);
    group.add(t);
    box([width, 0.18, depth], [0, 0, 0], wood, t);
    box([width - 0.1, 0.06, depth - 0.1], [0, 0.12, 0], felt, t);
    for (const s of [-1, 1]) {
      box([width, 0.18, 0.065], [0, 0.14, (s * depth) / 2], brass, t);
      box([0.065, 0.18, depth], [(s * width) / 2, 0.14, 0], brass, t);
    }
    // A real open lid gives the box a readable silhouette and a dark velvet back.
    const lid = box(
      [width, 0.12, depth * 0.62],
      [0, 0.57, -depth / 2 - 0.2],
      wood,
      t,
    );
    lid.rotation.x = 1.12;
    lid.userData.blockPointer = true;
    targets.push(lid);
    const lining = box(
      [width - 0.12, 0.025, depth * 0.62 - 0.12],
      [0, 0.07, 0],
      felt,
      lid,
    );
    label(title, width * 0.8, [0, 0.16, depth * 0.33], t);
    return t;
  }
  const gemTray = tray(-2.35, 0.65, 2.05, 1.6, "THE STONE BOX");
  const names = {
    tiger: "Tiger’s eye",
    diamond: "Diamond",
    emerald: "Emerald",
  };
  for (const [i, id] of ["tiger", "diamond", "emerald"].entries()) {
    const x = (i - 1) * 0.62;
    if (i < 2) box([0.025, 0.13, 0.9], [x + 0.31, 0.21, -0.15], dark, gemTray);
    const g = mesh(geometries[id], materials[id], [x, 0.2, -0.12], gemTray);
    if (id === "tiger")
      g.onBeforeRender = (_renderer, _scene, camera) => {
        const u = g.material.userData.fiberUniforms;
        g.worldToLocal(camera.getWorldPosition(u.fiberEye.value));
        g.worldToLocal(head.getWorldPosition(u.fiberLight.value));
      };
    g.scale.setScalar(0.32);
    g.rotation.y = i * 0.4;
    const hit = box(
      [0.59, 0.4, 0.9],
      [x, 0.32, -0.12],
      new THREE.MeshBasicMaterial({ visible: false }),
      gemTray,
    );
    hit.userData.action = {
      kind: "gem",
      value: id,
      label: `${names[id]} · choose stone`,
    };
    targets.push(hit);
    const halo = mesh(
      new THREE.TorusGeometry(0.225, 0.012, 8, 32),
      brass,
      [x, 0.185, -0.12],
      gemTray,
    );
    halo.rotation.x = Math.PI / 2;
    samples.push({ id, kind: "gem", object: g, baseY: g.position.y, halo });
  }
  const metalTray = tray(2.55, 1.05, 1.55, 1.5, "THE METAL BOX");
  for (const [i, id] of ["gold", "silver"].entries()) {
    const m = new THREE.MeshPhysicalMaterial({
      color: id === "gold" ? "#d5b374" : "#d6dce1",
      metalness: 1,
      roughness: 0.17,
      clearcoat: 0.4,
    });
    const ring = mesh(
      new THREE.TorusGeometry(0.18, 0.047, 16, 48),
      m,
      [(i - 0.5) * 0.64, 0.25, -0.13],
      metalTray,
    );
    ring.rotation.x = -0.8;
    const hit = box(
      [0.59, 0.4, 0.9],
      [(i - 0.5) * 0.64, 0.32, -0.12],
      new THREE.MeshBasicMaterial({ visible: false }),
      metalTray,
    );
    hit.userData.action = {
      kind: "metal",
      value: id,
      label: `${id === "gold" ? "Gold" : "Silver"} · choose setting`,
    };
    targets.push(hit);
    const halo = mesh(
      new THREE.TorusGeometry(0.235, 0.012, 8, 32),
      brass,
      [(i - 0.5) * 0.64, 0.185, -0.12],
      metalTray,
    );
    halo.rotation.x = Math.PI / 2;
    samples.push({
      id,
      kind: "metal",
      object: ring,
      baseY: ring.position.y,
      halo,
    });
  }

  // The same world-space loupe rests on the desk, travels, and becomes the eyepiece.
  const loupe = new THREE.Group();
  loupe.name = "Pick-up loupe";
  group.add(loupe);
  const body = mesh(
    new THREE.CylinderGeometry(0.275, 0.25, 0.14, 64, 1, true),
    brass,
    [0, 0, 0],
    loupe,
  );
  body.rotation.x = Math.PI / 2;
  body.material = brass.clone();
  body.material.side = THREE.DoubleSide;
  for (const z of [-0.075, 0.075])
    mesh(
      new THREE.TorusGeometry(0.275, 0.022, 12, 64),
      brass,
      [0, 0, z],
      loupe,
    );
  const handle = mesh(
    new THREE.CapsuleGeometry(0.055, 0.52, 8, 16),
    wood,
    [0, -0.58, 0],
    loupe,
  );
  mesh(
    new THREE.CylinderGeometry(0.065, 0.065, 0.14, 20),
    brass,
    [0, -0.3, 0],
    loupe,
  );
  const lens = mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.MeshPhysicalMaterial({
      color: "#d3e7df",
      transparent: true,
      opacity: 0.09,
      roughness: 0.03,
      clearcoat: 1,
      depthWrite: false,
    }),
    [0, 0, -0.05],
    loupe,
  );
  lens.scale.set(0.25, 0.25, 0.009);
  lens.castShadow = false;
  const baffle = mesh(
    new THREE.RingGeometry(0.278, 5, 96),
    new THREE.MeshBasicMaterial({
      color: "#10120f",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
    [0, 0, 0.065],
    loupe,
  );
  baffle.visible = false;
  baffle.castShadow = false;
  loupe.position.set(1.45, -1.04, 0.8);
  loupe.rotation.set(-Math.PI / 2, 0, -0.65);
  // Near-eye metal stays clean at the modest cube-shadow resolution.
  loupe.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  const restPosition = loupe.position.clone(),
    restQuaternion = loupe.quaternion.clone();
  const loupeHit = mesh(
    new THREE.BoxGeometry(0.85, 1.3, 0.25),
    new THREE.MeshBasicMaterial({ visible: false }),
    [0, -0.25, 0],
    loupe,
  );
  loupeHit.userData.action = {
    kind: "loupe",
    label: "Jeweler’s loupe · pick up",
  };
  targets.push(loupeHit);
  label("THE LOUPE", 1, [1.5, -1.19, 1.4]);

  // A jointed brass bench lamp. Its head is the actual light position.
  const lamp = new THREE.Group();
  group.add(lamp);
  const base = new THREE.Vector3(3.3, -1.16, -2.4);
  mesh(
    new THREE.CylinderGeometry(0.48, 0.55, 0.14, 40),
    brass,
    base.toArray(),
    lamp,
  );
  const armA = mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 1, 16),
    brass,
    [0, 0, 0],
    lamp,
  );
  const armB = mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1, 16),
    brass,
    [0, 0, 0],
    lamp,
  );
  const joint = mesh(
    new THREE.SphereGeometry(0.11, 20, 16),
    brass,
    [0, 0, 0],
    lamp,
  );
  const head = new THREE.Group();
  lamp.add(head);
  const shade = mesh(
    new THREE.CylinderGeometry(0.15, 0.43, 0.45, 48, 1, true),
    new THREE.MeshStandardMaterial({
      color: "#355044",
      metalness: 0.55,
      roughness: 0.34,
      side: THREE.DoubleSide,
    }),
    [0, 0.17, 0],
    head,
  );
  mesh(
    new THREE.TorusGeometry(0.43, 0.025, 12, 48),
    brass,
    [0, -0.055, 0],
    head,
  ).rotation.x = Math.PI / 2;
  const bulb = mesh(
    new THREE.SphereGeometry(0.12, 20, 16),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(4, 3.3, 2.1),
      toneMapped: false,
    }),
    [0, 0, 0],
    head,
  );
  bulb.castShadow = false;
  const lampHit = mesh(
    new THREE.SphereGeometry(0.57, 16, 12),
    new THREE.MeshBasicMaterial({ visible: false }),
    [0, 0, 0],
    head,
  );
  lampHit.userData.action = {
    kind: "lamp",
    label: "Bench lamp · drag the shade",
  };
  targets.push(lampHit);
  function link(o, a, b) {
    o.position.copy(a).lerp(b, 0.5);
    o.scale.y = a.distanceTo(b);
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
  }
  function setLamp(position) {
    head.position.copy(position);
    head.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0.7, 0).sub(position).normalize(),
    );
    const elbow = new THREE.Vector3(
      base.x + 0.12,
      Math.max(3.3, position.y + 0.5),
      base.z - 0.1,
    );
    link(armA, base, elbow);
    link(armB, elbow, position);
    joint.position.copy(elbow);
  }
  return {
    targets,
    loupe,
    baffle,
    restPosition,
    restQuaternion,
    setLamp,
    select(kind, value) {
      for (const s of samples)
        if (s.kind === kind) s.halo.visible = s.id === value;
    },
    animate(time, hover, motion = true) {
      for (const s of samples) {
        const active = motion && hover?.kind === s.kind && hover.value === s.id;
        s.object.position.y = THREE.MathUtils.damp(
          s.object.position.y,
          s.baseY + (active ? 0.07 : 0),
          14,
          time,
        );
      }
    },
  };
}

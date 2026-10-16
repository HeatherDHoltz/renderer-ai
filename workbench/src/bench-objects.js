import * as THREE from "../vendor/three.module.js";
import { velvetInsert } from "./velvet-insert.js";
import { METALS, FINISHES, metalMaterial } from "./metals.js";

export function makeBenchObjects(
  scene,
  geometries,
  materials,
  surfaces,
  light,
) {
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
  const wood = surfaces.wood;
  const felt = surfaces.velvet;
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
  function bevelBox(size, pos, material, parent = group) {
    const [w, h, d] = size,
      b = Math.min(0.035, h * 0.2, w * 0.08, d * 0.08);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + b, -d / 2);
    shape.lineTo(w / 2 - b, -d / 2);
    shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + b);
    shape.lineTo(w / 2, d / 2 - b);
    shape.quadraticCurveTo(w / 2, d / 2, w / 2 - b, d / 2);
    shape.lineTo(-w / 2 + b, d / 2);
    shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - b);
    shape.lineTo(-w / 2, -d / 2 + b);
    shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + b, -d / 2);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: true,
      bevelSize: b * 0.4,
      bevelThickness: b * 0.4,
      bevelSegments: 3,
      curveSegments: 8,
      steps: 1,
    });
    geo.translate(0, 0, -h / 2);
    geo.rotateX(-Math.PI / 2);
    return mesh(geo, material, pos, parent);
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
  function tray(x, z, width, depth, title, pockets, ring = false) {
    const t = new THREE.Group();
    t.position.set(x, -1.22, z);
    group.add(t);
    bevelBox([width, 0.23, depth], [0, 0, 0], wood, t);
    mesh(
      velvetInsert(width - 0.12, depth - 0.12, pockets, ring),
      felt,
      [0, 0, 0],
      t,
    );
    for (const s of [-1, 1]) {
      bevelBox([width, 0.26, 0.065], [0, 0.12, (s * depth) / 2], wood, t);
      bevelBox([0.065, 0.26, depth], [(s * width) / 2, 0.12, 0], wood, t);
    }
    // A real open lid gives the box a readable silhouette and a dark velvet back.
    const lid = bevelBox(
      [width, 0.12, depth * 0.62],
      [0, 0.57, -depth / 2 - 0.2],
      wood,
      t,
    );
    lid.rotation.x = 1.12;
    lid.userData.blockPointer = true;
    targets.push(lid);
    const lining = bevelBox(
      [width - 0.12, 0.025, depth * 0.62 - 0.12],
      [0, 0.07, 0],
      felt,
      lid,
    );
    label(title, width * 0.8, [0, 0.335, depth * 0.36], t);
    return t;
  }
  const gemPockets = [-0.62, 0, 0.62].map((x) => ({
    x,
    z: -0.12,
    rx: 0.25,
    rz: 0.36,
    depth: 0.16,
  }));
  const gemTray = tray(-2.35, 0.65, 2.05, 1.6, "THE STONE BOX", gemPockets);
  const names = {
    tiger: "Tiger’s eye",
    diamond: "Diamond",
    emerald: "Emerald",
  };
  for (const [i, id] of ["tiger", "diamond", "emerald"].entries()) {
    const x = (i - 1) * 0.62;

    const g = mesh(geometries[id], materials[id], [x, 0.2, -0.12], gemTray);
    g.onBeforeRender = (_r, _s, camera) => {
      if (g.material.userData.update)
        g.material.userData.update(g, camera, light);
      else if (id === "tiger") {
        const u = g.material.userData.fiberUniforms;
        g.worldToLocal(camera.getWorldPosition(u.fiberEye.value));
        g.worldToLocal(light.getWorldPosition(u.fiberLight.value));
      }
    };
    g.layers.set(1);
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
      new THREE.TorusGeometry(0.25, 0.006, 8, 48),
      brass,
      [x, 0.315, -0.12],
      gemTray,
    );
    halo.rotation.x = Math.PI / 2;
    samples.push({ id, kind: "gem", object: g, baseY: g.position.y, halo });
  }
  const ringPockets = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 6; col++)
      ringPockets.push({
        x: (col - 2.5) * 0.34,
        z: (row - 1) * 0.45 - 0.06,
        rx: 0.13,
        rz: 0.055,
        depth: 0.17,
      });
  const metalTray = tray(
    2.9,
    1.05,
    2.25,
    1.75,
    "THE RING COLLECTION",
    ringPockets,
    true,
  );
  for (const [row, finish] of FINISHES.entries())
    for (const [col, id] of Object.keys(METALS).entries()) {
      const x = (col - 2.5) * 0.34,
        z = (row - 1) * 0.45 - 0.06;
      const ring = mesh(
        new THREE.TorusGeometry(0.12, 0.027, 16, 64),
        metalMaterial(id, finish.value),
        [x, 0.34, z],
        metalTray,
      );
      ring.layers.set(1);
      ring.rotation.x = -0.15;
      const hit = box(
        [0.32, 0.42, 0.4],
        [x, 0.36, z],
        new THREE.MeshBasicMaterial({ visible: false }),
        metalTray,
      );
      hit.userData.action = {
        kind: "metal",
        value: id,
        finish: finish.value,
        label: `${METALS[id].name} · ${finish.name.toLowerCase()} · select ring`,
      };
      targets.push(hit);
      const halo = mesh(
        new THREE.TorusGeometry(0.14, 0.005, 8, 32),
        brass,
        [x, 0.312, z],
        metalTray,
      );
      halo.rotation.x = Math.PI / 2;
      samples.push({
        id,
        kind: "metal",
        finish: finish.value,
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
      o.layers.set(1);
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
      color: new THREE.Color(160, 138, 107),
      toneMapped: false,
    }),
    [0, 0, 0],
    head,
  );
  bulb.castShadow = false;
  const diffuser = mesh(
    new THREE.CircleGeometry(0.29, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(80, 69, 54),
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    [0, -0.045, 0],
    head,
  );
  diffuser.rotation.x = Math.PI / 2;
  diffuser.castShadow = false;
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
    reflectionMaterials: samples
      .filter((s) => s.kind === "metal")
      .map((s) => s.object.material),
    loupe,
    baffle,
    restPosition,
    restQuaternion,
    setLamp,
    select(kind, value, finish = 14) {
      for (const s of samples)
        if (s.kind === kind)
          s.halo.visible =
            s.id === value &&
            (kind !== "metal" ||
              Math.abs(s.finish - finish) ===
                Math.min(...FINISHES.map((f) => Math.abs(f.value - finish))));
    },
    animate(time, hover, motion = true) {
      for (const s of samples) {
        const active =
          motion &&
          hover?.kind === s.kind &&
          hover.value === s.id &&
          (s.kind !== "metal" || hover.finish === s.finish);
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

import * as THREE from "../vendor/three.module.js";
import { GEMS } from "./gems.js";
import { ease, caseInspectionView } from "./interaction.js";
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
  const cases = {};
  function tray(parent, width, depth, lining, pockets, rings = false) {
    const t = new THREE.Group();
    parent.add(t);
    bevelBox([width, 0.16, depth], [0, 0.07, 0], wood, t);
    mesh(
      velvetInsert(width - 0.12, depth - 0.12, pockets, rings),
      lining,
      [0, 0, 0],
      t,
    );
    for (const sign of [-1, 1]) {
      bevelBox([width, 0.15, 0.055], [0, 0.24, (sign * depth) / 2], wood, t);
      bevelBox([0.055, 0.15, depth], [(sign * width) / 2, 0.24, 0], wood, t);
    }
    return t;
  }
  function makeCase(id, x, z, title, lining, rings = false) {
    const width = 2.25,
      depth = 1.85;
    const c = new THREE.Group();
    c.position.set(x, -1.29, z);
    group.add(c);
    const action = {
      kind: "box",
      value: id,
      label: `${title} · open and examine`,
    };
    const base = bevelBox(
      [width + 0.1, 0.19, depth + 0.1],
      [0, 0.04, 0],
      wood,
      c,
    );
    base.userData.action = action;
    targets.push(base);
    for (const sign of [-1, 1]) {
      for (const [size, pos] of [
        [
          [width + 0.1, 0.86, 0.075],
          [0, 0.49, (sign * (depth + 0.04)) / 2],
        ],
        [
          [0.075, 0.86, depth + 0.1],
          [(sign * (width + 0.04)) / 2, 0.49, 0],
        ],
      ]) {
        const wall = bevelBox(size, pos, wood, c);
        wall.userData.action = action;
        targets.push(wall);
      }
    }
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.94, -(depth + 0.1) / 2);
    hinge.rotation.x = -1.76;
    c.add(hinge);
    const lid = bevelBox(
      [width + 0.1, 0.15, depth + 0.1],
      [0, 0, (depth + 0.1) / 2],
      wood,
      hinge,
    );
    lid.userData.action = action;
    targets.push(lid);
    const inside = bevelBox(
      [width - 0.04, 0.025, depth - 0.04],
      [0, -0.089, (depth + 0.1) / 2],
      lining,
      hinge,
    );
    inside.userData.action = action;
    targets.push(inside);
    for (const hx of [-0.75, 0.75]) {
      const h = mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.3, 20),
        brass,
        [hx, 0.92, -depth / 2],
        c,
      );
      h.rotation.z = Math.PI / 2;
    }
    bevelBox([0.25, 0.11, 0.04], [0, 0.63, depth / 2 + 0.06], brass, c);
    const pockets = [];
    for (let row = 0; row < (rings ? 3 : 2); row++)
      for (let col = 0; col < 3; col++)
        pockets.push({
          x: (col - 1) * 0.65,
          z: (row - (rings ? 1 : 0.5)) * (rings ? 0.47 : 0.72),
          rx: rings ? 0.18 : 0.25,
          rz: rings ? 0.065 : 0.27,
          depth: rings ? 0.18 : 0.15,
        });
    const lower = tray(c, width - 0.13, depth - 0.13, lining, pockets, rings);
    lower.position.y = 0.06;
    const upper = tray(c, width - 0.13, depth - 0.13, lining, pockets, rings);
    upper.position.y = 0.63;
    label(title, width * 0.8, [0, 0.97, depth * 0.49], c);
    const links = [];
    for (const zz of [-0.68, 0.68]) {
      const bar = mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 1, 12),
        brass,
        [0, 0, 0],
        c,
      );
      links.push({ bar, z: zz });
    }
    const result = {
      root: c,
      lower,
      upper,
      width,
      depth,
      hinge,
      links,
      progress: 0,
      destination: 0,
      sign: id === "gems" ? -1 : 1,
    };
    cases[id] = result;
    return result;
  }
  const gemCase = makeCase(
    "gems",
    -2.85,
    0.55,
    "THE STONE BOX",
    surfaces.redVelvet,
  );
  const metalCase = makeCase(
    "metals",
    3.05,
    0.8,
    "THE RING COLLECTION",
    felt,
    true,
  );
  for (const [i, id] of Object.keys(GEMS).entries()) {
    const parent = i < 6 ? gemCase.upper : gemCase.lower;
    const cell = i % 6,
      x = ((cell % 3) - 1) * 0.65,
      z = (Math.floor(cell / 3) - 0.5) * 0.72;
    const g = mesh(geometries[id], materials[id], [x, 0.21, z], parent);
    g.scale.setScalar(0.34);
    g.rotation.y = 0.2;
    g.onBeforeRender = (_r, _s, camera) => {
      if (g.material.userData.update)
        g.material.userData.update(g, camera, light);
      else {
        const u = g.material.userData.fiberUniforms;
        g.worldToLocal(camera.getWorldPosition(u.fiberEye.value));
        g.worldToLocal(light.getWorldPosition(u.fiberLight.value));
      }
    };
    g.layers.set(1);
    const hit = box(
      [0.61, 0.4, 0.62],
      [x, 0.36, z],
      new THREE.MeshBasicMaterial({ visible: false }),
      parent,
    );
    hit.userData.action = {
      kind: "gem",
      value: id,
      label: `${GEMS[id].name} · choose stone`,
    };
    targets.push(hit);
    const halo = mesh(
      new THREE.TorusGeometry(0.25, 0.005, 8, 48),
      brass,
      [x, 0.315, z],
      parent,
    );
    halo.rotation.x = Math.PI / 2;
    samples.push({ id, kind: "gem", object: g, baseY: g.position.y, halo });
  }
  const combos = FINISHES.flatMap((f) =>
    Object.keys(METALS).map((id) => ({ id, finish: f.value, name: f.name })),
  );
  for (const [i, { id, finish, name }] of combos.entries()) {
    const parent = i < 9 ? metalCase.upper : metalCase.lower,
      cell = i % 9;
    const x = ((cell % 3) - 1) * 0.65,
      z = (Math.floor(cell / 3) - 1) * 0.47;
    const ring = mesh(
      geometries.shank,
      metalMaterial(id, finish),
      [x, 0.39, z],
      parent,
    );
    ring.scale.setScalar(0.18);
    ring.layers.set(1);
    ring.rotation.x = -0.15;
    // Matching empty solitaire mounts, rather than broken open bands.
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const path = new THREE.CatmullRomCurve3([
          new THREE.Vector3(sx * 0.65, 0.65, sz * 0.03),
          new THREE.Vector3(sx * 0.48, 0.94, sz * 0.22),
          new THREE.Vector3(sx * 0.3, 1.1, sz * 0.3),
        ]);
        const claw = new THREE.Mesh(
          new THREE.TubeGeometry(path, 12, 0.035, 8, false),
          ring.material,
        );
        claw.layers.set(1);
        ring.add(claw);
      }
    const hit = box(
      [0.6, 0.43, 0.43],
      [x, 0.41, z],
      new THREE.MeshBasicMaterial({ visible: false }),
      parent,
    );
    hit.userData.action = {
      kind: "metal",
      value: id,
      finish,
      label: `${METALS[id].name} · ${name.toLowerCase()} · select ring`,
    };
    targets.push(hit);
    const halo = mesh(
      new THREE.TorusGeometry(0.21, 0.005, 8, 40),
      brass,
      [x, 0.317, z],
      parent,
    );
    halo.rotation.x = Math.PI / 2;
    samples.push({
      id,
      kind: "metal",
      finish,
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

  return {
    targets,
    cases,
    focusBox(id) {
      for (const [key, c] of Object.entries(cases))
        c.destination = key === id ? 1 : 0;
    },
    boxView(id, aspect) {
      const c = cases[id];
      return caseInspectionView(c.root.position, c.sign, aspect);
    },
    reflectionMaterials: samples
      .filter((s) => s.kind === "metal")
      .map((s) => s.object.material),
    loupe,
    baffle,
    restPosition,
    restQuaternion,
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
      for (const c of Object.values(cases)) {
        c.progress = THREE.MathUtils.damp(
          c.progress,
          c.destination,
          motion ? 4 : 8,
          time,
        );
        if (Math.abs(c.progress - c.destination) < 0.001)
          c.progress = c.destination;
        const p = ease(c.progress);
        c.lower.position.y = 0.06 + 0.5 * p;
        c.upper.position.x = c.sign * (c.width + 0.16) * p;
        c.upper.position.y = 0.63 + 0.21 * Math.sin(p * Math.PI);
        for (const { bar, z } of c.links) {
          const a = new THREE.Vector3(c.sign * 0.83, 0.42, z),
            b = new THREE.Vector3(
              c.upper.position.x + c.sign * 0.83,
              c.upper.position.y + 0.06,
              z,
            );
          bar.position.copy(a).lerp(b, 0.5);
          bar.scale.y = a.distanceTo(b);
          bar.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            b.sub(a).normalize(),
          );
          bar.visible = p > 0.005;
        }
      }
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

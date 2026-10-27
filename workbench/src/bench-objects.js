import * as THREE from "../vendor/three.module.js";
import { GEMS } from "./gems.js";
import { ease, caseInspectionView, LOUPE } from "./interaction.js";
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
  function label(text, width, pos, parent = group, fontSize = 27) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#c6b68f";
    ctx.font = `500 ${fontSize}px Georgia`;
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
  // Victorian cantilever jewellery boxes (matching scripts/railcar/cases.py):
  // rosewood with brass, a velvet well, and on each side two tiers of trays on
  // brass parallel arms. Opening swings the top tier out and down to the outer
  // step while the tier below rises to the inner, higher step; a parallelogram
  // linkage keeps every tray level. The open lid is lined with a padded panel
  // of the case's own velvet, as period jewellery boxes were (a mirror there
  // read as a black screen against the dark room).
  // The cases take less of the live jewellery fill than the stones do: at full
  // strength their rosewood and velvet read 2-3x brighter than the approved
  // Cycles reference (r16), whose cases are lit only by the room and the
  // examination lamps. Measured: velvet 203 vs 137 sRGB, case front 66 vs 24.
  const caseLightParam = Number(new URLSearchParams(globalThis.location?.search || "").get("caselight"));
  const CASE_LIGHT = Number.isFinite(caseLightParam) && caseLightParam > 0 ? caseLightParam : 0.285;
  const sheenParam = new URLSearchParams(globalThis.location?.search || "").get("casesheen");
  // Three's cloth lobe is broader and brighter than the source Cycles velvet.
  // Calibrate its response independently so the dyed diffuse colour survives.
  const CASE_SHEEN = sheenParam !== null && Number.isFinite(Number(sheenParam))
    ? Math.max(0, Number(sheenParam)) : 0.2;
  const caseLit = new Map();
  function caseMaterial(source) {
    if (caseLit.has(source)) return caseLit.get(source);
    const m = source.clone();
    const previous = source.onBeforeCompile;
    // Match the warm room illumination on the cloth without recolouring its
    // photographed pile or the neutral examination light used by gemstones.
    const clothTint = source.sheen > 0 ? "vec3(1.0, 0.56, 0.56)" : "vec3(1.0)";
    m.onBeforeCompile = (shader, renderer) => {
      previous?.call(m, shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
  reflectedLight.directDiffuse *= ${CASE_LIGHT.toFixed(3)} * ${clothTint};
  reflectedLight.indirectDiffuse *= ${CASE_LIGHT.toFixed(3)} * ${clothTint};
  reflectedLight.directSpecular *= ${CASE_LIGHT.toFixed(3)};
  // ...and the studio probe set up for the stones, which turned velvet pastel.
  reflectedLight.indirectSpecular *= ${CASE_LIGHT.toFixed(3)} * ${clothTint};
  #ifdef USE_SHEEN
    sheenSpecularDirect *= ${(CASE_LIGHT * CASE_SHEEN).toFixed(3)} * ${clothTint};
    sheenSpecularIndirect *= ${(CASE_LIGHT * CASE_SHEEN).toFixed(3)} * ${clothTint};
  #endif`,
      );
    };
    const key = source.customProgramCacheKey.bind(source);
    m.customProgramCacheKey = () => `${key()}|case-light-${CASE_LIGHT}|sheen-${CASE_SHEEN}`;
    caseLit.set(source, m);
    return m;
  }
  const caseBrass = caseMaterial(brass);
  const rosewood = caseMaterial(wood.clone());
  rosewood.color.set("#6a3326");
  const BODY = { width: 2.25, depth: 1.85, height: 1.28 },
    TRAY = { width: 1.02, depth: 1.72 },
    ARM_SPREAD = 0.08;
  // Tray base positions (x toward the side the tier opens, y up), case-local.
  // Each pivot sits on the perpendicular bisector of its closed/open positions,
  // so one rigid arm length carries the tray between them.
  const TIERS = [
    { closed: [0.53, 1.3], open: [2.0, 0.8], pivotY: 0.55, from: 0, to: 0.65, armZ: 1.07 },
    { closed: [0.53, 0.68], open: [1.0, 1.4], pivotY: 0.86, from: 0.3, to: 1, armZ: 1.02 },
  ].map((tier) => {
    const [cx, cy] = tier.closed,
      [ox, oy] = tier.open;
    const mx = (cx + ox) / 2,
      my = (cy + oy) / 2;
    const px = mx + ((my - tier.pivotY) * (oy - cy)) / (ox - cx);
    return {
      ...tier,
      pivot: [px, tier.pivotY],
      radius: Math.hypot(cx - px, cy - tier.pivotY),
      closedAngle: Math.atan2(cy - tier.pivotY, cx - px),
      openAngle: Math.atan2(oy - tier.pivotY, ox - px),
    };
  });
  function tray(parent, width, depth, lining, pockets, rings = false) {
    const t = new THREE.Group();
    parent.add(t);
    const insert = velvetInsert(width - 0.12, depth - 0.12, pockets, rings);
    insert.computeBoundingBox();
    // Keep the substrate (including its bevel) below the deepest velvet slit.
    // The old fixed top at 0.15 poked through the depressed ring pockets.
    const bottom = -0.01, top = Math.min(0.15, insert.boundingBox.min.y - 0.02);
    const floor = bevelBox([width, top - bottom, depth], [0, (top + bottom) / 2, 0], rosewood, t);
    floor.userData.previewPart = "substrate";
    const upholstery = mesh(insert, lining, [0, 0, 0], t);
    upholstery.userData.previewPart = "lining";
    for (const sign of [-1, 1]) {
      bevelBox([width, 0.15, 0.055], [0, 0.24, (sign * depth) / 2], rosewood, t);
      bevelBox([0.055, 0.15, depth], [(sign * width) / 2, 0.24, 0], rosewood, t);
    }
    // Brass edge on the front lip, as on the Blender trays.
    box([width, 0.03, 0.012], [0, 0.3, depth / 2 + 0.03], caseBrass, t);
    return t;
  }
  function makeCase(id, x, z, title, velvet, layout) {
    const { width, depth, height } = BODY;
    const lining = caseMaterial(velvet);
    const c = new THREE.Group();
    c.position.set(x, -1.29, z);
    group.add(c);
    c.scale.setScalar(0.78);
    const action = {
      kind: "box",
      value: id,
      label: `${title} · open and examine`,
    };
    const touch = (o) => {
      o.userData.action = action;
      targets.push(o);
      return o;
    };
    const base = touch(bevelBox([width + 0.1, 0.19, depth + 0.1], [0, 0.04, 0], rosewood, c));
    base.name = `${id} case base`;
    // Include the bevel's extension: the case rests on the leather, rather
    // than hovering above it. This same geometry feeds the Cycles preview.
    base.geometry.computeBoundingBox();
    c.position.y = -1.399 - c.scale.y * (base.position.y + base.geometry.boundingBox.min.y);
    const wallY = 0.06 + height / 2;
    for (const sign of [-1, 1]) {
      touch(
        bevelBox(
          [width + 0.1, height, 0.075],
          [0, wallY, (sign * (depth + 0.04)) / 2],
          rosewood,
          c,
        ),
      );
      touch(
        bevelBox(
          [0.075, height, depth + 0.1],
          [(sign * (width + 0.04)) / 2, wallY, 0],
          rosewood,
          c,
        ),
      );
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        box(
          [0.09, height + 0.02, 0.09],
          [(sx * (width + 0.1)) / 2, wallY, (sz * (depth + 0.1)) / 2],
          caseBrass,
          c,
        );
    const rim = 0.06 + height;
    // Lid stands open behind; its inner face is a padded velvet lining.
    const hinge = new THREE.Group();
    hinge.position.set(0, rim + 0.02, -(depth + 0.1) / 2);
    hinge.rotation.x = -2.5;
    c.add(hinge);
    touch(
      bevelBox(
        [width + 0.1, 0.15, depth + 0.1],
        [0, 0, (depth + 0.1) / 2],
        rosewood,
        hinge,
      ),
    );
    const lidLining = touch(
      bevelBox(
        [width - 0.24, 0.06, depth - 0.24],
        [0, -0.1, (depth + 0.1) / 2],
        lining,
        hinge,
      ),
    );
    lidLining.userData.previewPart = "lid-lining";
    for (const [size, pos] of [
      [[width - 0.14, 0.03, 0.05], [0, -0.09, 0.12]],
      [[width - 0.14, 0.03, 0.05], [0, -0.09, depth - 0.02]],
      [[0.05, 0.03, depth - 0.14], [-(width - 0.19) / 2, -0.09, (depth + 0.1) / 2]],
      [[0.05, 0.03, depth - 0.14], [(width - 0.19) / 2, -0.09, (depth + 0.1) / 2]],
    ])
      box(size, pos, caseBrass, hinge);
    for (const hx of [-0.75, 0.75]) {
      const h = mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.3, 20),
        caseBrass,
        [hx, rim, -depth / 2 - 0.02],
        c,
      );
      h.rotation.z = Math.PI / 2;
    }
    bevelBox([0.25, 0.11, 0.04], [0, rim - 0.3, depth / 2 + 0.06], caseBrass, c);
    label(title, width * 0.8, [0, rim + 0.015, depth * 0.49], c);
    const well = tray(
      c,
      width - 0.13,
      depth - 0.13,
      lining,
      layout.wellPockets,
      layout.rings,
    );
    well.position.y = 0.06;
    const trays = [];
    const armGeometry = new THREE.CylinderGeometry(0.026, 0.026, 1, 12);
    for (const tier of TIERS)
      for (const side of [-1, 1]) {
        const t = tray(
          c,
          TRAY.width,
          TRAY.depth,
          lining,
          layout.trayPockets,
          layout.rings,
        );
        const arms = [];
        for (const end of [-1, 1])
          for (const spread of [-ARM_SPREAD, ARM_SPREAD]) {
            const z = end * tier.armZ;
            // Lug from the tray end out to the arm, and the arm's pivot boss.
            box(
              [0.06, 0.06, tier.armZ - TRAY.depth / 2 + 0.03],
              [side * spread, 0.1, (end * (tier.armZ + TRAY.depth / 2)) / 2],
              caseBrass,
              t,
            );
            const boss = mesh(
              new THREE.CylinderGeometry(0.04, 0.04, tier.armZ - depth / 2 + 0.02, 16),
              caseBrass,
              [
                side * (tier.pivot[0] + spread),
                tier.pivot[1],
                (end * (tier.armZ + depth / 2 + 0.02)) / 2,
              ],
              c,
            );
            boss.rotation.x = Math.PI / 2;
            arms.push({ bar: mesh(armGeometry, caseBrass, [0, 0, 0], c), spread, z });
          }
        trays.push({ tray: t, tier, side, arms });
      }
    const result = {
      root: c,
      well,
      trays,
      width,
      depth,
      progress: 0,
      destination: 0,
    };
    poseCase(result, 0);
    cases[id] = result;
    return result;
  }
  function poseCase(c, p) {
    const from = new THREE.Vector3(),
      to = new THREE.Vector3(),
      up = new THREE.Vector3(0, 1, 0);
    for (const { tray: t, tier, side, arms } of c.trays) {
      const local = ease((p - tier.from) / (tier.to - tier.from));
      const angle =
        tier.closedAngle + (tier.openAngle - tier.closedAngle) * local;
      const [px, py] = tier.pivot;
      const tx = px + tier.radius * Math.cos(angle),
        ty = py + tier.radius * Math.sin(angle);
      t.position.set(side * tx, ty, 0);
      for (const { bar, spread, z } of arms) {
        from.set(side * (px + spread), py, z);
        to.set(side * (tx + spread), ty + 0.1, z);
        bar.position.copy(from).lerp(to, 0.5);
        bar.scale.y = from.distanceTo(to);
        bar.quaternion.setFromUnitVectors(up, to.sub(from).normalize());
      }
    }
  }
  // Contents: the top tier shows at rest; the lower tier and the well appear
  // as the box opens. Gem trays hold two stones, ring trays one metal in
  // three finishes; the well holds the rest (as in cases.py). Well rows sit
  // toward the back so the front wall does not hide them from the
  // inspection camera (about 50° above the desk).
  const wellGemRows = [-0.5, 0.15],
    wellRingRows = [-0.62, -0.17, 0.28];
  const gemCase = makeCase("gems", -2.85, 1.45, "THE STONE BOX", surfaces.redVelvet, {
    wellPockets: [-1, 1].flatMap((sx) =>
      wellGemRows.map((z) => ({ x: sx * 0.28, z, rx: 0.25, rz: 0.27, depth: 0.15 })),
    ),
    trayPockets: [-1, 1].map((sz) => ({ x: 0, z: sz * 0.42, rx: 0.25, rz: 0.27, depth: 0.15 })),
  });
  const ringRows = [-0.47, 0, 0.47];
  const metalCase = makeCase("metals", 3.05, 1.4, "THE RING COLLECTION", felt, {
    rings: true,
    wellPockets: [-1, 1].flatMap((sx) =>
      wellRingRows.map((z) => ({ x: sx * 0.27, z, rx: 0.18, rz: 0.065, depth: 0.18 })),
    ),
    trayPockets: ringRows.map((z) => ({ x: 0, z, rx: 0.18, rz: 0.065, depth: 0.18 })),
  });
  // Slot order: top-tier trays, lower-tier trays, then the well.
  const slots = (c, perTray, wellSlots) => [
    ...c.trays.flatMap(({ tray: t }) => perTray.map(([x, z]) => ({ parent: t, x, z }))),
    ...wellSlots.map(([x, z]) => ({ parent: c.well, x, z })),
  ];
  const gemSlots = slots(
    gemCase,
    [[0, -0.42], [0, 0.42]],
    [-0.28, 0.28].flatMap((x) => wellGemRows.map((z) => [x, z])),
  );
  for (const [i, id] of Object.keys(GEMS).entries()) {
    const { parent, x, z } = gemSlots[i];
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
  const combos = Object.keys(METALS).flatMap((id) =>
    FINISHES.map((f) => ({ id, finish: f.value, name: f.name })),
  );
  const ringSlots = slots(
    metalCase,
    ringRows.map((z) => [0, z]),
    [-0.27, 0.27].flatMap((x) => wellRingRows.map((z) => [x, z])),
  );
  for (const [i, { id, finish, name }] of combos.entries()) {
    const { parent, x, z } = ringSlots[i];
    const ring = mesh(
      geometries.shank,
      caseMaterial(metalMaterial(id, finish)),
      [x, 0.39, z],
      parent,
    );
    ring.scale.setScalar(0.18);
    ring.layers.set(1);
    ring.rotation.x = -1.1;
    ring.rotation.y = 0.12;
    // Crown points toward the rear; the continuous plain shank faces the eye.
    if (i % 3 === 0)
      label(
        METALS[id].name.toUpperCase(),
        parent === metalCase.well ? 0.55 : 0.9,
        [x, 0.319, parent === metalCase.well ? -0.84 : 0.8],
        parent,
      );
    label(name.toUpperCase(), 0.5, [x, 0.319, z + 0.19], parent, 52);
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
    [0, -0.35, 0],
    loupe,
  );
  // Ideal clear achromatic eyepiece: no translucent tinted overlay over the
  // inspected image. The physical brass body and aperture remain in 3D.
  // The baffle around the rim is never drawn in colour: scene.js renders it
  // only into the surround mask, where the post pass shows the blurred,
  // unmagnified room instead of the magnified one.
  const baffle = mesh(
    new THREE.RingGeometry(0.278, 5, 96),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    [0, 0, 0.065],
    loupe,
  );
  const baffleDepth = new THREE.Mesh(
    baffle.geometry,
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: THREE.DoubleSide,
    }),
  );
  baffleDepth.position.copy(baffle.position);
  baffleDepth.renderOrder = -1000;
  baffleDepth.visible = false;
  loupe.add(baffleDepth);
  baffle.visible = false;
  baffle.castShadow = false;
  // Rests on its rims: 0.097 model units below the centre touch the leather.
  loupe.position.set(1.6, -1.4 + 0.097 * LOUPE.restScale, 1.0);
  loupe.rotation.set(-Math.PI / 2, 0, -0.65);
  loupe.scale.setScalar(LOUPE.restScale);
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
  label("ACHROMATIC", 0.45, [1.6, -1.393, 1.37]);

  return {
    targets,
    cases,
    focusBox(id) {
      for (const [key, c] of Object.entries(cases)) {
        const next=key === id ? 1 : 0;
        if (c.destination !== next) { c.animationGoal=next; c.animationFrom=c.progress; c.animationStarted=performance.now()/1000; }
        c.destination=next;
      }
    },
    boxView(id, aspect) {
      const c = cases[id];
      return caseInspectionView(c.root.position, aspect, c.root.scale.x);
    },
    // The collection metals reflect the live room capture.
    reflectionMaterials: samples.filter((s) => s.kind === "metal").map((s) => s.object.material),
    loupe,
    baffle,
    baffleDepth,
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
      let moving = false;
      for (const c of Object.values(cases)) {
        // Finite 1.19s travel matches Heather's selected box recording, in either direction.
        if (c.animationGoal !== c.destination) {
          c.animationGoal = c.destination; c.animationFrom = c.progress; c.animationStarted=performance.now()/1000;
        }
        if (c.progress !== c.destination) {
          c.animationTime = Math.min(1.19, performance.now()/1000-c.animationStarted);
          c.progress = THREE.MathUtils.lerp(c.animationFrom, c.destination, ease(c.animationTime / 1.19));
          if (c.animationTime >= 1.19) c.progress = c.destination;
        }
        moving ||= c.progress !== c.destination;
        poseCase(c, c.progress);
      }
      for (const s of samples) {
        const active =
          motion &&
          hover?.kind === s.kind &&
          hover.value === s.id &&
          (s.kind !== "metal" || hover.finish === s.finish);
        const destination = s.baseY + (active ? 0.07 : 0);
        s.object.position.y = THREE.MathUtils.damp(
          s.object.position.y,
          destination,
          14,
          time,
        );
        if (Math.abs(s.object.position.y - destination) < 0.0001)
          s.object.position.y = destination;
        else moving = true;
      }
      return moving;
    },
  };
}

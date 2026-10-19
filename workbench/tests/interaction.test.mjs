import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import {
  caseInspectionView,
  ease,
  corridorPoint,
  loupeCorridor,
  advanceProgress,
  lampControls,
  benchFraming,
  benchIntersections,
  LOUPE,
  eyepieceScale,
} from "../src/interaction.js";
import { inspectionFieldOfView } from "../src/geometry.js";

test("pickup advances by elapsed time and reverses without a pose jump", () => {
  const points = [
    new THREE.Vector3(2, -1, 1),
    new THREE.Vector3(2, 4, 1),
    new THREE.Vector3(0, 4, 3),
    new THREE.Vector3(0, 2, 3),
  ];
  let p = 0;
  for (let i = 0; i < 30; i++) p = advanceProgress(p, 1, 1 / 60, 2);
  const before = corridorPoint(points, p);
  const unchanged = advanceProgress(p, 0, 0, 2);
  assert.equal(unchanged, p);
  assert.ok(corridorPoint(points, unchanged).distanceTo(before) < 1e-12);
  for (let i = 0; i < 30; i++) p = advanceProgress(p, 0, 1 / 60, 2);
  assert.ok(p < 1e-12);
  assert.equal(advanceProgress(0.98, 1, 1), 1);
  assert.equal(advanceProgress(0.02, 0, 1), 0);
});
test("loupe travels in a non-overshooting corridor over and in front of jewelry", () => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(-1.2, -1.2, -0.7),
    new THREE.Vector3(1.2, 1.9, 0.7),
  );
  const rest = new THREE.Vector3(2.4, -1, 1),
    eye = new THREE.Vector3(0, 2.2, 2.6);
  const radius = 0.95;
  const path = loupeCorridor(rest, eye, bounds, radius);
  assert.ok(corridorPoint(path, 0).distanceTo(rest) < 1e-12);
  assert.ok(corridorPoint(path, 1).distanceTo(eye) < 1e-12);
  for (let i = 0; i <= 1000; i++) {
    const p = corridorPoint(path, i / 1000);
    assert.ok(p.toArray().every(Number.isFinite));
    assert.ok(bounds.distanceToPoint(p) >= radius, `clearance at ${i}`);
  }
  for (const t of [-2, 0, 0.2, 0.8, 1, 3])
    assert.ok(ease(t) >= 0 && ease(t) <= 1);
});

test("the loupe body and handle clear every live cut and the imported shank", async () => {
  const { readFile } = await import("node:fs/promises");
  const { readGemOBJ, normalizeGem } = await import("../src/geometry.js");
  const { cutGeometry } = await import("../src/cuts.js");
  const { solitaireGeometry } = await import("../src/geometry.js");
  const meshes = {
    tiger: normalizeGem(
      readGemOBJ(
        await readFile(
          new URL("../assets/cabochon.obj", import.meta.url),
          "utf8",
        ),
        true,
      ),
      1.38,
    ),
    ...Object.fromEntries(
      ["brilliant", "step", "oval", "cushion"].map((k) => [k, cutGeometry(k)]),
    ),
  };
  const shank = solitaireGeometry(
    await readFile(
      new URL("../assets/solitaire-shank.obj", import.meta.url),
      "utf8",
    ),
  );
  for (const [name, geometry] of Object.entries(meshes)) {
    const group = new THREE.Group(),
      root = new THREE.Group();
    group.add(root);
    root.position.y = -0.2;
    group.position.y = 0.2;
    group.rotation.set(0.12, -0.3, 0);
    const band = new THREE.Mesh(shank);

    root.add(band);
    const stone = new THREE.Mesh(geometry);
    stone.position.y = name === "tiger" ? 0.98 : 0.7;
    root.add(stone);
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group).expandByScalar(0.04);
    const center = stone.localToWorld(
      geometry.boundingBox.getCenter(new THREE.Vector3()),
    );
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(center).add(new THREE.Vector3(0, 0.95, 2.8));
    camera.lookAt(center);
    const eye = new THREE.Vector3(0, 0, -0.66)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    const rest = new THREE.Vector3(1.45, -1.04, 0.8),
      restQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.PI / 2, 0, -0.65),
      );
    const path = loupeCorridor(rest, eye, bounds);
    for (let i = 0; i <= 400; i++) {
      const t = i / 400,
        p = corridorPoint(path, t),
        q = restQ.clone().slerp(camera.quaternion, ease(t));
      for (const [y, radius] of [
        [0, 0.3],
        [-0.3, 0.07],
        [-0.45, 0.07],
        [-0.6, 0.07],
        [-0.75, 0.07],
        [-0.9, 0.07],
      ]) {
        const sample = new THREE.Vector3(0, y, 0).applyQuaternion(q).add(p);
        assert.ok(
          bounds.distanceToPoint(sample) > radius,
          `${name}: loupe clearance at ${t}`,
        );
      }
    }
  }
});

test("lamp drag maps its physical plane into bounded controls", () => {
  assert.deepEqual(lampControls(new THREE.Vector3(-3.2, 2.1, -1)), {
    angle: -100,
    height: 8,
  });
  const high = lampControls(new THREE.Vector3(3.2, 3.8, -1));
  assert.equal(high.angle, 100);
  assert.ok(Math.abs(high.height - 85) < 1e-10);
  const center = lampControls(new THREE.Vector3(0, 2.95, -1));
  assert.ok(Math.abs(center.height - 46.5) < 1e-10);
  assert.deepEqual(lampControls(new THREE.Vector3(100, -100, -1)), {
    angle: 100,
    height: 8,
  });
});

test("bench framing keeps the two felt boxes in reach at portrait, square and wide aspects", () => {
  for (const aspect of [0.45, 0.65, 1, 1.78, 2.4]) {
    const pose = benchFraming(aspect);
    const halfWidth =
      (pose.z - 1.4) *
      Math.tan(THREE.MathUtils.degToRad(pose.fov / 2)) *
      aspect;
    assert.ok(halfWidth >= 4.15 - 1e-10, `horizontal work area at ${aspect}`);
    assert.ok(pose.fov >= 46 && pose.fov <= 60);
  }
  for (const aspect of [0, -1, NaN, Infinity])
    assert.throws(() => benchFraming(aspect));
});

test("pointer picking reaches the visible ring layer and preserves ordinary bench targets", () => {
  const camera = new THREE.PerspectiveCamera(46, 1, 0.01, 50);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);
  camera.layers.enable(1);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.91, 0.12, 16, 64));
  band.layers.set(1);
  band.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const point = new THREE.Vector3(0.91, 0, 0).project(camera);
  const x = (point.x + 1) / 2,
    y = (1 - point.y) / 2;
  assert.equal(
    benchIntersections(raycaster, camera, x, y, [band])[0]?.object.uuid,
    band.uuid,
  );
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2));
  lamp.position.set((0.91 * 4) / 6, 0, 2);
  lamp.updateMatrixWorld(true);
  assert.equal(
    benchIntersections(raycaster, camera, x, y, [lamp, band])[0]?.object.uuid,
    lamp.uuid,
  );
  lamp.layers.set(2); // Excluded objects must remain unpickable.
  assert.equal(
    benchIntersections(raycaster, camera, x, y, [lamp, band])[0]?.object.uuid,
    band.uuid,
  );
  band.geometry.dispose();
  lamp.geometry.dispose();
  band.material.dispose();
  lamp.material.dispose();
});

test("case inspection looks toward its contents and frames unfolded trays at wide and narrow aspects", () => {
  for (const aspect of [0.5, 0.7, 1, 1.78, 2.4])
    for (const sign of [-1, 1]) {
      const origin = new THREE.Vector3(sign * 3, -1.29, 0.6),
        v = caseInspectionView(origin, aspect);
      const camera = new THREE.PerspectiveCamera(40, aspect, 0.025, 70);
      camera.position.copy(v.position);
      camera.quaternion.copy(v.quaternion);
      camera.updateMatrixWorld(true);
      const center = v.center.clone().project(camera);
      assert.ok(v.position.y < 9, "inspection stays below the room ceiling");
      assert.ok(
        Math.abs(center.x) < 1e-6 && Math.abs(center.y) < 1e-6 && center.z < 1,
      );
      for (const x of [-2.6, 2.6])
        for (const z of [-0.95, 0.95]) {
          const p = v.center
            .clone()
            .add(new THREE.Vector3(x, 0.12, z))
            .project(camera);
          assert.ok(
            Math.abs(p.x) < 1.02 && Math.abs(p.y) < 1.02,
            `trays fit at ${aspect}: ${p.toArray()}`,
          );
        }
    }
});

// Screen radius (fraction of half the shorter side) of a loupe model radius at
// a model depth, for the raised loupe in front of the inspection eye.
function screenRadius(radius, depth, fov, aspect) {
  const size = eyepieceScale(fov, aspect);
  const distance = LOUPE.eyeDistance - depth * LOUPE.depthScale;
  return (
    (radius * size) /
    distance /
    (Math.min(1, aspect) * Math.tan(THREE.MathUtils.degToRad(fov / 2)))
  );
}

test("the eyepiece aperture keeps one larger screen size at every magnification", () => {
  for (const aspect of [0.5, 1, 1.78, 2.4])
    for (const zoom of [2, 2.6, 4, 6]) {
      const fov = inspectionFieldOfView(zoom);
      const clear = screenRadius(
        LOUPE.apertureRadius,
        -LOUPE.apertureDepth,
        fov,
        aspect,
      );
      assert.ok(Math.abs(clear - LOUPE.aperture) < 1e-12, `${aspect} ${zoom}`);
      // The previous eyepiece showed a clear radius of 0.774.
      assert.ok(clear > 0.774 * 1.15);
      // The near brass rim (torus 0.275 + 0.022 at depth 0.075) stays outside
      // the aperture and, at landscape aspects, inside the screen width.
      const rim = screenRadius(0.297, 0.097, fov, aspect);
      assert.ok(rim > clear * 1.25);
      if (aspect >= 1.6) assert.ok(rim < aspect * 0.8);
    }
  for (const [fov, aspect] of [[0, 1], [180, 1], [30, 0], [30, NaN]])
    assert.throws(() => eyepieceScale(fov, aspect));
});

test("the resting loupe is 50% larger than the previous model and the raised lens clears a turning specimen", async () => {
  assert.ok(Math.abs(LOUPE.restScale / 0.51 - 1.5) < 1e-12);
  const { readFile } = await import("node:fs/promises");
  const { readGemOBJ, normalizeGem, solitaireGeometry } = await import(
    "../src/geometry.js"
  );
  const { cutGeometry } = await import("../src/cuts.js");
  const shank = solitaireGeometry(
    await readFile(new URL("../assets/solitaire-shank.obj", import.meta.url), "utf8"),
  );
  const stones = {
    tiger: normalizeGem(
      readGemOBJ(await readFile(new URL("../assets/cabochon.obj", import.meta.url), "utf8"), true),
      1.38,
    ),
    ...Object.fromEntries(["brilliant", "step", "oval", "cushion"].map((k) => [k, cutGeometry(k)])),
  };
  // scene.js: specimen scale 0.24; the eye sits (0, 0.285, 0.84) from the
  // stone centre and turning keeps that centre fixed.
  const eyeToStone = Math.hypot(0.285, 0.84);
  const lensBack = LOUPE.eyeDistance + 0.097 * LOUPE.depthScale;
  for (const [name, geometry] of Object.entries(stones)) {
    const center = geometry.boundingBox
      .getCenter(new THREE.Vector3())
      .add(new THREE.Vector3(0, name === "tiger" ? 0.98 : 0.7, 0));
    let sweep = 0;
    const p = new THREE.Vector3();
    for (const g of [shank, geometry]) {
      const position = g.attributes.position;
      const offset = g === shank ? 0 : name === "tiger" ? 0.98 : 0.7;
      for (let i = 0; i < position.count; i++)
        sweep = Math.max(
          sweep,
          p.fromBufferAttribute(position, i).setY(position.getY(i) + offset).distanceTo(center),
        );
    }
    assert.ok(eyeToStone - lensBack > sweep * 0.24 + 0.05, `${name} clearance`);
  }
});

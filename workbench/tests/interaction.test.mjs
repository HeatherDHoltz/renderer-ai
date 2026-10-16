import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import {
  gazeOffset,
  ease,
  corridorPoint,
  loupeCorridor,
  advanceProgress,
  lampControls,
  benchFraming,
} from "../src/interaction.js";

test("seated gaze has finite angular limits and returns to center", () => {
  const right = gazeOffset(12, -8),
    left = gazeOffset(-12, 8);
  assert.deepEqual(right.toArray(), [0.105, -0.055]);
  assert.ok(right.clone().add(left).length() < 1e-12);
  assert.equal(gazeOffset(0, 0).length(), 0);
});
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

test("the actual loupe body and handle clear all three mounted gem bounds", async () => {
  const { readFile } = await import("node:fs/promises");
  const { readGemOBJ, normalizeGem } = await import("../src/geometry.js");
  const { convexFacetHull } = await import("../src/gem-optics.js");
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
    emerald: normalizeGem(
      convexFacetHull(
        readGemOBJ(
          await readFile(
            new URL("../assets/emerald-step.obj", import.meta.url),
            "utf8",
          ),
        ),
      ),
      1.22,
    ),
    diamond: normalizeGem(
      readGemOBJ(
        await readFile(
          new URL("../assets/diamond.obj", import.meta.url),
          "utf8",
        ),
      ),
      1.24,
    ),
  };
  for (const [name, geometry] of Object.entries(meshes)) {
    const group = new THREE.Group(),
      root = new THREE.Group();
    group.add(root);
    root.position.y = -0.2;
    group.position.y = 0.2;
    group.rotation.set(0.12, -0.3, 0);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.91, 0.12, 32, 128));
    band.scale.z = 1.2;
    root.add(band);
    const stone = new THREE.Mesh(geometry);
    stone.position.y = name === "tiger" ? 0.98 : 1.1;
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

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import { BenchOrbit, wheelScale } from "../src/orbit.js";

function fixture() {
  const camera = new THREE.PerspectiveCamera();
  const rig = new BenchOrbit(
    new THREE.Vector3(0, 2.6, 6.4),
    new THREE.Vector3(0, 0.3, -0.3),
  );
  return { camera, rig };
}
function settle(rig, camera) {
  for (let i = 0; i < 160; i++) rig.update(camera, 1 / 60);
  assert.equal(rig.moving, false);
}
test("orbit rotates around a stationary pivot and converges independent of refresh rate", () => {
  const a = fixture(),
    b = fixture();
  a.rig.drag(0.4, -0.2);
  b.rig.drag(0.4, -0.2);
  for (let i = 0; i < 60; i++) a.rig.update(a.camera, 1 / 60);
  for (let i = 0; i < 30; i++) b.rig.update(b.camera, 1 / 30);
  assert.ok(a.camera.position.distanceTo(b.camera.position) < 1e-10);
  assert.ok(
    Math.abs(
      a.camera.position.distanceTo(a.rig.target) - a.rig.spherical.radius,
    ) < 1e-8,
  );
  assert.ok(a.rig.target.distanceTo(new THREE.Vector3(0, 0.3, -0.3)) < 1e-8);
  settle(a.rig, a.camera);
  const forward = new THREE.Vector3();
  a.camera.getWorldDirection(forward);
  assert.ok(
    forward.distanceTo(
      a.rig.target.clone().sub(a.camera.position).normalize(),
    ) < 1e-8,
  );
});
test("pointer zoom changes pivot toward focus, pullback preserves it, limits remain finite", () => {
  const { rig, camera } = fixture();
  const point = new THREE.Vector3(3, 1, -4);
  rig.zoom(0.7, point);
  assert.ok(
    rig.destination.distanceTo(point) <
      new THREE.Vector3(0, 0.3, -0.3).distanceTo(point),
  );
  const pivot = rig.destination.clone();
  rig.zoom(1 / 0.7, new THREE.Vector3(-4, 2, 0));
  assert.deepEqual(rig.destination, pivot);
  for (let i = 0; i < 100; i++) {
    rig.zoom(0.5, point);
    rig.drag(50, -50);
  }
  settle(rig, camera);
  assert.equal(rig.goal.radius, 1.35);
  assert.ok(camera.position.y >= -0.75 && camera.position.z >= -5.8);
  rig.zoom(NaN);
  rig.zoom(0);
  assert.ok(Number.isFinite(rig.goal.radius));
  rig.focus(new THREE.Vector3(100, -100, -100));
  settle(rig, camera);
  assert.deepEqual(rig.destination.toArray(), [7, -0.9, -10]);
});
test("fine trackpad deltas accumulate and wheel units agree", () => {
  assert.ok(wheelScale(-1) < 1 && wheelScale(-1) > 0.99);
  assert.ok(Math.abs(wheelScale(12) * wheelScale(-12) - 1) < 1e-12);
  assert.equal(wheelScale(1, 1), wheelScale(16));
  assert.equal(wheelScale(1, 2), wheelScale(600));
  assert.ok(wheelScale(-10, 0, true) < wheelScale(-10));
});

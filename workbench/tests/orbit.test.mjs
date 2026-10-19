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
test("orbit stays within ±90° yaw and 0–75° elevation", () => {
  const { rig, camera } = fixture();
  rig.drag(50, -50);
  assert.ok(Math.abs(rig.goal.theta + THREE.MathUtils.degToRad(90)) < 1e-12);
  assert.ok(Math.abs(rig.goal.phi - THREE.MathUtils.degToRad(90)) < 1e-12);
  settle(rig, camera);
  const flatElevation = Math.asin(
    (camera.position.y - rig.target.y) / camera.position.distanceTo(rig.target),
  );
  assert.ok(Math.abs(flatElevation) < 1e-12);

  // A quarter turn looks straight along the car, square to the desk.
  const side = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(Math.abs(side.z) < 1e-9 && side.x > 0.99);

  rig.drag(-100, 100);
  assert.ok(Math.abs(rig.goal.theta - THREE.MathUtils.degToRad(90)) < 1e-12);
  assert.ok(Math.abs(rig.goal.phi - THREE.MathUtils.degToRad(15)) < 1e-12);
  settle(rig, camera);
  const highElevation = Math.asin(
    (camera.position.y - rig.target.y) / camera.position.distanceTo(rig.target),
  );
  assert.ok(Math.abs(highElevation - THREE.MathUtils.degToRad(75)) < 1e-12);
});
test("bench zoom reaches close inspection distance and a short step back", () => {
  const { rig } = fixture();
  const home = rig.homeRadius;
  rig.zoom(100);
  assert.ok(Math.abs(rig.goal.radius - home * 1.25) < 1e-12);
  rig.zoom(0.0001);
  assert.ok(Math.abs(rig.goal.radius - home * 0.18) < 1e-12);
  // About 13 cm from the pivot at this seat (1 unit = 10 cm).
  assert.ok(rig.goal.radius < 1.4);
});
test("double-click focus moves close, and adopting poses never ratchets the zoom range", () => {
  const { rig, camera } = fixture();
  const home = rig.homeRadius;
  rig.focus(new THREE.Vector3(1, -1, 0.5));
  assert.ok(Math.abs(rig.goal.radius - home * 0.3) < 1e-12);
  settle(rig, camera);
  // Loupe or case round trips adopt the current (zoomed) pose.
  rig.adopt(camera.position, rig.target);
  assert.equal(rig.homeRadius, home);
  rig.zoom(0.0001);
  assert.ok(Math.abs(rig.goal.radius - home * 0.18) < 1e-12);
  // Resizing or resetting re-homes on the seated framing.
  rig.home(new THREE.Vector3(0, 3, 8), new THREE.Vector3(0, 0, 0));
  assert.ok(Math.abs(rig.homeRadius - Math.hypot(3, 8)) < 1e-12);
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
  assert.ok(Math.abs(rig.goal.radius - rig.homeRadius * 0.18) < 1e-12);
  // Inside the railcar, and never inside the desk.
  const p = camera.position;
  assert.ok(p.x >= -24.5 && p.x <= 24.5 && p.y >= -8.3 && p.z >= -10.2 && p.z <= 26.5);
  if (Math.abs(p.x) < 8.4 && p.z > -6 && p.z < 3.6) assert.ok(p.y >= -0.75);
  rig.zoom(NaN);
  rig.zoom(0);
  assert.ok(Number.isFinite(rig.goal.radius));
  rig.focus(new THREE.Vector3(100, -100, -100));
  settle(rig, camera);
  assert.deepEqual(rig.destination.toArray(), [23, -8.5, -9.5]);
});
test("close orbit keeps the eye outside edited-room cabinet bounds", () => {
  const { rig, camera } = fixture();
  rig.obstacles = [{ min: [-1, -1, -1], max: [1, 2, 1] }];
  rig.destination.set(0, 0, 0);
  rig.target.set(0, 0, 0);
  rig.goal.radius = rig.spherical.radius = 0.5;
  rig.goal.phi = rig.spherical.phi = Math.PI / 2;
  rig.update(camera, 1 / 60);
  const box = rig.obstacles[0], p = camera.position.toArray();
  assert.ok(p.some((v, i) => v <= box.min[i] - 0.15 || v >= box.max[i] + 0.15));
});
test("fine trackpad deltas accumulate and wheel units agree", () => {
  assert.ok(wheelScale(-1) < 1 && wheelScale(-1) > 0.99);
  assert.ok(Math.abs(wheelScale(12) * wheelScale(-12) - 1) < 1e-12);
  assert.equal(wheelScale(1, 1), wheelScale(16));
  assert.equal(wheelScale(1, 2), wheelScale(600));
  assert.ok(wheelScale(-10, 0, true) < wheelScale(-10));
});

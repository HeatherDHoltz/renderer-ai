import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import { specimenEnvironment } from "../src/reflections.js";
import { applyMetal } from "../src/metals.js";

test("moving probe is scoped to jewelry and never changes room lighting", () => {
  const scene = new THREE.Scene();
  const daylight = new THREE.Texture(),
    first = new THREE.Texture(),
    next = new THREE.Texture();
  scene.environment = daylight;
  const table = new THREE.MeshStandardMaterial();
  const ring = new THREE.MeshPhysicalMaterial({
    metalness: 1,
    envMapIntensity: 1,
  });
  const tiger = new THREE.MeshPhysicalMaterial({ envMapIntensity: 0.8 });
  const update = specimenEnvironment([ring, tiger, ring], 0.6);
  update(first);
  const version = ring.version;
  update(first);
  assert.equal(
    ring.version,
    version,
    "cached target must not recompile each update",
  );
  update(next);
  assert.equal(ring.envMap, next);
  assert.equal(tiger.envMap, next);
  assert.equal(table.envMap, null);
  assert.equal(scene.environment, daylight);
  assert.equal(ring.envMapIntensity, 0.6);
  assert.ok(Math.abs(tiger.envMapIntensity - 0.48) < 1e-12);
  [table, ring, tiger, daylight, first, next].forEach((x) => x.dispose());
});
test("changing metal finish preserves bound reflection intensity", () => {
  const ring = new THREE.MeshPhysicalMaterial({
    metalness: 1,
    envMapIntensity: 1,
  });
  const texture = new THREE.Texture();
  specimenEnvironment([ring], 0.6)(texture);
  applyMetal(ring, "titanium", 92);
  assert.equal(ring.envMap, texture);
  assert.equal(ring.envMapIntensity, 0.6);
  applyMetal(ring, "gold", 8);
  assert.equal(ring.envMapIntensity, 0.6);
  ring.dispose();
  texture.dispose();
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "../vendor/three.module.js";
import {
  brilliantGeometry,
  readGemOBJ,
  normalizeGem,
  lightPosition,
  inspectionFieldOfView,
  turnSpecimen,
} from "../src/geometry.js";

test("brilliant has finite outward faces and no open edges", () => {
  const g = brilliantGeometry(),
    p = g.attributes.position;
  const edges = new Map();
  let volume = 0;
  const key = (v) =>
    v
      .toArray()
      .map((x) => x.toFixed(6))
      .join(",");
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i),
      b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
      c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    assert.ok([...a, ...b, ...c].every(Number.isFinite));
    assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-6);
    volume += a.dot(b.clone().cross(c)) / 6;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const ku = key(u),
        kv = key(v),
        sorted = [ku, kv].sort().join("|");
      const record = edges.get(sorted) || { count: 0, winding: 0 };
      record.count++;
      record.winding += ku < kv ? 1 : -1;
      edges.set(sorted, record);
    }
  }
  assert.ok(volume > 0, "positive oriented volume");
  for (const record of edges.values()) {
    assert.equal(record.count, 2);
    assert.equal(record.winding, 0);
  }
});
test("bundled gemstone meshes normalize to their requested width with valid normals", async () => {
  for (const [name, smooth] of [
    ["cabochon", true],
    ["emerald-step", false],
  ]) {
    const text = await readFile(
      new URL(`../assets/${name}.obj`, import.meta.url),
      "utf8",
    );
    const g = normalizeGem(readGemOBJ(text, smooth), 1.3);
    const b = g.boundingBox;
    assert.ok(
      Math.abs(Math.max(b.max.x - b.min.x, b.max.z - b.min.z) - 1.3) < 1e-6,
    );
    assert.ok(Math.abs(b.min.y) < 1e-6);
    for (const x of g.attributes.normal.array) assert.ok(Number.isFinite(x));
    assert.ok(g.attributes.position.count > 30);
  }
});
test("mesh importer rejects invalid indices, nonfinite vertices, and empty data", () => {
  for (const text of [
    "",
    "v NaN 0 0\nf 1 1 1",
    "v 0 0 0\nf 1 2 3",
    "v 0 0 0\nf 0 1 1",
  ])
    assert.throws(() => readGemOBJ(text));
});
test("light travels on the same orbit as azimuth/height controls specify", () => {
  const front = lightPosition(0, 45),
    back = lightPosition(180, 45),
    side = lightPosition(90, 45),
    high = lightPosition(90, 85);
  assert.ok(front.z > 0 && Math.abs(front.x) < 1e-10);
  assert.ok(back.z < 0);
  assert.ok(side.x > 0 && Math.abs(side.z) < 1e-10);
  assert.ok(high.y > side.y);
  assert.ok(
    Math.abs(
      front
        .clone()
        .sub(new THREE.Vector3(0, 0.4, 0))
        .length() - 5,
    ) < 1e-10,
  );
});
test("inspection projection magnifies by focal length without moving its camera", () => {
  const base = Math.tan(THREE.MathUtils.degToRad(55 / 2));
  for (const zoom of [2, 3, 4, 6])
    assert.ok(
      Math.abs(
        base /
          Math.tan(THREE.MathUtils.degToRad(inspectionFieldOfView(zoom) / 2)) -
          zoom,
      ) < 1e-10,
    );
  for (const invalid of [0, -1, NaN, Infinity])
    assert.throws(() => inspectionFieldOfView(invalid));
});
test("specimen rotation stays normalized and single-axis turns are reversible", () => {
  const q = new THREE.Quaternion();
  turnSpecimen(q, 0.6, 0);
  turnSpecimen(q, -0.6, 0);
  assert.ok(q.angleTo(new THREE.Quaternion()) < 1e-7);
  for (let i = 0; i < 10000; i++) turnSpecimen(q, 0.021, 0.013);
  assert.ok(Math.abs(q.length() - 1) < 1e-12);
  assert.ok(q.toArray().every(Number.isFinite));
  assert.throws(() => turnSpecimen(q, NaN, 0));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "../vendor/three.module.js";
import { readGemOBJ, normalizeGem } from "../src/geometry.js";
import {
  facetPlanes,
  convexFacetHull,
  dielectricFresnel,
} from "../src/gem-optics.js";
import { velvetInsert } from "../src/velvet-insert.js";
import { METALS, FINISHES, metalMaterial } from "../src/metals.js";

const mesh = async (name) =>
  readGemOBJ(
    await readFile(new URL(`../assets/${name}.obj`, import.meta.url), "utf8"),
  );
function assertClosed(g) {
  const p = g.attributes.position,
    edges = new Map();
  const key = (v) =>
    v
      .toArray()
      .map((x) => x.toFixed(5))
      .join(",");
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i),
      b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
      c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-8);
    volume += a.dot(b.clone().cross(c)) / 6;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const ku = key(u),
        kv = key(v),
        k = [ku, kv].sort().join("|");
      const r = edges.get(k) || { count: 0, winding: 0 };
      r.count++;
      r.winding += ku < kv ? 1 : -1;
      edges.set(k, r);
    }
  }
  assert.ok(volume > 0);
  for (const r of edges.values()) {
    assert.equal(r.count, 2);
    assert.equal(r.winding, 0);
  }
}
test("actual live diamond and repaired emerald are closed convex optical solids", async () => {
  const diamond = normalizeGem(await mesh("diamond"), 1.24),
    emerald = normalizeGem(convexFacetHull(await mesh("emerald-step")), 1.22);
  for (const [g, n] of [
    [diamond, 21],
    [emerald, 42],
  ]) {
    assertClosed(g);
    const planes = facetPlanes(g);
    assert.equal(planes.length, n);
    for (const p of planes)
      assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 1) < 1e-7);
  }
  assert.throws(
    () => facetPlanes(new THREE.TorusGeometry(1, 0.3, 8, 16)),
    /convex/,
  );
});
test("Fresnel conserves a split and diamond reaches total internal reflection at its critical angle", () => {
  const eta = 2.417,
    f0 = ((eta - 1) / (eta + 1)) ** 2;
  assert.ok(Math.abs(dielectricFresnel(1, 1, eta) - f0) < 1e-12);
  assert.ok(Math.abs(dielectricFresnel(1, eta, 1) - f0) < 1e-12);
  const critical = Math.asin(1 / eta);
  assert.equal(dielectricFresnel(Math.cos(critical + 0.001), eta, 1), 1);
  assert.ok(dielectricFresnel(Math.cos(critical - 0.001), eta, 1) < 1);
  for (let i = 0; i <= 100; i++) {
    const f = dielectricFresnel(i / 100, 1, eta);
    assert.ok(f >= 0 && f <= 1);
  }
});
test("velvet recess is real geometry with sloped lips and finite upward normals", () => {
  const pocket = { x: 0, z: 0, rx: 0.3, rz: 0.23, depth: 0.17 };
  const g = velvetInsert(2, 1.5, [pocket]);
  const p = g.attributes.position,
    n = g.attributes.normal,
    uv = g.attributes.uv;
  let center = Infinity,
    flat = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      y = p.getY(i);
    if (Math.hypot(x, z) < 0.02) center = Math.min(center, y);
    if (Math.abs(x - 0.65) < 0.03 && Math.abs(z) < 0.03)
      flat = Math.max(flat, y);
    assert.ok(Number.isFinite(y));
    assert.ok(n.getY(i) > 0);
    assert.ok(
      [n.getX(i), n.getY(i), n.getZ(i), uv.getX(i), uv.getY(i)].every(
        Number.isFinite,
      ),
    );
  }
  assert.ok(flat - center > 0.15);
  assert.ok(center > 0.11 && center < 0.15);
});
test("eighteen alloy/finish combinations have increasing roughness and directional brushing", () => {
  assert.equal(Object.keys(METALS).length * FINISHES.length, 18);
  for (const id of Object.keys(METALS)) {
    const ms = FINISHES.map((f) => metalMaterial(id, f.value));
    assert.ok(
      ms[0].roughness < ms[1].roughness && ms[1].roughness < ms[2].roughness,
    );
    assert.ok(ms[0].anisotropy < ms[2].anisotropy);
    assert.ok(ms[0].bumpScale < ms[2].bumpScale);
    for (const m of ms) {
      assert.equal(m.metalness, 1);
      m.dispose();
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { solitaireGeometry, readGemOBJ } from "../src/geometry.js";
function glbJSON(bytes) {
  const n = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + n).toString());
}
test("the study preserves separate source UVs, lighting UVs and distinct material responses", async () => {
  const g = glbJSON(
    await readFile(new URL("../assets/atelier/atelier.glb", import.meta.url)),
  );
  assert.ok(g.materials.length > 8);
  const pbr = g.materials.map((m) => m.pbrMetallicRoughness);
  assert.ok(pbr.some((m) => m.metallicFactor > 0.8));
  assert.ok(pbr.some((m) => m.roughnessFactor > 0.9));
  assert.ok(g.materials.some((m) => m.normalTexture));
  for (const mesh of g.meshes)
    for (const p of mesh.primitives) {
      assert.ok(p.attributes.TEXCOORD_0 !== undefined);
      assert.ok(p.attributes.TEXCOORD_1 !== undefined);
    }
});
test("new photographed objects retain full PBR dependencies and their source hashes", async () => {
  const records = JSON.parse(
    await readFile(
      new URL("../assets/study-props/sources.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(records.length, 3);
  for (const r of records) {
    assert.equal(r.license, "CC0-1.0");
    const root = new URL(
      "../assets/study-props/" + r.asset + "/",
      import.meta.url,
    );
    const gltf = JSON.parse(
      await readFile(new URL("model.gltf", root), "utf8"),
    );
    assert.ok(gltf.materials.some((m) => m.normalTexture));
    assert.ok(
      gltf.materials.some(
        (m) => m.pbrMetallicRoughness.metallicRoughnessTexture,
      ),
    );
    for (const f of r.files) {
      const bytes = await readFile(new URL("../" + f.file, import.meta.url));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
    }
  }
});
test("the new collection setting is closed, connected, smooth and does not smear the brushing UV seam", async () => {
  const text = await readFile(
    new URL("../assets/solitaire-sample.obj", import.meta.url),
    "utf8",
  );
  const indexed = readGemOBJ(text, true),
    edges = new Map(),
    adj = Array.from({ length: indexed.attributes.position.count }, () => []),
    is = indexed.index.array;
  for (let i = 0; i < is.length; i += 3)
    for (const [a, b] of [
      [is[i], is[i + 1]],
      [is[i + 1], is[i + 2]],
      [is[i + 2], is[i]],
    ]) {
      const key = [a, b].sort((a, b) => a - b).join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
      adj[a].push(b);
      adj[b].push(a);
    }
  assert.ok(
    [...edges.values()].every((n) => n === 2),
    "closed manifold",
  );
  const seen = new Set([0]),
    stack = [0];
  while (stack.length)
    for (const k of adj[stack.pop()])
      if (!seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
  assert.equal(seen.size, adj.length, "one continuous cast setting");
  const g = solitaireGeometry(text),
    uv = g.attributes.uv,
    n = g.attributes.normal;
  const triangles = g.index.array;
  for (let i = 0; i < triangles.length; i += 3)
    for (const axis of ["getX", "getY"]) {
      const values = [0, 1, 2].map((j) => uv[axis](triangles[i + j]));
      assert.ok(Math.max(...values) - Math.min(...values) <= 0.50001);
    }
  for (let i = 0; i < n.count; i++)
    assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5);
});

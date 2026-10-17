import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { solitaireGeometry, readGemOBJ } from "../src/geometry.js";
function readGLB(bytes) {
  // GLB: 12-byte header, then the JSON chunk (length, type, payload).
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
}
const railcar = (name) => new URL("../assets/railcar/" + name, import.meta.url);
test("the railcar ships every baked group with an atlas, lightmap and distinct material responses", async () => {
  const manifest = JSON.parse(await readFile(railcar("export/railcar-manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.groups).sort(), ["architecture", "desk", "furnishings"]);
  for (const group of Object.values(manifest.groups)) {
    const g = readGLB(await readFile(railcar("export/" + group.file)));
    assert.equal(g.materials.length, group.materials);
    const pbr = g.materials.map((m) => m.pbrMetallicRoughness);
    assert.ok(pbr.every((m) => m.baseColorTexture), "colour atlas on every material");
    assert.ok(pbr.some((m) => (m.metallicFactor ?? 1) === 1));
    assert.ok(pbr.some((m) => m.metallicFactor === 0 && m.roughnessFactor > 0.85));
    for (const mesh of g.meshes)
      for (const p of mesh.primitives) assert.ok(p.attributes.TEXCOORD_0 !== undefined);
    for (const map of [group.light, group.emit]) {
      const header = (await readFile(railcar("export/" + map))).subarray(0, 10).toString("latin1");
      assert.match(header, /^#\?RADIANCE/);
    }
  }
  for (const extra of [manifest.glass, manifest.paintings])
    assert.ok(readGLB(await readFile(railcar("export/" + extra.file))).meshes.length > 0);
});
test("railcar sources are credited: Poly Haven CC0 models and public-domain paintings", async () => {
  const polyhaven = JSON.parse(await readFile(railcar("polyhaven/credits.json"), "utf8"));
  assert.ok(Object.keys(polyhaven).length > 0);
  for (const asset of Object.values(polyhaven)) {
    assert.equal(asset.license, "CC0");
    assert.match(asset.source, /^https:\/\/polyhaven\.com\/a\//);
    assert.ok(asset.authors.length > 0);
  }
  const paintings = JSON.parse(await readFile(railcar("paintings/SOURCES.json"), "utf8"));
  for (const [file, record] of Object.entries(paintings)) {
    await readFile(railcar("paintings/" + file));
    assert.match(record.source, /^https:\/\//);
    assert.match(record.license, /public domain/);
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

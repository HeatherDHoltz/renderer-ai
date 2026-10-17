import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { solitaireGeometry, readGemOBJ } from "../src/geometry.js";
function readGLB(bytes) {
  // GLB: 12-byte header, then the JSON chunk (length, type, payload).
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"));
}
const railcar = (name) => new URL("../assets/railcar/" + name, import.meta.url);
test("the railcar ships full-resolution materials with packed, baked light", async () => {
  const manifest = JSON.parse(await readFile(railcar("export/railcar-manifest.json"), "utf8"));
  assert.equal(manifest.version, 2);
  assert.deepEqual(Object.keys(manifest.groups).sort(), ["architecture", "desk", "furnishings"]);
  const kinds = new Set();
  for (const [name, group] of Object.entries(manifest.groups)) {
    const g = readGLB(await readFile(railcar("export/" + group.file)));
    // one node per Blender material, every node has a recipe
    const nodes = g.nodes.filter((n) => n.mesh !== undefined).map((n) => n.name);
    assert.ok(nodes.length > 3);
    for (const node of nodes) {
      assert.ok(node.startsWith(name + "|"), node);
      assert.ok(group.materials[node.slice(name.length + 1)], `recipe for ${node}`);
    }
    // the lightmap UV is packed (0.33-0.71), not 4-10% of the texture like the old atlas
    assert.ok(group.lightCoverage > 0.3, `${name} light coverage ${group.lightCoverage}`);
    for (const map of [group.light, group.emit]) {
      const webp = await readFile(railcar("export/" + map));
      assert.equal(webp.subarray(8, 12).toString("latin1"), "WEBP");
    }
    for (const spec of Object.values(group.materials)) {
      kinds.add(spec.kind);
      const files = [spec.color, spec.orm, spec.normal, spec.mask, spec.maps?.color, spec.maps?.rough, spec.maps?.normal];
      for (const f of files.filter((x) => typeof x === "string")) await readFile(railcar("export/" + f));
      if (spec.kind === "uvbake") assert.ok(spec.size >= 256);
    }
  }
  for (const k of ["box", "uvbake", "gilt", "metal", "damask", "bindings", "artglass", "plain"])
    assert.ok(kinds.has(k), `material kind ${k}`);
  for (const extra of [manifest.glass, manifest.paintings])
    assert.ok(readGLB(await readFile(railcar("export/" + extra.file))).meshes.length > 0);
  await readFile(railcar("export/" + manifest.sky));
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

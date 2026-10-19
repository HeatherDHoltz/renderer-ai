// Prepare an isolated Sites checkout; never change the working room exports.
// Every geometry buffer and compressed lighting byte is retained exactly.
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const bench = path.join(root, "workbench");
const destination = path.resolve(process.argv[2] || "");
if (!destination.startsWith(path.join(root, "output") + path.sep))
  throw new Error("Use an isolated checkout under this repository's output/ directory");
const hosting = JSON.parse(await readFile(path.join(bench, ".openai/hosting.json")));
const selected = JSON.parse(await readFile(path.join(destination, ".openai/hosting.json")));
assert.equal(selected.project_id, hosting.project_id, "Sites project identity must match");
for (const name of ["assets", "src", "vendor"])
  await rm(path.join(destination, name), { force: true, recursive: true });
for (const name of ["index.html", "gallery.html", "assets", "src", "vendor"])
  await cp(path.join(bench, "dist", name), path.join(destination, name), { recursive: true });
await mkdir(path.join(destination, "scripts"), { recursive: true });
for (const file of ["build.mjs", "serve.mjs"])
  await cp(path.join(bench, "scripts", file), path.join(destination, "scripts", file));
await writeFile(path.join(destination, ".gitignore"), ".DS_Store\nnode_modules/\ndist/\n");
await writeFile(path.join(destination, "package.json"), JSON.stringify({
  name: "the-little-jeweler", private: true, type: "module",
  scripts: { build: "node scripts/build.mjs", dev: "node scripts/serve.mjs" },
  engines: { node: ">=20" },
}, null, 2) + "\n");
// OBJ transport is lossless too; retain decoded text exactly for the same parser.
const scenePath = path.join(destination, "src/scene.js");
let sceneSource = await readFile(scenePath, "utf8");
for (const filename of ["cabochon.obj", "solitaire-sample.obj"]) {
  const input = path.join(destination, "assets", filename);
  const original = await readFile(input), compressed = gzipSync(original, { level: 9 });
  assert.deepEqual(gunzipSync(compressed), original);
  await writeFile(input + ".gz", compressed);
  await rm(input);
  sceneSource = sceneSource.replaceAll(filename, filename + ".gz");
}
await writeFile(scenePath, sceneSource);
const exported = path.join(destination, "assets/railcar/export");
const interactiveGeometry = JSON.parse(await readFile(path.join(exported, "railcar-interactions.json")));
for (const [group, expected] of Object.entries(interactiveGeometry.geometryHashes))
  assert.equal(hash(await readFile(path.join(exported, `railcar-${group}.glb`))), expected,
    'Interactive object mapping is stale: rebuild it from the current source before publishing');
// Retired resources are not requested by the current room. Keep authoring
// originals in the working repository; omit them from the publication only.
const publishedManifest = JSON.parse(await readFile(path.join(exported, "railcar-manifest.json")));
const activeResponses = new Set(Object.values(publishedManifest.groups)
  .flatMap(group => Object.values(group.materials).map(material => material.bakedResponse)).filter(Boolean));
for (const filename of await readdir(exported)) {
  if (filename.endsWith(".f16.gz") && !activeResponses.has(filename))
    await rm(path.join(exported, filename));
}
await rm(path.join(exported, "railcar-sky.webp"), { force: true });
delete publishedManifest.sky; // night-forest.js supplies the current exterior.
await writeFile(path.join(exported, "railcar-manifest.json"), JSON.stringify(publishedManifest, null, 1) + "\n");
const materialReferences = JSON.stringify(publishedManifest) +
  await readFile(path.join(exported, "live-authoring.json"), "utf8");
for (const filename of await readdir(path.join(exported, "tex"))) {
  if (!materialReferences.includes(filename))
    await rm(path.join(exported, "tex", filename));
}
// These props and plaster maps belong to the retired atelier, not this car.
for (const name of ["props", "materials/plaster-color.jpg", "materials/plaster-normal.jpg", "materials/plaster-roughness.jpg"])
  await rm(path.join(destination, "assets", name), { force: true, recursive: true });
const manifestPath = path.join(exported, "railcar-manifest.json");
const originalManifest = await readFile(path.join(bench, "dist/assets/railcar/export/railcar-manifest.json"));
let manifestText = await readFile(manifestPath, "utf8");
const evidence = { sourceManifestSha256: hash(originalManifest), geometry: [], streams: [] };
const limit = 8 * 1024 * 1024;
for (const filename of await readdir(exported)) {
  const input = path.join(exported, filename);
  if ((await stat(input)).size <= limit && !(["railcar-desk.glb", "railcar-glass.glb", "railcar-interactive-props.glb", "railcar-interactions.json"].includes(filename))) continue;
  const original = await readFile(input);
  if (filename.endsWith(".glb")) {
    const compressed = gzipSync(original, { level: 9 });
    assert.deepEqual(gunzipSync(compressed), original);
    if (compressed.length > limit) throw new Error("Compressed GLB exceeds source delivery limit");
    await writeFile(input + ".gz", compressed);
    manifestText = manifestText.replaceAll(filename, filename + ".gz");
    evidence.geometry.push({ file: filename, sourceSha256: hash(original),
      encoding: "lossless gzip", gzipBytes: compressed.length });
  } else if (filename === "railcar-interactions.json") {
    const compressed = gzipSync(original, { level: 9 });
    assert.deepEqual(gunzipSync(compressed), original);
    await writeFile(input + ".gz", compressed);
    manifestText = manifestText.replaceAll(filename, filename + ".gz");
    evidence.streams.push({ file: filename, sha256: hash(original), encoding: "lossless gzip JSON", byteLength: original.length });
  } else if (filename.endsWith(".f16.gz")) {
    const parts = [];
    for (let offset = 0, i = 0; offset < original.length; offset += limit, i++) {
      const data = original.subarray(offset, offset + limit);
      const file = `${filename}.part-${i}`;
      await writeFile(path.join(exported, file), data);
      parts.push({ file, byteLength: data.length });
    }
    const restored = Buffer.concat(await Promise.all(parts.map(p => readFile(path.join(exported, p.file)))));
    assert.deepEqual(restored, original);
    const record = { version: 1, byteLength: original.length, sha256: hash(original), parts };
    await writeFile(input + ".parts.json", JSON.stringify(record) + "\n");
    manifestText = manifestText.replaceAll(filename, filename + ".parts.json");
    evidence.streams.push({ file: filename, sha256: record.sha256, byteLength: record.byteLength, parts: parts.length });
  } else throw new Error(`Unexpected large delivery asset: ${filename}`);
  await rm(input);
}
await writeFile(manifestPath, manifestText);
await writeFile(path.join(destination, "PUBLICATION.json"), JSON.stringify(evidence, null, 2) + "\n");
await writeFile(path.join(destination, "README.md"),
  "# The Little Jeweler\n\nStatic publication source for Heather Holtz’s interactive workbench. " +
  "Full authoring source and credits: https://github.com/HeatherDHoltz/renderer-ai\n\n" +
  "Run `npm run build`. Geometry buffer views and lighting streams are packed losslessly; " +
  "PUBLICATION.json records exact source hashes. The current room is a work in progress.\n");
console.log(JSON.stringify(evidence, null, 2));

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }

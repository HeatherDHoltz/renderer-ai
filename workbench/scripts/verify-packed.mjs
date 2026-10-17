// Verify canonical/delivered assets and optional original authoring exports.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { readGemOBJ, readSettingBinary } from "../src/geometry.js";
const assets = new URL("../assets/", import.meta.url),
  dist = new URL("../dist/assets/", import.meta.url),
  raw = new URL("../../output/fidelity-research/", import.meta.url);
let views = 0,
  largest = 0,
  originalsChecked = 0;
for (const name of ["atelier", "study-props"]) {
  const json = await readFile(new URL("atelier/" + name + ".gltf", assets));
  assert.deepEqual(
    json,
    await readFile(new URL("atelier/" + name + ".gltf", dist)),
  );
  const gltf = JSON.parse(json),
    buffers = await Promise.all(
      gltf.buffers.map(async (b) => {
        const data = await readFile(new URL("atelier/" + b.uri, assets));
        assert.deepEqual(
          data,
          await readFile(new URL("atelier/" + b.uri, dist)),
        );
        assert.equal(data.length, b.byteLength);
        largest = Math.max(largest, data.length);
        return data;
      }),
    );
  let original;
  try {
    original = await readFile(new URL(name + ".glb", raw));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (original) {
    const n = original.readUInt32LE(12),
      source = JSON.parse(original.subarray(20, 20 + n));
    assert.equal(source.bufferViews.length, gltf.bufferViews.length);
    for (let i = 0; i < source.bufferViews.length; i++) {
      const a = source.bufferViews[i],
        b = gltf.bufferViews[i];
      assert.deepEqual(
        original.subarray(
          28 + n + (a.byteOffset || 0),
          28 + n + (a.byteOffset || 0) + a.byteLength,
        ),
        buffers[b.buffer].subarray(b.byteOffset, b.byteOffset + b.byteLength),
      );
    }
    originalsChecked++;
  }
  views += gltf.bufferViews.length;
}
const gzip = await readFile(new URL("solitaire-setting.mesh.gz", assets));
assert.deepEqual(
  gzip,
  await readFile(new URL("solitaire-setting.mesh.gz", dist)),
);
const binary = gunzipSync(gzip),
  packed = readSettingBinary(
    binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength,
    ),
  );
let obj;
try {
  obj = await readFile(new URL("solitaire-setting.obj", raw), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (obj) {
  const source = readGemOBJ(obj, true);
  assert.deepEqual(
    source.attributes.position.array,
    packed.attributes.position.array,
  );
  assert.deepEqual(
    Array.from(source.index.array),
    Array.from(packed.index.array),
  );
  originalsChecked++;
}
console.log(
  JSON.stringify({
    roomAndPropBufferViewsRetained: views,
    originalAuthoringExportsCompared: originalsChecked,
    ringTrianglesRetainedExactly: packed.index.count / 3,
    largestGLTFBufferBytes: largest,
    ringGzipBytes: gzip.length,
    ringBinaryBytes: binary.length,
  }),
);

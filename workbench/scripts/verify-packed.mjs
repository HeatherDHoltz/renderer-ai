// Verify production transport against the original high-detail source assets.
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { readGemOBJ, readSettingBinary } from "../src/geometry.js";
const asset = new URL("../assets/", import.meta.url),
  dist = new URL("../dist/assets/", import.meta.url);
const original = await readFile(new URL("atelier/atelier.glb", asset));
const n = original.readUInt32LE(12),
  a = JSON.parse(original.subarray(20, 20 + n));
const b = JSON.parse(await readFile(new URL("atelier/atelier.gltf", dist)));
const buffers = await Promise.all(
  b.buffers.map((x) => readFile(new URL("atelier/" + x.uri, dist))),
);
assert.equal(a.bufferViews.length, b.bufferViews.length);
for (let i = 0; i < a.bufferViews.length; i++) {
  const v = a.bufferViews[i],
    w = b.bufferViews[i];
  assert.deepEqual(
    original.subarray(
      28 + n + (v.byteOffset || 0),
      28 + n + (v.byteOffset || 0) + v.byteLength,
    ),
    buffers[w.buffer].subarray(w.byteOffset, w.byteOffset + w.byteLength),
  );
}
const source = readGemOBJ(
  await readFile(new URL("solitaire-setting.obj", asset), "utf8"),
  true,
);
const bin = await readFile(new URL("solitaire-setting.mesh", dist));
const packed = readSettingBinary(
  bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength),
);
assert.deepEqual(
  source.attributes.position.array,
  packed.attributes.position.array,
);
assert.deepEqual(
  Array.from(source.index.array),
  Array.from(packed.index.array),
);
console.log(
  JSON.stringify({
    roomBufferViewsRetainedExactly: a.bufferViews.length,
    ringTrianglesRetainedExactly: source.index.count / 3,
    largestRoomBufferBytes: Math.max(...buffers.map((b) => b.length)),
    ringBinaryBytes: bin.length,
  }),
);

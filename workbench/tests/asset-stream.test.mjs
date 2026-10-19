import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { loadFloatResponse } from "../src/float-response.js";
import { loadRoomAsset } from "../src/room-asset.js";

test("split hosted lighting preserves every half-float and rejects missing or truncated parts", async () => {
  const pixels = new Uint16Array([0x3c00, 0x3800, 0x3400, 0x3c00, 0x4000, 0, 0x7bff, 0x3c00]);
  const binary = Buffer.alloc(8 + pixels.byteLength);
  binary.writeUInt32LE(2, 0);
  binary.writeUInt32LE(1, 4);
  Buffer.from(pixels.buffer).copy(binary, 8);
  const gzip = gzipSync(binary);
  const pieces = [gzip.subarray(0, 5), gzip.subarray(5, 21), gzip.subarray(21)];
  const manifest = { version: 1, byteLength: gzip.length,
    parts: pieces.map((p, i) => ({ file: `part-${i}`, byteLength: p.length })) };
  const server = createServer((req, res) => {
    const route = req.url;
    if (route.endsWith(".parts.json")) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(manifest));
    } else if (route === "/whole.gz" || route === "/room.glb.gz") res.end(gzip);
    else if (route.startsWith("/missing/")) res.writeHead(404).end();
    else {
      const index = Number(route.match(/part-(\d+)$/)?.[1]);
      const part = pieces[index];
      if (!part) res.writeHead(404).end();
      else res.end(route.startsWith("/short/") ? part.subarray(1) : part);
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const parsed = await loadRoomAsset({ parseAsync(bytes, path) {
      assert.deepEqual(Buffer.from(bytes), binary);
      assert.equal(path, `${base}/`);
      return "original GLB bytes";
    } }, `${base}/room.glb.gz`);
    assert.equal(parsed, "original GLB bytes");
    for (const file of ["whole.gz", "valid.parts.json"]) {
      const texture = await loadFloatResponse(`${base}/${file}`);
      assert.equal(texture.image.width, 2);
      assert.equal(texture.image.height, 1);
      assert.deepEqual(texture.image.data, pixels);
      texture.dispose();
    }
    await assert.rejects(loadFloatResponse(`${base}/missing/light.parts.json`), /Asset part: 404/);
    await assert.rejects(loadFloatResponse(`${base}/short/light.parts.json`), /Truncated asset part/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";

test("all five downloaded props and their local dependencies match their provenance hashes", async () => {
  const root = new URL("../assets/props/", import.meta.url);
  const records = JSON.parse(
    await readFile(new URL("sources.json", root), "utf8"),
  );
  assert.equal(records.length, 5);
  let bytes = 0;
  for (const record of records) {
    assert.equal(record.license, "CC0-1.0");
    assert.ok(Object.keys(record.authors).length);
    const folder = new URL(record.asset + "/", root),
      modelBytes = await readFile(new URL("model.gltf", folder));
    assert.equal(
      createHash("sha256").update(modelBytes).digest("hex"),
      record.gltf_sha256,
    );
    const gltf = JSON.parse(modelBytes);
    for (const item of [...gltf.buffers, ...gltf.images]) {
      assert.ok(!item.uri.includes("..") && !item.uri.includes("://"));
      assert.ok((await stat(new URL(item.uri, folder))).size > 0);
    }
    for (const file of record.files) {
      const data = await readFile(
        new URL(file.file, new URL("../", import.meta.url)),
      );
      assert.equal(
        createHash("sha256").update(data).digest("hex"),
        file.sha256,
      );
      bytes += data.byteLength;
    }
  }
  assert.ok(
    bytes < 12_000_000,
    "background asset download budget stays below 12 MB",
  );
});
test("browser reference images and reused meshes match the recorded Rust/Mitsuba originals", async () => {
  const records = JSON.parse(
    await readFile(
      new URL("../assets/references.json", import.meta.url),
      "utf8",
    ),
  );
  for (const record of records) {
    const data = await readFile(
      new URL("../assets/" + record.file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(data).digest("hex"),
      record.sha256,
    );
  }
});

test("photographed materials and HDR panoramas retain upstream and local checksums", async () => {
  const root = new URL("../assets/materials/", import.meta.url);
  const records = JSON.parse(
    await readFile(new URL("sources.json", root), "utf8"),
  );
  assert.equal(records.length, 14);
  let total = 0;
  for (const r of records) {
    assert.equal(r.license, "CC0-1.0");
    assert.ok(Object.keys(r.authors).length);
    assert.ok(!r.file.includes("/") && !r.file.includes(".."));
    assert.ok(r.source.startsWith("https://polyhaven.com/a/"));
    const data = await readFile(new URL(r.file, root));
    assert.equal(data.byteLength, r.bytes);
    assert.equal(createHash("md5").update(data).digest("hex"), r.md5);
    assert.equal(createHash("sha256").update(data).digest("hex"), r.sha256);
    total += data.byteLength;
  }
  assert.ok(
    total < 11_000_000,
    "surface and panorama download budget stays below 11 MB",
  );
});

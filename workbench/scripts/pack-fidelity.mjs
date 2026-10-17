// Lossless authoring-time packaging: retain every triangle, UV and texture byte.
// All external buffers stay below 8 MiB, including embedded image buffer views.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
export async function splitGLB(input, prefix) {
  const source = await readFile(input),
    n = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + n)),
    binary = source.subarray(28 + n);
  const chunks = [];
  let pieces = [],
    length = 0,
    buffer = 0;
  async function flush() {
    if (!length) return;
    const uri = `${path.basename(prefix)}-${buffer}.bin`;
    await writeFile(
      path.join(path.dirname(prefix), uri),
      Buffer.concat(pieces, length),
    );
    chunks.push({ byteLength: length, uri });
    buffer++;
    pieces = [];
    length = 0;
  }
  for (const view of gltf.bufferViews) {
    if (view.byteLength > 8 * 1024 * 1024)
      throw new Error("A source buffer view exceeds the delivery limit");
    if (length + ((4 - (length % 4)) % 4) + view.byteLength > 8 * 1024 * 1024)
      await flush();
    const padding = (4 - (length % 4)) % 4;
    if (padding) {
      pieces.push(Buffer.alloc(padding));
      length += padding;
    }
    pieces.push(
      binary.subarray(
        view.byteOffset || 0,
        (view.byteOffset || 0) + view.byteLength,
      ),
    );
    view.buffer = buffer;
    view.byteOffset = length;
    length += view.byteLength;
  }
  await flush();
  gltf.buffers = chunks;
  await writeFile(prefix + ".gltf", JSON.stringify(gltf));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await splitGLB(process.argv[2], process.argv[3]);
  console.log("Retained all source buffer views in aligned glTF buffers.");
}

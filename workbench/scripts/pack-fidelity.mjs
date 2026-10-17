// Lossless transport packaging: retain every triangle/UV/texture, keeping each
// static asset below 20 MiB. Source OBJ/GLB assets remain untouched.
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { readGemOBJ } from "../src/geometry.js";
export async function packFidelity(dist) {
  const folder = path.join(dist, "assets/atelier");
  const source = await readFile(path.join(folder, "atelier.glb"));
  const jsonLength = source.readUInt32LE(12);
  const gltf = JSON.parse(source.subarray(20, 20 + jsonLength).toString());
  const binary = source.subarray(28 + jsonLength);
  const chunks = [];
  let pieces = [],
    length = 0,
    buffer = 0;
  async function flush() {
    if (!length) return;
    const bytes = Buffer.concat(pieces, length),
      uri = `atelier-${buffer}.bin`;
    await writeFile(path.join(folder, uri), bytes);
    chunks.push({ byteLength: length, uri });
    buffer++;
    pieces = [];
    length = 0;
  }
  for (const view of gltf.bufferViews) {
    const padding = (4 - (length % 4)) % 4;
    if (length + padding + view.byteLength > 20 * 1024 * 1024) await flush();
    const align = (4 - (length % 4)) % 4;
    if (align) {
      pieces.push(Buffer.alloc(align));
      length += align;
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
  await writeFile(path.join(folder, "atelier.gltf"), JSON.stringify(gltf));
  await rm(path.join(folder, "atelier.glb"));
  const obj = path.join(dist, "assets/solitaire-setting.obj");
  const geometry = readGemOBJ(await readFile(obj, "utf8"), true);
  const positions = geometry.attributes.position.array,
    indices = geometry.index.array;
  const packed = Buffer.alloc(12 + positions.length * 4 + indices.length * 4);
  packed.writeUInt32LE(0x31474e52, 0);
  packed.writeUInt32LE(positions.length / 3, 4);
  packed.writeUInt32LE(indices.length, 8);
  positions.forEach((x, i) => packed.writeFloatLE(x, 12 + i * 4));
  indices.forEach((x, i) =>
    packed.writeUInt32LE(x, 12 + positions.length * 4 + i * 4),
  );
  await writeFile(path.join(dist, "assets/solitaire-setting.mesh"), packed);
  await rm(obj);
  geometry.dispose();
}

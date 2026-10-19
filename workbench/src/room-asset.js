import { assetStream } from "./asset-stream.js";

// Lossless gzip delivery changes only transfer/storage size. GLTFLoader sees
// the original complete GLB, with every vertex, image, UV and normal intact.
export async function loadRoomAsset(loader, url) {
  if (!/\.glb\.gz(?:\.parts\.json)?$/.test(String(url)))
    return loader.loadAsync(url);
  const stream = await assetStream(url);
  const bytes = await new Response(stream.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return loader.parseAsync(bytes, new URL(".", url).href);
}

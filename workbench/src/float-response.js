import * as THREE from "../vendor/three.module.js";
import { assetStream } from "./asset-stream.js";

export async function loadFloatResponse(url) {
  const stream = await assetStream(url);
  const bytes = await new Response(stream.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const header = new DataView(bytes);
  const width = header.getUint32(0, true), height = header.getUint32(4, true);
  if (!width || !height || bytes.byteLength !== 8 + width * height * 8)
    throw new Error("Invalid baked response dimensions");
  const texture = new THREE.DataTexture(new Uint16Array(bytes, 8), width, height,
    THREE.RGBAFormat, THREE.HalfFloatType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

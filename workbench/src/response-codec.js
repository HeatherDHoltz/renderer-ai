// Decode transport only: retain every delivered half-float bit and texel.
export function decodeResponse(bytes) {
  if (bytes.byteLength < 8) throw new Error("Invalid baked response header");
  const header = new DataView(bytes), encoded = header.getUint32(0, true);
  const shuffled = !!(encoded & 0x80000000);
  const width = encoded & 0x7fffffff, height = header.getUint32(4, true);
  if (!width || !height || bytes.byteLength !== 8 + width * height * 8)
    throw new Error("Invalid baked response dimensions");
  let pixels;
  if (shuffled) {
    const source = new Uint8Array(bytes, 8), count = width * height;
    pixels = new Uint16Array(count * 4);
    for (let channel = 0; channel < 4; channel++) {
      const low = channel * 2 * count, high = low + count;
      for (let i = 0; i < count; i++) {
        const value = source[low + i] | (source[high + i] << 8);
        pixels[i * 4 + channel] = value;
      }
    }
  } else pixels = new Uint16Array(bytes, 8);
  return { width, height, pixels };
}

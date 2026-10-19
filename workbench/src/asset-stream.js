// Hosted assets may be split at arbitrary byte boundaries without recompression.
// Stream the pieces in order so the original gzip decoder sees the exact file.
export async function assetStream(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset: ${response.status}`);
  if (!String(url).endsWith(".parts.json")) return response.body;
  const manifest = await response.json();
  if (manifest.version !== 1 || !manifest.parts?.length ||
      !Number.isSafeInteger(manifest.byteLength) || manifest.byteLength <= 0 ||
      manifest.parts.some(p => typeof p.file !== "string" ||
        !Number.isSafeInteger(p.byteLength) || p.byteLength <= 0) ||
      manifest.parts.reduce((sum, p) => sum + p.byteLength, 0) !== manifest.byteLength)
    throw new Error("Invalid split asset manifest");
  let index = 0, reader = null, received = 0;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (index < manifest.parts.length) {
          const part = manifest.parts[index];
          if (!reader) {
            const piece = await fetch(new URL(part.file, url));
            if (!piece.ok) throw new Error(`Asset part: ${piece.status}`);
            reader = piece.body.getReader();
            received = 0;
          }
          const { done, value } = await reader.read();
          if (done) {
            reader.releaseLock();
            reader = null;
            if (received !== part.byteLength) throw new Error("Truncated asset part");
            index++;
          } else {
            received += value.byteLength;
            if (received > part.byteLength) throw new Error("Oversized asset part");
            controller.enqueue(value);
            return;
          }
        }
        controller.close();
      } catch (error) {
        await reader?.cancel().catch(() => {});
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader?.cancel(reason);
    },
  });
}

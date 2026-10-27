// Split assets retain the exact original bytes. Fetch at most one chunk ahead
// within each stream, overlapping network latency without buffering every part.
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
  const abort = new AbortController(), pending = new Map();
  let index = 0, reader = null, received = 0;
  function prefetch(i) {
    if (i >= manifest.parts.length || pending.has(i)) return;
    const request = fetch(new URL(manifest.parts[i].file, url), {signal:abort.signal});
    // A later chunk can fail before the stream gets to it. Observe rejection now
    // and still report the original error when that chunk is consumed.
    request.catch(() => {});
    pending.set(i, request);
  }
  prefetch(0); prefetch(1);
  return new ReadableStream({
    async pull(controller) {
      try {
        while (index < manifest.parts.length) {
          const part = manifest.parts[index];
          if (!reader) {
            prefetch(index);
            const piece = await pending.get(index);
            pending.delete(index);
            if (!piece.ok) throw new Error(`Asset part: ${piece.status}`);
            reader = piece.body.getReader(); received = 0;
          }
          const { done, value } = await reader.read();
          if (done) {
            reader.releaseLock(); reader = null;
            if (received !== part.byteLength) throw new Error("Truncated asset part");
            index++; prefetch(index + 1);
          } else {
            received += value.byteLength;
            if (received > part.byteLength) throw new Error("Oversized asset part");
            controller.enqueue(value); return;
          }
        }
        controller.close();
      } catch (error) {
        abort.abort();
        await reader?.cancel().catch(() => {});
        controller.error(error);
      }
    },
    async cancel(reason) {
      abort.abort(reason);
      await reader?.cancel(reason);
    },
  });
}

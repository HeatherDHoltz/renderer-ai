// Local preview only: include personal-use audio (git-ignored, never in a normal build).
process.env.LJ_LOCAL_AUDIO = "1";
await import("./build.mjs");
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".gif": "image/gif",
  ".gltf": "model/gltf+json",
  ".json": "application/json",
  ".obj": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const requested = path.resolve(
      root,
      "." + pathname + (pathname.endsWith("/") ? "index.html" : ""),
    );
    if (!requested.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const body = await readFile(requested);
    res.writeHead(200, {
      "Content-Type":
        types[path.extname(requested)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local: http://127.0.0.1:${port}`),
);

import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
for (const name of ["index.html", "src", "vendor"]) {
  await cp(path.join(root, name), path.join(dist, name), { recursive: true });
}
// Ship only what the browser loads. Authoring caches (Poly Haven sources,
// painting originals, the retired atelier room) stay in the repository.
const authoringOnly = [
  "assets/railcar/polyhaven",
  "assets/railcar/paintings",
  "assets/railcar/textures",
  "assets/atelier",
  "assets/study-props",
].map((p) => path.join(root, p));
await cp(path.join(root, "assets"), path.join(dist, "assets"), {
  recursive: true,
  filter: (src) => !authoringOnly.some((p) => src === p || src.startsWith(p + path.sep)),
});
console.log(
  "Built dist/ with local modules, meshes, and credited reference renders.",
);

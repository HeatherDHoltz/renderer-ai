import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { prepareCuts } from "./prepare-cuts.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
for (const name of ["index.html", "gallery.html", "src", "vendor"]) {
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
  // Personal-use audio is only copied for the local dev server (serve.mjs
  // sets LJ_LOCAL_AUDIO=1); a normal build never ships it.
  ...(process.env.LJ_LOCAL_AUDIO === "1" ? [] : ["assets/railcar/audio/local"]),
].map((p) => path.join(root, p));
await cp(path.join(root, "assets"), path.join(dist, "assets"), {
  recursive: true,
  filter: (src) => !authoringOnly.some((p) => src === p || src.startsWith(p + path.sep)),
});
// The globe now samples its centered geographic source directly at runtime.
await mkdir(path.join(dist,'assets/railcar/textures'),{recursive:true});
await cp(path.join(root,'assets/railcar/textures/antique-globe.jpg'),path.join(dist,'assets/railcar/textures/antique-globe.jpg'));
await prepareCuts(path.join(dist, "assets"));
console.log(
  "Built dist/ with local modules, meshes, and credited reference renders.",
);

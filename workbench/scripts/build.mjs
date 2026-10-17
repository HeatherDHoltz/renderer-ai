import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { packFidelity } from "./pack-fidelity.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
for (const name of ["index.html", "src", "vendor"]) {
  await cp(path.join(root, name), path.join(dist, name), { recursive: true });
}
await cp(path.join(root, "assets"), path.join(dist, "assets"), {
  recursive: true,
});
await packFidelity(dist);
console.log(
  "Built dist/ with local modules, meshes, and credited reference renders.",
);

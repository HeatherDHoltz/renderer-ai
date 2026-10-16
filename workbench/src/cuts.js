import * as THREE from "../vendor/three.module.js";
import { convexFacetHull } from "./gem-optics.js";
import { normalizeGem } from "./geometry.js";

// Convex cut solids with a finite, 2%-diameter girdle. This is an authored cut
// family, not a grading-standard claim or a rescaled glass sphere.
export function cutGeometry(kind) {
  const points = [];
  function ring(radius, y, count, offset = 0) {
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + offset;
      let x = Math.cos(a),
        z = Math.sin(a);
      if (kind === "step") {
        const outline = [
          [1, 0.56],
          [0.72, 0.8],
          [-0.72, 0.8],
          [-1, 0.56],
          [-1, -0.56],
          [-0.72, -0.8],
          [0.72, -0.8],
          [1, -0.56],
        ];
        [x, z] = outline[i];
      } else if (kind === "oval") x *= 0.78;
      else if (kind === "cushion") {
        x = Math.sign(x) * Math.abs(x) ** 0.72;
        z = Math.sign(z) * Math.abs(z) ** 0.72;
      }
      points.push(x * radius, y, z * radius);
    }
  }
  if (kind === "step") {
    ring(0.08, 0, 8);
    ring(0.52, 0.37, 8);
    ring(0.8, 0.66, 8);
    ring(1, 0.84, 8);
    ring(1, 0.88, 8);
    ring(0.83, 1.04, 8);
    ring(0.61, 1.16, 8);
  } else {
    points.push(0, 0, 0);
    ring(0.65, 0.3, 8, Math.PI / 8);
    ring(1, 0.84, 16);
    ring(1, 0.88, 16);
    ring(0.76, 1.08, 8, Math.PI / 8);
    ring(0.55, 1.19, 8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return normalizeGem(convexFacetHull(g), kind === "step" ? 1.28 : 1.24);
}

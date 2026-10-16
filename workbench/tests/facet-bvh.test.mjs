import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import { buildFacetBVH, intersectFacetBVH } from "../src/facet-bvh.js";
import { facetPlanes } from "../src/gem-optics.js";
import { cutGeometry } from "../src/cuts.js";
let seed = 173;
const rand = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
test("accelerated facet exits match the convex half-space reference for every cut", () => {
  for (const cut of ["brilliant", "step", "oval", "cushion"]) {
    const g = cutGeometry(cut),
      planes = facetPlanes(g),
      tree = buildFacetBVH(g);
    assert.ok(tree.data.length / 4 < 4096);
    for (let i = 0; i < 2000; i++) {
      const o = new THREE.Vector3(
        (rand() - 0.5) * 0.15,
        0.4 + (rand() - 0.5) * 0.15,
        (rand() - 0.5) * 0.15,
      );
      const d = new THREE.Vector3(
        rand() - 0.5,
        rand() - 0.5,
        rand() - 0.5,
      ).normalize();
      if (i < 6) d.set(0, 0, 0).setComponent(Math.floor(i / 2), i % 2 ? -1 : 1);
      for (let bounce = 0; bounce < 12; bounce++) {
        let distance = Infinity,
          normal;
        for (const p of planes) {
          const den = p.x * d.x + p.y * d.y + p.z * d.z;
          if (den <= 1e-6) continue;
          const t = -(p.x * o.x + p.y * o.y + p.z * o.z + p.w) / den;
          if (t > 1e-7 && t < distance) {
            distance = t;
            normal = new THREE.Vector3(p.x, p.y, p.z);
          }
        }
        const hit = intersectFacetBVH(tree, o, d);
        assert.ok(
          Math.abs(hit.distance - distance) < 1e-6,
          `${cut} ray ${i}, bounce ${bounce}: exit`,
        );
        assert.ok(hit.normal.distanceTo(normal) < 1e-5, `${cut}: facet normal`);
        o.addScaledVector(d, hit.distance);
        d.reflect(hit.normal);
      }
    }
  }
});

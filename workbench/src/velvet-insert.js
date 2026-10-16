import * as THREE from "../vendor/three.module.js";

// Real displaced upholstery: the pockets are geometry, including sloping lips
// and narrow deep slits between padded ring rolls, rather than dark decals.
export function velvetInsert(width, depth, pockets, ring = false) {
  const nx = 128,
    nz = 96,
    p = [],
    uv = [],
    indices = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = (i / nx - 0.5) * width,
        z = (j / nz - 0.5) * depth;
      let y = 0.3;
      for (const pocket of pockets) {
        const dx = (x - pocket.x) / pocket.rx,
          dz = (z - pocket.z) / pocket.rz;
        const r = dx * dx + dz * dz;
        y -= pocket.depth * Math.exp(-Math.pow(r, 1.6) * 1.6);
        y += 0.017 * Math.exp(-Math.pow((Math.sqrt(r) - 1.2) * 4, 2));
      }
      const edge = Math.min(width / 2 - Math.abs(x), depth / 2 - Math.abs(z));
      y -= 0.055 * Math.exp(-Math.max(0, edge) * 35);
      if (ring) y += 0.025 * Math.cos(((z + 0.05) * Math.PI) / 0.24);
      y += 0.0018 * Math.sin(x * 85 + z * 13) * Math.cos(z * 54);
      p.push(x, y, z);
      uv.push(i / nx, j / nz);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

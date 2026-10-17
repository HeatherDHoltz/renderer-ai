import * as THREE from "../vendor/three.module.js";
export const METALS = {
  gold: { name: "Yellow gold", color: "#e3bd72" },
  rose: { name: "Rose gold", color: "#dca58d" },
  silver: { name: "Silver", color: "#e8eaf0" },
  platinum: { name: "Platinum", color: "#bbbfc2" },
  titanium: { name: "Titanium", color: "#737d89" },
  oxidized: { name: "Oxidized silver", color: "#393e44" },
};
export const FINISHES = [
  { name: "Polished", value: 8 },
  { name: "Satin", value: 48 },
  { name: "Brushed", value: 92 },
];
let brush;
function brushingTexture() {
  if (brush) return brush;
  const n = 1024,
    p = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      p[y * n + x] = 105 + ((y * 73) % 61) + Math.sin(x * 0.13 + y) * 5;
  brush = new THREE.DataTexture(p, n, n, THREE.RedFormat);
  brush.wrapS = brush.wrapT = THREE.RepeatWrapping;
  brush.repeat.set(4, 2);
  brush.needsUpdate = true;
  return brush;
}
export function applyMetal(material, id, finish) {
  const t = Math.max(0, Math.min(1, finish / 100)),
    preset = METALS[id] || METALS.gold;
  material.color.set(preset.color);
  material.roughness = 0.065 + 0.46 * t;
  material.anisotropy = 0.08 + 0.86 * t;
  material.bumpMap = brushingTexture();
  material.bumpScale = 0.0008 * t * t;
}
export function metalMaterial(id, finish) {
  const m = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.1 });
  applyMetal(m, id, finish);
  return m;
}

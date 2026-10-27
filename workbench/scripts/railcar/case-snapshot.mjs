// Evaluate the real runtime case factory without a renderer. Export only its
// visible case meshes; never reproduce the geometry with a second modeller.
// node case-snapshot.mjs <output.json.gz> <source-sha256>
import * as THREE from '../../vendor/three.module.js';
import { benchFraming } from '../../src/interaction.js';
import { makeBenchObjects } from '../../src/bench-objects.js';
import { normalizeGem, readGemOBJ, solitaireGeometry } from '../../src/geometry.js';
import { cutGeometry } from '../../src/cuts.js';
import { createSurfaceMaterials } from '../../src/surface-materials.js';
import { GEMS } from '../../src/gems.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [out, sourceHash] = process.argv.slice(2);
if (!out || !sourceHash) throw new Error('Output and source hash required');
const assets = fileURLToPath(new URL('../../assets/', import.meta.url));
// Canvas is used only for labels. Record the text; Blender creates real text
// objects, while all case/lining/jewellery meshes come from the actual factory.
globalThis.document = { createElement(type) {
  if (type !== 'canvas') throw new Error(`Unexpected DOM request: ${type}`);
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => ({ fillText(text) { canvas.labelText = text; canvas.labelFont = this.font; canvas.labelColor = this.fillStyle; } });
  return canvas;
} };
const surfaces = createSurfaceMaterials(Object.fromEntries(
  ['velvetColor','velvetNormal','velvetRough','velvetAO','woodColor','woodNormal','woodRough']
    .map(name => [name, new THREE.Texture()])));
surfaces.wood.userData.previewPhoto = 'wood';
surfaces.velvet.userData.previewPhoto = 'velvet';
surfaces.redVelvet.userData.previewPhoto = 'velvet';
const geometries = {
  tiger: normalizeGem(readGemOBJ(await readFile(path.join(assets, 'cabochon.obj'), 'utf8'), true), 1.38),
  shank: solitaireGeometry(await readFile(path.join(assets, 'solitaire-sample.obj'), 'utf8')),
};
const materials = {};
for (const [id, gem] of Object.entries(GEMS)) {
  if (id !== 'tiger') geometries[id] = cutGeometry(gem.cut);
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: id === 'tiger' ? 0 : 1, ior: gem.ior, roughness: .02 });
  m.userData.previewGem = { id, ...gem };
  materials[id] = m;
}
const scene = new THREE.Scene();
const bench = makeBenchObjects(scene, geometries, materials, surfaces, new THREE.PointLight());
bench.select('gem', 'diamond');
bench.select('metal', 'gold', 8);
// Export a settled pose; the browser animates against wall-clock time.
for (const c of Object.values(bench.cases)) c.progress = c.destination = 1;
bench.animate(100, null, false);
scene.updateMatrixWorld(true);

const encoded = (attribute) => ({ type: attribute.array.constructor.name, count: attribute.count,
  itemSize: attribute.itemSize,
  base64: Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength).toString('base64') });
const geometryIds = new Map(), materialIds = new Map(), geometryData = [], materialData = [], objects = [];
function materialId(m) {
  if (materialIds.has(m)) return materialIds.get(m);
  const id = materialData.length;
  materialIds.set(m,id);
  materialData.push({ color: m.color.toArray(), metalness: m.metalness || 0, roughness: m.roughness ?? .5,
    normalStrength: m.normalScale?.x, anisotropy: m.anisotropy || 0, sheen: m.sheen || 0, sheenColor: m.sheenColor?.toArray(),
    photo: m.userData.previewPhoto, gem: m.userData.previewGem,
    mirror: m.customProgramCacheKey() === 'case-mirror-v1', label: m.map?.image?.labelText,
    labelFont: m.map?.image?.labelFont, labelColor: m.map?.image?.labelColor });
  return id;
}
for (const [caseId,c] of Object.entries(bench.cases)) {
  c.root.traverse((o) => {
    if (!o.isMesh || !o.visible || o.material.visible === false || o.userData.noPreview) return;
    // Selection halos are UI feedback, not physical components of the set.
    if (o.geometry.type === 'TorusGeometry') return;
    if (!geometryIds.has(o.geometry)) {
      const id = geometryData.length;
      geometryIds.set(o.geometry,id);
      geometryData.push({ position: encoded(o.geometry.attributes.position),
        normal: o.geometry.attributes.normal && encoded(o.geometry.attributes.normal),
        uv: o.geometry.attributes.uv && encoded(o.geometry.attributes.uv),
        index: o.geometry.index && encoded(o.geometry.index) });
    }
    const tray = c.trays.find(t => t.tray === o.parent);
    const role = o.material.userData.previewGem ? 'gem' : o.geometry === geometries.shank ? 'ring' : 'case';
    objects.push({ case: caseId, name: o.name || `${caseId} ${o.material.userData.previewGem?.id || role} ${objects.length}`,
      geometry: geometryIds.get(o.geometry), material: materialId(o.material), matrix: o.matrixWorld.toArray(),
      tray: tray && { tier: c.trays.indexOf(tray) < 2 ? 0 : 1, side: tray.side },
      part: o.userData.previewPart, assembly: o.parent === c.well ? 'well' : tray ? `tray-${c.trays.indexOf(tray)}` : 'body',
      role });
  });
}
const home = benchFraming(16 / 9);
const report = { version: 1, sourceHash, pose: 'fully-open', byteOrder: 'little-endian',
  camera: { position: [0, home.y, home.z], target: [0, -1.08, .15], fov: home.fov, aspect: 16 / 9 },
  geometry: geometryData, materials: materialData, objects };
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, gzipSync(JSON.stringify(report)));
console.log(JSON.stringify({ output: out, meshes: objects.length, geometries: geometryData.length,
  gems: objects.filter(o=>o.role==='gem').length, rings: objects.filter(o=>o.role==='ring').length }));

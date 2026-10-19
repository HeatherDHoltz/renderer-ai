import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import * as THREE from '../vendor/three.module.js';

function decode(a) {
  const b = Buffer.from(a.base64, 'base64');
  const buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return new ({ Float32Array, Uint16Array, Uint32Array }[a.type])(buffer);
}

test('Cycles case snapshot preserves contents, real desk contact and exposed velvet', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'railcar-case-check-'));
  try {
    const output = path.join(dir, 'cases.json.gz');
    const run = spawnSync(process.execPath, [new URL('../scripts/railcar/case-snapshot.mjs', import.meta.url).pathname,
      output, 'regression-fixture'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const data = JSON.parse(gunzipSync(readFileSync(output)));
    assert.equal(data.objects.filter(o => o.role === 'gem').length, 12);
    assert.equal(data.objects.filter(o => o.role === 'ring').length, 18);
    const geometry = data.geometry.map(g => {
      const mesh = new THREE.BufferGeometry();
      const p = decode(g.position);
      assert.ok(p.every(Number.isFinite));
      mesh.setAttribute('position', new THREE.BufferAttribute(p, 3));
      if (g.index) {
        const indices = decode(g.index);
        assert.ok(indices.every(i => i < p.length / 3));
        mesh.setIndex(new THREE.BufferAttribute(indices, 1));
      }
      if (g.normal) {
        assert.equal(g.normal.count, g.position.count);
        assert.ok(decode(g.normal).every(Number.isFinite));
      }
      if (g.uv) assert.equal(g.uv.count, g.position.count);
      return mesh;
    });
    const meshes = data.objects.filter(o => !data.materials[o.material].label).map(o => {
      const m = new THREE.Mesh(geometry[o.geometry], new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      m.userData.row = o;
      m.matrixAutoUpdate = false;
      m.matrix.copy(new THREE.Matrix4().fromArray(o.matrix));
      m.updateMatrixWorld(true);
      return m;
    });
    // The default frame must include every physical part of both open cases.
    const camera = new THREE.PerspectiveCamera(data.camera.fov, data.camera.aspect, .025, 180);
    camera.position.fromArray(data.camera.position);
    camera.lookAt(new THREE.Vector3().fromArray(data.camera.target));
    camera.updateMatrixWorld(true);
    for (const mesh of meshes) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
        assert.ok(Math.abs(p.x) < .99 && Math.abs(p.y) < .99 && p.z > -1 && p.z < 1,
          `open case part outside the default frame: ${mesh.userData.row.name}`);
      }
    }
    for (const id of ['gems', 'metals']) {
      const base = meshes.find(o => o.userData.row.name === `${id} case base`);
      assert.ok(base);
      const bounds = new THREE.Box3().setFromObject(base);
      assert.ok(Math.abs(bounds.min.y - (-1.399)) < 1e-5, `case ${id} floats or sinks: ${bounds.min.y}`);
      const lined = meshes.filter(o => o.userData.row.case === id && data.materials[o.userData.row.material].photo === 'velvet');
      const velvet = lined.filter(o => o.userData.row.part !== 'lid-lining');
      assert.equal(velvet.length, 5, 'one well and four lined trays');
      // The open lid is lined with the case's velvet, not a mirror.
      assert.equal(lined.filter(o => o.userData.row.part === 'lid-lining').length, 1);
      assert.equal(meshes.filter(o => o.userData.row.case === id && data.materials[o.userData.row.material].mirror).length, 0);
      for (const lining of velvet) {
        const floor = meshes.find(o => o.userData.row.case === id &&
          o.userData.row.assembly === lining.userData.row.assembly && o.userData.row.part === 'substrate');
        assert.ok(floor);
        assert.ok(new THREE.Box3().setFromObject(floor).max.y < new THREE.Box3().setFromObject(lining).min.y,
          'wood substrate protrudes through the bottom of a velvet pocket');
        const tray = lining.userData.row.tray;
        const origin = new THREE.Vector3(tray ? .32 : 0, 2, tray ? 0 : .6).applyMatrix4(lining.matrixWorld);
        const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(meshes, false)[0];
        assert.ok(hit?.object === lining, `wood or another part hides ${id} velvet at an exposed sample (hit ${hit?.object?.userData.row.name})`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

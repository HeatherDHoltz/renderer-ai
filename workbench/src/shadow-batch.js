import * as THREE from "../vendor/three.module.js";

const SHADOW_LAYER = 4;
const shadowSide = new Map([[THREE.FrontSide, THREE.BackSide], [THREE.BackSide, THREE.FrontSide], [THREE.DoubleSide, THREE.DoubleSide]]);

// Batch the cases' identical opaque shadow geometry. Visible meshes, material
// quality and shadow-map resolution remain unchanged. Static cases then submit
// a few shadow draws when the inspected stone turns, instead of hundreds.
export function batchCaseShadows(renderer, scene, cases, { enabled = true, spatial = true } = {}) {
  const groups = new Map(), records = [];
  for (const [caseId, entry] of Object.entries(cases)) entry.root.traverse((object) => {
    if (!object.isMesh || !object.castShadow || Array.isArray(object.material) ||
        object.material.visible === false || object.material.alphaTest > 0 ||
        object.material.displacementMap || object.customDepthMaterial || object.customDistanceMaterial ||
        object.isSkinnedMesh || object.isInstancedMesh) return;
    const side = object.material.shadowSide ?? (renderer.shadowMap.type === THREE.VSMShadowMap
      ? object.material.side : shadowSide.get(object.material.side));
    const mask = object.layers.mask, key = `${spatial ? caseId : "all"}:${side}:${mask}`;
    if (!groups.has(key)) groups.set(key, { side, mask, objects: [] });
    groups.get(key).objects.push(object);
  });
  const proxies = [];
  for (const group of groups.values()) {
    let vertices = 0, indices = 0;
    for (const o of group.objects) {
      vertices += o.geometry.attributes.position.count;
      indices += o.geometry.index?.count ?? o.geometry.attributes.position.count;
    }
    const positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3);
    const triangles = new Uint32Array(indices);
    let vertex = 0, index = 0;
    for (const object of group.objects) {
      const geometry = object.geometry, p = geometry.attributes.position;
      const n = geometry.attributes.normal;
      if (!n) throw new Error(`Missing case shadow normals: ${object.name}`);
      const record = { object, offset: vertex, matrix: new THREE.Matrix4(), shown: null,
        position: positions, normal: normals, geometry: null };
      records.push(record);
      for (let j = 0; j < (geometry.index?.count ?? p.count); j++)
        triangles[index++] = vertex + (geometry.index ? geometry.index.getX(j) : j);
      vertex += p.count;
      if (enabled) object.castShadow = false;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(triangles, 1));
    for (const r of records) if (r.position === positions) r.geometry = geometry;
    const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    material.shadowSide = group.side;
    const proxy = new THREE.Mesh(geometry, material);
    proxy.name = 'Cached exact case shadow geometry';
    proxy.layers.set(SHADOW_LAYER);
    proxy.castShadow = enabled;
    // Per-case bounds let Three skip cube faces that cannot contain this case.
    // Every original triangle remains; the sphere is recomputed after posing.
    proxy.frustumCulled = spatial;
    proxy.userData.sourceLayerMask = group.mask;
    proxy.raycast = () => {};
    scene.add(proxy);
    proxies.push(proxy);
  }
  const vector = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  function update() {
    const dirty = new Set();
    for (const r of records) {
      const o = r.object;
      o.updateWorldMatrix(true, false);
      let shown = o.visible;
      for (let p = o.parent; p && shown; p = p.parent) shown = p.visible;
      if (r.shown === shown && r.matrix.equals(o.matrixWorld)) continue;
      r.shown = shown;r.matrix.copy(o.matrixWorld);
      normalMatrix.getNormalMatrix(o.matrixWorld);
      const p = o.geometry.attributes.position, n = o.geometry.attributes.normal;
      for (let j = 0; j < p.count; j++) {
        const offset = (r.offset + j) * 3;
        vector.fromBufferAttribute(p, j).applyMatrix4(o.matrixWorld);
        if (!shown) vector.set(0, 0, 0); // collapsed triangles cast no shadow
        vector.toArray(r.position, offset);
        vector.fromBufferAttribute(n, j).applyNormalMatrix(normalMatrix).toArray(r.normal, offset);
      }
      dirty.add(r.geometry);
    }
    for (const geometry of dirty) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.normal.needsUpdate = true;
      geometry.computeBoundingSphere();
    }
    return dirty.size > 0;
  }
  const shadowMap = renderer.shadowMap, previous = shadowMap.render;
  function render(lights, currentScene, camera) {
    const mask = camera.layers.mask;
    const visibility = proxies.map((proxy) => proxy.visible);
    try {
      for (const proxy of proxies) proxy.visible = !!(mask & proxy.userData.sourceLayerMask);
      camera.layers.enable(SHADOW_LAYER);
      return previous.call(shadowMap, lights, currentScene, camera);
    } finally {
      camera.layers.mask = mask;
      proxies.forEach((proxy, i) => { proxy.visible = visibility[i]; });
    }
  }
  if (enabled) shadowMap.render = render;
  update();
  return {
    update,
    count: proxies.length,
    sourceCount: records.length,
    meshes: proxies,
    dispose() {
      if (shadowMap.render === render) shadowMap.render = previous;
      for (const record of records) record.object.castShadow = true;
      for (const proxy of proxies) { scene.remove(proxy);proxy.geometry.dispose();proxy.material.dispose(); }
    },
  };
}

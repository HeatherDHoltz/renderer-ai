import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "../vendor/three.module.js";
import { convexFacetHull, facetPlanes } from "../src/gem-optics.js";

test("the paper diamonds have a closed optical boundary with their authored extents", async () => {
  const bytes = await readFile(new URL("../assets/railcar/export/railcar-glass.glb", import.meta.url));
  const length = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + length));
  const bin = 20 + length + 8;
  const nodes = doc.nodes.filter((n) => n.mesh !== undefined && /loose brilliant|brilliant in tweezers/.test(n.name));
  assert.equal(nodes.length, 10);
  for (const node of nodes) {
    const primitive = doc.meshes[node.mesh].primitives[0];
    const accessor = doc.accessors[primitive.attributes.POSITION];
    const view = doc.bufferViews[accessor.bufferView];
    assert.equal(accessor.componentType, 5126);
    const offset = bin + (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const values = [];
    for (let i = 0; i < accessor.count; i++)
      for (let k = 0; k < 3; k++) values.push(bytes.readFloatLE(offset + i * (view.byteStride || 12) + k * 4));
    const source = new THREE.BufferGeometry();
    source.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
    source.computeBoundingBox();
    const hull = convexFacetHull(source);
    assert.ok(facetPlanes(hull).length >= 17, node.name);
    assert.ok(hull.boundingBox.min.distanceTo(source.boundingBox.min) < 1e-6, node.name);
    assert.ok(hull.boundingBox.max.distanceTo(source.boundingBox.max) < 1e-6, node.name);
    source.dispose(); hull.dispose();
  }
});

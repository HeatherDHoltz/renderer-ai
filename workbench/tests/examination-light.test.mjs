import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import {
  examinationLights,
  diskRayDistance,
  bindExaminationLights,
} from "../src/examination-light.js";
import { makeFacetMaterial, facetPlanes } from "../src/gem-optics.js";
import { cutGeometry } from "../src/cuts.js";

test("finite examination apertures accept front-facing rays and reject misses, back faces and self hits", () => {
  const disk = {
    position: new THREE.Vector3(0, 0, 2),
    normal: new THREE.Vector3(0, 0, -1),
    radius: 0.14,
  };
  assert.equal(
    diskRayDistance(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), disk),
    2,
  );
  assert.equal(
    diskRayDistance(
      new THREE.Vector3(0.15, 0, 0),
      new THREE.Vector3(0, 0, 1),
      disk,
    ),
    Infinity,
  );
  assert.equal(
    diskRayDistance(
      new THREE.Vector3(0, 0, 3),
      new THREE.Vector3(0, 0, -1),
      disk,
    ),
    Infinity,
  );
  assert.equal(
    diskRayDistance(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), disk),
    Infinity,
  );
  assert.equal(
    diskRayDistance(disk.position, new THREE.Vector3(0, 0, 1), disk),
    Infinity,
  );
  const shift = new THREE.Vector3(8, -3, 2),
    rot = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      0.8,
    );
  const transformed = {
    position: disk.position.clone().applyQuaternion(rot).add(shift),
    normal: disk.normal.clone().applyQuaternion(rot),
    radius: disk.radius,
  };
  assert.ok(
    Math.abs(
      diskRayDistance(
        shift,
        new THREE.Vector3(0, 0, 1).applyQuaternion(rot),
        transformed,
      ) - 2,
    ) < 1e-9,
  );
});

test("moving and broad light profiles update shader uniforms without recompiling or losing world transforms", () => {
  const geometry = cutGeometry("brilliant"),
    material = makeFacetMaterial(geometry, null),
    version = material.version;
  const focused = examinationLights(new THREE.Vector3(2, 3, 2.2)),
    broad = examinationLights(new THREE.Vector3(-2, 2.4, 2.2), true);
  bindExaminationLights([material], focused);
  assert.equal(material.uniforms.lightDisks.value[0].x, 2);
  bindExaminationLights([material], broad);
  assert.equal(material.uniforms.lightDisks.value[0].x, -2);
  assert.ok(broad[0].radius > focused[0].radius);
  assert.ok(broad[0].radiance.x < focused[0].radiance.x);
  assert.equal(material.version, version);
  const root = new THREE.Group(),
    object = new THREE.Mesh(geometry, material),
    camera = new THREE.PerspectiveCamera(),
    light = new THREE.PointLight();
  root.position.set(3, 1, -2);
  root.rotation.y = 0.4;
  object.scale.setScalar(0.34);
  root.add(object);
  material.userData.update(object, camera, light);
  assert.deepEqual(
    material.uniforms.objectWorld.value.elements,
    object.matrixWorld.elements,
  );
});

test("diamond pavilion facets use controlled light-return angles instead of the former shallow lower tier", () => {
  const planes = facetPlanes(cutGeometry("brilliant"));
  const pavilion = planes.filter((p) => p.y < -0.05);
  assert.ok(pavilion.length >= 8);
  for (const p of pavilion) {
    const angle = (Math.atan2(Math.hypot(p.x, p.z), -p.y) * 180) / Math.PI;
    assert.ok(angle > 39 && angle < 43, `pavilion angle ${angle}`);
  }
});

import * as THREE from "../vendor/three.module.js";

// Finite, one-sided examination apertures. They have no visible fixture mesh.
// Direct disk intersections preserve narrow HDR sources through refracted rays
// instead of depending on their resolution in a captured room cubemap.
export function examinationLights(position, broad = false) {
  return [
    {
      position: position.clone(),
      radius: broad ? 1.25 : 0.45,
      radiance: new THREE.Vector3(1, 0.985, 0.95).multiplyScalar(
        broad ? 8 : 65,
      ),
    },
    {
      position: new THREE.Vector3(-3.1, 4.7, 1.6),
      radius: 1.1,
      radiance: new THREE.Vector3(12, 12, 12),
    },
    {
      position: new THREE.Vector3(2.7, 4.6, -2.0),
      radius: 0.65,
      radiance: new THREE.Vector3(20, 19.5, 18.5),
    },
    {
      position: new THREE.Vector3(-0.6, 5.8, -3.3),
      radius: 2.25,
      radiance: new THREE.Vector3(4.5, 4.5, 4.5),
    },
  ].map((light) => ({
    ...light,
    normal: new THREE.Vector3(0, 1.1, 0).sub(light.position).normalize(),
  }));
}

export function diskRayDistance(origin, direction, disk) {
  const den = direction.dot(disk.normal);
  if (den >= -1e-8) return Infinity;
  const t = disk.position.clone().sub(origin).dot(disk.normal) / den;
  if (t <= 1e-5) return Infinity;
  const hit = origin.clone().addScaledVector(direction, t);
  return hit.distanceTo(disk.position) <= disk.radius ? t : Infinity;
}

export function bindExaminationLights(materials, lights) {
  for (const material of materials) {
    if (!material.uniforms?.lightDisks) continue;
    const u = material.uniforms;
    for (let i = 0; i < 4; i++) {
      const l = lights[i];
      u.lightDisks.value[i].set(
        l.position.x,
        l.position.y,
        l.position.z,
        l.radius,
      );
      u.lightNormals.value[i].copy(l.normal);
      u.lightRadiance.value[i].copy(l.radiance);
    }
  }
}

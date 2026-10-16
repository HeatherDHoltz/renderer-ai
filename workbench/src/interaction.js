import * as THREE from "../vendor/three.module.js";

export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const ease = (x) => {
  const t = clamp(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// A small seated head movement, never an orbit or a full camera turn.
export function gazeOffset(x, y) {
  return new THREE.Vector2(clamp(x, -1, 1) * 0.105, clamp(y, -1, 1) * 0.055);
}

// Each leg eases to rest. Straight segments cannot overshoot the safe corridor.
export function corridorPoint(points, progress) {
  const t = clamp(progress) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(t));
  return points[i].clone().lerp(points[i + 1], ease(t - i));
}

// Lift beside the specimen, cross above its swept bounds, then approach the eye
// from the camera side. The radius includes the handle and the lens rim.
export function loupeCorridor(rest, eye, bounds, radius = 0.95) {
  const safeY = Math.max(
    bounds.max.y + radius + 0.45,
    rest.y + 2.5,
    eye.y + 0.6,
  );
  const safeZ = Math.max(bounds.max.z + radius + 0.35, eye.z);
  return [
    rest.clone(),
    new THREE.Vector3(rest.x, rest.y, safeZ),
    new THREE.Vector3(rest.x, safeY, safeZ),
    new THREE.Vector3(eye.x, safeY, safeZ),
    eye.clone(),
  ];
}

// Progress reverses in place; switching direction never changes the pose.
export function advanceProgress(
  progress,
  destination,
  seconds,
  duration = 1.8,
) {
  const step = Math.max(0, seconds) / duration;
  return destination > progress
    ? Math.min(destination, progress + step)
    : Math.max(destination, progress - step);
}

// The lamp moves on a plane behind and above the specimen, outside its reach.
export function lampControls(point) {
  return {
    angle: clamp(point.x / 3.2, -1, 1) * 100,
    height: 8 + clamp((point.y - 2.1) / 1.7) * 77,
  };
}

export function benchFraming(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0)
    throw new RangeError("Invalid viewport aspect");
  const fov = THREE.MathUtils.lerp(60, 46, clamp((aspect - 0.55) / 1.1));
  const z = Math.max(
    6.4,
    Math.min(
      18,
      1.4 + 4.15 / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect),
    ),
  );
  return { fov, z, y: 2.6 + (z - 6.4) * 0.37 };
}

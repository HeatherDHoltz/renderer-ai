import * as THREE from "../vendor/three.module.js";

const clamp = THREE.MathUtils.clamp;
// A seated orbit: the focal point can move around the room, but the viewer
// cannot pass through the desk, roll over, or turn around behind the chair.
export class BenchOrbit {
  constructor(position, target) {
    this.target = target.clone();
    this.destination = target.clone();
    this.spherical = new THREE.Spherical().setFromVector3(
      position.clone().sub(target),
    );
    this.goal = this.spherical.clone();
  }
  adopt(position, target) {
    this.target.copy(target);
    this.destination.copy(target);
    this.spherical.setFromVector3(position.clone().sub(target));
    this.goal.copy(this.spherical);
  }
  drag(dx, dy) {
    this.goal.theta = clamp(this.goal.theta - dx, -0.85, 0.85);
    this.goal.phi = clamp(this.goal.phi - dy, 0.24, 1.53);
  }
  zoom(factor, focus) {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    const next = clamp(this.goal.radius * factor, 1.35, 26);
    // Moving the pivot toward the pointer keeps the subject under the fingers.
    // Pulling back retains the selected pivot instead of chasing a far wall.
    if (focus && next < this.goal.radius)
      this.destination.lerp(focus, clamp(1 - next / this.goal.radius, 0, 0.35));
    this.goal.radius = next;
    this.boundTarget();
  }
  focus(point, distance = 4) {
    this.destination.copy(point);
    this.goal.radius = clamp(distance, 1.35, 26);
    this.boundTarget();
  }
  boundTarget() {
    this.destination.clamp(
      new THREE.Vector3(-7, -0.9, -10),
      new THREE.Vector3(7, 5.8, 3),
    );
  }
  update(camera, dt) {
    const t = 1 - Math.exp(-Math.max(0, dt) * 12);
    this.target.lerp(this.destination, t);
    for (const k of ["radius", "phi", "theta"])
      this.spherical[k] = THREE.MathUtils.lerp(
        this.spherical[k],
        this.goal[k],
        t,
      );
    camera.position.setFromSpherical(this.spherical).add(this.target);
    // Keep the eye in front of the back wall and above the working surface.
    camera.position.x = clamp(camera.position.x, -6.7, 6.7);
    camera.position.y = clamp(camera.position.y, -0.75, 6.5);
    camera.position.z = Math.max(-5.8, camera.position.z);
    camera.lookAt(this.target);
    return this.moving;
  }
  get moving() {
    return (
      this.target.distanceToSquared(this.destination) > 1e-8 ||
      ["radius", "phi", "theta"].some(
        (k) => Math.abs(this.spherical[k] - this.goal[k]) > 0.0001,
      )
    );
  }
}

// Wheel deltaMode is pixels, lines, or pages. A smooth exponential preserves
// small trackpad deltas and makes opposite gestures cancel before clamping.
export function wheelScale(delta, mode = 0, pinch = false) {
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? 600 : 1);
  return Math.exp(clamp(pixels, -240, 240) * (pinch ? 0.008 : 0.0018));
}

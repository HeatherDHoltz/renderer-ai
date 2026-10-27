import * as THREE from "../vendor/three.module.js";

const clamp = THREE.MathUtils.clamp;
const MAX_YAW = THREE.MathUtils.degToRad(90);
// Three's spherical phi is measured down from +Y: elevation 0..75° maps to
// phi 90..15°.
const MIN_PHI = THREE.MathUtils.degToRad(15);
const MAX_PHI = THREE.MathUtils.degToRad(90);
// Close enough to read a single ring or a book spine; the far limit stays a
// short step back from the seat.
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 1.25;

// Each fixed station owns its pivot and forward direction. The viewer
// cannot pass through the desk, roll over, or turn around behind the chair.
export class BenchOrbit {
  constructor(position, target) {
    this.target = target.clone();
    this.destination = target.clone();
    this.spherical = new THREE.Spherical().setFromVector3(
      position.clone().sub(target),
    );
    this.goal = this.spherical.clone();
    this.homeRadius = this.spherical.radius;
    this.yawCenter = this.spherical.theta;
    this.obstacles = [];
    this.maxZoom = MAX_ZOOM;
  }
  // Adopt a pose without changing the station’s yaw or zoom limits.
  adopt(position, target) {
    this.target.copy(target);
    this.destination.copy(target);
    this.spherical.setFromVector3(position.clone().sub(target));
    this.goal.copy(this.spherical);
  }
  // A selected station (or the default desk) defines yaw and zoom limits.
  home(position, target) {
    this.adopt(position, target);
    this.homeRadius = this.spherical.radius;
    this.yawCenter = this.spherical.theta;
  }
  drag(dx, dy) {
    // Keep the visitor within this station’s 180° horizontal view cone and
    // above the desk plane, with at most a 75° downward view.
    this.goal.theta = clamp(this.goal.theta - dx, this.yawCenter - MAX_YAW, this.yawCenter + MAX_YAW);
    this.goal.phi = clamp(this.goal.phi - dy, MIN_PHI, MAX_PHI);
  }
  zoom(factor) {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    const next = clamp(
      this.goal.radius * factor,
      this.homeRadius * MIN_ZOOM,
      this.homeRadius * this.maxZoom,
    );
    // Every zoom stays on the selected station's fixed pivot.
    this.goal.radius = next;
  }
  station(position, target) {
    this.home(position, target);
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
    this.constrainPosition(camera.position);
    camera.lookAt(this.target);
    return this.moving;
  }
  constrainPosition(position) {
    // Keep the eye in front of the back wall and above the working surface.
    position.x = clamp(position.x, -24.5, 24.5);
    position.y = clamp(position.y, -8.3, 16.5);
    position.z = clamp(position.z, -10.2, 26.5);
    // Never dip into the desk: over its footprint stay above the leather.
    if (Math.abs(position.x) < 8.4 && position.z > -6 && position.z < 3.6)
      position.y = Math.max(position.y, -0.75);
    // Broad cabinet/seat bounds from the edited Blender room keep a close
    // quarter-turn from placing the eye inside solid furniture.
    for (let pass = 0; pass < 3; pass++) for (const box of this.obstacles) {
      const p = position, pad = 0.15;
      if (!(["x", "y", "z"].every((k, i) => p[k] > box.min[i] - pad && p[k] < box.max[i] + pad))) continue;
      const faces = ["x", "y", "z"].flatMap((k, i) => [
        { k, value: box.min[i] - pad, distance: p[k] - box.min[i] + pad },
        { k, value: box.max[i] + pad, distance: box.max[i] + pad - p[k] },
      ]);
      const nearest = faces.reduce((a, b) => a.distance < b.distance ? a : b);
      p[nearest.k] = nearest.value;
    }
    return position;
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

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
// Double-click focus lands roughly 25 cm from the picked point.
const FOCUS_ZOOM = 0.3;
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
    this.homeRadius = this.spherical.radius;
    this.obstacles = [];
  }
  // Take over the current camera pose. The zoom limits stay relative to the
  // seated framing, so adopting a zoomed or case-inspection pose never
  // ratchets them.
  adopt(position, target) {
    this.target.copy(target);
    this.destination.copy(target);
    this.spherical.setFromVector3(position.clone().sub(target));
    this.goal.copy(this.spherical);
  }
  // The seated framing (resize, reset) defines the zoom range.
  home(position, target) {
    this.adopt(position, target);
    this.homeRadius = this.spherical.radius;
  }
  drag(dx, dy) {
    // Keep the visitor within the desk-facing 180° horizontal view cone and
    // above the desk plane, with at most a 75° downward view.
    this.goal.theta = clamp(this.goal.theta - dx, -MAX_YAW, MAX_YAW);
    this.goal.phi = clamp(this.goal.phi - dy, MIN_PHI, MAX_PHI);
  }
  zoom(factor, focus) {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    const next = clamp(
      this.goal.radius * factor,
      this.homeRadius * MIN_ZOOM,
      this.homeRadius * MAX_ZOOM,
    );
    // Moving the pivot toward the pointer keeps the subject under the fingers.
    // Pulling back retains the selected pivot instead of chasing a far wall.
    if (focus && next < this.goal.radius)
      this.destination.lerp(focus, clamp(1 - next / this.goal.radius, 0, 0.35));
    this.goal.radius = next;
    this.boundTarget();
  }
  focus(point, distance = this.homeRadius * FOCUS_ZOOM) {
    this.destination.copy(point);
    this.goal.radius = clamp(
      distance,
      this.homeRadius * MIN_ZOOM,
      this.homeRadius * MAX_ZOOM,
    );
    this.boundTarget();
  }
  boundTarget() {
    // Railcar interior (10 cm units): x -26..26, floor -9, back wall z -11, front wall z 28.
    this.destination.clamp(
      new THREE.Vector3(-23, -8.5, -9.5),
      new THREE.Vector3(23, 14, 25),
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
    camera.position.x = clamp(camera.position.x, -24.5, 24.5);
    camera.position.y = clamp(camera.position.y, -8.3, 16.5);
    camera.position.z = clamp(camera.position.z, -10.2, 26.5);
    // Never dip into the desk: over its footprint stay above the leather.
    if (Math.abs(camera.position.x) < 8.4 && camera.position.z > -6 && camera.position.z < 3.6)
      camera.position.y = Math.max(camera.position.y, -0.75);
    // Broad cabinet/seat bounds from the edited Blender room keep a close
    // quarter-turn from placing the eye inside solid furniture.
    for (let pass = 0; pass < 3; pass++) for (const box of this.obstacles) {
      const p = camera.position, pad = 0.15;
      if (!(["x", "y", "z"].every((k, i) => p[k] > box.min[i] - pad && p[k] < box.max[i] + pad))) continue;
      const faces = ["x", "y", "z"].flatMap((k, i) => [
        { k, value: box.min[i] - pad, distance: p[k] - box.min[i] + pad },
        { k, value: box.max[i] + pad, distance: box.max[i] + pad - p[k] },
      ]);
      const nearest = faces.reduce((a, b) => a.distance < b.distance ? a : b);
      p[nearest.k] = nearest.value;
    }
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

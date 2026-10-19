import * as THREE from "../vendor/three.module.js";

// Night forest outside both rows of windows: the standard train-window
// technique (layers of scenery at different distances, each passing at the
// speed its distance implies) with real trees: Poly Haven's scanned
// "Fir Tree 01" and "Pine Tree 01" (CC0), rendered in Cycles under moonlight
// (scripts/railcar/impostors.py, LJ_NIGHT=1) as camera-facing cards.
//
// Four layers, 6 / 14 / 30 / 60 m beyond the car. No distant scenery.
// Nothing repeats: each tree slot draws its variant, view, size, gap and
// position from a hash of (slot, lap), so every time a slot wraps round it
// becomes a different tree. Layers are true geometry at true distances, so
// turning the camera changes what each window shows. Motion blur is a short
// shutter (a third of a frame's travel), not a smear.

const knob = (name, fallback) => {
  const raw = new URLSearchParams(globalThis.location?.search || "").get(name);
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

// 1 unit = 10 cm. ?nightspeed= train speed in units/s (100 = 10 m/s, 36 km/h).
const SPEED = knob("nightspeed", 100);
// Horizontal motion blur: a full frame's travel (180-degree film shutter x2),
// so passing trees read as soft streaks rather than sharp, eye-catching cut-outs.
const SHUTTER = knob("nightshutter", 1.2); // fraction of a 30 fps frame
const GROUND = -21; // ground ~1.2 m below the car floor
// The line runs on an embankment and the forest falls away downhill, so from
// the seat the windows look into the canopies of all four layers rather than
// at bare lower trunks. drop: how far below the car's ground each layer stands.
const LAYERS = [
  // distance from the outer wall, ground drop, mean spacing, share of empty slots, brightness, fog
  { d: 60, drop: 80, spacing: 42, skip: 0.2, light: 1.0, fog: 0.0 },
  { d: 140, drop: 110, spacing: 36, skip: 0.12, light: 0.9, fog: 0.16 },
  { d: 300, drop: 150, spacing: 30, skip: 0.06, light: 0.8, fog: 0.34 },
  { d: 600, drop: 200, spacing: 18, skip: 0.0, light: 0.7, fog: 0.55 },
  // Two dense back rows so gaps open onto more forest, not open sky.
  { d: 1000, drop: 240, spacing: 14, skip: 0.0, light: 0.6, fog: 0.72 },
  { d: 1600, drop: 280, spacing: 12, skip: 0.0, light: 0.5, fog: 0.85 },
];

const HASH = /* glsl */ `
float nh(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}`;

const TREE_VERT = /* glsl */ `
attribute float slot;
uniform float offset, span, spacing, skip, seed, side, wall, depth, drop;
uniform float views, variants, cols, rows;
uniform vec4 frames[8]; // per variant: frameW, frameH (m), baseV
varying vec2 vUv;
varying vec4 vCell; // atlas cell rect: u0, v0, du, dv
varying float vLayerU;
${HASH}
void main() {
  float u = slot * spacing - offset;
  float lap = floor((u + span * 0.5) / span);
  float x = u - lap * span;
  vec3 k = vec3(slot, lap, seed);
  if (nh(k) < skip) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  x += (nh(k + 1.7) - 0.5) * spacing * 0.9;
  float variant = min(floor(nh(k + 3.1) * variants), variants - 1.0);
  float view = min(floor(nh(k + 5.3) * views), views - 1.0);
  float scale = mix(0.72, 1.15, nh(k + 7.9));
  float flip = nh(k + 9.7) < 0.5 ? -1.0 : 1.0;
  float dz = (nh(k + 11.3) - 0.5) * depth * 0.18;
  vec4 f = frames[int(variant)];
  float w = f.x * 10.0 * scale, h = f.y * 10.0 * scale;
  float base = ${GROUND.toFixed(1)} - drop - nh(k + 13.1) * 25.0;
  vec3 world = vec3(x + position.x * w, base + (position.y - f.z) * h, wall + side * (depth + dz));
  float n = variant * views + view;
  float col = mod(n, cols), row = floor(n / cols);
  vCell = vec4(col / cols, 1.0 - (row + 1.0) / rows, 1.0 / cols, 1.0 / rows);
  vUv = vec2(flip > 0.0 ? position.x + 0.5 : 0.5 - position.x, position.y);
  vLayerU = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const TREE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D atlas;
uniform float blur, light, fog;
uniform vec3 fogColor;
varying vec2 vUv;
varying vec4 vCell;
varying float vLayerU;
#define TAPS 12
void main() {
  vec4 c = vec4(0.0);
  float du = blur / max(vLayerU, 1.0); // card-space shutter travel
  for (int i = 0; i < TAPS; i++) {
    float t = float(i) / float(TAPS - 1) - 0.5;
    vec2 uv = vec2(clamp(vUv.x + t * du, 0.0, 1.0), vUv.y);
    c += texture2D(atlas, vCell.xy + uv * vCell.zw);
  }
  c /= float(TAPS);
  if (c.a < 0.06) discard;
  vec3 col = c.rgb / max(c.a, 1e-3) * light;
  // Coverage follows the blurred alpha (alphaToCoverage), so streaked edges
  // stay soft instead of being cut off at a hard threshold.
  gl_FragColor = vec4(mix(col, fogColor, fog), c.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */ `
precision highp float;
uniform vec3 horizon, zenith;
varying vec3 vDir;
${HASH}
void main() {
  vec3 d = normalize(vDir);
  vec3 c = mix(horizon, zenith, pow(clamp(d.y, 0.0, 1.0), 0.45));
  // sparse, faint stars
  vec3 g = floor(d * 380.0);
  float s = step(0.9965, nh(g)) * smoothstep(0.05, 0.25, d.y);
  c += vec3(0.6, 0.65, 0.8) * s * nh(g + 4.2) * 0.35;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export async function createNightForest(scene, room, base, eye) {
  const back = room?.back_wall_z ?? -11;
  const front = room?.front_wall_z ?? 28;
  const WALL = 6; // wall + window reveal thickness in units
  const [atlas, meta] = await Promise.all([
    new THREE.TextureLoader().loadAsync(base + "railcar-trees-night.webp").then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    }),
    fetch(base + "railcar-trees-night.json").then((r) => r.json()),
  ]);
  const variants = meta.trees.length;
  const frames = Array.from({ length: 8 }, (_, i) => {
    const t = meta.trees[Math.min(i, variants - 1)];
    return new THREE.Vector4(t.frameW, t.frameH, t.baseV, t.heightM);
  });
  const fogColor = new THREE.Color(0.006, 0.008, 0.012);
  const group = new THREE.Group();
  group.name = "night forest (live)";
  const card = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const offsets = [];
  const disposables = [card, atlas];
  for (const [wallZ, side, sideSeed] of [
    [back - WALL, -1, 11],
    [front + WALL, 1, 47],
  ]) {
    LAYERS.forEach((L, li) => {
      // Wide enough for the widest view out of any window at the +-45 deg limits.
      const reach = Math.abs(wallZ + side * L.d - eye.z);
      const span = 2 * reach * 4 + 400;
      const slots = Math.ceil(span / L.spacing);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = card.index;
      geo.setAttribute("position", card.attributes.position);
      geo.setAttribute("slot", new THREE.InstancedBufferAttribute(Float32Array.from({ length: slots }, (_, i) => i), 1));
      geo.instanceCount = slots;
      disposables.push(geo);
      const u = {
        atlas: { value: atlas },
        offset: { value: 0 },
        span: { value: slots * L.spacing },
        spacing: { value: L.spacing },
        skip: { value: L.skip },
        seed: { value: sideSeed * 13 + li * 7 },
        side: { value: side },
        wall: { value: wallZ },
        depth: { value: L.d },
        drop: { value: L.drop },
        views: { value: meta.views },
        variants: { value: variants },
        cols: { value: meta.cols },
        rows: { value: meta.rows },
        frames: { value: frames },
        blur: { value: (SPEED / 30) * SHUTTER },
        light: { value: L.light },
        fog: { value: L.fog },
        fogColor: { value: fogColor },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: TREE_VERT,
        fragmentShader: TREE_FRAG,
        side: THREE.DoubleSide,
        alphaToCoverage: true,
      });
      disposables.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      // The scenery runs backwards along the car; opposite on the two sides.
      offsets.push({ u, dir: side });
    });
  }
  // Dark valley floor that fades into the night-sky horizon with distance, so
  // a gap between trees never shows a hard ground edge.
  // Dark, near-neutral horizon: behind the trees it should read as deep forest
  // and night haze, not blue sky.
  const horizonColor = new THREE.Color(0.005, 0.007, 0.01);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { near: { value: new THREE.Color(0.004, 0.005, 0.006) }, far: { value: horizonColor } },
      vertexShader: "varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
      fragmentShader: `uniform vec3 near, far; varying vec3 vW;
        void main(){ float d=length(vW.xz-cameraPosition.xz); vec3 c=mix(near, far, smoothstep(300.0, 2400.0, d));
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }),
  );
  ground.position.y = GROUND - 260;
  group.add(ground);
  disposables.push(ground.geometry, ground.material);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: {
        horizon: { value: horizonColor },
        zenith: { value: new THREE.Color(0.011, 0.015, 0.03) },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  group.add(sky);
  disposables.push(sky.geometry, sky.material);
  scene.add(group);
  return {
    needsAnimation: () => true,
    animate(t, motion) {
      if (!motion) return;
      for (const o of offsets) o.u.offset.value = t * SPEED * o.dir;
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}

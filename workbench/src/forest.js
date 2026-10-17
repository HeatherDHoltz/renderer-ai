import * as THREE from "../vendor/three.module.js";

// The dusk forest outside both rows of windows.
//
// Backdrop: the same Poly Haven "sunset_forest" HDRI (CC0) the Cycles renders
// see through the glass, looked up by view direction exactly as Blender's
// world does (Environment Texture, Mapping rotation Z 200°, strength 0.55).
// The train moves along the car's x axis, so on top of the distant photo two
// layers of out-of-focus trunks and boughs stream past at different speeds;
// the nearest ones catch the warm light spilling from the car's own windows.
const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D sky;
uniform float rgbm;
uniform float time;
uniform float side;
uniform float floorY;
uniform float strength;
uniform float yaw;
varying vec3 vWorld;
#define PI 3.14159265
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
vec3 backdrop(vec3 d, float lod) {
  // app -> Blender, then the world Mapping node's Z rotation.
  vec3 b = vec3(d.x, -d.z, d.y);
  float c = cos(yaw), s = sin(yaw);
  b = vec3(c * b.x - s * b.y, s * b.x + c * b.y, b.z);
  vec2 uv = vec2(0.5 - atan(b.y, b.x) / (2.0 * PI), 0.5 + asin(clamp(b.z, -1.0, 1.0)) / PI);
  vec4 t = textureLod(sky, uv, lod);
  // The panorama's sun is far brighter than anything Cycles shows through the
  // glazing here; clamp it so it does not bloom into a streak.
  return min(t.rgb * t.a * rgbm, vec3(3.0));
}
// A row of trunks with boughs, blurred by distance (out of focus) and motion.
// x: position along the track (already scrolled), y: height above rail, cell: spacing.
float trunks(float x, float y, float cell, float blur, float seed, out float lit) {
  float u = x / cell;
  float c = floor(u);
  float f = fract(u) - 0.5;
  float a = 0.0;
  lit = 0.0;
  for (int k = -1; k <= 1; k++) {
    float id = c + float(k);
    if (h1(id + seed) < 0.35) continue;
    float off = (h1(id * 1.7 + seed) - 0.5) * 0.6;
    float fx = (f - float(k) - off) * cell;
    float w = mix(0.35, 1.1, h1(id * 2.3 + seed));
    float trunk = 1.0 - smoothstep(w - blur, w + blur, abs(fx + 0.15 * sin(y * 0.11 + id)));
    // low boughs: sagging horizontal fans from the upper trunk
    float bough = 0.0;
    for (int j = 0; j < 4; j++) {
      float by = 14.0 + float(j) * 6.0 + h1(id * 3.1 + float(j) + seed) * 4.0;
      float len = mix(3.0, 8.0, h1(id + float(j) * 7.7 + seed));
      float dy = y - by + 0.04 * fx * fx;
      float reach = 1.0 - smoothstep(len - blur * 2.0, len + blur * 2.0, abs(fx));
      float thick = 1.0 - smoothstep(0.6 - blur, 0.6 + blur + 0.8 * abs(fx) / len, abs(dy));
      float needles = 0.65 + 0.35 * n1(fx * 1.7 + y * 2.3 + id * 9.0);
      bough = max(bough, reach * thick * needles * step(0.3, h1(id * 5.3 + float(j))));
    }
    float m = max(trunk, bough * 0.92);
    if (m > a) {
      a = m;
      lit = trunk;
    }
  }
  return a;
}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float t = time;
  float x = vWorld.x * side;
  float y = vWorld.y - floorY;
  // Distant photo, very slowly drifting (it is far away); slightly soft.
  vec3 col = backdrop(d, 0.6) * strength;
  // Haze between the backdrop and the near trees.
  vec3 haze = vec3(0.10, 0.075, 0.06) * strength;
  // Middle row: ~6 m out, 16 m/s (soft).
  float litM;
  float mid = trunks(x + t * 38.0, y + 4.0, 26.0, 1.6, 11.0, litM);
  col = mix(col, mix(col, haze, 0.5) * 0.35, mid * 0.85);
  // Near row: just beside the track, fast and well out of focus.
  float litN;
  float nearT = trunks(x + t * 110.0, y + 2.0, 42.0, 3.2, 37.0, litN);
  vec3 bark = vec3(0.012, 0.010, 0.009);
  // warm spill from the lit windows of the car, strongest at window height
  // (a faint warm edge only: a lit trunk frozen in a still reads as a smudge)
  float spill = exp(-pow((y - 12.0) / 9.0, 2.0)) * litN * (1.0 - nearT);
  bark += vec3(0.05, 0.026, 0.011) * spill * strength;
  col = mix(col, bark, nearT * 0.94);
  // ground cutting and ballast below the sills
  col = mix(col, vec3(0.012, 0.012, 0.010), smoothstep(6.0, -2.0, y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createForest(scene, room, sky, rgbm) {
  const floorY = room?.floor ?? -9;
  const back = room?.back_wall_z ?? -11;
  const front = room?.front_wall_z ?? 28;
  const uniforms = { time: { value: 0 } };
  const meshes = [];
  for (const [z, side, rot] of [
    [back - 9, 1, 0],
    [front + 9, -1, Math.PI],
  ]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: uniforms.time,
        side: { value: side },
        floorY: { value: floorY },
        sky: { value: sky },
        rgbm: { value: rgbm },
        strength: { value: 0.55 },
        yaw: { value: THREE.MathUtils.degToRad(200) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: false,
      depthWrite: true,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(130, 70), mat);
    plane.position.set(0, floorY + 20, z);
    plane.rotation.y = rot;
    plane.matrixAutoUpdate = false;
    plane.updateMatrix();
    scene.add(plane);
    meshes.push(plane);
  }
  const frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4(),
    box = new THREE.Box3();
  return {
    needsAnimation(camera) {
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      return meshes.some((m) => frustum.intersectsBox(box.setFromObject(m)));
    },
    animate(t, motion) {
      if (motion) uniforms.time.value = t;
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        m.material.dispose();
        scene.remove(m);
      }
    },
  };
}

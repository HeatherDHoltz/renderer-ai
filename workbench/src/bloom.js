import * as THREE from "../vendor/three.module.js";

// Soft glow around the lamps, sconce bulbs, fire and the brightest glints
// (dual-filter bloom: one thresholded half-resolution prefilter, then a
// down/up chain). It reads the same composite the post pass shows (room +
// cached jewellery layer), works on scene-linear light before the AgX view,
// and costs a handful of small full-screen passes.
const VERT = "varying vec2 vUV;void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}";

const PREFILTER = /* glsl */ `
uniform sampler2D image, depthImage, jewelry, jewelryDepth;
uniform vec2 texel;
uniform float threshold, knee;
varying vec2 vUV;
vec3 scene(vec2 uv) {
  vec4 gem = texture2D(jewelry, uv);
  float visible = step(texture2D(jewelryDepth, uv).r, texture2D(depthImage, uv).r + .000003);
  return texture2D(image, uv).rgb * (1. - gem.a * visible) + gem.rgb * visible;
}
void main() {
  // 4-tap box over the 2x2 source footprint keeps fireflies from strobing.
  vec3 c = (scene(vUV + texel * vec2(-.5, -.5)) + scene(vUV + texel * vec2(.5, -.5)) +
            scene(vUV + texel * vec2(-.5, .5)) + scene(vUV + texel * vec2(.5, .5))) * .25;
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - threshold + knee, 0., 2. * knee);
  soft = soft * soft / (4. * knee + 1e-4);
  float w = max(soft, b - threshold) / max(b, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(64.)), 1.);
}`;

const DOWN = /* glsl */ `
uniform sampler2D source; uniform vec2 texel; varying vec2 vUV;
void main() {
  vec3 c = texture2D(source, vUV).rgb * 4.;
  c += texture2D(source, vUV + texel * vec2(-1., -1.)).rgb;
  c += texture2D(source, vUV + texel * vec2(1., -1.)).rgb;
  c += texture2D(source, vUV + texel * vec2(-1., 1.)).rgb;
  c += texture2D(source, vUV + texel * vec2(1., 1.)).rgb;
  gl_FragColor = vec4(c / 8., 1.);
}`;

const UP = /* glsl */ `
uniform sampler2D source, base; uniform vec2 texel; uniform float radius; varying vec2 vUV;
void main() {
  vec2 o = texel * radius;
  vec3 c = texture2D(source, vUV + vec2(-2. * o.x, 0.)).rgb;
  c += texture2D(source, vUV + vec2(-o.x, o.y)).rgb * 2.;
  c += texture2D(source, vUV + vec2(0., 2. * o.y)).rgb;
  c += texture2D(source, vUV + vec2(o.x, o.y)).rgb * 2.;
  c += texture2D(source, vUV + vec2(2. * o.x, 0.)).rgb;
  c += texture2D(source, vUV + vec2(o.x, -o.y)).rgb * 2.;
  c += texture2D(source, vUV + vec2(0., -2. * o.y)).rgb;
  c += texture2D(source, vUV + vec2(-o.x, -o.y)).rgb * 2.;
  gl_FragColor = vec4(c / 12. + texture2D(base, vUV).rgb, 1.);
}`;

export function createBloom(renderer, inputs, { levels = 6, threshold = 1.2, knee = 0.6 } = {}) {
  const make = () =>
    new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  const down = Array.from({ length: levels }, make);
  const up = Array.from({ length: levels - 1 }, make);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  camera.position.z = 1;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const scene = new THREE.Scene();
  scene.add(quad);
  const material = (fragmentShader, uniforms) =>
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const prefilter = material(PREFILTER, {
    ...inputs,
    texel: { value: new THREE.Vector2() },
    threshold: { value: threshold },
    knee: { value: knee },
  });
  const downMat = material(DOWN, { source: { value: null }, texel: { value: new THREE.Vector2() } });
  const upMat = material(UP, {
    source: { value: null },
    base: { value: null },
    texel: { value: new THREE.Vector2() },
    radius: { value: 1 },
  });
  function pass(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }
  return {
    texture: up[0].texture,
    setSize(w, h) {
      let x = Math.max(1, Math.round(w / 2)),
        y = Math.max(1, Math.round(h / 2));
      for (let i = 0; i < levels; i++) {
        down[i].setSize(x, y);
        if (i < levels - 1) up[i].setSize(x, y);
        x = Math.max(1, Math.round(x / 2));
        y = Math.max(1, Math.round(y / 2));
      }
      prefilter.uniforms.texel.value.set(1 / w, 1 / h);
    },
    render() {
      pass(prefilter, down[0]);
      for (let i = 1; i < levels; i++) {
        downMat.uniforms.source.value = down[i - 1].texture;
        downMat.uniforms.texel.value.set(1 / down[i - 1].width, 1 / down[i - 1].height);
        pass(downMat, down[i]);
      }
      // up[i] = blur(level i+1 result) + down[i]
      for (let i = levels - 2; i >= 0; i--) {
        const src = i === levels - 2 ? down[levels - 1] : up[i + 1];
        upMat.uniforms.source.value = src.texture;
        upMat.uniforms.base.value = down[i].texture;
        upMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
        pass(upMat, up[i]);
      }
    },
    dispose() {
      for (const t of [...down, ...up]) t.dispose();
      for (const m of [prefilter, downMat, upMat]) m.dispose();
      quad.geometry.dispose();
    },
  };
}

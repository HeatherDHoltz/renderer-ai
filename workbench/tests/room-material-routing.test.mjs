import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";
import { railcarMaterial } from "../src/railcar-materials.js";

function context(live) {
  return {
    live, base: "", loader: { load: () => new THREE.Texture() }, cache: new Map(),
    aniso: 1, rgbm: 16, light: new THREE.Texture(), emit: new THREE.Texture(),
    lightIntensity: Math.PI, envMap: null, metalEnv: 1, roomEnv: 0.12,
    specular: 0.3, liveLight: 0.42,
  };
}
function compile(material) {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader);
  return shader;
}
test("static room receives its irradiance once and suppresses live diffuse", () => {
  const m = railcarMaterial("static", { kind: "plain", color: [0.2, 0.1, 0.05] }, context(false));
  assert.ok(m.lightMap && m.emissiveMap);
  assert.equal(m.lightMapIntensity, Math.PI);
  const s = compile(m);
  assert.match(s.fragmentShader, /reflectedLight.directDiffuse = vec3\(0.0\)/);
  assert.match(s.fragmentShader, /ljL.rgb \* ljL.a \* ljLightRgbm/);
  assert.match(s.fragmentShader, /irradiance = vec3\(0.0\)/);
  assert.match(s.fragmentShader, /iblIrradiance = vec3\(0.0\)/);
  m.dispose();
});

test("room contrast preserves bright pools and decodes each group's HDR range", () => {
  const ctx = { ...context(false), lightRange: 128, shadowFloor: 0.58 };
  const m = railcarMaterial("wall", { kind: "plain" }, ctx);
  const s = compile(m);
  assert.equal(s.uniforms.ljLightRgbm.value, 128);
  assert.equal(s.uniforms.ljRgbm.value, 16);
  assert.match(s.fragmentShader, /mix\(0.580, 1.0/);
  assert.match(s.fragmentShader, /smoothstep\(.035, .45, ljIlluminance\)/);
  m.dispose();
});

test("Cycles cloth response keeps the source photograph and is not relit", () => {
  const response = new THREE.Texture();
  const ctx = { ...context(false), responses: new Map([["cloth.f16.gz", response]]) };
  const m = railcarMaterial("cloth", { kind: "plain", bakedResponse: "cloth.f16.gz" }, ctx);
  const s = compile(m);
  assert.equal(s.uniforms.ljClothResponse.value, response);
  assert.match(s.fragmentShader, /outgoingLight = diffuseColor.rgb \* ljResponse.rgb/);
  m.dispose();
});
test("live case wood retains authored box maps and has no static lightmap", () => {
  const m = railcarMaterial("live wood", {
    kind: "box", space: "world", maps: { color: "wood.jpg" }, scale: 0.24,
    tint: [0.31, 0.22, 0.18], coat: 0.4,
  }, context(true));
  assert.equal(m.lightMap, null);
  assert.equal(m.emissiveMap, null);
  assert.equal(m.emissive.getHex(), 0);
  const s = compile(m);
  assert.deepEqual(s.uniforms.ljTint.value.toArray(), [0.31, 0.22, 0.18]);
  assert.equal(s.uniforms.ljScale.value, 0.24);
  assert.match(s.fragmentShader, /reflectedLight.directDiffuse \*= 0.420/);
  assert.match(s.fragmentShader, /#include <lights_fragment_maps>/);
  assert.notEqual(m.customProgramCacheKey(), railcarMaterial("static", {kind:"plain"}, context(false)).customProgramCacheKey());
  m.dispose();
});

test('diffuse-only response preserves live specular instead of frozen highlights', () => {
  const response=new THREE.Texture();
  const ctx={...context(false),responses:new Map([['diffuse.f16.gz',response]])};
  const m=railcarMaterial('varnish',{kind:'plain',coat:.25,bakedResponse:'diffuse.f16.gz',bakedResponseMode:'diffuse'},ctx);
  const s=compile(m);
  assert.equal(s.uniforms.ljClothResponse.value,response);
  assert.match(s.fragmentShader,/vec3 ljIllumination = texture2D\(ljClothResponse, vLightMapUv\).rgb/);
  assert.doesNotMatch(s.fragmentShader,/outgoingLight = diffuseColor.rgb \* ljResponse.rgb/);
  assert.match(s.fragmentShader,/reflectedLight.directDiffuse = vec3\(0.0\)/);
  assert.match(s.fragmentShader,/irradiance = vec3\(0.0\)/);
  assert.match(s.fragmentShader,/clearcoatSpecularDirect \*= 0.000/);
  const combined=railcarMaterial('old response',{kind:'plain',bakedResponse:'diffuse.f16.gz'},ctx);
  assert.notEqual(m.customProgramCacheKey(),combined.customProgramCacheKey());
  m.dispose();combined.dispose();
});

test('probe strength follows sampled metalness rather than its texture multiplier', () => {
  const ctx={...context(false),probeDielectric:.12};
  const m=railcarMaterial('mapped leather',{kind:'uvbake',color:'photo.jpg',orm:'orm.jpg'},ctx);
  const s=compile(m);
  assert.equal(m.metalness,1);
  assert.equal(s.uniforms.ljProbeDielectric.value,.12);
  assert.match(s.fragmentShader,/mix\(ljProbeDielectric, 1.0, metalnessFactor\)/);
  assert.doesNotMatch(s.fragmentShader,/material.metalness/);
  m.dispose();
});

test('neutral irradiance stays separate from UV material sheen and coat settings', () => {
  const field=new THREE.Texture();
  const ctx={...context(false),responses:new Map([['light.f16.gz',field]])};
  const m=railcarMaterial('mapped carpet',{kind:'uvbake',color:'photo.jpg',orm:'orm.jpg',
    sheen:.6,sheenTint:[1,1,1],sheenRough:.5,coat:.2,coatRough:.4,
    bakedResponse:'light.f16.gz',bakedResponseMode:'irradiance'},ctx);
  const s=compile(m);
  assert.equal(m.sheenColor.getHex(),0xffffff);
  assert.equal(m.clearcoatRoughness,.4);
  assert.equal(m.userData.bakedResponseMode,'irradiance');
  assert.equal(m.userData.roomDirectSpecular,0);
  assert.match(s.fragmentShader,/sheenSpecularIndirect \+= getIBLIrradiance\(geometryNormal\)/);
  assert.match(s.fragmentShader,/vec3 ljIllumination = texture2D\(ljClothResponse, vLightMapUv\).rgb/);
  assert.doesNotMatch(s.fragmentShader,/outgoingLight = diffuseColor.rgb \* ljResponse.rgb/);
  assert.match(s.fragmentShader,/iblIrradiance = vec3\(0.0\)/);
  m.dispose();
});

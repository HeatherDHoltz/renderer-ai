import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {rayHitsBox,patchProbeOcclusion} from '../src/probe-occlusion.js';

const lo=[-1,-1,-1],hi=[1,1,1];
test('local probe slabs handle parallel rays, misses, self surfaces and tangency',()=>{
  assert.equal(rayHitsBox([0,-2,0],[0,1,0],lo,hi),true);
  assert.equal(rayHitsBox([0,-2,0],[0,1,0],lo,hi,.5),false);
  assert.equal(rayHitsBox([2,-2,0],[0,1,0],lo,hi),false);
  assert.equal(rayHitsBox([0,2,0],[0,1,0],lo,hi),false);
  assert.equal(rayHitsBox([0,0,0],[0,1,0],lo,hi),false);
  assert.equal(rayHitsBox([2,0,0],[-1,1,0],lo,hi),false);
});
test('oriented structural bounds transform ray directions without normalization',()=>{
  const world=new THREE.Matrix4().compose(new THREE.Vector3(4,0,0),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.4),new THREE.Vector3(2,1,.5));
  const inv=world.clone().invert();
  const p=new THREE.Vector4(0,0,0,1).applyMatrix4(inv);
  const d=new THREE.Vector4(1,0,0,0).applyMatrix4(inv);
  assert.equal(rayHitsBox([p.x,p.y,p.z],[d.x,d.y,d.z],lo,hi),true);
  assert.ok(Math.abs(Math.hypot(d.x,d.y,d.z)-1)>.01);
});
test('probe visibility attenuates distant specular radiance without changing baked diffuse',()=>{
  const material=new THREE.MeshStandardMaterial();
  patchProbeOcclusion([material],[{name:'solid',inverse:new THREE.Matrix4().toArray(),min:lo,max:hi}]);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.localProbeInverse.value.length,1);
  assert.equal(shader.uniforms.localProbeCount.value,1);
  assert.match(shader.fragmentShader,/for\(int j=0;j<localProbeCount;j\+\+\)/);
  assert.match(shader.fragmentShader,/rectAreaLight = rectAreaLights\[ i \];\s*\{\s*float localAreaVisible/);
  assert.match(shader.fragmentShader,/radiance\*=localProbeVisibility/);
  assert.match(shader.fragmentShader,/directLight.color\*=localRayVisibility/);
  assert.match(shader.fragmentShader,/rectAreaLight.color\*=localAreaVisible\/5/);
  assert.ok(shader.fragmentShader.indexOf('radiance*=localProbeVisibility')<shader.fragmentShader.indexOf('#include <lights_fragment_end>'));
  assert.doesNotMatch(shader.fragmentShader,/irradiance\*=localProbeVisibility/);
  assert.doesNotMatch(shader.fragmentShader,/outgoingLight\*=localProbeVisibility/);
  material.dispose();
});

test('mirror ownership and frozen combined appearance remain untouched',()=>{
  for(const [name,mode] of [['rc mirror','live'],['static photograph','combined']]){
    const m=new THREE.MeshStandardMaterial({name});m.userData.bakedResponseMode=mode;
    const before=m.onBeforeCompile;
    patchProbeOcclusion([m],[{name:'solid',inverse:new THREE.Matrix4().toArray(),min:lo,max:hi}]);
    assert.equal(m.onBeforeCompile,before);m.dispose();
  }
});

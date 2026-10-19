import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createAreaCaseShadows } from '../src/area-case-shadows.js';

test('case depth atlas caches geometry visibility and restores renderer state', () => {
  const target={}, color=new THREE.Color(.2,.3,.4);
  let current=target,alpha=.4,draws=0,clears=0;
  const renderer={autoClear:true,shadowMap:{enabled:true},
    getRenderTarget:()=>current,setRenderTarget:t=>{current=t},
    getClearColor:out=>out.copy(color),getClearAlpha:()=>alpha,
    setClearColor:(c,a)=>{color.set(c);alpha=a},clear:()=>clears++,
    render:()=>{assert.equal(renderer.shadowMap.enabled,false);draws++},
  };
  const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
  const diffuseMaterial=new THREE.MeshStandardMaterial();
  diffuseMaterial.userData.bakedResponseMode='diffuse';
  const shadows=createAreaCaseShadows(renderer,{meshes:[new THREE.Mesh(geometry)]},[material,diffuseMaterial]);
  assert.equal(shadows.positions.length,18);
  shadows.update();assert.equal(draws,18);assert.equal(clears,18);
  assert.equal(shadows.renders,1);assert.equal(current,target);assert.equal(alpha,.4);
  assert.equal(renderer.autoClear,true);assert.equal(renderer.shadowMap.enabled,true);
  assert.ok(color.equals(new THREE.Color(.2,.3,.4)));
  shadows.update();assert.equal(draws,18);
  shadows.update(true);assert.equal(draws,36);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.indexOf('#include <packing>')<shader.fragmentShader.indexOf('float caseDepthCompare'));
  assert.ok(shader.fragmentShader.includes('caseDepthCompare(clamp(p,lo,hi),d)'));
  assert.equal(shader.uniforms.caseShadowAtlas.value,shadows.atlas.texture);
  const diffuseShader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  diffuseMaterial.onBeforeCompile(diffuseShader);
  assert.ok(diffuseShader.fragmentShader.includes('irradiance*=mix(1.,.12+.88*visibility,caseReceiver)'));
  assert.ok(diffuseShader.fragmentShader.indexOf('float caseReceiver=')<diffuseShader.fragmentShader.indexOf('#include <lights_fragment_end>'));
  assert.ok(!diffuseShader.fragmentShader.includes('outgoingLight*=mix'));
  diffuseMaterial.dispose();
  const render=renderer.render;
  renderer.render=()=>{throw new Error('depth pass failed')};
  assert.throws(()=>shadows.update(true),/depth pass failed/);
  assert.equal(current,target);assert.equal(alpha,.4);
  assert.equal(renderer.autoClear,true);assert.equal(renderer.shadowMap.enabled,true);
  renderer.render=render;shadows.update();
  assert.equal(shadows.renders,3);
  shadows.dispose();geometry.dispose();material.dispose();
});

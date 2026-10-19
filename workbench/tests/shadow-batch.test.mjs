import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { batchCaseShadows } from '../src/shadow-batch.js';

function setup() {
  const scene = new THREE.Scene(), root = new THREE.Group();scene.add(root);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,2,3), new THREE.MeshStandardMaterial());
  mesh.castShadow = true;mesh.position.set(2,.4,-1);mesh.rotation.y=.4;root.scale.setScalar(.78);root.add(mesh);
  const camera = new THREE.PerspectiveCamera();camera.layers.set(0);
  let captured;
  const renderer = { shadowMap: { type:THREE.PCFShadowMap, render(_lights,_scene,cam) {
    captured = { mask:cam.layers.mask, batches:scene.children.filter(o=>o.isMesh).map(o=>o.visible) };
  } } };
  return { scene,root,mesh,camera,renderer,get captured(){return captured} };
}
test('shadow batching preserves every vertex, triangle and world normal', () => {
  const f=setup(), old=f.renderer.shadowMap.render;
  const batch=batchCaseShadows(f.renderer,f.scene,{one:{root:f.root}});
  const proxy=f.scene.children.find(o=>o.isMesh);
  assert.equal(batch.sourceCount,1);assert.equal(batch.count,1);assert.equal(f.mesh.castShadow,false);
  assert.equal(proxy.geometry.index.count,f.mesh.geometry.index.count);
  for(let i=0;i<f.mesh.geometry.attributes.position.count;i++) {
    const expected=new THREE.Vector3().fromBufferAttribute(f.mesh.geometry.attributes.position,i).applyMatrix4(f.mesh.matrixWorld);
    const actual=new THREE.Vector3().fromBufferAttribute(proxy.geometry.attributes.position,i);
    assert.ok(expected.distanceTo(actual)<1e-6);
    const normalExpected=new THREE.Vector3().fromBufferAttribute(f.mesh.geometry.attributes.normal,i)
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(f.mesh.matrixWorld));
    const normalActual=new THREE.Vector3().fromBufferAttribute(proxy.geometry.attributes.normal,i);
    assert.ok(normalExpected.distanceTo(normalActual)<1e-6);
  }
  assert.equal(proxy.material.shadowSide,THREE.BackSide);
  assert.equal(batch.update(),false);
  f.root.position.x=3;assert.equal(batch.update(),true);
  const expected=new THREE.Vector3().fromBufferAttribute(f.mesh.geometry.attributes.position,0).applyMatrix4(f.mesh.matrixWorld);
  assert.ok(expected.distanceTo(new THREE.Vector3().fromBufferAttribute(proxy.geometry.attributes.position,0))<1e-6);
  f.renderer.shadowMap.render([],f.scene,f.camera);
  assert.equal(f.captured.mask,17);assert.equal(f.camera.layers.mask,1);
  assert.deepEqual(f.captured.batches,[true]);
  batch.dispose();assert.equal(f.mesh.castShadow,true);assert.equal(f.renderer.shadowMap.render,old);
});
test('batches preserve source render-layer selection and ignore hidden casters', () => {
  const f=setup();f.mesh.layers.set(1);
  const batch=batchCaseShadows(f.renderer,f.scene,{one:{root:f.root}});
  f.renderer.shadowMap.render([],f.scene,f.camera);assert.deepEqual(f.captured.batches,[false]);
  f.camera.layers.enable(1);f.renderer.shadowMap.render([],f.scene,f.camera);assert.deepEqual(f.captured.batches,[true]);
  f.root.visible=false;batch.update();
  const p=f.scene.children.find(o=>o.isMesh).geometry.attributes.position;
  assert.ok(Array.from(p.array).every(v=>v===0));batch.dispose();
});

test('disabled batching provides exact geometry without replacing native shadows', () => {
  const f=setup(), previous=f.renderer.shadowMap.render;
  const batch=batchCaseShadows(f.renderer,f.scene,{one:{root:f.root}},{enabled:false});
  assert.equal(f.mesh.castShadow,true);
  assert.equal(f.renderer.shadowMap.render,previous);
  assert.equal(batch.meshes.length,1);
  assert.equal(batch.meshes[0].castShadow,false);
  batch.dispose();
});

test('spatial batches keep separate conservative bounds for each posed case', () => {
  const f=setup(), other=f.root.clone();other.position.set(-12,0,0);f.scene.add(other);
  const batch=batchCaseShadows(f.renderer,f.scene,{one:{root:f.root},two:{root:other}});
  assert.equal(batch.count,2);
  const check=()=>{for(const proxy of batch.meshes){
    assert.equal(proxy.frustumCulled,true);
    const p=proxy.geometry.attributes.position,sphere=proxy.geometry.boundingSphere;
    for(let i=0;i<p.count;i++)assert.ok(new THREE.Vector3().fromBufferAttribute(p,i).distanceTo(sphere.center)<=sphere.radius+1e-5);
  }};
  check();other.rotation.z=.8;other.position.y=4;batch.update();check();
  assert.equal(batch.meshes.reduce((n,m)=>n+m.geometry.index.count,0),f.mesh.geometry.index.count*2);
  batch.dispose();
  const legacy=batchCaseShadows(f.renderer,f.scene,{one:{root:f.root},two:{root:other}},{spatial:false});
  assert.equal(legacy.count,1);assert.equal(legacy.meshes[0].frustumCulled,false);legacy.dispose();
});

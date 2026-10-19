import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createJewelryCache } from '../src/jewelry-cache.js';
function setup() {
 const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera();camera.layers.enable(1);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.layers.set(1);scene.add(mesh);
 const calls=[];let target;
 const renderer={capabilities:{maxSamples:4},shadowMap:{render(_l,_s,c){calls.push({shadowMask:c.layers.mask})}},
  setRenderTarget(t){target=t},getClearColor(c){return c.set(0)},getClearAlpha(){return 1},setClearColor(){},
  render(s,c){const mask=c.layers.mask;this.shadowMap.render([],s,c);calls.push({mask,target,material:mesh.material})}};
 const base=new THREE.WebGLRenderTarget(4,4),cache=createJewelryCache(renderer,scene,camera,base);
 return {scene,camera,mesh,calls,renderer,base,cache};
}
test('room cache draws live jewellery with fresh depth while reusing stationary room',()=>{
 const f=setup(),material=f.mesh.material,previous=f.renderer.shadowMap.render;
 f.cache.render(true,{reuseRoom:true,key:'pose1'});
 assert.deepEqual(f.calls.filter(c=>c.mask!==undefined).map(c=>c.mask),[1,2]);
 assert.ok(f.calls.filter(c=>c.shadowMask!==undefined).every(c=>c.shadowMask===3));
 assert.equal(f.mesh.material,material);assert.equal(f.camera.layers.mask,3);assert.equal(f.renderer.shadowMap.render,previous);
 f.cache.render(true,{reuseRoom:true,key:'pose1'});
 assert.deepEqual(f.cache.stats,{roomRenders:1,roomReuses:1});
 assert.equal(f.calls.filter(c=>c.target===f.base).length,1);
 f.cache.render(true,{reuseRoom:true,key:'pose2'});assert.equal(f.cache.stats.roomRenders,2);
 f.cache.resize(8,8);f.cache.render(true,{reuseRoom:true,key:'pose2'});assert.equal(f.cache.stats.roomRenders,3);
 f.cache.render(true);f.cache.render(true);assert.equal(f.cache.stats.roomRenders,5);f.cache.dispose();
});
test('room cache restores materials, layers and shadow hook after rendering fails',()=>{
 const f=setup(),material=f.mesh.material,previous=f.renderer.shadowMap.render;
 f.renderer.render=()=>{throw new Error('diagnostic failure')};
 assert.throws(()=>f.cache.render(true,{reuseRoom:true,key:'pose'}),/diagnostic failure/);
 assert.equal(f.mesh.material,material);assert.equal(f.camera.layers.mask,3);assert.equal(f.renderer.shadowMap.render,previous);f.cache.dispose();
});
test('uncached room also excludes live depth, while retaining all shadow casters',()=>{
 const f=setup();f.cache.render(true);
 assert.deepEqual(f.calls.filter(c=>c.mask!==undefined).map(c=>c.mask),[1,2]);
 assert.ok(f.calls.filter(c=>c.shadowMask!==undefined).every(c=>c.shadowMask===3));
 f.cache.dispose();
});

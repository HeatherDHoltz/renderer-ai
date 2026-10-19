import test from 'node:test';
import assert from 'node:assert/strict';
import { layerIsVisible, layerDepthGLSL } from '../src/layer-depth.js';
const quantize=d=>Math.round(d*16777215)/16777215;
const depth=z=>{const near=.025,far=3200;return quantize(far/(far-near)-far*near/((far-near)*z));};
test('layer comparison rejects geometry behind the pad at high/distant views',()=>{
 let previouslyLeaked=0,distinguishable=0;
 for(const distance of [3,5,8,14,20,26])for(const elevation of [35,55,75]){
  const pad=depth(distance),buried=depth(distance+.0025*Math.sin(elevation*Math.PI/180));
  if(buried<=pad+.000003)previouslyLeaked++;
  if(buried>pad){distinguishable++;assert.equal(layerIsVisible(buried,pad),false);}
  assert.equal(layerIsVisible(depth(distance-.02),pad),true);
 }
 assert.ok(previouslyLeaked>0);assert.ok(distinguishable>12);
 assert.equal(layerIsVisible(.7,.7),true);
 assert.equal(layerIsVisible(.7+1/16777215,.7),false);
 assert.match(layerDepthGLSL,/step\(liveDepth, roomDepth\)/);
});

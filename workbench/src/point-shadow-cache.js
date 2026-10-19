import * as THREE from '../vendor/three.module.js';

// Exact union of the existing packed-distance maps. Static case triangles are
// rasterized once; the moving specimen keeps its original geometry/resolution.
// No averaged visibility, lower-resolution proxy or different PCF is introduced.
export function cachePointShadows(renderer, scene, light, dynamicRoot) {
  const shadowMap = renderer.shadowMap, previous = shadowMap.render;
  const shadow = light.shadow;
  let staticMap = null, dynamicMap = shadow.map, unionMap = null;
  let signature = '', stable = 0, valid = false, composing = false;
  const stats = { staticRenders: 0, dynamicRenders: 0, fallbackRenders: 0, unions: 0 };
  const quadScene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const material = new THREE.ShaderMaterial({
    uniforms: { stationary: {value:null}, moving: {value:null}, size: {value:new THREE.Vector2()} },
    depthTest:false, depthWrite:false, toneMapped:false, blending:THREE.NoBlending,
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`uniform sampler2D stationary,moving;uniform vec2 size;
      #include <packing>
      void main(){vec2 uv=gl_FragCoord.xy/size;vec4 a=texture2D(stationary,uv),b=texture2D(moving,uv);
        gl_FragColor=unpackRGBAToDepth(a)<unpackRGBAToDepth(b)?a:b;}`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), material);quadScene.add(quad);

  function render(lights, currentScene, view) {
    if(composing || currentScene!==scene || !lights.includes(light) ||
      !shadowMap.enabled || (!shadowMap.autoUpdate&&!shadowMap.needsUpdate) ||
      (!shadow.autoUpdate&&!shadow.needsUpdate) || shadowMap.type!==THREE.PCFShadowMap)
      return previous.call(shadowMap,lights,currentScene,view);
    const dynamic = new Set();dynamicRoot.traverse(o=>{if(o.isMesh)dynamic.add(o)});
    const stationary = [], moving = [];
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{if(o.isMesh&&o.castShadow)(dynamic.has(o)?moving:stationary).push(o)});
    // Unsupported deforming or cutout stationary casters use the original pass.
    if(stationary.some(o=>Array.isArray(o.material)||o.isSkinnedMesh||o.isInstancedMesh||
      o.morphTargetInfluences?.length||o.material.alphaTest>0||o.material.displacementMap||
      o.customDepthMaterial||o.customDistanceMaterial)){
      valid=false;signature="";stable=0;
      if(shadow.map===unionMap)shadow.map=dynamicMap;
      previous.call(shadowMap,lights,currentScene,view);dynamicMap=shadow.map;
      stats.fallbackRenders++;return;
    }
    // Proxy attribute versions change as case parts move, even when its own
    // world matrix remains identity. Include inherited visibility and layer mask.
    const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
    const next=JSON.stringify([view.layers.mask,...light.matrixWorld.elements,
      shadow.camera.near,shadow.camera.far,shadow.mapSize.x,shadow.mapSize.y,
      stationary.map(o=>[o.id,visible(o),o.layers.mask,...o.matrixWorld.elements,
        o.geometry.id,o.geometry.attributes.position.version,o.geometry.attributes.normal?.version,o.geometry.index?.version,
        o.material.id,o.material.version,o.material.shadowSide,o.material.side])]);
    if(next!==signature){signature=next;stable=0;valid=false;}else stable++;
    // Moving cases use the ordinary combined render. Build the cache only
    // once their geometry has stopped changing, avoiding extra work on opening.
    if(stable<2){
      if(shadow.map===unionMap)shadow.map=dynamicMap;
      previous.call(shadowMap,lights,currentScene,view);dynamicMap=shadow.map;
      stats.fallbackRenders++;return;
    }
    const originalMap=shadow.map, originalNeeds=shadow.needsUpdate;
    try {
      const columns=shadow.getFrameExtents();
      const width=shadow.mapSize.x*columns.x,height=shadow.mapSize.y*columns.y;
      if(staticMap&&(staticMap.width!==width||staticMap.height!==height)){staticMap.dispose();staticMap=null;valid=false;}
      if(dynamicMap&&(dynamicMap.width!==width||dynamicMap.height!==height)){dynamicMap.dispose();dynamicMap=null;valid=false;}
      if(!valid){
        for(const o of moving)o.castShadow=false;
        shadow.map=staticMap;shadow.needsUpdate=true;shadowMap.needsUpdate=true;
        try{previous.call(shadowMap,[light],scene,view);staticMap=shadow.map;}
        finally{for(const o of moving)o.castShadow=true;}
        valid=true;stats.staticRenders++;
      }
      for(const o of stationary)o.castShadow=false;
      shadow.map=dynamicMap;shadow.needsUpdate=true;shadowMap.needsUpdate=true;
      try{previous.call(shadowMap,[light],scene,view);dynamicMap=shadow.map;}
      finally{for(const o of stationary)o.castShadow=true;}
      stats.dynamicRenders++;
      if(!unionMap)unionMap=new THREE.WebGLRenderTarget(dynamicMap.width,dynamicMap.height,{
        minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false});
      if(unionMap.width!==dynamicMap.width||unionMap.height!==dynamicMap.height)
        unionMap.setSize(dynamicMap.width,dynamicMap.height);
      material.uniforms.stationary.value=staticMap.texture;
      material.uniforms.moving.value=dynamicMap.texture;
      material.uniforms.size.value.set(dynamicMap.width,dynamicMap.height);
      const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel();
      composing=true;
      try{renderer.setRenderTarget(unionMap);renderer.render(quadScene,camera);}
      finally{renderer.setRenderTarget(target,face,mip);composing=false;}
      shadow.map=unionMap;shadow.needsUpdate=false;stats.unions++;
      const others=lights.filter(l=>l!==light);
      if(others.length){shadowMap.needsUpdate=true;previous.call(shadowMap,others,scene,view);}
    } catch(error) {
      valid=false;shadow.map=dynamicMap||originalMap;shadow.needsUpdate=originalNeeds;
      throw error;
    }
  }
  shadowMap.render=render;
  return { stats, invalidate(){valid=false;signature='';}, dispose(){
    if(shadowMap.render===render)shadowMap.render=previous;
    shadow.map=dynamicMap;staticMap?.dispose();unionMap?.dispose();
    quad.geometry.dispose();material.dispose();
  }};
}

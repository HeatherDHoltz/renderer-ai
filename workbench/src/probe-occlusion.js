import * as THREE from '../vendor/three.module.js';

// Visibility of probe and live light rays against reviewed, opaque structural
// cuboids. This removes probe light leaking through the desk; it does not trace
// the local object's reflected colour. Bevels are approximated by their bounds.
export function rayHitsBox(p, d, min, max, distance = Infinity) {
  if (p.every((v,k)=>v>=min[k]&&v<=max[k])) return false; // receiver's own solid
  let near=-Infinity,far=Infinity;
  for(let k=0;k<3;k++) {
    if(Math.abs(d[k])<1e-8) {if(p[k]<min[k]||p[k]>max[k]) return false;continue;}
    const a=(min[k]-p[k])/d[k],b=(max[k]-p[k])/d[k];
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
  }
  return near>0&&near<distance&&far>Math.max(near,.001);
}

export function patchProbeOcclusion(materials, boxes) {
  if(!boxes?.length)return;
  const matrices=boxes.map(b=>new THREE.Matrix4().fromArray(b.inverse));
  const minima=boxes.map(b=>new THREE.Vector3().fromArray(b.min));
  const maxima=boxes.map(b=>new THREE.Vector3().fromArray(b.max));
  for(const b of boxes) {
    if(b.inverse.length!==16||b.min.length!==3||b.max.length!==3||
      ![...b.inverse,...b.min,...b.max].every(Number.isFinite)||b.min.some((v,k)=>v>=b.max[k]))
      throw new Error('Invalid reviewed reflection occluder: '+b.name);
  }
  const rootMin=new THREE.Vector3(Infinity,Infinity,Infinity),rootMax=new THREE.Vector3(-Infinity,-Infinity,-Infinity);
  boxes.forEach((b,i)=>{
    const world=matrices[i].clone().invert();
    for(const x of [b.min[0],b.max[0]])for(const y of [b.min[1],b.max[1]])for(const z of [b.min[2],b.max[2]]){
      const p=new THREE.Vector3(x,y,z).applyMatrix4(world);rootMin.min(p);rootMax.max(p);
    }
  });
  for(const material of materials) {
    if (/mirror/i.test(material.name) || material.userData.bakedResponseMode === 'combined') continue;
    const previous=material.onBeforeCompile;
    material.onBeforeCompile=(shader,...args)=>{
      previous.call(material,shader,...args);
      Object.assign(shader.uniforms,{localProbeInverse:{value:matrices},
        localProbeMin:{value:minima},localProbeMax:{value:maxima},localProbeRootMin:{value:rootMin},localProbeRootMax:{value:rootMax},localProbeCount:{value:boxes.length}});
      shader.vertexShader='varying vec3 localProbeWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nlocalProbeWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 localProbeWorld;
        uniform mat4 localProbeInverse[${boxes.length}];
        uniform vec3 localProbeMin[${boxes.length}],localProbeMax[${boxes.length}];
        uniform vec3 localProbeRootMin,localProbeRootMax;
        uniform int localProbeCount;
        bool localProbeHit(vec3 p,vec3 d,vec3 lo,vec3 hi,float limit){
          if(all(greaterThanEqual(p,lo))&&all(lessThanEqual(p,hi)))return false;
          float nearest=-1.e20,farthest=1.e20;
          for(int axis=0;axis<3;axis++){
            if(abs(d[axis])<1.e-8){if(p[axis]<lo[axis]||p[axis]>hi[axis])return false;}
            else{
              float a=(lo[axis]-p[axis])/d[axis],b=(hi[axis]-p[axis])/d[axis];
              nearest=max(nearest,min(a,b));farthest=min(farthest,max(a,b));
            }
          }
          return nearest>0.&&nearest<limit&&farthest>max(nearest,.001);
        }
        float localRayVisibility(vec3 normalView,vec3 directionView,float limit){
          vec3 ray=inverseTransformDirection(directionView,viewMatrix);
          vec3 origin=localProbeWorld+inverseTransformDirection(normalView,viewMatrix)*.002;
          bool insideRoot=all(greaterThanEqual(origin,localProbeRootMin))&&all(lessThanEqual(origin,localProbeRootMax));
          if(!insideRoot&&!localProbeHit(origin,ray,localProbeRootMin,localProbeRootMax,limit))return 1.;
          for(int j=0;j<localProbeCount;j++){
            vec3 p=(localProbeInverse[j]*vec4(origin,1.)).xyz;
            // Do not normalize: transformed direction preserves world t.
            vec3 d=(localProbeInverse[j]*vec4(ray,0.)).xyz;
            if(localProbeHit(p,d,localProbeMin[j],localProbeMax[j],limit))return 0.;
          }
          return 1.;
        }
        float localProbeVisibility(vec3 normalView,vec3 viewDirection,float rough){
          vec3 ray=normalize(mix(reflect(-viewDirection,normalView),normalView,rough*rough));
          return localRayVisibility(normalView,ray,1.e20);
        }
      `);
      if (material.userData.roomDirectSpecular !== 0) {
      let direct=THREE.ShaderChunk.lights_fragment_begin;
      for(const [fn,arg,range] of [
        ['getPointLightInfo','pointLight','length(pointLight.position-geometryPosition)'],
        ['getSpotLightInfo','spotLight','length(spotLight.position-geometryPosition)'],
        ['getDirectionalLightInfo','directionalLight','1.e20'],
      ]){
        const call=fn==='getDirectionalLightInfo' ? `${fn}( ${arg}, directLight );` : `${fn}( ${arg}, geometryPosition, directLight );`;
        direct=direct.replace(call,call+`\ndirectLight.color*=localRayVisibility(geometryNormal,directLight.direction,${range});`);
      }
      // The existing LTC area-light term uses a small deterministic visibility
      // quadrature. Static diffuse remains baked; this prevents live glints
      // shining through the solid desktop.
      direct=direct.replace('rectAreaLight = rectAreaLights[ i ];',`rectAreaLight = rectAreaLights[ i ];
        {
        float localAreaVisible=0.;
        for(int corner=0;corner<5;corner++){
          vec3 point=rectAreaLight.position;
          if(corner>0)point+=rectAreaLight.halfWidth*(mod(float(corner),2.)*2.-1.)+rectAreaLight.halfHeight*(corner<3?-1.:1.);
          vec3 delta=point-geometryPosition;
          localAreaVisible+=localRayVisibility(geometryNormal,normalize(delta),length(delta));
        }
        rectAreaLight.color*=localAreaVisible/5.;
        }`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',direct);
      }
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
        radiance*=localProbeVisibility(geometryNormal,geometryViewDir,material.roughness);
        #ifdef USE_CLEARCOAT
          clearcoatRadiance*=localProbeVisibility(geometryClearcoatNormal,geometryViewDir,material.clearcoatRoughness);
        #endif
        #include <lights_fragment_end>`);
    };
    const key=material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey=()=>key()+`|local-probe-and-light-solids-v3-${boxes.length}`;
    material.needsUpdate=true;
  }
}

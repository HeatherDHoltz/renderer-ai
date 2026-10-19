import * as THREE from "../vendor/three.module.js";

const AREA_SAMPLES = 16, COUNT = 18, GRID = 5, TILE = 1024;
const bias = new THREE.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
const radicalInverse = (n) => {
  let value=0,scale=.5;
  while(n){value+=(n&1)*scale;n>>=1;scale*=.5;}
  return value;
};

// Real case-geometry visibility from the authored 70×30 cm examination panel
// and the two case spots. The baked desk receives the resulting shadows. The
// atlas changes only when the cases move, not when the visitor pans or zooms.
export function createAreaCaseShadows(renderer, batch, materials) {
  const atlas = new THREE.WebGLRenderTarget(GRID*TILE, GRID*TILE, {
    minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,
    generateMipmaps:false,depthBuffer:true,
  });
  atlas.texture.colorSpace=THREE.NoColorSpace;
  const depth = new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking, side:THREE.DoubleSide });
  depth.toneMapped=false;
  const scene = new THREE.Scene();scene.overrideMaterial=depth;
  for(const source of batch.meshes){
    const mesh=new THREE.Mesh(source.geometry,depth);mesh.matrixAutoUpdate=false;
    mesh.frustumCulled=true;scene.add(mesh);
  }
  const cameras=[], matrices=[], positions=[], directions=[];
  for(let i=0;i<COUNT;i++){
    const area=i<AREA_SAMPLES;
    const camera=new THREE.PerspectiveCamera(area?90:22,1,.05,26);
    let target;
    if(area){
      camera.position.set(((i+.5)/AREA_SAMPLES-.5)*7,9.5,1.6+(radicalInverse(i)+.5/AREA_SAMPLES-.5)*3);
      target=new THREE.Vector3(0,-1.399,.25);
    }else{
      const x=i===16?-2.85:3.05;
      camera.position.set(x*.7,8,5.5);target=new THREE.Vector3(x,-.6,i===16?1.45:1.4);
    }
    camera.lookAt(target);camera.updateMatrixWorld(true);
    cameras.push(camera);positions.push(camera.position.clone());
    directions.push(target.sub(camera.position).normalize());
    matrices.push(new THREE.Matrix4().multiplyMatrices(bias,camera.projectionMatrix).multiply(camera.matrixWorldInverse));
  }
  for(const material of materials){
    const previous=material.onBeforeCompile;
    material.onBeforeCompile=(shader,...args)=>{
      previous.call(material,shader,...args);
      Object.assign(shader.uniforms,{
        caseShadowAtlas:{value:atlas.texture},caseShadowMatrix:{value:matrices},
        caseSourcePosition:{value:positions},caseSourceDirection:{value:directions},
      });
      shader.vertexShader='varying vec3 caseShadowWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\ncaseShadowWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <packing>', `#include <packing>
varying vec3 caseShadowWorld;
        uniform sampler2D caseShadowAtlas;
        uniform mat4 caseShadowMatrix[${COUNT}];
        uniform vec3 caseSourcePosition[${COUNT}],caseSourceDirection[${COUNT}];
        float caseDepthCompare(vec2 uv,float reference){
          return step(reference,unpackRGBAToDepth(texture2D(caseShadowAtlas,uv)));
        }
        float caseVisibility(int index){
          vec4 projected=caseShadowMatrix[index]*vec4(caseShadowWorld,1.);
          vec3 q=projected.xyz/projected.w;
          if(projected.w<=0.||any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))return 1.;
          vec2 pixel=q.xy*${TILE}.-.5,base=floor(pixel),f=fract(pixel);
          vec2 tile=vec2(mod(float(index),${GRID}.),floor(float(index)/${GRID}.));
          vec2 lo=(tile+vec2(.5/float(${TILE})))/float(${GRID});
          vec2 hi=(tile+vec2(1.-.5/float(${TILE})))/float(${GRID});
          vec2 p=( (base+.5)/float(${TILE})+tile)/float(${GRID});
          vec2 stepUV=vec2(1./float(${GRID*TILE}));
          float d=q.z-.000001;
          float a=caseDepthCompare(clamp(p,lo,hi),d),b=caseDepthCompare(clamp(p+vec2(stepUV.x,0.),lo,hi),d);
          float c=caseDepthCompare(clamp(p+vec2(0.,stepUV.y),lo,hi),d),e=caseDepthCompare(clamp(p+stepUV,lo,hi),d);
          return mix(mix(a,b,f.x),mix(c,e,f.x),f.y);
        }\n`);
      const diffuse = ['diffuse','irradiance'].includes(material.userData.bakedResponseMode);
      const marker = diffuse ? '#include <lights_fragment_end>' : '#include <opaque_fragment>';
      const receiverLight = diffuse ? 'irradiance' : 'outgoingLight';
      shader.fragmentShader=shader.fragmentShader.replace(marker,`
        float caseReceiver=step(-1.43,caseShadowWorld.y)*step(caseShadowWorld.y,-.90);
        caseReceiver*=step(.85,inverseTransformDirection(nonPerturbedNormal,viewMatrix).y);
        if(caseReceiver>0.){
          float visiblePower=0.,totalPower=0.;
          for(int j=0;j<${COUNT};j++){
            vec3 delta=caseSourcePosition[j]-caseShadowWorld;
            float r2=max(dot(delta,delta),.001),cosine=max(delta.y*inversesqrt(r2),0.);
            float weight;
            if(j<${AREA_SAMPLES})weight=(700./(3.14159265*${AREA_SAMPLES}.))*cosine*cosine/r2;
            else{
              float cone=dot(-normalize(delta),caseSourceDirection[j]);
              weight=(260./(4.*3.14159265))*cosine/r2*smoothstep(.981627,.997053,cone);
            }
            totalPower+=weight;visiblePower+=weight*caseVisibility(j);
          }
          float visibility=visiblePower/max(totalPower,.000001);
          // Preserve a small indirect-light remainder under direct occlusion.
          ${receiverLight}*=mix(1.,.12+.88*visibility,caseReceiver);
        }
        ${marker}`);
    };
    const previousKey=material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey=()=>`${previousKey()}|authored-case-area-${COUNT}`;
    material.needsUpdate=true;
  }
  let dirty=true,renders=0;
  return {
    atlas,matrices,positions,
    update(changed=false){
      if(!dirty&&!changed)return;
      dirty=true;
      const target=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color());
      const alpha=renderer.getClearAlpha(),auto=renderer.autoClear,shadows=renderer.shadowMap.enabled;
      try{
        renderer.autoClear=false;renderer.shadowMap.enabled=false;renderer.setClearColor(0xffffff,1);
        atlas.scissorTest=true;
        cameras.forEach((camera,i)=>{
          const x=(i%GRID)*TILE,y=Math.floor(i/GRID)*TILE;
          atlas.viewport.set(x,y,TILE,TILE);atlas.scissor.set(x,y,TILE,TILE);
          renderer.setRenderTarget(atlas);renderer.clear(true,true,true);renderer.render(scene,camera);
        });
        dirty=false;renders++;
      }finally{
        renderer.autoClear=auto;renderer.shadowMap.enabled=shadows;
        renderer.setRenderTarget(target);renderer.setClearColor(clear,alpha);
      }
    },
    get renders(){return renders},
    dispose(){atlas.dispose();depth.dispose();},
  };
}

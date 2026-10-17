import * as THREE from "../vendor/three.module.js";
import { facetPlanes, convexOpticsGLSL } from "./gem-optics.js";

export const CAUSTIC_SAMPLES = 32768;
export const SETTLED_CAUSTIC_SAMPLES = 32768;
const SIZE = 1024;
const EXTENT = new THREE.Vector2(12, 10);
const RECEIVER_Y = -1.32;

// Stable, shared RGB samples: changing wavelength bends the same incident ray.
// No frame-random seed or temporal history that would smear a moving stone.
export function photonSamples(count = CAUSTIC_SAMPLES) {
  const samples = new Float32Array(count * 3 * 3);
  for (let i = 0; i < count; i++) {
    let bits = i,
      inverse = 0,
      weight = 0.5;
    while (bits) {
      inverse += (bits & 1) * weight;
      bits >>>= 1;
      weight *= 0.5;
    }
    for (let c = 0; c < 3; c++)
      samples.set([(i + 0.5) / count, inverse, c], (i * 3 + c) * 3);
  }
  return samples;
}

function photonMaterial(planes, textureUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: {
      facets: { value: planes },
      objectWorld: { value: new THREE.Matrix4() },
      inverseObject: { value: new THREE.Matrix4() },
      lightPosition: { value: new THREE.Vector3() },
      center: { value: new THREE.Vector3() },
      targetRadius: { value: 1 },
      sourceRadius: { value: 0.06 },
      intensity: { value: 100 },
      sampleCount: { value: CAUSTIC_SAMPLES },
      ior: { value: 2.417 },
      dispersion: { value: 0.018 },
      absorption: { value: new THREE.Vector3() },
      extent: textureUniforms.extent,
    },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `precision highp float;
      uniform vec4 facets[${planes.length}];
      uniform mat4 objectWorld, inverseObject;
      uniform vec3 lightPosition,center,absorption;
      uniform float targetRadius,sourceRadius,intensity,ior,dispersion,sampleCount;
      uniform vec2 extent;
      varying vec3 flux;
      ${convexOpticsGLSL(planes.length)}
      float random(float seed){return fract(sin(seed*12.9898+78.233)*43758.5453);}
      vec2 disk(float u,float v){float a=6.28318530718*v;return sqrt(u)*vec2(cos(a),sin(a));}
      bool entry(vec3 o,vec3 d,out float nearT,out vec3 normal){
        nearT=-1.e8;float farT=1.e8;normal=vec3(0,1,0);
        for(int i=0;i<${planes.length};i++){
          float den=dot(facets[i].xyz,d),dist=dot(facets[i].xyz,o)+facets[i].w;
          if(abs(den)<1.e-7){if(dist>0.)return false;}
          else{float t=-dist/den;if(den<0.){if(t>nearT){nearT=t;normal=facets[i].xyz;}}else farT=min(farT,t);}
        }
        return nearT>0.&&farT>nearT;
      }
      void main(){
        flux=vec3(0);gl_Position=vec4(3,3,3,1);gl_PointSize=3.;
        vec3 axis=normalize(center-lightPosition);
        vec3 u=normalize(cross(axis,abs(axis.y)>.95?vec3(1,0,0):vec3(0,1,0)));
        vec3 v=cross(axis,u);
        vec2 target=disk(position.x,position.y)*targetRadius;
        vec2 emitter=disk(random(position.x+3.7),random(position.y+2.3))*sourceRadius;
        vec3 worldOrigin=lightPosition+u*emitter.x+v*emitter.y;
        vec3 worldDirection=normalize(center+u*target.x+v*target.y-worldOrigin);
        float distanceToLight=length(center-worldOrigin);
        float beamCos=dot(axis,worldDirection);
        vec3 o=(inverseObject*vec4(worldOrigin,1)).xyz;
        // Unnormalized transformed direction preserves world t for entry.
        vec3 d=(inverseObject*vec4(worldDirection,0)).xyz;
        float t;vec3 n;if(!entry(o,d,t,n))return;
        vec3 hit=o+d*t;d=normalize(d);
        float eta=ior+(position.z-1.)*dispersion;
        float f=fresnel(-dot(d,n),1.,eta);
        float seed=position.x*4713.+position.y*797.;
        bool outside=random(seed)<f;
        d=outside?reflect(d,n):refract(d,n,1./eta);
        o=hit;float throughput=1.;
        if(!outside){
          for(int bounce=0;bounce<12;bounce++){
            float distance=exitFacet(o,d,n);if(distance>1.e5)return;
            throughput*=exp(-dot(absorption,position.z<.5?vec3(1,0,0):position.z<1.5?vec3(0,1,0):vec3(0,0,1))*distance);
            hit=o+d*distance;f=fresnel(dot(d,n),eta,1.);
            if(f<.999999&&random(seed+float(bounce)*17.31+1.2)>=f){
              d=refract(d,-n,eta);o=hit;outside=true;break;
            }
            d=reflect(d,n);o=hit;
          }
        }
        if(!outside)return;
        worldOrigin=(objectWorld*vec4(o,1)).xyz;
        worldDirection=normalize((objectWorld*vec4(d,0)).xyz);
        if(worldDirection.y>=-.0001)return;
        float floorT=(${RECEIVER_Y.toFixed(3)}-worldOrigin.y)/worldDirection.y;
        if(floorT<=0.)return;
        vec3 receiver=worldOrigin+worldDirection*floorT;
        // Projected-disk solid angle and cosine correction, then flux / sample.
        float power=intensity*3.14159265*targetRadius*targetRadius*pow(max(beamCos,0.),3.)/
          (distanceToLight*distanceToLight*sampleCount);
        float pixelArea=extent.x*extent.y/float(${SIZE * SIZE});
        vec3 channel=position.z<.5?vec3(1,0,0):position.z<1.5?vec3(0,1,0):vec3(0,0,1);
        flux=channel*throughput*power/pixelArea;
        gl_Position=vec4(receiver.x/extent.x*2.,receiver.z/extent.y*2.,0,1);
      }`,
    fragmentShader: `precision highp float;varying vec3 flux;
      void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;
      // Epanechnikov disk, normalized over a three-pixel point footprint.
      gl_FragColor=vec4(flux*(1.-r)*(2./(3.14159265*2.25)),1.);}`,
  });
}

export function createCaustics(renderer, receivers, host) {
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
  const shared = {
    map: { value: target.texture },
    extent: { value: EXTENT.clone() },
    enabled: { value: 1 },
  };
  for (const material of new Set(receivers)) {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, ...args) => {
      previous.call(material, shader, ...args);
      shader.uniforms.benchCausticMap = shared.map;
      shader.uniforms.benchCausticExtent = shared.extent;
      shader.uniforms.benchCausticEnabled = shared.enabled;
      shader.vertexShader =
        "varying vec3 causticWorld;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\ncausticWorld=(modelMatrix*vec4(transformed,1.)).xyz;",
      );
      shader.fragmentShader =
        "uniform sampler2D benchCausticMap;uniform vec2 benchCausticExtent;uniform float benchCausticEnabled;varying vec3 causticWorld;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        vec2 causticUV=causticWorld.xz/benchCausticExtent+.5;
        float onBench=step(-1.43,causticWorld.y)*step(causticWorld.y,-1.26);
        onBench*=step(.7,inverseTransformDirection(normal,viewMatrix).y);
        float inMap=step(0.,causticUV.x)*step(causticUV.x,1.)*step(0.,causticUV.y)*step(causticUV.y,1.);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*texture2D(benchCausticMap,causticUV).rgb*(benchCausticEnabled*onBench*inMap/3.14159265);`,
      );
    };
    // Chain the receiver's own key: its onBeforeCompile may differ per material.
    const previousKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () =>
      `${previousKey()}|bench-photon-caustic-v1`;
    material.needsUpdate = true;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(photonSamples(), 3),
  );
  const settledGeometry = new THREE.BufferGeometry();
  settledGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(photonSamples(SETTLED_CAUSTIC_SAMPLES), 3),
  );
  const points = new THREE.Points(geometry);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(points);
  const camera = new THREE.Camera();
  const materials = new Map();
  const previous = new THREE.Matrix4();
  const oldLight = new THREE.Vector3(Infinity, Infinity, Infinity);
  let enabled = true,
    dirty = true,
    oldMaterial = null,
    oldBroad = null,
    revision = 0,
    lastChange = -Infinity,
    refined = false,
    optical = false;
  const gl = renderer.getContext();
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  let pendingQuery = null;
  const timings = [];
  function pollTimer() {
    if (
      !pendingQuery ||
      !gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT_AVAILABLE)
    )
      return;
    if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      timings.push(gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT) / 1e6);
      if (timings.length > 60) timings.shift();
      host.dataset.causticGpuMs = (
        timings.reduce((a, b) => a + b, 0) / timings.length
      ).toFixed(3);
      host.dataset.causticTimedPasses = String(timings.length);
      host.dataset.causticLastGpuMs = (
        gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT) / 1e6
      ).toFixed(3);
    }
    gl.deleteQuery(pendingQuery);
    pendingQuery = null;
  }
  return {
    setEnabled(value) {
      enabled = value;
      shared.enabled.value = value ? 1 : 0;
      dirty = true;
    },
    get settling() {
      return enabled && optical && !refined;
    },
    update(stone, light, broad, now) {
      pollTimer();
      optical = !!stone.material.uniforms?.facets;
      shared.enabled.value = enabled && optical ? 1 : 0;
      if (!enabled || !optical) return;
      stone.updateWorldMatrix(true, false);
      const changed =
        dirty ||
        !(
          oldMaterial === stone.material &&
          oldBroad === broad &&
          previous.equals(stone.matrixWorld) &&
          oldLight.equals(light.position)
        );
      if (changed) {
        lastChange = now;
        refined = false;
      } else if (refined || now - lastChange < 180) return;
      else refined = true;
      dirty = false;
      previous.copy(stone.matrixWorld);
      oldLight.copy(light.position);
      oldMaterial = stone.material;
      oldBroad = broad;
      if (!materials.has(stone.geometry))
        materials.set(
          stone.geometry,
          photonMaterial(facetPlanes(stone.geometry), shared),
        );
      points.material = materials.get(stone.geometry);
      points.geometry = refined ? settledGeometry : geometry;
      const u = points.material.uniforms;
      u.sampleCount.value = refined ? SETTLED_CAUSTIC_SAMPLES : CAUSTIC_SAMPLES;
      u.objectWorld.value.copy(stone.matrixWorld);
      u.inverseObject.value.copy(stone.matrixWorld).invert();
      if (!stone.geometry.boundingSphere)
        stone.geometry.computeBoundingSphere();
      u.center.value
        .copy(stone.geometry.boundingSphere.center)
        .applyMatrix4(stone.matrixWorld);
      const scale = new THREE.Vector3().setFromMatrixScale(stone.matrixWorld);
      u.targetRadius.value =
        stone.geometry.boundingSphere.radius *
        Math.max(scale.x, scale.y, scale.z) *
        1.01;
      u.lightPosition.value.copy(light.position);
      u.sourceRadius.value = broad ? 1.25 : 0.06;
      u.intensity.value = broad ? 65 : 100;
      for (const name of ["ior", "dispersion"])
        u[name].value = stone.material.uniforms[name].value;
      u.absorption.value.copy(stone.material.uniforms.absorption.value);
      const oldTarget = renderer.getRenderTarget(),
        oldColor = renderer.getClearColor(new THREE.Color()),
        oldAlpha = renderer.getClearAlpha();
      let query = null;
      if (timer && !pendingQuery) {
        query = gl.createQuery();
        gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      }
      renderer.setRenderTarget(target);
      renderer.setClearColor(0, 0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(oldTarget);
      renderer.setClearColor(oldColor, oldAlpha);
      if (query) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pendingQuery = query;
      }
      host.dataset.causticRevision = String(++revision);
      host.dataset.causticRays = String(u.sampleCount.value * 3);
    },
    dispose() {
      if (pendingQuery) gl.deleteQuery(pendingQuery);
      target.dispose();
      geometry.dispose();
      settledGeometry.dispose();
      for (const m of materials.values()) m.dispose();
    },
  };
}

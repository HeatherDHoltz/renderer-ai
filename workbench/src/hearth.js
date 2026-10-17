import * as THREE from "../vendor/three.module.js";

// Art-directed participating flame volume, not a fluid/combustion solver.
// A repeatable3D noise texture is advected upward; front-to-back integration
// gives a translucent turbulent body instead of overlapping striped billboards.
export function createHearth(scene) {
  const group = new THREE.Group();
  group.position.set(2.15, -1.4, -6.95);
  scene.add(group);
  let seed = 419;
  const n = 64,
    data = new Uint8Array(n * n * n);
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[i] = seed >>> 24;
  }
  const noise = new THREE.Data3DTexture(data, n, n, n);
  noise.format = THREE.RedFormat;
  noise.type = THREE.UnsignedByteType;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.unpackAlignment = 1;
  noise.needsUpdate = true;
  const uniforms = {
    time: { value: 0 },
    eye: { value: new THREE.Vector3() },
    noiseVolume: { value: noise },
  };
  const fire = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 1.05, 0.6),
    new THREE.ShaderMaterial({
      uniforms,
      side: THREE.FrontSide,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      vertexShader:
        "varying vec3 localPoint;void main(){localPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `precision highp float;precision highp sampler3D;uniform sampler3D noiseVolume;uniform float time;uniform vec3 eye;varying vec3 localPoint;
   float turbulence(vec3 p){return texture(noiseVolume,p*.095).r*.58+texture(noiseVolume,p*.197+vec3(.13,.47,.29)).r*.29+texture(noiseVolume,p*.411+vec3(.7,.1,.5)).r*.13;}
   void main(){vec3 d=normalize(localPoint-eye),inv=1./d;vec3 a=(vec3(-1.05,-.525,-.30)-eye)*inv,b=(vec3(1.05,.525,.30)-eye)*inv;vec3 lo=min(a,b),hi=max(a,b);float nearT=max(max(lo.x,lo.y),lo.z),farT=min(min(hi.x,hi.y),hi.z);float start=max(nearT,0.);if(farT<=start)discard;
    float stepSize=(farT-start)/56.;vec4 sum=vec4(0.);
    for(int i=0;i<56;i++){
      vec3 p=eye+d*(start+(float(i)+.5)*stepSize);float h=(p.y+.525)/1.05;
      vec3 flow=vec3(p.x*4.2,p.y*5.-time*1.3,p.z*6.);
      float warp=turbulence(flow*.7+vec3(time*.12,0.,0.));
      float plume=0.;
      for(int j=0;j<5;j++){
        float fj=float(j),center=-.78+fj*.39;
        float top=.56+.19*sin(time*.43+fj*1.7)+.13*sin(time*.71-fj*.9);
        float curve=.10*sin(h*7.-time*.8+fj)+.14*(warp-.5)*h;
        float width=mix(.18,.028,clamp(h/top,0.,1.));
        float lateral=1.-smoothstep(width*.2,width,abs(p.x-center-curve));
        plume=max(plume,lateral*max(0.,1.-h/top));
      }
      float body=turbulence(flow+vec3(warp*1.7,0.,warp*.8));
      float density=max(0.,plume*(.65+body*.9)-h*.09)*(1.-smoothstep(.06,.30,abs(p.z)));
      float alpha=1.-exp(-density*stepSize*5.0);
      vec3 hot=mix(vec3(3.8,.19,.004),vec3(7.,2.6,.26),smoothstep(.4,.9,density));
      sum.rgb+=(1.-sum.a)*hot*alpha;sum.a+=(1.-sum.a)*alpha;
      if(sum.a>.985)break;
    }
    if(sum.a<.003)discard;gl_FragColor=sum;
   }`,
    }),
  );
  fire.position.set(0, 0.58, 0);
  fire.onBeforeRender = (_r, _s, camera) =>
    fire.worldToLocal(camera.getWorldPosition(uniforms.eye.value));
  group.add(fire);
  const bark = new THREE.MeshStandardMaterial({
    color: "#100d0b",
    roughness: 0.96,
  });
  bark.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
   float cracks=sin(vViewPosition.x*133.)*sin(vViewPosition.y*97.+sin(vViewPosition.z*57.));diffuseColor.rgb*=.68+.32*smoothstep(-.8,.8,cracks);`,
    );
  };
  for (let i = 0; i < 6; i++) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.13, 0.85 + (i % 3) * 0.12, 48, 8),
      bark,
    );
    log.position.set(
      (i - 2.5) * 0.23,
      0.1 + (i % 2) * 0.11,
      ((i % 3) - 0.5) * 0.09,
    );
    log.rotation.set(0.12 * i, 0.22 * (i - 2), Math.PI / 2 + (i % 2) * 0.2);
    group.add(log);
  }
  const emberMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 0.11, 0.004),
  });
  for (let i = 0; i < 42; i++) {
    const e = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.025 + (i % 4) * 0.009, 2),
      emberMat,
    );
    e.position.set(
      Math.sin(i * 4.7) * 0.91,
      0.045,
      Math.cos(i * 3.1) * 0.2 + 0.03,
    );
    e.scale.set(1, 0.3, 0.7);
    group.add(e);
  }
  const light = new THREE.PointLight("#ff9348", 4, 6, 2);
  light.position.set(2.15, -0.75, -6.65);
  scene.add(light);
  const frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4(),
    bounds = new THREE.Box3();
  return {
    group,
    needsAnimation(camera) {
      projection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      frustum.setFromProjectionMatrix(projection);
      bounds.setFromObject(fire);
      return frustum.intersectsBox(bounds);
    },
    animate(t, motion) {
      uniforms.time.value = motion ? t : 0;
    },
    dispose() {
      noise.dispose();
      fire.material.dispose();
      bark.dispose();
      emberMat.dispose();
    },
  };
}

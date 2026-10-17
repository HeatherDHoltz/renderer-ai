import * as THREE from "../vendor/three.module.js";

// A dusk forest streaming past both rows of windows. Procedural (no textures),
// four layers moving at different speeds for depth: sky, distant ridge,
// conifer stands, and close trunks that blur past. One cheap fragment shader
// per side; drawn only where the window openings expose it.
const VERT = `varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const FRAG = `precision highp float;
uniform float time;uniform float side;uniform float floorY;varying vec3 vWorld;
float h1(float n){return fract(sin(n*127.1)*43758.5453);}
float n1(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(h1(i),h1(i+1.),f);}
float ridge(float x){return n1(x)*.6+n1(x*2.3+7.)*.3+n1(x*5.1+3.)*.1;}
// conifer stand: one tree per cell, soft-edged triangle crown + trunk (anti-aliased with fwidth)
float conifers(vec2 p,float cell,float minH,float maxH,float seed){
  float c=floor(p.x/cell),fx=fract(p.x/cell)-.5;
  float r=h1(c+seed);if(r<.06)return 0.;
  float hgt=mix(minH,maxH,h1(c*1.7+seed));
  fx-=(h1(c*3.1+seed)-.5)*.35;
  float y=p.y/cell;
  float aa=max(fwidth(p.x/cell),fwidth(y))*1.5+.004;
  float halfW=max(0.,(hgt-y)/hgt)*(.42+.05*sin(y*9.+c));
  float crown=smoothstep(halfW+aa,halfW-aa,abs(fx))*smoothstep(.15*hgt-aa,.15*hgt+aa,y)*smoothstep(hgt+aa,hgt-aa,y);
  float trunk=smoothstep(.04+aa,.04-aa,abs(fx))*smoothstep(hgt*.3+aa,hgt*.3-aa,y);
  return max(crown,trunk);
}
void main(){
  float t=time;
  float x=vWorld.x*side;
  float y=vWorld.y-floorY;           // height above the car floor, 10 cm units
  // sky: deep blue overhead warming to an amber horizon
  float hz=clamp((y-6.)/26.,0.,1.);
  vec3 col=mix(vec3(.62,.36,.20),vec3(.05,.08,.17),pow(hz,.6));
  col+=vec3(.25,.12,.05)*exp(-pow((y-4.)/5.,2.));   // afterglow band
  // distant ridge (slow)
  float r=ridge((x+t*1.5)*.012)*9.+2.;
  col=mix(col,vec3(.08,.10,.13),step(y,r));
  // dense forest wall below an uneven treeline (dusk: mostly silhouette)
  float tl=12.+7.*ridge((x+t*10.)*.07)+3.*n1((x+t*10.)*.4);
  float wall=smoothstep(tl+.6,tl-.6,y);
  float leaf=n1((x+t*10.)*1.3+y*.7)*.5+n1((x+t*10.)*3.7-y*1.9)*.5;
  col=mix(col,mix(vec3(.025,.04,.035),vec3(.06,.08,.06),leaf),wall);
  // far conifers (medium)
  float far=conifers(vec2(x+t*10.,y),2.4,6.,10.,11.);
  col=mix(col,vec3(.035,.055,.05),far);
  // near conifers (fast)
  float mid=conifers(vec2(x+t*24.,y+2.),4.5,5.,7.5,37.);
  col=mix(col,vec3(.018,.028,.022),mid);
  // trunks right beside the track: very fast, softened (motion blur)
  float u=(x+t*70.)/14.;float c=floor(u),f=fract(u);
  float present=step(.55,h1(c+91.));
  float w=.08+.06*h1(c+5.);
  float trunk=present*smoothstep(w+.06,w-.02,abs(f-.5));
  col=mix(col,vec3(.012,.012,.011),trunk*.85);
  // ground and embankment
  col=mix(col,vec3(.03,.035,.025),smoothstep(5.,-2.,y));
  gl_FragColor=vec4(col*.42,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createForest(scene, room) {
  const floorY = room?.floor ?? -9;
  const back = room?.back_wall_z ?? -11;
  const front = room?.front_wall_z ?? 28;
  const uniforms = { time: { value: 0 } };
  const meshes = [];
  for (const [z, side, rot] of [
    [back - 9, 1, 0],
    [front + 9, -1, Math.PI],
  ]) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: uniforms.time, side: { value: side }, floorY: { value: floorY } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: false,
      depthWrite: true,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(130, 70), mat);
    plane.position.set(0, floorY + 20, z);
    plane.rotation.y = rot;
    plane.matrixAutoUpdate = false;
    plane.updateMatrix();
    scene.add(plane);
    meshes.push(plane);
  }
  const frustum = new THREE.Frustum(),
    projection = new THREE.Matrix4(),
    box = new THREE.Box3();
  return {
    needsAnimation(camera) {
      projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projection);
      return meshes.some((m) => frustum.intersectsBox(box.setFromObject(m)));
    },
    animate(t, motion) {
      if (motion) uniforms.time.value = t;
    },
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        m.material.dispose();
        scene.remove(m);
      }
    },
  };
}

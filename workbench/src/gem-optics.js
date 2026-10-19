import * as THREE from "../vendor/three.module.js";
import { buildFacetBVH, facetBVHGLSL } from "./facet-bvh.js";

// Convex, outward facet planes. Reject concavity instead of silently tracing an
// unrelated convex hull. The CPU check and GPU share these exact mesh planes.
export function facetPlanes(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position,
    planes = [];
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i),
      b = new THREE.Vector3().fromBufferAttribute(p, i + 1),
      c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const n = b.sub(a).cross(c.sub(a)).normalize(),
      d = -n.dot(a);
    if (
      planes.some(
        (v) =>
          new THREE.Vector3(v.x, v.y, v.z).distanceTo(n) < 1e-4 &&
          Math.abs(v.w - d) < 1e-4,
      )
    )
      continue;
    planes.push(new THREE.Vector4(n.x, n.y, n.z, d));
  }
  for (const plane of planes)
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      if (v.x * plane.x + v.y * plane.y + v.z * plane.z + plane.w > 2e-4)
        throw new Error("Optical mesh must be convex and outward wound");
    }
  return planes;
}

export function dielectricFresnel(cosine, etaI, etaT) {
  const ci = Math.abs(cosine),
    s2 = (etaI / etaT) ** 2 * (1 - ci * ci);
  if (s2 >= 1) return 1;
  const ct = Math.sqrt(1 - s2),
    rs = (etaI * ci - etaT * ct) / (etaI * ci + etaT * ct),
    rp = (etaT * ci - etaI * ct) / (etaT * ci + etaI * ct);
  return (rs * rs + rp * rp) / 2;
}

export function makeFacetMaterial(
  geometry,
  environment,
  { ior = 2.417, dispersion = 0.018, absorption = [0.004, 0.004, 0.004] } = {},
) {
  const planes = facetPlanes(geometry);
  const hierarchy = buildFacetBVH(geometry);
  const tree = new THREE.DataTexture(
    hierarchy.data,
    hierarchy.data.length / 4,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  tree.needsUpdate = true;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      facets: { value: planes },
      facetTree: { value: tree },
      environment: { value: environment },
      inverseObject: { value: new THREE.Matrix4() },
      objectRotation: { value: new THREE.Matrix3() },
      objectWorld: { value: new THREE.Matrix4() },
      lightDisks: {
        value: Array.from({ length: 4 }, () => new THREE.Vector4()),
      },
      lightNormals: {
        value: Array.from({ length: 4 }, () => new THREE.Vector3(0, -1, 0)),
      },
      lightRadiance: {
        value: Array.from({ length: 4 }, () => new THREE.Vector3()),
      },
      eyeLocal: { value: new THREE.Vector3() },
      ior: { value: ior },
      dispersion: { value: dispersion },
      absorption: { value: new THREE.Vector3(...absorption) },
      lampLocal: { value: new THREE.Vector3() },
    },
    vertexShader: `varying vec3 pointLocal;varying vec3 facetNormal;
      void main(){pointLocal=position;facetNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `precision highp float;
      uniform vec4 facets[${planes.length}];uniform samplerCube environment;
      uniform vec3 eyeLocal;uniform mat3 objectRotation;uniform float ior;uniform float dispersion;uniform vec3 absorption;uniform vec3 lampLocal;
      uniform mat4 objectWorld;uniform vec4 lightDisks[4];uniform vec3 lightNormals[4];uniform vec3 lightRadiance[4];
      varying vec3 pointLocal;varying vec3 facetNormal;
      vec3 environmentAt(vec3 d){return textureCube(environment,normalize(objectRotation*d)).rgb;}
      vec3 externalRadiance(vec3 localOrigin,vec3 localDirection){
        vec3 result=environmentAt(localDirection);
        vec3 origin=(objectWorld*vec4(localOrigin,1.)).xyz;
        vec3 direction=normalize(objectRotation*localDirection);
        for(int i=0;i<4;i++){
          float den=dot(direction,lightNormals[i]);
          if(den<-.00001){
            float t=dot(lightDisks[i].xyz-origin,lightNormals[i])/den;
            if(t>.00001){
              float distance=length(origin+direction*t-lightDisks[i].xyz);
              float radius=lightDisks[i].w;
              // Facet paths diverge between neighboring pixels. Screen-space
              // derivatives here are undefined and can light entire boundaries.
              float feather=max(radius*.035,.0001);
              result+=lightRadiance[i]*(1.-smoothstep(radius-feather,radius+feather,distance));
            }
          }
        }
        return result;
      }
      ${convexOpticsGLSL(planes.length).split("      float exitFacet")[0]}
      ${facetBVHGLSL(hierarchy.nodes.length)}
      vec3 traceStone(vec3 incident,vec3 n,float eta){
        float f=fresnel(-dot(incident,n),1.,eta);
        vec3 result=f*externalRadiance(pointLocal,reflect(incident,n));
        vec3 d=refract(incident,n,1./eta),o=pointLocal;vec3 throughput=vec3(1.-f);
        for(int bounce=0;bounce<12;bounce++){
          vec3 normal;float distance=exitFacet(o,d,normal);if(distance>1e5)break;
          throughput*=exp(-absorption*distance);vec3 hit=o+d*distance;
          float reflected=fresnel(dot(d,normal),eta,1.);
          vec3 transmitted=refract(d,-normal,eta);
          if(reflected<.999999)result+=throughput*(1.-reflected)*externalRadiance(hit,transmitted);
          throughput*=reflected;if(max(throughput.r,max(throughput.g,throughput.b))<.002)break;
          d=reflect(d,normal);o=hit;
        }
        return result;
      }
      void main(){vec3 n=normalize(facetNormal),incident=normalize(pointLocal-eyeLocal);
        vec3 r=traceStone(incident,n,ior-dispersion),g=traceStone(incident,n,ior),b=traceStone(incident,n,ior+dispersion);
        vec3 color=vec3(r.r,g.g,b.b);

        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.userData.facetCount = planes.length;
  material.addEventListener("dispose", () => tree.dispose());
  material.userData.update = (object, camera, light) => {
    material.uniformsNeedUpdate = true;
    const u = material.uniforms;
    object.updateWorldMatrix(true, false);
    u.inverseObject.value.copy(object.matrixWorld).invert();
    object.worldToLocal(camera.getWorldPosition(u.eyeLocal.value));
    object.worldToLocal(light.getWorldPosition(u.lampLocal.value));
    u.objectRotation.value.setFromMatrix4(object.matrixWorld);
    u.objectWorld.value.copy(object.matrixWorld);
  };
  material.userData.renderRoute = "custom_gem";
  return material;
}

// Small authored meshes only. Construct supporting planes and their 2D convex
// polygon boundaries, avoiding concave step faces in the legacy emerald mesh.
export function convexFacetHull(geometry) {
  const source = geometry.attributes.position,
    points = [];
  for (let i = 0; i < source.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(source, i);
    if (!points.some((p) => p.distanceTo(v) < 1e-5)) points.push(v);
  }
  const planes = [];
  for (let a = 0; a < points.length; a++)
    for (let b = a + 1; b < points.length; b++)
      for (let c = b + 1; c < points.length; c++) {
        let n = points[b]
          .clone()
          .sub(points[a])
          .cross(points[c].clone().sub(points[a]));
        if (n.length() < 1e-7) continue;
        n.normalize();
        let d = -n.dot(points[a]),
          lo = Infinity,
          hi = -Infinity;
        for (const p of points) {
          const s = n.dot(p) + d;
          lo = Math.min(lo, s);
          hi = Math.max(hi, s);
        }
        if (hi > 1e-5 && lo < -1e-5) continue;
        if (lo >= -1e-5) {
          n.negate();
          d = -d;
        }
        if (
          !planes.some(
            (p) => p.n.distanceTo(n) < 1e-4 && Math.abs(p.d - d) < 1e-4,
          )
        )
          planes.push({ n, d });
      }
  const positions = [];
  for (const { n, d } of planes) {
    const u = new THREE.Vector3(
        Math.abs(n.y) < 0.8 ? 0 : 1,
        Math.abs(n.y) < 0.8 ? 1 : 0,
        0,
      )
        .cross(n)
        .normalize(),
      v = n.clone().cross(u);
    const ps = points
      .filter((p) => Math.abs(n.dot(p) + d) < 1e-4)
      .map((p) => ({ p, x: p.dot(u), y: p.dot(v) }))
      .sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (a, b, c) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const lower = [],
      upper = [];
    for (const p of ps) {
      while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), p) <= 1e-8)
        lower.pop();
      lower.push(p);
    }
    for (const p of [...ps].reverse()) {
      while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), p) <= 1e-8)
        upper.pop();
      upper.push(p);
    }
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    for (let i = 1; i < hull.length - 1; i++)
      positions.push(...hull[0].p, ...hull[i].p, ...hull[i + 1].p);
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  result.computeVertexNormals();
  result.computeBoundingBox();
  return result;
}

// Shared by eye rays and light-side photons; exactly the same facet exits/Fresnel.
export function convexOpticsGLSL(count) {
  return `      float fresnel(float ci,float ni,float nt){ci=abs(ci);float s2=ni*ni/(nt*nt)*(1.-ci*ci);if(s2>=1.)return 1.;float ct=sqrt(1.-s2);float rs=(ni*ci-nt*ct)/(ni*ci+nt*ct);float rp=(nt*ci-ni*ct)/(nt*ci+ni*ct);return .5*(rs*rs+rp*rp);}
      float exitFacet(vec3 o,vec3 d,out vec3 normal){float nearest=1e6;normal=vec3(0,1,0);
        for(int i=0;i<${count};i++){vec4 p=facets[i];float den=dot(p.xyz,d);if(den>1e-6){float t=-(dot(p.xyz,o)+p.w)/den;if(t>1e-7&&t<nearest){nearest=t;normal=p.xyz;}}}return nearest;}
`;
}

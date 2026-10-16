import * as THREE from "../vendor/three.module.js";

// Stackless hierarchy over finite facet bounds. From inside a convex stone,
// the nearest forward supporting plane is its boundary. That facet's polygon
// must intersect the ray, so its AABB cannot be culled. Other candidate planes
// may be conservative, but none can precede the true nearest supporting plane.
// This retains the exact half-space result without triangle barycentric tests.
export function buildFacetBVH(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = g.attributes.position,
    facets = [];
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i);
    const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize(),
      d = -normal.dot(a);
    let facet = facets.find(
      (f) => f.normal.distanceTo(normal) < 1e-4 && Math.abs(f.d - d) < 1e-4,
    );
    if (!facet) {
      facet = {
        normal,
        d,
        bounds: new THREE.Box3(),
        center: new THREE.Vector3(),
      };
      facets.push(facet);
    }
    facet.bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
  for (const f of facets) {
    // A tiny conservative pad handles coplanar faces and float texture rounding.
    f.bounds.expandByScalar(2e-5);
    f.bounds.getCenter(f.center);
  }
  const nodes = [],
    ordered = [];
  function visit(ts) {
    const node = { bounds: new THREE.Box3(), start: -1, count: 0, skip: 0 };
    const index = nodes.length;
    nodes.push(node);
    for (const t of ts) node.bounds.union(t.bounds);
    if (ts.length <= 4) {
      node.start = ordered.length;
      node.count = ts.length;
      ordered.push(...ts);
    } else {
      const size = node.bounds.getSize(new THREE.Vector3());
      const axis =
        size.x > size.y && size.x > size.z ? "x" : size.y > size.z ? "y" : "z";
      ts.sort((a, b) => a.center[axis] - b.center[axis]);
      const mid = Math.floor(ts.length / 2);
      visit(ts.slice(0, mid));
      visit(ts.slice(mid));
    }
    node.skip = nodes.length;
    return index;
  }
  visit(facets);
  const data = new Float32Array((nodes.length * 2 + ordered.length) * 4);
  nodes.forEach((n, i) => {
    data.set([...n.bounds.min, n.skip], i * 8);
    data.set([...n.bounds.max, n.count ? n.start : -1], i * 8 + 4);
  });
  ordered.forEach((f, i) =>
    data.set([...f.normal, f.d], nodes.length * 8 + i * 4),
  );
  // Pack count with start; negative values mean internal nodes.
  nodes.forEach((n, i) => {
    if (n.count) data[i * 8 + 7] = n.start * 4 + n.count - 1;
  });
  return { nodes, facets: ordered, data };
}

// Internal paths start exactly at the previous boundary. Forward-facing
// planes exclude that reflected/refracted entry face; an origin offset could
// otherwise jump across a neighboring facet near a corner.
// Independent CPU traversal for geometry / grazing-ray regression tests.
export function intersectFacetBVH(bvh, origin, direction) {
  const ray = new THREE.Ray(origin, direction);
  let nearest = Infinity,
    normal = null,
    index = 0;
  while (index < bvh.nodes.length) {
    const node = bvh.nodes[index];
    if (!ray.intersectsBox(node.bounds)) {
      index = node.skip;
      continue;
    }
    for (let i = 0; i < node.count; i++) {
      const f = bvh.facets[node.start + i],
        den = f.normal.dot(direction);
      if (den <= 1e-6) continue;
      const distance = -(f.normal.dot(origin) + f.d) / den;
      if (distance > 1e-7 && distance < nearest) {
        nearest = distance;
        normal = f.normal;
      }
    }
    index++;
  }
  return { distance: nearest, normal };
}

export function facetBVHGLSL(nodeCount) {
  return `uniform sampler2D facetTree;
  vec4 treeAt(int i){return texelFetch(facetTree,ivec2(i,0),0);}
  float exitFacet(vec3 o,vec3 d,out vec3 normal){
    float nearest=1e6;normal=vec3(0,1,0);int node=0;
    vec3 inv=1./(sign(d)*max(abs(d),vec3(1e-20))+vec3(equal(d,vec3(0.)))*1e-20);
    for(int step=0;step<${nodeCount};step++){
      if(node>=${nodeCount})break;
      vec4 lo=treeAt(node*2),hi=treeAt(node*2+1);
      vec3 a=(lo.xyz-o)*inv,b=(hi.xyz-o)*inv;
      vec3 lower=min(a,b),upper=max(a,b);
      float nearT=max(max(lower.x,lower.y),lower.z),farT=min(min(upper.x,upper.y),upper.z);
      if(farT<max(nearT,0.)||nearT>nearest){node=int(lo.w);continue;}
      if(hi.w>=0.){
        int start=int(hi.w)/4,count=int(hi.w)%4+1;
        for(int j=0;j<4;j++){
          if(j>=count)break;
          vec4 plane=treeAt(${nodeCount * 2}+start+j);
          float den=dot(plane.xyz,d);
          if(den>1e-6){float t=-(dot(plane.xyz,o)+plane.w)/den;
            if(t>1e-7&&t<nearest){nearest=t;normal=plane.xyz;}}
        }
      }
      node++;
    }return nearest;
  }`;
}

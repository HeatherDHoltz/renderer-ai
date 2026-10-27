import * as THREE from '../vendor/three.module.js';
import { loadFloatResponse } from './float-response.js';
const assetBase = new URL('../assets/', import.meta.url);
export async function deliveryPlan() {
  const response = await fetch(new URL('delivery-details.json', assetBase));
  if (!response.ok) throw new Error('Delivery manifest could not load');
  const plan = await response.json();
  if (![0,1].includes(plan.version)) throw new Error('Unsupported delivery manifest');
  return plan;
}
// The complete room starts at smaller delivery quality. Sharper maps are only
// requested after a focus action, without blocking interaction or animation.
export function createRoomDetails(plan, scene, textures, renderer, host) {
  const finished = new Set(), pending = new Map(), queue = [];
  let active = 0, disposed = false;
  const loader = new THREE.TextureLoader();
  function drain() {
    while (!disposed && active < 2 && queue.length) {
      active++;
      const job=queue.shift();
      Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{active--;drain();});
    }
  }
  const enqueue = run => new Promise((resolve,reject)=>{queue.push({run,resolve,reject});drain();});
  function bindings() {
    const found=new Map();
    const add = t => {
      if (!t?.isTexture) return;
      const source=t.userData.deliveryURL || t.image?.currentSrc || t.image?.src;
      if (!source) return;
      const u=new URL(source,assetBase), prefix=assetBase.pathname;
      if(u.origin!==assetBase.origin || !u.pathname.startsWith(prefix)) return;
      const key=decodeURIComponent(u.pathname.slice(prefix.length)).replace(/\.parts\.json$/, '');
      if (!found.has(key)) found.set(key,new Set());
      found.get(key).add(t);
    };
    textures.forEach(add);
    scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)for(const v of Object.values(m))add(v);});
    return found;
  }
  async function request(location) {
    if (disposed || plan?.version!==1) return;
    const groups=['desk','gems','metals'].includes(location)?['desk']:
      location==='fireplace'?['architecture','furnishings']:
      location==='safe'?['furnishings','gramophone']:['furnishings',location];
    const targets=bindings(), jobs=[];
    for(const [key,entry] of Object.entries(plan.entries)) {
      if(!entry.groups.some(g=>groups.includes(g)) || !targets.has(key) || finished.has(key))continue;
      if(!pending.has(key)) {
        const job=enqueue(async()=>{
          if(disposed)return;
          const url=new URL(entry.file,assetBase);
          const loaded=entry.kind==='float'?await loadFloatResponse(url):await loader.loadAsync(url.href);
          try {
            if(disposed)return;
            for(const texture of targets.get(key)) {
              texture.image=loaded.image;texture.needsUpdate=true;
              renderer.initTexture(texture);
            }
            finished.add(key);
            host.dataset.detailTextures=String(finished.size);
            host.dispatchEvent(new Event('roomdetail'));
          } finally { loaded.dispose(); }
        }).finally(()=>pending.delete(key));
        pending.set(key,job);job.catch(()=>{});
      }
      jobs.push(pending.get(key));
    }
    host.dataset.detailState='loading';
    const outcomes=await Promise.allSettled(jobs);
    if(!disposed)host.dataset.detailState=outcomes.some(r=>r.status==='rejected')?'partial':'ready';
  }
  return {request,dispose(){disposed=true;for(const job of queue.splice(0))job.resolve();},get state(){return {loaded:finished.size,pending:pending.size,active};}};
}

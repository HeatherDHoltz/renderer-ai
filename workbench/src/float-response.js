import * as THREE from "../vendor/three.module.js";
import { assetStream } from "./asset-stream.js";
import { decodeResponse } from "./response-codec.js";

// Bound concurrent decoded lighting buffers. Transfer pixels rather than copying
// them back to the main thread; workers keep byte reconstruction off the UI.
const slots = [], queue = [];
let sequence = 0, idleTimer, workersDisabled = false;
function drain() {
  clearTimeout(idleTimer);
  for (const slot of slots) {
    if (slot.job || !queue.length) continue;
    slot.job = queue.shift();
    slot.worker.postMessage({id:slot.job.id,url:slot.job.url});
  }
  if (!queue.length && slots.every(s => !s.job)) idleTimer = setTimeout(() => {
    for (const slot of slots) slot.worker.terminate();
    slots.length = 0;
  }, 1000);
}
function ensureWorkers() {
    while (slots.length < 2) {
      let worker;
      try { worker = new Worker(new URL('./response-worker.js',import.meta.url),{type:'module'}); }
      catch(error) {
        error.workerUnavailable=true; workersDisabled=true;
        for (const slot of slots) { slot.failed(error); slot.worker.terminate(); }
        slots.length=0;
        throw error;
      }
      let started, failed;
      const ready = new Promise((resolve,reject) => { started=resolve; failed=reject; });
      ready.catch(() => {});
      const slot = {worker,job:null,ready,failed};
      slot.worker.onmessage = ({data}) => {
        if (data.ready) { started(); return; }
        const job = slot.job;
        if (!job || data.id !== job.id) return;
        slot.job = null;
        if (data.error) job.reject(new Error(data.error)); else job.resolve(data);
        drain();
      };
      slot.worker.onerror = event => {
        event.preventDefault();
        const error = new Error(event.message || 'Lighting worker failed');
        error.workerUnavailable=true;workersDisabled=true;
        for (const s of slots) { s.failed(error); s.job?.reject(error); s.worker.terminate(); }
        for (const job of queue.splice(0)) job.reject(error);
        slots.length = 0;
      };
      slots.push(slot);
    }
}
// Worker module requests can otherwise sit behind hundreds of MB of images on
// HTTP/2. Finish this tiny module graph before starting the large asset burst.
export async function prepareLightingWorkers() {
  if (typeof Worker === 'undefined' || workersDisabled) return;
  try { ensureWorkers(); await Promise.all(slots.map(slot => slot.ready)); }
  catch { /* The existing main-thread decoder remains the fallback. */ }
}
function decodeInWorker(url) {
  return new Promise((resolve,reject) => {
    try { ensureWorkers(); } catch(error) { reject(error); return; }
    queue.push({id:++sequence,url,resolve,reject});
    drain();
  });
}
async function decodeOnMain(url) {
  const stream = await assetStream(url);
  const bytes = await new Response(stream.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return decodeResponse(bytes);
}
async function decode(url) {
  if (typeof Worker === 'undefined' || workersDisabled) return decodeOnMain(url);
  try { return await decodeInWorker(String(url)); }
  catch(error) { if(error.workerUnavailable)return decodeOnMain(url);throw error; }
}
export function startFloatResponse(url) {
  // Stable texture identity allows program compilation while data is in flight.
  // It is never rendered until ready; all original pixels replace this seed.
  const texture = new THREE.DataTexture(new Uint16Array(4),1,1,
    THREE.RGBAFormat, THREE.HalfFloatType);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.userData.deliveryURL = String(url);
  const ready=decode(url).then(result => {
    texture.image={data:result.pixels,width:result.width,height:result.height};
    texture.needsUpdate=true;
    return texture;
  });
  ready.catch(() => {});
  return {texture,ready};
}
export async function loadFloatResponse(url) {
  return startFloatResponse(url).ready;
}

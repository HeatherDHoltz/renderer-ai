// Precompute the authored convex hulls once per build, with the same generator
// and float32 geometry used by the browser. No tessellation/precision changes.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {cutGeometry} from '../src/cuts.js';
export async function prepareCuts(assetsDirectory) {
  const cuts = {};
  for (const name of ['brilliant','step','oval','cushion']) {
    const geometry = cutGeometry(name);
    cuts[name] = {position:Array.from(geometry.attributes.position.array),
      normal:Array.from(geometry.attributes.normal.array),
      negativeZeros:Object.fromEntries(['position','normal'].map(attribute => [attribute,
        Array.from(geometry.attributes[attribute].array.entries()).filter(([,value])=>Object.is(value,-0)).map(([index])=>index)]))};
    geometry.dispose();
  }
  await writeFile(path.join(assetsDirectory,'prepared-cuts.json'),JSON.stringify({version:1,cuts})+'\n');
}

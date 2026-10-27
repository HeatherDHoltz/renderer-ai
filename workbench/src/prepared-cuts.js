import * as THREE from '../vendor/three.module.js';
export async function loadPreparedCuts() {
  const response = await fetch(new URL('../assets/prepared-cuts.json',import.meta.url));
  if (!response.ok) throw new Error(`Prepared gemstone cuts: ${response.status}`);
  const data = await response.json();
  if (data.version !== 1) throw new Error('Unsupported prepared gemstone cuts');
  return Object.fromEntries(['brilliant','step','oval','cushion'].map(name => {
    const source=data.cuts?.[name];
    if (!source?.position?.length || source.position.length % 9 ||
        source.normal?.length !== source.position.length ||
        !source.position.every(Number.isFinite) || !source.normal.every(Number.isFinite))
      throw new Error(`Invalid prepared gemstone cut: ${name}`);
    const geometry = new THREE.BufferGeometry();
    for (const attribute of ['position','normal']) {
      const values=new Float32Array(source[attribute]);
      for(const index of source.negativeZeros?.[attribute] || []) {
        if(!Number.isSafeInteger(index) || index<0 || index>=values.length || values[index]!==0)
          throw new Error(`Invalid signed zero in gemstone cut: ${name}`);
        values[index]=-0;
      }
      geometry.setAttribute(attribute,new THREE.BufferAttribute(values,3));
    }
    geometry.computeBoundingBox();
    return [name,geometry];
  }));
}

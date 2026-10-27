import * as THREE from '../vendor/three.module.js';
import { createRoomAudio } from './room-audio.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { createRoomClock } from './room-clock.js';

const smooth = x => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const nameOf = o => (o.userData.name || o.name).replaceAll('_', ' ');
const vec = a => new THREE.Vector3(...a);

// Partition only indices: original surface UVs, custom attributes, normals and
// all unselected triangles remain exact. Compact copies retain exact attributes.
function separateParts(car, metadata) {
  const parts = new Map(), meshes = [];
  car.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const full = mesh.userData.name || mesh.name;
    const material = full.slice(full.indexOf('|') + 1);
    const group = full.slice(0, full.indexOf('|'));
    const selections = metadata.parts.filter(p => p.material === material && p.group === group && metadata.objects[p.object].moving && p.triangles.length);
    if (!selections.length) continue;
    const original = mesh.geometry, index = original.index;
    if (!index) throw new Error('Interactive room requires indexed authored geometry');
    const removed = new Set();
    for (const spec of selections) {
      const indices = [];
      for (const tri of spec.triangles) {
        if (removed.has(tri) || tri * 3 + 2 >= index.count) throw new Error('Interactive triangle ownership mismatch');
        removed.add(tri);
        indices.push(index.getX(tri * 3), index.getX(tri * 3 + 1), index.getX(tri * 3 + 2));
      }
      const geometry = new THREE.BufferGeometry();
      const used = [...new Set(indices)], remap = new Map(used.map((v, i) => [v, i]));
      for (const [key, attr] of Object.entries(original.attributes)) {
        const Constructor = (attr.array || attr.data.array).constructor;
        const values = new Constructor(used.length * attr.itemSize);
        for (let i = 0; i < used.length; i++) for (let k = 0; k < attr.itemSize; k++) {
          const source = attr.isInterleavedBufferAttribute ? used[i] * attr.data.stride + attr.offset + k : used[i] * attr.itemSize + k;
          values[i * attr.itemSize + k] = (attr.array || attr.data.array)[source];
        }
        geometry.setAttribute(key, new THREE.BufferAttribute(values, attr.itemSize, attr.normalized));
      }
      geometry.setIndex(indices.map(i => remap.get(i))); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const part = new THREE.Mesh(geometry, mesh.material);
      part.name = spec.object; part.castShadow = true; part.receiveShadow = true;
      part.position.copy(mesh.position); part.quaternion.copy(mesh.quaternion); part.scale.copy(mesh.scale);
      car.add(part);
      if (!parts.has(spec.object)) parts.set(spec.object, []);
      parts.get(spec.object).push(part);
    }
    const keep = [];
    for (let tri = 0; tri < index.count / 3; tri++) if (!removed.has(tri))
      keep.push(index.getX(tri * 3), index.getX(tri * 3 + 1), index.getX(tri * 3 + 2));
    original.setIndex(keep); original.computeBoundingBox(); original.computeBoundingSphere();
  }
  for (const [name, info] of Object.entries(metadata.objects))
    if (info.moving && !name.startsWith('safe ') && !parts.has(name)) throw new Error(`Missing interactive part: ${name}`);
  return parts;
}

export function createRoomInteractions({ car, props, metadata, lampUniform, hearth, fireUniform, safeOpenUniform, safeAngleUniform, liveMaterial, propMaterial }) {
  const audio = createRoomAudio(), targets = [], parts = separateParts(car, metadata), ownedMaterials = new Set(), ownedGeometries = new Set();
  car.add(props);
  let revision = 0, last = null, safeProgress = 0, safeGoal = 0, safeBusy = false;
  let globeAngle = 0, globeStart = 0, globeEnd = 0, globeAt = -Infinity, globeDuration = 5;
  let gramOn = false, gramRequest = 0, armProgress = 0, armGoal = 0, inhaleAt = -Infinity, stokeAt = -Infinity;
  let tilt = 0, tiltVelocity = 0, fireReset;
  const onScale = [false, false, false, false, false], masses = [2, 1, .5, .2, .1];
  const root = new THREE.Group(); root.name = 'Interactive room assemblies'; car.add(root);
  function assembly(name, pivot, filter, parent = root) {
    const g = new THREE.Group(); g.name = name; g.position.copy(vec(pivot)); parent.add(g); car.updateMatrixWorld(true);
    for (const [n, list] of parts) if (filter(n)) for (const mesh of list) {
      g.attach(mesh);
      // Moving surfaces keep full authored colour/roughness maps but receive
      // live lighting instead of spinning their old shadows with the object.
      const m = liveMaterial?.(mesh.material, n);
      if (m) { mesh.material = m; ownedMaterials.add(m); }
    }
    // Batch glued decoration by shared material/transform, while keeping the
    // door, handle, dial and other independently moving assemblies separate.
    const batches = new Map();
    for (const o of g.children.filter(o=>o.isMesh)) {
      o.updateMatrix(); const key=o.material.uuid+'|'+o.matrix.elements.join(',');
      if (!batches.has(key)) batches.set(key,[]); batches.get(key).push(o);
    }
    for (const list of batches.values()) if (list.length>1) {
      const geometry=mergeGeometries(list.map(o=>o.geometry));
      if (!geometry) throw new Error('Cannot batch interactive assembly '+name);
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const merged=new THREE.Mesh(geometry,list[0].material);merged.name=name;
      merged.position.copy(list[0].position);merged.quaternion.copy(list[0].quaternion);merged.scale.copy(list[0].scale);
      merged.castShadow=true;merged.receiveShadow=true;
      for(const o of list){g.remove(o);o.geometry.dispose();}g.add(merged);
    }
    return g;
  }
  function mark(group, id, label) {
    const action = { kind: 'room', value: id, label };
    group.traverse(o => { if (o.isMesh) { o.userData.action = action; if (!targets.includes(o)) targets.push(o); } });
  }
  const shellNames = new Set(['safe back','safe floor','safe left wall','safe right wall','safe roof']);
  assembly('Safe interior and carcass', [0,0,0], n => shellNames.has(n));
  const hinge = [-21.3965, -5.595, -5.0465];
  const isDial = n => n === 'safe combination dial' || n.startsWith('safe dial ') || n.startsWith('safe Victorian dial number ');
  const safe = assembly('Safe hinged door', hinge, n => n.startsWith('safe ') && !shellNames.has(n) && !n.startsWith('safe handle ') && !isDial(n));
  // Handle and dial belong to the door; their own spin axes follow its swing.
  const handle = assembly('Safe turning handle', [-20.8835, -5.8125, -3.6555], n => /^safe handle (hub|knob|spoke)/.test(n));
  safe.attach(handle);
  const handleBase = assembly('Safe handle escutcheon', hinge, n => n === 'safe handle base'); safe.attach(handleBase);
  const dial = assembly('Safe combination wheel', metadata.objects['safe combination dial'].center, isDial); safe.attach(dial);
  mark(safe, 'safe-door', 'Look at the safe / push the open door closed');
  mark(handle, 'safe-control', 'Turn the handle to open / close the safe');
  mark(dial, 'safe-control', 'Turn the lock to open / close the safe');
  const globeInfo = metadata.replacements?.globe;
  const globeCenter = globeInfo?.center || metadata.objects.globe.center;
  const globe = assembly('Spinning globe', globeCenter, n => n === 'globe');
  if (globeInfo) {
    let sphere;
    props.traverse(o=>{if(nameOf(o)===globeInfo.sphere)sphere=o;});
    if(!sphere)throw Error('Replacement globe sphere is missing');
    const material=propMaterial?.(sphere.material,sphere);
    if(material){sphere.material=material;ownedMaterials.add(material);}
    car.updateMatrixWorld(true);globe.attach(sphere);
  }
  const globeMeshes = [];
  globe.traverse(o => { if (o.isMesh) globeMeshes.push(o); });
  if (metadata.globeProjection && !globeInfo) {
    const north=vec(metadata.globeProjection.north).normalize(), prime=vec(metadata.globeProjection.prime).normalize();
    const east=new THREE.Vector3().crossVectors(north,prime).normalize(), center=vec(metadata.objects.globe.center);
    car.updateMatrixWorld(true);
    for(const mesh of globeMeshes) {
      const original=mesh.geometry, geometry=original.index ? original.toNonIndexed() : original.clone();
      const positions=geometry.attributes.position, values=new Float32Array(positions.count*2);
      for(let i=0;i<positions.count;i++) {
        const p=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).sub(center).normalize();
        values[i*2]=.5+Math.atan2(p.dot(east),p.dot(prime))/(2*Math.PI);
        values[i*2+1]=.5+Math.asin(THREE.MathUtils.clamp(p.dot(north),-1,1))/Math.PI;
      }
      for(let i=0;i<positions.count;i+=3) {
        const u=[values[i*2],values[(i+1)*2],values[(i+2)*2]];
        if(Math.max(...u)-Math.min(...u)>.5)for(let k=0;k<3;k++)if(values[(i+k)*2]<.5)values[(i+k)*2]+=1;
      }
      geometry.setAttribute('uv2',new THREE.BufferAttribute(values,2)); mesh.geometry=geometry; original.dispose();
    }
  }
  const globeAxis = vec(globeInfo?.axis || metadata.globeProjection?.north || metadata.objects.globe.axis).normalize(); mark(globe, 'globe', 'Spin the globe');
  const leftInfo = metadata.objects['balance pan -1'], rightInfo = metadata.objects['balance pan 1'];
  const leftAt = vec(leftInfo.center), rightAt = vec(rightInfo.center);
  const beamAt = metadata.objects['balance beam'].center;
  const beam = assembly('Balance rocking beam', beamAt, n => n === 'balance beam' || n === 'balance pointer');
  const direction = rightAt.clone().sub(leftAt); direction.y = 0; direction.normalize();
  const beamAxis = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
  const left = assembly('Balance left suspension', leftInfo.center, n => n === 'balance pan -1' || n.startsWith('pan wire -1'));
  const right = assembly('Balance right suspension', rightInfo.center, n => n === 'balance pan 1' || n.startsWith('pan wire 1'));
  mark(right, 'weight-pan', 'Choose the nearest weight on this side of the scale');
  const weights = masses.map((_, i) => {
    const body = i < 3 ? `weight ${i}.001` : `weight ${i}`;
    const g = assembly(`Clickable weight ${i}`, metadata.objects[body].center, n => n === body || n === `weight knob ${i}`);
    const home = g.position.clone(), bottom = metadata.objects[body].min[1] - home.y;
    mark(g, `weight-${i}`, 'Place / return this balance weight'); return { g, home, bottom };
  });
  // Fixed authored surfaces get bounds for picking only. Invisible materials do
  // not draw, but raycasting still sees the proxy. Main picking checks occlusion.
  const pickMaterial = new THREE.MeshBasicMaterial({ visible: false }); ownedMaterials.add(pickMaterial);
  // A generous moving hit volume covers the receiving bowl and its suspension.
  const panProxy = new THREE.Mesh(new THREE.CylinderGeometry(.52,.52,1.6,24),pickMaterial);
  panProxy.name='Forgiving right weight pan'; panProxy.position.y=.65; right.add(panProxy);
  panProxy.userData.action={kind:'room',value:'weight-pan',label:'Choose the nearest weight on this side of the scale'};
  targets.push(panProxy);
  for (const [name, info] of Object.entries(metadata.objects)) if (name.startsWith('student lamp ') || name.startsWith('fire iron ')) {
    const size = vec(info.max).sub(vec(info.min)).addScalar(.045);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), pickMaterial);
    proxy.position.copy(vec(info.center)); root.add(proxy);
    proxy.userData.action = { kind: 'room', value: name.startsWith('student') ? 'lamp' : 'poker', label: name.startsWith('student') ? 'Turn the student lamp on / off' : 'Stoke the fire' };
    targets.push(proxy);
  }
  const record = [], cigar = [], ember = [];
  let tonearm;
  props.traverse(o => { if (nameOf(o) === 'gramophone tonearm') tonearm = o; });
  if (!tonearm) throw new Error('Gramophone tonearm is missing');
  props.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const replacement = propMaterial?.(o.material, o);
    if (replacement) { o.material = replacement; ownedMaterials.add(replacement); }
    const name = nameOf(o);
    // Static dressing already casts shadows in the room bake. Keep it out
    // of the desk atlas; clock hands must not dirty its 18 views continuously.
    if (name.startsWith('replacement clock ') || name.startsWith('replacement cigar ') || name === 'replacement globe stand') o.castShadow=false;
    if (name.startsWith('gramophone')) { o.userData.action = { kind: 'room', value: name === 'gramophone tonearm' ? 'gramophone-tonearm' : 'gramophone', label: name === 'gramophone tonearm' ? 'Lower / raise the tonearm' : 'Look at the gramophone' }; targets.push(o); }
    if (name === 'gramophone record' || name === 'gramophone record label') { record.push(o); o.castShadow = false; }
    if (name.startsWith('cigar') || name.startsWith('ashtray') || name.startsWith('replacement cigar')) { o.userData.action = { kind: 'room', value: 'cigar', label: 'Draw on the cigar' }; targets.push(o); cigar.push(o); }
    if (name === 'cigar ember') { o.material = o.material.clone(); ownedMaterials.add(o.material); ember.push(o); }
  });
  const clock = createRoomClock({props,rig:metadata.replacements?.clock,audio,mark});
  const smokeAt = vec(metadata.replacements?.cigar.ember || [-7.807, -1.135, -2.7]);
  if (metadata.replacements?.cigar) {
    const material=new THREE.MeshStandardMaterial({color:0x170502,emissive:0xff2402,emissiveIntensity:.6,roughness:1});
    const tip=new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),material);
    tip.name='Live smoldering cigar tip';tip.position.copy(smokeAt);root.add(tip);
    tip.userData.action={kind:'room',value:'cigar',label:'Draw on the cigar'};targets.push(tip);ember.push(tip);ownedMaterials.add(material);ownedGeometries.add(tip.geometry);
  }
  const smokeGeometry = new THREE.BufferGeometry(), smokePositions = new Float32Array(24 * 3), smokeAlpha = new Float32Array(24);
  smokeGeometry.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3)); smokeGeometry.setAttribute('opacity', new THREE.BufferAttribute(smokeAlpha, 1));
  const smokeMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
    uniforms: { pixelRatio: { value: 1 } },
    vertexShader: 'attribute float opacity;varying float a;uniform float pixelRatio;void main(){a=opacity;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(100.*pixelRatio/max(1.,-p.z),2.,32.);gl_Position=projectionMatrix*p;}',
    fragmentShader: 'varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.25,.22,.19,a*exp(-r*r*5.)*(1.-smoothstep(.65,1.,r)));}' });
  ownedMaterials.add(smokeMaterial);
  const smoke = new THREE.Points(smokeGeometry, smokeMaterial); smoke.frustumCulled = false; root.add(smoke);
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4(), box = new THREE.Box3();
  function visible(camera, object) { matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(matrix); box.setFromObject(object); return frustum.intersectsBox(box); }
  function bump() { revision++; }
  function state() { return { lampOn: lampUniform.value > .5, safeProgress, safeGoal, safeDoorAngle:safe.rotation.y, globeAngle, clock:clock?.state || null, gramophone: gramOn, armProgress, armGoal, recordSpinning: true, weights: onScale.slice(), tilt, fireBoost: fireUniform.value, audio: audio.state, revision }; }
  function activate(id) {
    if (id.startsWith('clock-')) return clock?.activate(id) || '';
    if (id === 'lamp') { lampUniform.value = 1 - lampUniform.value; audio.sound('lamp'); bump(); return lampUniform.value ? 'Student lamp lit.' : 'Student lamp extinguished.'; }
    if (id === 'safe-control') { if (!safeBusy) { safeGoal = 1 - safeGoal; safeBusy = true; audio.sound(safeGoal ? 'safe-open' : 'safe-close'); bump(); } return safeGoal ? 'Opening the safe.' : 'Closing the safe.'; }
    if (id === 'globe') { globeStart = globeAngle; globeEnd = globeAngle + Math.PI * 2 * (2 + Math.random() * 2); globeDuration = 1.99351; globeAt = performance.now() / 1000; audio.sound('globe'); bump(); return 'The globe is spinning.'; }
    if (id === 'gramophone') return 'Click the tonearm to lower it onto the spinning record.';
    if (id === 'gramophone-tonearm') {
      armGoal = 1 - armGoal;
      gramOn = !!armGoal; const requested = gramOn, request = ++gramRequest;
      audio.gramophone(requested, { delay: requested ? 1.3 : 0 }).then(ok => { if (request === gramRequest && requested && !ok && gramOn) { gramOn = false; armGoal = 0; bump(); } }); bump();
      return gramOn ? 'Lowering the tonearm. The gramophone is playing.' : 'Lifting the tonearm. Gramophone stopped.';
    }
    if (id === 'cigar') { inhaleAt = performance.now() / 1000; audio.sound('cigar'); bump(); return 'The cigar ember glows.'; }
    if (id === 'poker') { stokeAt = performance.now() / 1000; audio.sound('poker'); bump(); clearTimeout(fireReset); fireReset = setTimeout(() => { audio.fire(0); }, 7000); return 'Fire stoked.'; }
    const match = /^weight-([0-4])$/.exec(id);
    if (match) { const i = Number(match[1]); onScale[i] = !onScale[i]; audio.sound('weight', { rate: 2 ** ([0, 2, 4, 6, 8][i] / 12), group: `weight-${i}` }); bump(); return onScale[i] ? 'Weight placed on the scale.' : 'Weight returned to its tray.'; }
    return '';
  }
  return {
    targets, activate, audio, root,
    weightAt(point, area) {
      // Actual tray surfaces get a generous margin; the moving pan follows its suspension.
      const tray = point.x >= -2.83 && point.x <= -1.16 && point.z >= -4.85 && point.z <= -3.55 && point.y >= -1.65 && point.y <= -.65;
      const pan = area === 'pan' || Math.hypot(point.x-right.position.x,point.z-right.position.z)<.56 && Math.abs(point.y-right.position.y)<.65;
      let candidates=weights.map((w,i)=>({w,i})).filter(({i})=>tray ? !onScale[i] : pan ? onScale[i] : false);
      if(!tray && !pan)return null;
      if(!candidates.length)candidates=weights.map((w,i)=>({w,i}));
      candidates.sort((a,b)=> {
        const da=a.w.g.position,db=b.w.g.position;
        return (da.x-point.x)**2+(da.z-point.z)**2-((db.x-point.x)**2+(db.z-point.z)**2);
      });
      return {kind:'room',value:`weight-${candidates[0].i}`,label:onScale[candidates[0].i]?'Return the nearest weight to its tray':'Place the nearest weight on the scale'};
    },
    locationAt(point) {
      const regions = [
        ['gramophone', [-24.5,-2.3,-5.1],[-21,1.7,-1.1]],
        ['safe',[-25.1,-9.1,-5.6],[-20.6,-2.25,-.7]],
        ['clock',[8.5,-9.1,-11.1],[14.9,14.8,-5.8]],
        ['fireplace',[-26.5,-9.1,4.5],[-21.5,4,12.5]],
        ['globe',[16.4,-9.1,-9.9],[23.4,1.3,-2.9]],
        ['desk',[-9,-4.2,-6.4],[9,.1,4.0]],
      ];
      return regions.find(([,lo,hi]) => point.x>=lo[0] && point.x<=hi[0] && point.y>=lo[1] && point.y<=hi[1] && point.z>=lo[2] && point.z<=hi[2])?.[0] || null;
    },
    locationView(id, aspect) {
      if (id === 'gramophone') return this.gramophoneView(aspect);
      const spec = {
        globe: { center:globeCenter, size:[6.7,6.7,6.7], direction:[-1,.32,.35] },
        clock: { center:metadata.replacements?.clock.view?.center || [11.7,2.6,-7.4], size:metadata.replacements?.clock.view?.size || [5.7,23.5,4.8], direction:[-.12,.08,1] },
        safe: { center:[-22.7,-5.6,-3.1], size:[4.3,6.8,4.6], direction:[1,.28,0] },
        fireplace: { center:[-24,-4.7,8.5], size:[2,7,6.8], direction:[1,.5,0] },
      }[id];
      if (!spec) throw new Error('Unknown fixed room view: '+id);
      const center=vec(spec.center), direction=vec(spec.direction).normalize();
      const fov=aspect<.8?52:40, tan=Math.tan(THREE.MathUtils.degToRad(fov/2));
      const view=new THREE.PerspectiveCamera(); view.position.copy(center).add(direction); view.lookAt(center);
      const right=new THREE.Vector3(1,0,0).applyQuaternion(view.quaternion), up=new THREE.Vector3(0,1,0).applyQuaternion(view.quaternion);
      let distance=0;
      for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]) {
        const corner=new THREE.Vector3(x*spec.size[0]/2,y*spec.size[1]/2,z*spec.size[2]/2);
        distance=Math.max(distance,corner.dot(direction)+Math.abs(corner.dot(right))/(tan*aspect),corner.dot(direction)+Math.abs(corner.dot(up))/tan);
      }
      return {center,position:center.clone().addScaledVector(direction,distance*1.08),quaternion:view.quaternion.clone(),fov};
    },
    gramophoneView(aspect) {
      car.updateMatrixWorld(true);
      const cabinet = targets.find(o => nameOf(o) === 'gramophone Rigdhi cabinet and horn');
      const bounds = new THREE.Box3().setFromObject(cabinet);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const distance = Math.max(size.y, size.z / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(20))) * 1.24;
      const position = center.clone().add(new THREE.Vector3(distance * .88, distance * .60, -distance * .70));
      const view = new THREE.PerspectiveCamera(); view.position.copy(position); view.lookAt(center);
      return { position, center, quaternion: view.quaternion.clone() };
    },
    shadowRoots: { dressing: {root:props}, balanceBeam: {root:beam}, balanceLeft: {root:left}, balanceRight: {root:right}, ...Object.fromEntries(weights.map((w,i)=>[`weight${i}`,{root:w.g}])) },
    get revision() { return revision; },
    get moving() { return clock?.moving || Math.abs(armProgress - armGoal) > .0001 || safeBusy || performance.now() / 1000 - globeAt < globeDuration || Math.abs(tiltVelocity) > .0005 || Math.abs(tilt - targetTilt()) > .0001; },
    get state() { return state(); },
    needsAnimation(camera) { return this.moving || visible(camera, props) || visible(camera, cigar[0] || smoke); },
    animate(t, motion, camera, renderer) {
      const dt = last === null ? 0 : Math.min(.05, Math.max(0, t - last)); last = t;
      let changed = false;
      changed ||= clock?.animate(t,camera) || false;
      if (safeBusy) {
        const old = safeProgress; safeProgress = THREE.MathUtils.clamp(safeProgress + (safeGoal ? 1 : -1) * dt / 3.05, 0, 1);
        const p = safeProgress;
        safe.rotation.y = smooth((p - .65) / .35) * Math.PI * .58;
        if (safeAngleUniform) safeAngleUniform.value=safe.rotation.y;
        if (safeOpenUniform) safeOpenUniform.value = Math.sin(Math.min(Math.PI / 2, safe.rotation.y));
        handle.rotation.x = smooth(p / .65) * Math.PI * .65;
        dial.rotation.x = smooth(p / .65) * Math.PI * 2;
        changed ||= old !== p;
        if (p === safeGoal) { safeBusy = false; }
      }
      if (t - globeAt < globeDuration) {
        const p = THREE.MathUtils.clamp((t - globeAt) / globeDuration, 0, 1);
        globeAngle = globeStart + (globeEnd - globeStart) * (1 - (1 - p) ** 3); globe.quaternion.setFromAxisAngle(globeAxis, globeAngle); changed = true;
      } else if (globeAt > -Infinity && globeAngle !== globeEnd) { globeAngle = globeEnd; globe.quaternion.setFromAxisAngle(globeAxis, globeAngle); changed = true; }
      const target = targetTilt();
      if (Math.abs(tiltVelocity) > .00005 || Math.abs(tilt - target) > .00001) {
        // Stable damped spring, substepped after slow frames; pans stay vertical.
        const count = Math.max(1, Math.ceil(dt / .008)), h = dt / count;
        for (let k = 0; k < count; k++) { tiltVelocity += ((target - tilt) * 55 - tiltVelocity * 8) * h; tilt += tiltVelocity * h; }
        if (Math.abs(tiltVelocity) < .00005 && Math.abs(tilt-target) < .00001) { tilt = target; tiltVelocity = 0; }
        beam.quaternion.setFromAxisAngle(beamAxis, tilt);
        const pivot = vec(beamAt);
        for (const [g, at] of [[left, leftAt], [right, rightAt]]) g.position.copy(at).sub(pivot).applyAxisAngle(beamAxis, tilt).add(pivot);
        changed = true;
      }
      const slots = [[-.18,-.11],[.14,-.11],[-.17,.13],[.06,.15],[.25,.08]];
      weights.forEach(({g,home,bottom},i) => {
        const at = onScale[i] ? right.position.clone().add(new THREE.Vector3(slots[i][0], .055 - bottom, slots[i][1])) : home;
        if (!g.position.equals(at)) { g.position.copy(at); changed = true; }
      });
      let cacheChanged = changed;
      // Only the record spins. The hand crank remains a static mesh.
      for (const r of record) r.rotateOnAxis(new THREE.Vector3(0,1,0), -dt * 8.168);
      if (record.length) changed = true;
      if (armProgress !== armGoal) {
        armProgress = THREE.MathUtils.clamp(armProgress + (armGoal ? 1 : -1) * dt / 1.35, 0, 1);
        // First swing over the disc while lifted, then lower the needle.
        const lift = -.3 * (1 - smooth((armProgress - .55) / .45));
        const swing = .8 * (1 - smooth(armProgress / .65));
        tonearm.quaternion.setFromEuler(new THREE.Euler(lift, swing, 0, 'YZX'));
        changed = true; cacheChanged = true;
      }
      const age = t - stokeAt;
      const boost = age >= 0 && age < 7 ? Math.sin(Math.min(1, age / .38) * Math.PI / 2) * (1 - smooth((age - 3.8) / 3.2)) * (1 + .1 * Math.sin(t * 5.7) + .06 * Math.sin(t * 11.3)) : 0;
      if (fireUniform.value !== boost) { fireUniform.value = boost; changed = true; cacheChanged = true; }
      hearth.setBoost(boost); audio.fire(boost);
      const puffAge = t - inhaleAt, puff = puffAge >= 0 && puffAge < 2.2 ? Math.sin(puffAge / 2.2 * Math.PI) : 0;
      for (const e of ember) e.material.emissiveIntensity = .7 + puff * 5;
      if (motion && camera && visible(camera, cigar[0] || smoke)) {
        for (let i = 0; i < 24; i++) {
          const a = (t * .18 + i / 24) % 1, y = a * (1.1 + puff * .35);
          smokePositions[i*3] = smokeAt.x + Math.sin(t * .8 + a * 5) * .08 * a;
          smokePositions[i*3+1] = smokeAt.y + y; smokePositions[i*3+2] = smokeAt.z + Math.sin(a * 7 - t * .55) * .10 * a;
          smokeAlpha[i] = Math.sin(a * Math.PI) * (.10 + puff * .06);
        }
        smokeGeometry.attributes.position.needsUpdate = true; smokeGeometry.attributes.opacity.needsUpdate = true;
        smokeMaterial.uniforms.pixelRatio.value = renderer?.getPixelRatio() || 1; changed = true;
      }
      smoke.visible = motion;
      if (puff > 0) { changed = true; cacheChanged = true; }
      if (cacheChanged) bump();
      return changed;
    },
    dispose() { clearTimeout(fireReset); clock?.dispose(); audio.dispose(); for (const m of ownedMaterials) m.dispose(); for(const g of ownedGeometries)g.dispose(); smokeGeometry.dispose(); },
  };
  function targetTilt() { return Math.min(.15, onScale.reduce((n, on, i) => n + (on ? masses[i] : 0), 0) * .04); }
}

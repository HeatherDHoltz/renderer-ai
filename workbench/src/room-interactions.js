import * as THREE from '../vendor/three.module.js';
import { createRoomAudio } from './room-audio.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

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

export function createRoomInteractions({ car, props, metadata, lampUniform, hearth, fireUniform, liveMaterial, propMaterial }) {
  const audio = createRoomAudio(), targets = [], parts = separateParts(car, metadata), ownedMaterials = new Set();
  car.add(props);
  let revision = 0, last = null, safeProgress = 0, safeGoal = 0, safeBusy = false;
  let globeAngle = 0, globeStart = 0, globeEnd = 0, globeAt = -Infinity, globeDuration = 5;
  let gramOn = false, gramRequest = 0, gramSpeed = 0, inhaleAt = -Infinity, stokeAt = -Infinity;
  let tilt = 0, tiltVelocity = 0, crackleAt = 0, fireReset;
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
    group.traverse(o => { if (o.isMesh) { o.userData.action = action; targets.push(o); } });
  }
  const shellNames = new Set(['safe back','safe floor','safe left wall','safe right wall','safe roof']);
  assembly('Safe interior and carcass', [0,0,0], n => shellNames.has(n));
  const hinge = [-21.3965, -5.595, -5.0465];
  const safe = assembly('Safe hinged door', hinge, n => n.startsWith('safe ') && !shellNames.has(n) && !n.startsWith('safe handle ') && !n.startsWith('safe combination dial') && !n.startsWith('safe dial '));
  // Handle and dial belong to the door; their own spin axes follow its swing.
  const handle = assembly('Safe turning handle', [-20.8835, -5.8125, -3.6555], n => /^safe handle (hub|knob|spoke)/.test(n));
  safe.attach(handle);
  const handleBase = assembly('Safe handle escutcheon', hinge, n => n === 'safe handle base'); safe.attach(handleBase);
  const dial = assembly('Safe combination wheel', metadata.objects['safe combination dial'].center, n => n === 'safe combination dial' || n.startsWith('safe dial ')); safe.attach(dial);
  mark(safe, 'safe', 'Open / close the safe');
  const globe = assembly('Spinning globe', metadata.objects.globe.center, n => n === 'globe');
  const globeAxis = vec(metadata.objects.globe.axis).normalize(); mark(globe, 'globe', 'Spin the globe');
  const leftInfo = metadata.objects['balance pan -1'], rightInfo = metadata.objects['balance pan 1'];
  const leftAt = vec(leftInfo.center), rightAt = vec(rightInfo.center);
  const beamAt = metadata.objects['balance beam'].center;
  const beam = assembly('Balance rocking beam', beamAt, n => n === 'balance beam' || n === 'balance pointer');
  const direction = rightAt.clone().sub(leftAt); direction.y = 0; direction.normalize();
  const beamAxis = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
  const left = assembly('Balance left suspension', leftInfo.center, n => n === 'balance pan -1' || n.startsWith('pan wire -1'));
  const right = assembly('Balance right suspension', rightInfo.center, n => n === 'balance pan 1' || n.startsWith('pan wire 1'));
  const weights = masses.map((_, i) => {
    const body = i < 3 ? `weight ${i}.001` : `weight ${i}`;
    const g = assembly(`Clickable weight ${i}`, metadata.objects[body].center, n => n === body || n === `weight knob ${i}`);
    const home = g.position.clone(), bottom = metadata.objects[body].min[1] - home.y;
    mark(g, `weight-${i}`, 'Place / return this balance weight'); return { g, home, bottom };
  });
  // Fixed authored surfaces get bounds for picking only. Invisible materials do
  // not draw, but raycasting still sees the proxy. Main picking checks occlusion.
  const pickMaterial = new THREE.MeshBasicMaterial({ visible: false }); ownedMaterials.add(pickMaterial);
  for (const [name, info] of Object.entries(metadata.objects)) if (name.startsWith('student lamp ') || name.startsWith('fire iron ')) {
    const size = vec(info.max).sub(vec(info.min)).addScalar(.045);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), pickMaterial);
    proxy.position.copy(vec(info.center)); root.add(proxy);
    proxy.userData.action = { kind: 'room', value: name.startsWith('student') ? 'lamp' : 'poker', label: name.startsWith('student') ? 'Turn the student lamp on / off' : 'Stoke the fire' };
    targets.push(proxy);
  }
  const record = [], cigar = [], ember = [];
  props.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const replacement = propMaterial?.(o.material);
    if (replacement) { o.material = replacement; ownedMaterials.add(replacement); }
    const name = nameOf(o);
    if (name.startsWith('gramophone')) { o.userData.action = { kind: 'room', value: 'gramophone', label: 'Play / stop the gramophone' }; targets.push(o); }
    if (name === 'gramophone record' || name === 'gramophone record label') { record.push(o); o.castShadow = false; }
    if (name.startsWith('cigar') || name.startsWith('ashtray')) { o.userData.action = { kind: 'room', value: 'cigar', label: 'Draw on the cigar' }; targets.push(o); cigar.push(o); }
    if (name === 'cigar ember') { o.material = o.material.clone(); ownedMaterials.add(o.material); ember.push(o); }
  });
  const labelSource = record.find(o=>nameOf(o)==='gramophone record label');
  let labelTexture;
  if (labelSource) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const c=canvas.getContext('2d');c.fillStyle='#b99a5b';c.fillRect(0,0,512,512);
    c.strokeStyle=c.fillStyle='#342116';c.lineWidth=7;c.beginPath();c.arc(256,256,235,0,Math.PI*2);c.stroke();
    c.textAlign='center';c.font='bold 46px Georgia';c.fillText('FAURÉ',256,148);
    c.font='bold 53px Georgia';c.fillText('PIE JESU',256,232);
    c.font='27px Georgia';c.fillText('REQUIEM · OP. 48',256,293);
    c.font='22px Georgia';c.fillText('NIKIA PLAYERS',256,370);
    labelTexture=new THREE.CanvasTexture(canvas);labelTexture.colorSpace=THREE.SRGBColorSpace;
    labelSource.updateWorldMatrix(true,false);labelSource.geometry.computeBoundingSphere();
    const at=labelSource.geometry.boundingSphere.center.clone().applyMatrix4(labelSource.matrixWorld);at.y+=.004;
    const material=new THREE.MeshBasicMaterial({map:labelTexture,color:0x777777});ownedMaterials.add(material);
    const label=new THREE.Mesh(new THREE.CircleGeometry(.255,64),material);label.name='Printed gramophone label';
    label.position.copy(props.worldToLocal(at));label.rotation.x=-Math.PI/2;label.userData.action={kind:'room',value:'gramophone',label:'Play / stop the gramophone'};
    props.add(label);targets.push(label);record.push(label);labelSource.visible=false;
  }
  const smokeAt = new THREE.Vector3(-7.807, -1.135, -2.7);
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
  function state() { return { lampOn: lampUniform.value > .5, safeProgress, safeGoal, globeAngle, gramophone: gramOn, weights: onScale.slice(), tilt, fireBoost: fireUniform.value, audio: audio.state, revision }; }
  function activate(id) {
    if (id === 'lamp') { lampUniform.value = 1 - lampUniform.value; audio.sound('lamp'); bump(); return lampUniform.value ? 'Student lamp lit.' : 'Student lamp extinguished.'; }
    if (id === 'safe') { if (!safeBusy) { safeGoal = 1 - safeGoal; safeBusy = true; audio.sound('safe'); bump(); } return safeGoal ? 'Opening the safe.' : 'Closing the safe.'; }
    if (id === 'globe') { globeStart = globeAngle; globeEnd = globeAngle + Math.PI * 2 * (2 + Math.random() * 2); globeDuration = 4.5 + Math.random() * 1.5; globeAt = performance.now() / 1000; audio.sound('globe'); bump(); return 'The globe is spinning.'; }
    if (id === 'gramophone') {
      gramOn = !gramOn; const requested = gramOn, request = ++gramRequest; audio.sound('lamp');
      audio.gramophone(requested).then(ok => { if (request === gramRequest && requested && !ok && gramOn) { gramOn = false; bump(); } }); bump();
      return gramOn ? 'The gramophone is playing.' : 'Gramophone stopped.';
    }
    if (id === 'cigar') { inhaleAt = performance.now() / 1000; audio.sound('cigar'); bump(); return 'The cigar ember glows.'; }
    if (id === 'poker') { stokeAt = performance.now() / 1000; audio.sound('poker'); bump(); clearTimeout(fireReset); fireReset = setTimeout(() => { audio.fire(0); }, 7000); return 'Fire stoked.'; }
    const match = /^weight-([0-4])$/.exec(id);
    if (match) { const i = Number(match[1]); onScale[i] = !onScale[i]; audio.sound('weight'); bump(); return onScale[i] ? 'Weight placed on the scale.' : 'Weight returned to its tray.'; }
    return '';
  }
  return {
    targets, activate, audio, root,
    shadowRoots: { dressing: {root:props}, balanceBeam: {root:beam}, balanceLeft: {root:left}, balanceRight: {root:right}, ...Object.fromEntries(weights.map((w,i)=>[`weight${i}`,{root:w.g}])) },
    get revision() { return revision; },
    get moving() { return safeBusy || performance.now() / 1000 - globeAt < globeDuration || Math.abs(tiltVelocity) > .0005 || Math.abs(tilt - targetTilt()) > .0001; },
    get state() { return state(); },
    needsAnimation(camera) { return this.moving || (gramOn && visible(camera, props)) || visible(camera, cigar[0] || smoke); },
    animate(t, motion, camera, renderer) {
      const dt = last === null ? 0 : Math.min(.05, Math.max(0, t - last)); last = t;
      let changed = false;
      if (safeBusy) {
        const old = safeProgress; safeProgress = THREE.MathUtils.clamp(safeProgress + (safeGoal ? 1 : -1) * dt / 2.4, 0, 1);
        const p = safeProgress;
        safe.rotation.y = smooth((p - .22) / .78) * Math.PI * .58;
        handle.rotation.x = smooth(p / .25) * Math.PI * .65;
        dial.rotation.x = smooth(p / .20) * Math.PI * 2;
        changed ||= old !== p;
        if (p === safeGoal) { safeBusy = false; audio.sound('safe-end'); }
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
      const speedGoal = gramOn ? 1 : 0; gramSpeed += (speedGoal - gramSpeed) * (1 - Math.exp(-dt * 4));
      if (gramSpeed > .001) { for (const r of record) r.rotateOnWorldAxis(new THREE.Vector3(0,1,0), dt * 8.168 * gramSpeed); changed = true; }
      const age = t - stokeAt;
      const boost = age >= 0 && age < 7 ? Math.sin(Math.min(1, age / .38) * Math.PI / 2) * (1 - smooth((age - 3.8) / 3.2)) * (1 + .1 * Math.sin(t * 5.7) + .06 * Math.sin(t * 11.3)) : 0;
      if (fireUniform.value !== boost) { fireUniform.value = boost; changed = true; cacheChanged = true; }
      hearth.setBoost(boost); audio.fire(boost);
      if (boost > 0 && t > crackleAt) { audio.sound('crackle'); crackleAt = t + .07 + Math.random() * .16; }
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
    dispose() { clearTimeout(fireReset); labelTexture?.dispose(); audio.dispose(); for (const m of ownedMaterials) m.dispose(); smokeGeometry.dispose(); },
  };
  function targetTilt() { return Math.min(.15, onScale.reduce((n, on, i) => n + (on ? masses[i] : 0), 0) * .04); }
}

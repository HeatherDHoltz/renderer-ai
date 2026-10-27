import * as THREE from '../vendor/three.module.js';

const ease = t => { t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t); };
const nameOf = o => o.userData.name || o.name;
export function createRoomClock({ props, rig, audio, mark }) {
  if (!rig) return null;
  const find=name=>{let found;props.traverse(o=>{if(nameOf(o)===name)found=o;});if(!found)throw Error('Clock part missing: '+name);return found;};
  const root=find(rig.root),door=find(rig.door),pendulum=find(rig.pendulum);
  const hands=Object.fromEntries(Object.entries(rig.hands).map(([k,name])=>[k,{mesh:find(name),base:find(name).quaternion.clone()}]));
  const weights=[0,1].map(i=>{
    const mesh=find('replacement clock weight '+i),chain=find('replacement clock chain '+i);
    return {mesh,chain,raised:mesh.userData.raised_z,lowered:mesh.userData.lowered_z,level:0,winding:null,chargedAt:null};
  });
  const doorBase=door.quaternion.clone(),pendulumBase=pendulum.quaternion.clone();
  const axis=new THREE.Vector3(0,0,-1),hingeAxis=new THREE.Vector3(0,1,0),q=new THREE.Quaternion();
  mark(root,'clock','Look at the grandfather clock');mark(door,'clock-door','Open / close the clock door');
  weights.forEach((w,i)=>mark(w.mesh,'clock-wind-'+i,i===0?'Wind right weight (timekeeping)':'Wind left weight (chime)'));
  const pickMaterial=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
  const doorPick=new THREE.Mesh(new THREE.BoxGeometry(.24,.67,.03),pickMaterial);
  doorPick.name='Clock door window click area';doorPick.position.set(.119,-.3365,-.005);door.add(doorPick);
  mark(doorPick,'clock-door','Open / close the clock door');
  const weightPicks=weights.map((w,i)=>{
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.28,12),pickMaterial);w.mesh.add(mesh);
    mark(mesh,'clock-wind-'+i,i===0?'Wind right weight (timekeeping)':'Wind left weight (chime)');return mesh;
  });
  let doorGoal=0,doorProgress=0,doorMotion=null,runningAt=null,elapsed=0,lastHalf=Math.floor(rig.initialSeconds/1800),revision=0;
  const chargeDuration=8*24*3600;
  function activate(id) {
    const now=performance.now()/1000;
    if(id==='clock-door') {
      doorGoal=1-doorGoal;doorMotion={from:doorProgress,at:now,duration:doorGoal?1.5:.5};
      audio.sound(doorGoal?'clock-open':'clock-close');revision++;
      return doorGoal?'Opening the clock door. Wind the right weight to start it.':'Closing the clock door.';
    }
    const match=/^clock-wind-([01])$/.exec(id);
    if(match) {
      if(doorGoal!==1||doorProgress<.95)return 'Open the clock door before winding its weights.';
      const i=Number(match[1]),w=weights[i];
      if(w.winding)return 'This weight is being wound.';
      if(w.level>.995)return i===0?'The timekeeping weight is already wound.':'The chime weight is already wound.';
      w.winding={at:now,from:w.level};audio.sound('clock-wind',{group:'clock-wind-'+i});revision++;
      return i===0?'Raising the timekeeping weight. The clock will start when winding finishes.':'Raising the chime weight.';
    }
    return '';
  }
  function animate(now,camera) {
    let changed=false;
    if(doorMotion) {
      const t=THREE.MathUtils.clamp((now-doorMotion.at)/doorMotion.duration,0,1);
      doorProgress=THREE.MathUtils.lerp(doorMotion.from,doorGoal,ease(t));door.quaternion.copy(doorBase).multiply(q.setFromAxisAngle(hingeAxis,-1.75*doorProgress));changed=true;
      if(t===1)doorMotion=null;
    }
    weights.forEach((w,i)=>{
      if(w.winding) {
        const t=THREE.MathUtils.clamp((now-w.winding.at)/3.84,0,1);
        w.level=THREE.MathUtils.lerp(w.winding.from,1,ease(t));changed=true;
        if(t===1) {w.winding=null;w.chargedAt=now;if(i===0&&runningAt===null){runningAt=now-elapsed;audio.clockTick(true);}}
      } else if(w.chargedAt!==null)w.level=Math.max(0,1-(now-w.chargedAt)/chargeDuration);
      w.mesh.position.y=THREE.MathUtils.lerp(w.lowered,w.raised,w.level);
      w.chain.scale.y=(rig.chainLengthLocal+rig.weightTravelLocal*(1-w.level))/rig.chainLengthLocal;
    });
    if(runningAt!==null) {
      elapsed=now-runningAt;
      if(weights[0].level<=0){runningAt=null;audio.clockTick(false);}
      else {
        // One pendulum cycle contains a tick and a tock, about two seconds.
        pendulum.quaternion.copy(pendulumBase).multiply(q.setFromAxisAngle(axis,Math.cos(Math.PI*(elapsed-.04))*.045));
        for(const [name,h]of Object.entries(hands)) {
          const seconds=name==='second'?Math.floor(elapsed):elapsed;
          const period={second:60,minute:3600,hour:43200}[name];
          h.mesh.quaternion.copy(h.base).multiply(q.setFromAxisAngle(axis,seconds/period*Math.PI*2));
        }
        const half=Math.floor((rig.initialSeconds+elapsed)/1800);
        // Heather's recording is a half-hour melody; play it at :30 only.
        // Skip missed boundaries after a hidden tab rather than replay a queue.
        if(half!==lastHalf){if(half===lastHalf+1&&(rig.initialSeconds+elapsed)%1800<2&&half%2===1&&weights[1].level>0&&!document.hidden)audio.sound('clock-chime');lastHalf=half;}
        changed=true;
      }
    }
    if(camera){const center=root.getWorldPosition(new THREE.Vector3());center.y+=10;audio.clockDistance(camera.position.distanceTo(center));}
    if(changed)revision++;
    return changed;
  }
  return {activate,animate,root,dispose(){pickMaterial.dispose();doorPick.geometry.dispose();for(const o of weightPicks)o.geometry.dispose();},// Continuous pendulum motion uses the existing ambient 30fps cadence.
    // Only door/winding request fast interaction frames and shadow updates.
    get moving(){return !!doorMotion||weights.some(w=>w.winding);},
    get state(){return {doorGoal,doorProgress,weights:weights.map(w=>w.level),winding:weights.map(w=>!!w.winding),running:runningAt!==null,timeSeconds:rig.initialSeconds+elapsed,revision};}};
}

import { createRecordingPlayer } from './recorded-audio.js';
// Selected recordings; gramophone music/filtering supplied by Heather and Claude.
export function createRoomAudio() {
  let ctx, master, white, fireGain, gramGain, media, mediaNode, gramNoise, effects, fireEffects, trainGain, trainEffects;
  let enabled = true, playing = false, disposed = false, playbackRequest = 0;
  let trainOn = true, clockGain, clockEffects, clockTicking = false;
  const nodes = new Set();
  function init() {
    if (disposed) return false;
    if (!ctx) {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return false;
      ctx = new Audio(); master = ctx.createGain(); master.gain.value = enabled ? .55 : 0; master.connect(ctx.destination);
      white = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const d = white.getChannelData(0); let seed = 817;
      for (let i = 0; i < d.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
      fireGain = ctx.createGain(); fireGain.gain.value = .22; fireGain.connect(master);
      effects = createRecordingPlayer(ctx, master);
      fireEffects = createRecordingPlayer(ctx, fireGain);
      fireEffects.play('fire', { level: 1, loop: true });
      trainGain = ctx.createGain(); trainGain.gain.value = trainOn ? .55 : 0; trainGain.connect(master);
      trainEffects = createRecordingPlayer(ctx, trainGain);
      trainEffects.play('train', { level: 1, loop: true });
      clockGain = ctx.createGain(); clockGain.gain.value = .12; clockGain.connect(master);
      clockEffects = createRecordingPlayer(ctx, clockGain);
      for (const name of ['safe-dial', 'safe-door', 'globe', 'lamp', 'cigar', 'weight', 'poker', 'box', 'clock-open', 'clock-close', 'clock-wind', 'clock-chime'])
        effects.load(name).catch(() => {});

    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  function sound(id, { rate = 1, group = id } = {}) {
    if (!init() || !enabled) return;
    if (id === 'safe-open') {
      effects.stop('safe');
      effects.play('safe-dial', { level: .75, group: 'safe' });
      effects.play('safe-door', { level: .8, delay: 2, group: 'safe' });
    } else if (id === 'safe-close') {
      effects.stop('safe'); effects.play('safe-door', { level: .8, group: 'safe' });
    } else if (['lamp', 'weight', 'globe', 'cigar', 'poker', 'box', 'clock-open', 'clock-close', 'clock-wind', 'clock-chime'].includes(id)) {
      effects.stop(group); effects.play(id, { rate, group, level: { lamp: .65, weight: .5, globe: .6, cigar: .65, poker: .75, box: .65, 'clock-open':4.8, 'clock-close':.6, 'clock-wind':.55, 'clock-chime':1.4 }[id] });
    }
  }
  async function gramophone(on, { delay = 0 } = {}) {
    const request = ++playbackRequest;
    playing = on;
    if (!init()) return false;
    if (!media) {
      media = new Audio(new URL('../assets/railcar/audio/gramophone.mp3', import.meta.url));
      media.loop = true; media.preload = 'none';
      mediaNode = ctx.createMediaElementSource(media);
      const lo = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
      lo.type = 'lowpass'; lo.frequency.value = 3100; hi.type = 'highpass'; hi.frequency.value = 240;
      gramGain = ctx.createGain(); gramGain.gain.value = 0;
      mediaNode.connect(hi).connect(lo).connect(gramGain).connect(master);
      gramNoise = ctx.createBufferSource(); gramNoise.buffer = white; gramNoise.loop = true;
      const hiss = ctx.createGain(); hiss.gain.value = .018; gramNoise.connect(hiss).connect(gramGain); gramNoise.start(); nodes.add(gramNoise);
    }
    if (on) {
      try { await media.play(); } catch { if (request === playbackRequest) playing = false; return request === playbackRequest ? false : playing; }
      if (request !== playbackRequest) return playing;
      if (!playing) { media.pause(); return false; }
    } else media.pause();
    gramGain.gain.cancelScheduledValues(ctx.currentTime);
    gramGain.gain.setTargetAtTime(on ? .65 : 0, ctx.currentTime + (on ? delay : 0), .12);
    return playing;
  }
  return {
    sound, gramophone, unlock: init,
    clockTick(value) {
      clockTicking=!!value;
      if(!init())return;
      clockEffects.stop('clock-tick');
      // The supplied tick excerpt peaks at -39 dBFS; compensate its recording
      // level before distance attenuation (+34 dB, with headroom remaining).
      if(clockTicking)clockEffects.play('clock-tick',{level:10**(34/20),loop:true,group:'clock-tick'});
    },
    clockDistance(distance) { if(clockGain)clockGain.gain.setTargetAtTime(.035+.55/(1+(distance/30)**2),ctx.currentTime,.2); },
    setTrain(value) {
      trainOn = !!value;
      if (trainGain) trainGain.gain.setTargetAtTime(trainOn ? .55 : 0, ctx.currentTime, .15);
    },
    get enabled() { return enabled; },
    setEnabled(value) { enabled = !!value; if (!ctx) return; master.gain.setTargetAtTime(enabled ? .55 : 0, ctx.currentTime, .06); },
    fire(boost) { if (ctx && fireGain) fireGain.gain.setTargetAtTime(.22 + boost * .10, ctx.currentTime, .12); },
    get state() { return { enabled, playing, context: ctx?.state || 'unstarted', voices: nodes.size, recordings: effects?.state || [], clockTicking, clockRecordings:clockEffects?.state || [], fireRecordings: fireEffects?.state || [], trainOn, trainRecordings: trainEffects?.state || [], trainGain: trainGain?.gain.value ?? 0, mediaTime: media?.currentTime || 0, mediaDuration: Number.isFinite(media?.duration) ? media.duration : null }; },
    dispose() { disposed = true; effects?.dispose(); fireEffects?.dispose(); trainEffects?.dispose(); clockEffects?.dispose(); media?.pause(); media?.removeAttribute('src'); for (const n of nodes) { try { n.stop(); } catch {} n.disconnect(); } nodes.clear(); mediaNode?.disconnect(); ctx?.close(); },
  };
}

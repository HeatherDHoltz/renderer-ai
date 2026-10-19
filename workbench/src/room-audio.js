// Local gramophone recording plus original synthesized foley. Context starts only
// in a visitor gesture; no microphone, autoplay, audio worklet or remote request.
export function createRoomAudio() {
  let ctx, master, white, fireGain, gramGain, media, mediaNode, gramNoise;
  let enabled = true, playing = false, disposed = false, playbackRequest = 0;
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
      fireGain = ctx.createGain(); fireGain.gain.value = .009; fireGain.connect(master);
      const fire = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
      fire.buffer = white; fire.loop = true; filter.type = 'lowpass'; filter.frequency.value = 650;
      fire.connect(filter).connect(fireGain); fire.start(); nodes.add(fire);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }
  function voice(type, frequency, duration, level, offset = 0, destination = master) {
    if (!ctx || disposed) return;
    const t = ctx.currentTime + offset, gain = ctx.createGain();
    const source = type === 'noise' ? ctx.createBufferSource() : ctx.createOscillator();
    let filter;
    if (type === 'noise') { source.buffer = white; filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = .7; filter.frequency.value = frequency; source.connect(filter).connect(gain); }
    else { source.type = type; source.frequency.setValueAtTime(frequency, t); source.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * .72), t + duration); source.connect(gain); }
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(level, t + Math.min(.035, duration * .15));
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration); gain.connect(destination);
    source.onended = () => { source.disconnect(); filter?.disconnect(); gain.disconnect(); nodes.delete(source); };
    nodes.add(source); source.start(t); source.stop(t + duration + .02);
  }
  function sound(id) {
    if (!init() || !enabled) return;
    if (id === 'lamp') { voice('noise', 1700, .07, .14); voice('triangle', 430, .045, .07); }
    if (id === 'weight') { voice('sine', 2100, .22, .10); voice('sine', 3460, .10, .035); voice('noise', 550, .055, .075); }
    if (id === 'safe') {
      for (let i = 0; i < 8; i++) voice('noise', 650 + i * 90, .07, .10, i * .055);
      voice('triangle', 82, .23, .12, .35); voice('noise', 340, 1.5, .055, .45); voice('sine', 170, .8, .022, .6);
    }
    if (id === 'safe-end') { voice('noise', 240, .18, .17); voice('sine', 62, .28, .12); }
    if (id === 'globe') { for (let i = 0; i < 18; i++) voice('noise', 900 - i * 25, .12, .024 * (1 - i / 20), i * .13 + i * i * .006); }
    if (id === 'cigar') { voice('noise', 780, 1.8, .18); voice('noise', 180, 1.4, .055, .1); }
    if (id === 'poker') { voice('noise', 1250, .32, .13); voice('sine', 760, .12, .07); }
    if (id === 'crackle') voice('noise', 3200 + Math.random() * 2200, .025 + Math.random() * .045, .025 + Math.random() * .055);
  }
  async function gramophone(on) {
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
    gramGain.gain.setTargetAtTime(on ? .65 : 0, ctx.currentTime, .12);
    return playing;
  }
  return {
    sound, gramophone,
    get enabled() { return enabled; },
    setEnabled(value) { enabled = !!value; if (!ctx) return; master.gain.setTargetAtTime(enabled ? .55 : 0, ctx.currentTime, .06); },
    fire(boost) { if (ctx && fireGain) fireGain.gain.setTargetAtTime(.009 + boost * .07, ctx.currentTime, .12); },
    get state() { return { enabled, playing, context: ctx?.state || 'unstarted', voices: nodes.size, mediaTime: media?.currentTime || 0, mediaDuration: Number.isFinite(media?.duration) ? media.duration : null }; },
    dispose() { disposed = true; media?.pause(); media?.removeAttribute('src'); for (const n of nodes) { try { n.stop(); } catch {} n.disconnect(); } nodes.clear(); mediaNode?.disconnect(); ctx?.close(); },
  };
}

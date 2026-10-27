// Locally hosted, credited recordings. Decode once; cancel stale asynchronous
// starts so toggling a loop while it loads cannot leave it playing unexpectedly.
export function createRecordingPlayer(context, destination) {
  const buffers = new Map(), voices = new Set(), generations = new Map();
  let disposed = false;
  async function load(name) {
    if (!buffers.has(name)) buffers.set(name, (async () => {
      const response = await fetch(new URL(`../assets/railcar/audio/${name}.mp3`, import.meta.url));
      if (!response.ok) throw new Error(`Sound recording unavailable: ${name}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      // Three-millisecond edge ramps prevent clicks at exact excerpt/loop cuts.
      // Duration, pitch and the requested source interval remain unchanged.
      const edge = Math.min(Math.round(buffer.sampleRate * .003), Math.floor(buffer.length / 2));
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const samples = buffer.getChannelData(c);
        for (let i = 0; i < edge; i++) {
          const gain = i / edge;
          samples[i] *= gain; samples[buffer.length - 1 - i] *= gain;
        }
      }
      return buffer;
    })().catch(error => { buffers.delete(name); throw error; }));
    return buffers.get(name);
  }
  function stop(group) {
    generations.set(group, (generations.get(group) || 0) + 1);
    for (const voice of voices) if (voice.group === group) {
      try { voice.source.stop(); } catch { /* already ended */ }
    }
  }
  async function play(name, { level = .65, delay = 0, loop = false, group = name, rate = 1 } = {}) {
    const generation = generations.get(group) || 0;
    const scheduled = context.currentTime + delay;
    try {
      const buffer = await load(name);
      if (disposed || generation !== (generations.get(group) || 0)) return false;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = loop; source.playbackRate.value = rate;
      gain.gain.value = level; source.connect(gain).connect(destination);
      const voice = { source, gain, group, name }; voices.add(voice);
      source.onended = () => { source.disconnect(); gain.disconnect(); voices.delete(voice); };
      source.start(Math.max(context.currentTime, scheduled));
      return true;
    } catch (error) { console.warn(error.message); return false; }
  }
  return {
    play, stop, load,
    get state() { return [...voices].map(v => ({ name: v.name, group: v.group, loop: v.source.loop, rate: v.source.playbackRate.value, level: v.gain.gain.value, duration: v.source.buffer.duration })); },
    dispose() { disposed = true; for (const voice of voices) { try { voice.source.stop(); } catch {} } buffers.clear(); },
  };
}

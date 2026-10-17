// Optional soundscape for the railcar, synthesized with Web Audio (no audio
// files): the car's low rumble, wheels clicking over rail joints in pairs
// (two axles per bogie), and the open fire crackling. Off until the visitor
// turns it on; fades in and out.
export function createAmbience() {
  let ctx = null,
    master = null,
    timers = [],
    on = false;

  function noiseBuffer(seconds, brown) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  function start() {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // Rumble: brown noise, low-passed, slowly swaying.
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuffer(6, true);
    rumble.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 140;
    const rg = ctx.createGain();
    rg.gain.value = 0.55;
    const sway = ctx.createOscillator();
    sway.frequency.value = 0.13;
    const swayDepth = ctx.createGain();
    swayDepth.gain.value = 0.12;
    sway.connect(swayDepth).connect(rg.gain);
    rumble.connect(lp).connect(rg).connect(master);
    rumble.start();
    sway.start();
    const white = noiseBuffer(1, false);
    // A wheel striking a rail joint: a short filtered knock plus a low thump.
    function clack(t, level) {
      const s = ctx.createBufferSource();
      s.buffer = white;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900 + Math.random() * 500;
      bp.Q.value = 2.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32 * level, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      s.connect(bp).connect(g).connect(master);
      s.start(t, Math.random() * 0.5, 0.12);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.35 * level, t + 0.006);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(og).connect(master);
      o.start(t);
      o.stop(t + 0.2);
    }
    // 12 m rails at ~16 m/s: a joint every ~0.75 s, bogie axles 0.16 s apart,
    // then the far bogie of the car ~1.1 s later, slightly softer.
    let next = ctx.currentTime + 0.3;
    function schedule() {
      while (next < ctx.currentTime + 1.5) {
        const jitter = (Math.random() - 0.5) * 0.02;
        clack(next + jitter, 1);
        clack(next + 0.16 + jitter, 0.9);
        next += 0.75 + (Math.random() - 0.5) * 0.015;
      }
    }
    // The fire: sparse, bright crackles.
    function crackle() {
      const t = ctx.currentTime + Math.random() * 0.4;
      const s = ctx.createBufferSource();
      s.buffer = white;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2500 + Math.random() * 2500;
      const g = ctx.createGain();
      const level = 0.04 + Math.random() * 0.08;
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.02 + Math.random() * 0.05);
      s.connect(hp).connect(g).connect(master);
      s.start(t, Math.random() * 0.8, 0.08);
    }
    timers.push(setInterval(schedule, 400));
    timers.push(setInterval(() => Math.random() < 0.55 && crackle(), 180));
    schedule();
  }

  return {
    get on() {
      return on;
    },
    toggle() {
      on = !on;
      if (on && !ctx) start();
      if (!ctx) return on;
      if (on) ctx.resume();
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(on ? 0.6 : 0, t + 1.2);
      if (!on) setTimeout(() => !on && ctx.suspend(), 1300);
      return on;
    },
    dispose() {
      for (const t of timers) clearInterval(t);
      ctx?.close();
    },
  };
}

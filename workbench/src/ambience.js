import { createRecordingPlayer } from './recorded-audio.js';
// Heather's selected wooden steam-carriage recording, first forty seconds.
export function createAmbience() {
  let ctx, gain, player, on = false, suspendTimer;
  return {
    get on() { return on; },
    toggle() {
      on = !on; clearTimeout(suspendTimer);
      if (!ctx) {
        ctx = new AudioContext(); gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
        player = createRecordingPlayer(ctx, gain);
      }
      if (on) { ctx.resume().catch(() => {}); player.stop('train'); player.play('train', { loop: true, level: 1 }); }
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(on ? .23 : 0, ctx.currentTime, .15);
      if (!on) { player.stop('train'); suspendTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 250); }
      return on;
    },
    dispose() { clearTimeout(suspendTimer); player?.dispose(); ctx?.close(); },
  };
}

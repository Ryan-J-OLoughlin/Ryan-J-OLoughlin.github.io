// Soft glass chimes, synthesised (no files to load). Each beacon the light reaches rings one note;
// a chain of beacons climbs a pentatonic scale, so a cascade is heard as a rising phrase.
const SCALE = [0, 2, 4, 7, 9]; // major pentatonic: any notes together sound consonant
const BASE = 392; // G4

let ctx = null,
  out = null;
function unlock() {
  if (ctx) return ctx.state === "suspended" && ctx.resume();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = 0.35;
  // a little room: a short feedback delay, low-passed
  const dly = ctx.createDelay(),
    fb = ctx.createGain(),
    lp = ctx.createBiquadFilter();
  dly.delayTime.value = 0.19;
  fb.gain.value = 0.28;
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  out.connect(ctx.destination);
  out.connect(dly);
  dly.connect(lp);
  lp.connect(fb);
  fb.connect(dly);
  lp.connect(ctx.destination);
}
// audio may only start from a user gesture
for (const ev of ["pointerdown", "keydown"])
  addEventListener(ev, unlock, { passive: true });

let muted = false;
export const setMuted = (m) => (muted = m);

// step: position in a chain (0 = a lone beacon); big: a great beacon
export function chime(step = 0, big = false) {
  if (!ctx || muted || ctx.state !== "running") return;
  const n = SCALE[step % 5] + 12 * Math.floor(step / 5),
    f = BASE * Math.pow(2, Math.min(n, 26) / 12),
    t0 = ctx.currentTime + 0.01,
    dur = big ? 3.2 : 1.6;
  // a glassy bell: the fundamental plus two slightly inharmonic partials
  for (const [m, a] of [
    [1, 0.5],
    [2.76, 0.14],
    [5.4, 0.05],
  ]) {
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f * m;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(a * (big ? 1 : 0.8), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur / m ** 0.5);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }
  if (big) chime(step + 2); // a great beacon rings a fifth above as well
}

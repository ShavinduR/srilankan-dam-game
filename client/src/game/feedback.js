// Tiny audio/haptic helpers (no assets needed).
let ctx;
export function beep(freq = 660, ms = 120) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* audio not available */ }
}
export const vibrate = (pattern) => navigator.vibrate?.(pattern);

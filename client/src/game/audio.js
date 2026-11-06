/**
 * Global audio manager: sound effects, looping background music and a single
 * Mute/Unmute switch (remembered on the device).
 *
 * Files live in client/public/sounds/ — replace move.mp3, capture.mp3 or bgm.mp3
 * with your own MP3s of the same name to change the sounds.
 *
 * - SFX use the Web Audio API (low latency on phones, can overlap). If a file
 *   can't be loaded we fall back to a synthesized beep, so the game never breaks.
 * - Music uses one looping <audio> element, paused while the app is in the background.
 * - Browsers only allow audio after a user tap, so everything is "unlocked" on the
 *   first pointer/key press.
 */
import { useSyncExternalStore } from 'react';

const SFX_FILES = { move: '/sounds/move.mp3', capture: '/sounds/capture.mp3' };
const MUSIC_FILE = '/sounds/bgm.mp3';
const MUSIC_VOLUME = 0.35;
const STORAGE_KEY = 'dam.muted';

let muted = typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
const listeners = new Set();

let ctx = null;
const buffers = {};          // name -> AudioBuffer | null (null = failed → use beep)
let music = null;            // HTMLAudioElement
let musicWanted = false;     // a game is on screen and wants music

const hasWindow = typeof window !== 'undefined';

function getCtx() {
  if (!ctx && hasWindow) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}

async function loadSfx(name) {
  if (name in buffers) return buffers[name];
  buffers[name] = null;
  try {
    const c = getCtx();
    const res = await fetch(SFX_FILES[name]);
    if (!res.ok) throw new Error(res.status);
    buffers[name] = await c.decodeAudioData(await res.arrayBuffer());
  } catch {
    buffers[name] = null; // keep null → beep fallback
  }
  return buffers[name];
}

/** Simple synthesized tone (fallback + UI blips). Respects mute. */
export function beep(freq = 660, ms = 120, volume = 0.08) {
  if (muted) return;
  try {
    const c = getCtx();
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq; g.gain.value = volume;
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + ms / 1000);
  } catch { /* no audio available */ }
}

/** Play a sound effect: 'move' | 'capture'. */
export async function playSfx(name) {
  if (muted || !SFX_FILES[name]) return;
  const c = getCtx();
  if (!c) return;
  const buf = buffers[name] === undefined ? await loadSfx(name) : buffers[name];
  if (muted) return;
  if (!buf) { beep(name === 'capture' ? 330 : 600, 60); return; }
  const src = c.createBufferSource();
  const gain = c.createGain();
  gain.gain.value = 0.9;
  src.buffer = buf;
  src.connect(gain).connect(c.destination);
  src.start();
}

function ensureMusic() {
  if (!music && hasWindow) {
    music = new Audio(MUSIC_FILE);
    music.loop = true;
    music.preload = 'auto';
    music.volume = MUSIC_VOLUME;
  }
  return music;
}

function syncMusic() {
  const m = ensureMusic();
  if (!m) return;
  const shouldPlay = musicWanted && !muted && document.visibilityState === 'visible';
  if (shouldPlay && m.paused) m.play().catch(() => { /* waits for the next tap (autoplay policy) */ });
  else if (!shouldPlay && !m.paused) m.pause();
}

/** Start the looping background music (call when a game starts). */
export function startMusic() { musicWanted = true; syncMusic(); }
/** Stop the music and rewind (call when the game ends / player leaves). */
export function stopMusic() {
  musicWanted = false;
  if (music) { music.pause(); music.currentTime = 0; }
}

export const isMuted = () => muted;
export function setMuted(value) {
  muted = !!value;
  try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
  syncMusic();
  listeners.forEach((l) => l());
}
export const toggleMuted = () => setMuted(!muted);

/** React hook: [muted, toggle] — re-renders every component when it changes. */
export function useMuted() {
  const value = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => muted,
    () => muted,
  );
  return [value, toggleMuted];
}

if (hasWindow) {
  // Unlock audio on the first interaction, and retry music that autoplay blocked.
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume();
    Object.keys(SFX_FILES).forEach(loadSfx);
    syncMusic();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
  // Pause music when the app goes to the background (phone lock, switching apps).
  document.addEventListener('visibilitychange', syncMusic);
}

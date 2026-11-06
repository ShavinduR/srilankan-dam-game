/**
 * Lifetime player stats, stored only on this device (localStorage — no database).
 * Online and vs-computer games count; Pass & Play doesn't (both players share the phone).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'dam.stats.v1';
const SEEN_KEY = 'dam.stats.recorded';
const EMPTY = { played: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, online: 0, ai: 0, lastPlayedAt: null };
const listeners = new Set();

function read() {
  try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...EMPTY }; }
}
let cache = read();

/**
 * Record one finished game. `gameKey` makes it idempotent (a reload of the game-over
 * screen won't count the same game twice).
 * @param {'win'|'loss'|'draw'} result
 * @param {'online'|'ai'} mode
 */
export function recordResult(result, mode, gameKey) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    if (gameKey && seen.includes(gameKey)) return;
    if (gameKey) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, gameKey].slice(-30)));
  } catch { /* ignore */ }
  const s = read();
  s.played += 1;
  s[mode] = (s[mode] || 0) + 1;
  if (result === 'win') { s.wins += 1; s.streak += 1; s.bestStreak = Math.max(s.bestStreak, s.streak); }
  else if (result === 'loss') { s.losses += 1; s.streak = 0; }
  else { s.draws += 1; }
  s.lastPlayedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full / private mode */ }
  cache = s;
  listeners.forEach((l) => l());
}

export function resetStats() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(SEEN_KEY); } catch { /* ignore */ }
  cache = { ...EMPTY };
  listeners.forEach((l) => l());
}

export const winRate = (s) => (s.played ? Math.round((s.wins / s.played) * 100) : 0);

/** React hook → live stats object. */
export function useStats() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => cache,
    () => cache,
  );
}

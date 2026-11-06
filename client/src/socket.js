import { io } from 'socket.io-client';

// VITE_SERVER_URL is baked in at BUILD time (set it in Vercel → Environment Variables).
// Unset → same origin (Vite proxies /socket.io in dev; Express serves the build in single-server mode).
const SERVER_URL = import.meta.env.VITE_SERVER_URL?.replace(/\/+$/, '') || undefined;

if (import.meta.env.PROD && !SERVER_URL && location.hostname.endsWith('vercel.app')) {
  console.warn('[dam] VITE_SERVER_URL is not set — the game cannot reach the Socket.IO server.');
}

/**
 * Stable id for THIS tab. Survives reloads and network drops (sessionStorage), so after a
 * reconnect the server gives us our seat back. A new tab = a new player (handy for testing).
 */
function getPlayerId() {
  const KEY = 'dam.playerId';
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `p${Date.now()}${Math.random().toString(36).slice(2)}`;
  }
}

export const playerId = getPlayerId();

// Connect right away: resumes a game after a reload, and wakes a sleeping Render server
// while the player is still on the home screen.
export const socket = io(SERVER_URL, {
  auth: { playerId },
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 60000, // Render free instances can take ~50s to wake up
});

import { io } from 'socket.io-client';

// VITE_SERVER_URL is baked in at BUILD time (set it in Vercel → Environment Variables).
// Unset → same origin (Vite proxies /socket.io in dev; Express serves the build in single-server mode).
const SERVER_URL = import.meta.env.VITE_SERVER_URL?.replace(/\/+$/, '') || undefined;

if (import.meta.env.PROD && !SERVER_URL && location.hostname.endsWith('vercel.app')) {
  console.warn('[dam] VITE_SERVER_URL is not set — the game cannot reach the Socket.IO server.');
}

export const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnectionDelayMax: 5000,
  timeout: 60000, // Render free instances can take ~50s to wake up
});

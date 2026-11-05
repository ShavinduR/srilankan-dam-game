import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { createRoomManager, rooms } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
// CLIENT_ORIGIN: comma-separated list of allowed frontend origins (no trailing slash).
// Entries may contain '*' wildcards, e.g. "https://dam-*.vercel.app" for Vercel preview URLs.
// Unset → allow any origin (fine for local dev).
const allowed = (process.env.CLIENT_ORIGIN || '')
  .split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
  .map((s) => (s.includes('*') ? new RegExp('^' + s.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$') : s));

const io = new Server(server, {
  cors: { origin: allowed.length ? allowed : '*' },
  pingInterval: 20000,
  pingTimeout: 20000,
});

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// In production the server also serves the built PWA (client/dist).
const dist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  // API-only mode (e.g. Render, with the frontend on Vercel).
  app.get('/', (_req, res) => res.type('text').send('Dam Socket.IO server is running.'));
}

io.on('connection', createRoomManager(io));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Dam server listening on port ${PORT}`);
  console.log(`CORS origins: ${allowed.length ? allowed.join(', ') : '* (any)'}`);
});

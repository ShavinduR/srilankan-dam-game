/**
 * Game server: matchmaking, private rooms (DAM-4821 codes), game state, turn timers,
 * reconnection grace period, reactions. Everything lives in memory (no database):
 * a server restart clears all rooms.
 *
 * Identity: every browser tab sends a random `playerId` in the Socket.IO handshake
 * (`auth.playerId`). Sockets come and go (mobile networks!), the playerId stays —
 * that's what lets a player reclaim their seat after reconnecting.
 */
import { randomUUID } from 'node:crypto';
import {
  createGame, applyMove, applyBlow, endGame, opponent, isValidSize,
  WHITE, BLACK, DEFAULT_SIZE, TURN_LIMIT_MS, WARNING_AFTER_MS, NUDGE_AFTER_MS, DRAW_QUIET_TURNS,
} from '../shared/damEngine.js';
import { getReaction, REACTION_COOLDOWN_MS } from '../shared/reactions.js';

// Overridable only to speed up automated tests; production uses 60s.
export const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS) || 60_000;
const LOBBY_TTL_MS = 30 * 60_000;      // an unused private room code expires after 30 min

/** roomId -> Room (a match between two seated players) */
export const rooms = new Map();
/** playerId -> { roomId } — which room a player is seated in */
const seats = new Map();
/** size -> { playerId, socketId, name } — public matchmaking, one queue per board size */
const queue = new Map();
/** code -> { code, size, host: { playerId, socketId, name, connected }, expires, timer } */
const lobbies = new Map();

const COLORS = [WHITE, BLACK];
const cleanName = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Guest';
const validPos = (p, size) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n) && n >= 0 && n < size);
const pickSize = (s) => (isValidSize(Number(s)) ? Number(s) : DEFAULT_SIZE);
const validPlayerId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

/** "dam-4821", "4821", " DAM 4821 " → "DAM-4821" (or null). */
export function normalizeCode(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.length === 4 ? `DAM-${digits}` : null;
}

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const code = `DAM-${1000 + Math.floor(Math.random() * 9000)}`;
    if (!lobbies.has(code) && ![...rooms.values()].some((r) => r.code === code)) return code;
  }
  throw new Error('No free room codes');
}

export function createRoomManager(io) {
  const sendError = (socket, message) => socket.emit('errorMsg', message);
  const socketOf = (seat) => (seat?.socketId ? io.sockets.sockets.get(seat.socketId) : null);

  // ------------------------------------------------------------------ state broadcast

  function publicRoom(room) {
    const seat = (c) => room.seats[c] && {
      name: room.seats[c].name,
      connected: room.seats[c].connected,
      graceEndsAt: room.seats[c].graceEndsAt,
    };
    return {
      roomId: room.id,
      code: room.code,
      gameNo: room.gameNo,       // increments on every rematch (stats count each game once)
      players: { w: seat(WHITE), b: seat(BLACK) },
      size: room.size,
      game: room.game,
      turnStartedAt: room.turnStartedAt,
      pausedAt: room.pausedAt,
      serverNow: Date.now(),
      turnLimitMs: TURN_LIMIT_MS,
      warningAfterMs: WARNING_AFTER_MS,
      nudgeAfterMs: NUDGE_AFTER_MS,
      drawQuietTurns: DRAW_QUIET_TURNS,
      reconnectGraceMs: RECONNECT_GRACE_MS,
      drawOfferBy: room.drawOfferBy,
      rematchVotes: [...room.rematchVotes],
    };
  }
  const emitState = (room) => io.to(room.id).emit('state', publicRoom(room));

  // ------------------------------------------------------------------ turn clock (pausable)

  function scheduleTimeout(room, ms) {
    clearTimeout(room.timer);
    if (room.game.winner) return;
    const { turn } = room.game;
    const gameNo = room.gameNo;
    room.timer = setTimeout(() => {
      if (room.game.winner || room.game.turn !== turn || room.gameNo !== gameNo || room.pausedAt) return;
      finish(room, opponent(turn), 'timeout');
    }, Math.max(0, ms));
  }

  function startTurnClock(room) {
    room.turnStartedAt = Date.now();
    room.nudgedThisTurn = false;
    if (room.pausedAt) { room.pausedAt = room.turnStartedAt; return; } // stays paused
    scheduleTimeout(room, TURN_LIMIT_MS);
  }

  function pauseClock(room) {
    if (room.pausedAt || room.game.winner) return;
    room.pausedAt = Date.now();
    clearTimeout(room.timer);
  }

  function resumeClock(room) {
    if (!room.pausedAt) return;
    const now = Date.now();
    room.turnStartedAt += now - room.pausedAt;  // the paused time doesn't count
    room.pausedAt = null;
    scheduleTimeout(room, TURN_LIMIT_MS - (now - room.turnStartedAt));
  }

  // ------------------------------------------------------------------ room lifecycle

  function finish(room, winner, reason) {
    clearTimeout(room.timer);
    room.pausedAt = null;
    room.game = endGame(room.game, winner, reason);
    room.drawOfferBy = null;
    room.rematchVotes.clear();
    emitState(room);
  }

  function destroyRoom(room) {
    clearTimeout(room.timer);
    for (const c of COLORS) {
      const s = room.seats[c];
      clearTimeout(s?.graceTimer);
      if (s && seats.get(s.playerId)?.roomId === room.id) seats.delete(s.playerId);
    }
    rooms.delete(room.id);
  }

  function destroyIfEmpty(room) {
    if (!COLORS.some((c) => room.seats[c]?.connected)) destroyRoom(room);
  }

  function matchFoundPayload(room, color, extra = {}) {
    return {
      roomId: room.id, code: room.code, color, size: room.size,
      opponent: room.seats[opponent(color)].name, ...extra,
    };
  }

  /** Seat two players and start the first game. `w` moves first. */
  function startRoom({ w, b, size, code = null }) {
    const room = {
      id: randomUUID().slice(0, 8),
      code,
      size,
      seats: {
        w: { playerId: w.playerId, name: w.name, socketId: w.socketId, connected: true, graceEndsAt: null },
        b: { playerId: b.playerId, name: b.name, socketId: b.socketId, connected: true, graceEndsAt: null },
      },
      game: createGame(size),
      gameNo: 1,
      timer: null,
      turnStartedAt: Date.now(),
      pausedAt: null,
      drawOfferBy: null,
      rematchVotes: new Set(),
      nudgedThisTurn: false,
    };
    rooms.set(room.id, room);
    for (const c of COLORS) {
      const seat = room.seats[c];
      seats.set(seat.playerId, { roomId: room.id });
      const s = socketOf(seat);
      if (s) s.join(room.id); else markDisconnected(room, c);
      s?.emit('matchFound', matchFoundPayload(room, c));
    }
    startTurnClock(room);
    if (COLORS.some((c) => !room.seats[c].connected)) pauseClock(room);
    emitState(room);
    return room;
  }

  // ------------------------------------------------------------------ disconnect / reconnect

  function markDisconnected(room, color) {
    const seat = room.seats[color];
    seat.connected = false;
    seat.socketId = null;
    if (room.game.winner) return;
    pauseClock(room);
    seat.graceEndsAt = Date.now() + RECONNECT_GRACE_MS;
    clearTimeout(seat.graceTimer);
    seat.graceTimer = setTimeout(() => {
      seat.graceTimer = null;
      if (seat.connected || room.game.winner || !rooms.has(room.id)) return;
      seat.graceEndsAt = null;
      finish(room, opponent(color), 'disconnect');      // didn't come back in time → forfeit
      destroyIfEmpty(room);
    }, RECONNECT_GRACE_MS);
  }

  function reclaimSeat(socket, room, color) {
    const seat = room.seats[color];
    const old = socketOf(seat);
    if (old && old.id !== socket.id) { old.emit('sessionReplaced'); old.leave(room.id); }
    clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.graceEndsAt = null;
    seat.connected = true;
    seat.socketId = socket.id;
    socket.join(room.id);
    socket.emit('matchFound', matchFoundPayload(room, color, { resumed: true }));
    if (COLORS.every((c) => room.seats[c].connected)) resumeClock(room);
    socket.to(room.id).emit('opponentReconnected');
    emitState(room);
  }

  // ------------------------------------------------------------------ helpers for handlers

  /** Room + colour for the socket's player, or null. Ignores stale sockets. */
  function ctx(socket) {
    const pid = socket.data.playerId;
    const room = rooms.get(seats.get(pid)?.roomId);
    if (!room) return null;
    const color = COLORS.find((c) => room.seats[c]?.playerId === pid);
    if (!color || room.seats[color].socketId !== socket.id) return null;
    return { room, color };
  }

  function dequeue(playerId) {
    for (const [size, w] of queue) if (w.playerId === playerId) queue.delete(size);
  }

  function closeLobby(code) {
    const l = lobbies.get(code);
    if (!l) return;
    clearTimeout(l.timer);
    lobbies.delete(code);
  }
  function lobbyOf(playerId) {
    for (const l of lobbies.values()) if (l.host.playerId === playerId) return l;
    return null;
  }

  /** Leave whatever the player is doing (queue, lobby, room). Leaving an active game = resign. */
  function leaveEverything(socket, reason = 'left') {
    const pid = socket.data.playerId;
    dequeue(pid);
    const lobby = lobbyOf(pid);
    if (lobby) closeLobby(lobby.code);
    const room = rooms.get(seats.get(pid)?.roomId);
    if (!room) return;
    const color = COLORS.find((c) => room.seats[c]?.playerId === pid);
    seats.delete(pid);
    socket.leave(room.id);
    if (!color) return;
    const seat = room.seats[color];
    clearTimeout(seat.graceTimer);
    seat.connected = false;
    seat.left = true;
    seat.socketId = null;
    seat.graceEndsAt = null;
    if (!room.game.winner) finish(room, opponent(color), reason);
    io.to(room.id).emit('opponentLeft', { reason });
    emitState(room);
    destroyIfEmpty(room);
  }

  // ------------------------------------------------------------------ connection

  return function onConnection(socket) {
    const authId = socket.handshake.auth?.playerId;
    socket.data.playerId = validPlayerId(authId) ? authId : `anon-${socket.id}`;
    const pid = socket.data.playerId;

    // Reconnecting player? Give them their seat back.
    const existing = rooms.get(seats.get(pid)?.roomId);
    if (existing) {
      const color = COLORS.find((c) => existing.seats[c]?.playerId === pid);
      if (color && !existing.seats[color].left) reclaimSeat(socket, existing, color);
    }
    // Host of a private room reconnecting? Keep the room code alive.
    const lobby = lobbyOf(pid);
    if (lobby) {
      lobby.host.socketId = socket.id;
      lobby.host.connected = true;
      socket.emit('roomCreated', { code: lobby.code, size: lobby.size });
    }

    // ---------------- public matchmaking
    socket.on('findMatch', ({ name, size } = {}) => {
      leaveEverything(socket);
      const boardSize = pickSize(size);
      const me = { playerId: pid, socketId: socket.id, name: cleanName(name) };
      const host = queue.get(boardSize);
      if (!host || !io.sockets.sockets.get(host.socketId) || host.playerId === pid) {
        queue.set(boardSize, me);
        socket.emit('waiting', { size: boardSize });
        return;
      }
      queue.delete(boardSize);
      startRoom({ w: host, b: me, size: boardSize }); // first in queue plays White
    });

    socket.on('cancelMatch', () => {
      dequeue(pid);
      const l = lobbyOf(pid);
      if (l) closeLobby(l.code);
    });

    // ---------------- private rooms (WhatsApp invites)
    socket.on('createRoom', ({ name, size } = {}) => {
      leaveEverything(socket);
      const code = newCode();
      const lobby = {
        code,
        size: pickSize(size),
        host: { playerId: pid, socketId: socket.id, name: cleanName(name), connected: true },
        expires: Date.now() + LOBBY_TTL_MS,
      };
      lobby.timer = setTimeout(() => {
        const s = io.sockets.sockets.get(lobby.host.socketId);
        s?.emit('roomExpired', { code });
        closeLobby(code);
      }, LOBBY_TTL_MS);
      lobbies.set(code, lobby);
      socket.emit('roomCreated', { code, size: lobby.size });
    });

    socket.on('joinRoom', ({ name, code } = {}) => {
      const c = normalizeCode(code);
      const lobby = c && lobbies.get(c);
      if (!lobby) {
        const inPlay = c && [...rooms.values()].some((r) => r.code === c && !r.game.winner);
        return socket.emit('joinError', {
          code: c,
          message: inPlay ? 'That game has already started.' : 'Room not found. Check the code — it may have expired.',
        });
      }
      if (lobby.host.playerId === pid) return socket.emit('roomCreated', { code: lobby.code, size: lobby.size });
      leaveEverything(socket);
      closeLobby(lobby.code);
      startRoom({
        w: lobby.host,  // the host (who sent the invite) moves first
        b: { playerId: pid, socketId: socket.id, name: cleanName(name) },
        size: lobby.size,
        code: lobby.code,
      });
    });

    // ---------------- gameplay
    socket.on('move', ({ from, to } = {}) => {
      const c = ctx(socket);
      if (!c || !validPos(from, c.room.size) || !validPos(to, c.room.size)) return;
      const { room, color } = c;
      if (room.pausedAt) { emitState(room); return sendError(socket, 'Waiting for your opponent to reconnect…'); }
      if (room.game.turn !== color) return sendError(socket, 'Not your turn.');
      const res = applyMove(room.game, from, to);
      if (!res.ok) { emitState(room); return sendError(socket, res.error); }
      room.game = res.state;
      room.drawOfferBy = null; // making a move implicitly declines a pending offer
      if (room.game.winner) return finish(room, room.game.winner, room.game.endReason);
      if (res.turnEnded) startTurnClock(room);
      emitState(room);
    });

    socket.on('blow', ({ pos } = {}) => {
      const c = ctx(socket);
      if (!c || !validPos(pos, c.room.size)) return;
      const { room, color } = c;
      if (room.pausedAt) { emitState(room); return sendError(socket, 'Waiting for your opponent to reconnect…'); }
      if (room.game.turn !== color) return sendError(socket, 'Not your turn.');
      const res = applyBlow(room.game, pos);
      if (!res.ok) return sendError(socket, res.error);
      room.game = res.state;
      io.to(room.id).emit('blown', { pos, by: color });
      if (room.game.winner) return finish(room, room.game.winner, room.game.endReason);
      emitState(room);
    });

    socket.on('nudge', () => {
      const c = ctx(socket);
      if (!c) return;
      const { room, color } = c;
      if (room.game.winner || room.pausedAt || room.game.turn === color || room.nudgedThisTurn) return;
      if (Date.now() - room.turnStartedAt < NUDGE_AFTER_MS) return;
      room.nudgedThisTurn = true;
      io.to(room.id).emit('nudged', { by: color });
    });

    // Quick-chat reaction: relayed to BOTH players (sender included) so both screens show it.
    socket.on('reaction', ({ id } = {}) => {
      const c = ctx(socket);
      const reaction = getReaction(id);
      if (!c || !reaction) return;
      const now = Date.now();
      if (now - (socket.data.lastReactionAt || 0) < REACTION_COOLDOWN_MS) return; // anti-spam
      socket.data.lastReactionAt = now;
      io.to(c.room.id).emit('reaction', {
        id: reaction.id, by: c.color, name: c.room.seats[c.color].name, at: now,
      });
    });

    socket.on('resign', () => {
      const c = ctx(socket);
      if (!c || c.room.game.winner) return;
      finish(c.room, opponent(c.color), 'resign');
    });

    socket.on('offerDraw', () => {
      const c = ctx(socket);
      if (!c || c.room.game.winner || c.room.pausedAt || c.room.drawOfferBy) return;
      c.room.drawOfferBy = c.color;
      emitState(c.room);
    });

    socket.on('respondDraw', ({ accept } = {}) => {
      const c = ctx(socket);
      if (!c || c.room.game.winner) return;
      const { room, color } = c;
      if (!room.drawOfferBy || room.drawOfferBy === color) return;
      if (accept) return finish(room, 'draw', 'draw-agreed');
      room.drawOfferBy = null;
      io.to(room.id).emit('drawDeclined');
      emitState(room);
    });

    socket.on('rematch', () => {
      const c = ctx(socket);
      if (!c || !c.room.game.winner) return;
      const { room, color } = c;
      if (!COLORS.every((k) => room.seats[k].connected)) {
        return sendError(socket, 'Opponent has left. Find a new match.');
      }
      room.rematchVotes.add(color);
      if (room.rematchVotes.size === 2) {
        // Swap colours so the other player moves first this time.
        room.seats = { w: room.seats.b, b: room.seats.w };
        room.game = createGame(room.size); // rematch keeps the board size
        room.gameNo++;
        room.drawOfferBy = null;
        room.rematchVotes.clear();
        for (const k of COLORS) socketOf(room.seats[k])?.emit('matchFound', matchFoundPayload(room, k));
        startTurnClock(room);
      }
      emitState(room);
    });

    socket.on('leaveRoom', () => leaveEverything(socket, 'left'));

    socket.on('disconnect', () => {
      // Public queue: drop (the client re-queues itself when it reconnects).
      const q = [...queue.entries()].find(([, w]) => w.socketId === socket.id);
      if (q) queue.delete(q[0]);
      // Private room host: keep the code alive for the grace period.
      const l = lobbyOf(pid);
      if (l && l.host.socketId === socket.id) {
        l.host.connected = false;
        setTimeout(() => { if (!l.host.connected && lobbies.get(l.code) === l) closeLobby(l.code); }, RECONNECT_GRACE_MS);
      }
      // In a game: pause + grace period instead of an instant loss.
      const room = rooms.get(seats.get(pid)?.roomId);
      if (!room) return;
      const color = COLORS.find((c) => room.seats[c]?.playerId === pid);
      if (!color || room.seats[color].socketId !== socket.id) return; // an older, replaced socket
      markDisconnected(room, color);
      emitState(room);
      if (room.game.winner) destroyIfEmpty(room);
    });
  };
}

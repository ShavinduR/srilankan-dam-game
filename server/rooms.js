import { randomUUID } from 'node:crypto';
import {
  createGame, applyMove, applyBlow, endGame, opponent,
  WHITE, BLACK, TURN_LIMIT_MS, NUDGE_AFTER_MS,
} from '../shared/damEngine.js';

/** In-memory store. Everything is lost on restart — fine for the MVP. */
export const rooms = new Map();      // roomId -> Room
export const socketRoom = new Map(); // socketId -> roomId
let waiting = null;                  // { socketId, name } — single matchmaking queue

const cleanName = (n) => String(n ?? '').trim().slice(0, 20) || 'Guest';
const validPos = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n) && n >= 0 && n < 12);

export function createRoomManager(io) {
  const emitState = (room) => io.to(room.id).emit('state', publicRoom(room));
  const sendError = (socket, message) => socket.emit('errorMsg', message);

  function publicRoom(room) {
    return {
      roomId: room.id,
      players: {
        w: room.players.w && { name: room.players.w.name, connected: room.players.w.connected },
        b: room.players.b && { name: room.players.b.name, connected: room.players.b.connected },
      },
      game: room.game,
      turnStartedAt: room.turnStartedAt,
      serverNow: Date.now(),
      turnLimitMs: TURN_LIMIT_MS,
      nudgeAfterMs: NUDGE_AFTER_MS,
      drawOfferBy: room.drawOfferBy,
      rematchVotes: [...room.rematchVotes],
    };
  }

  function colorOf(room, socketId) {
    if (room.players.w?.socketId === socketId) return WHITE;
    if (room.players.b?.socketId === socketId) return BLACK;
    return null;
  }

  function startTurnClock(room) {
    clearTimeout(room.timer);
    room.turnStartedAt = Date.now();
    room.nudgedThisTurn = false;
    if (room.game.winner) return;
    const turnAtStart = room.game.turn;
    room.timer = setTimeout(() => {
      if (room.game.winner || room.game.turn !== turnAtStart) return;
      finish(room, opponent(turnAtStart), 'timeout');
    }, TURN_LIMIT_MS);
  }

  function finish(room, winner, reason) {
    clearTimeout(room.timer);
    room.game = endGame(room.game, winner, reason);
    room.drawOfferBy = null;
    room.rematchVotes.clear();
    emitState(room);
  }

  function newMatch(room) {
    room.game = createGame();
    room.drawOfferBy = null;
    room.rematchVotes.clear();
    startTurnClock(room);
    emitState(room);
  }

  /** Common guard for in-game actions. */
  function ctx(socket) {
    const room = rooms.get(socketRoom.get(socket.id));
    if (!room) return null;
    return { room, color: colorOf(room, socket.id) };
  }

  function leave(socket, reason = 'left') {
    if (waiting?.socketId === socket.id) waiting = null;
    const roomId = socketRoom.get(socket.id);
    socketRoom.delete(socket.id);
    const room = rooms.get(roomId);
    if (!room) return;
    const color = colorOf(room, socket.id);
    socket.leave(room.id);
    if (color) room.players[color].connected = false;
    if (!room.game.winner && color) finish(room, opponent(color), 'disconnect');
    io.to(room.id).emit('opponentLeft', { reason });
    emitState(room);
    // Destroy the room once nobody is left connected.
    const anyone = [WHITE, BLACK].some((c) => room.players[c]?.connected);
    if (!anyone) { clearTimeout(room.timer); rooms.delete(room.id); }
  }

  return function onConnection(socket) {
    socket.on('findMatch', ({ name } = {}) => {
      if (socketRoom.has(socket.id)) leave(socket);
      const me = { socketId: socket.id, name: cleanName(name) };
      const other = waiting && io.sockets.sockets.get(waiting.socketId);
      if (!other || waiting.socketId === socket.id) {
        waiting = me;
        socket.emit('waiting');
        return;
      }
      const host = waiting;
      waiting = null;
      const room = {
        id: randomUUID().slice(0, 8),
        players: {
          w: { ...host, connected: true },  // first in queue plays White (moves first)
          b: { ...me, connected: true },
        },
        game: createGame(),
        timer: null,
        turnStartedAt: Date.now(),
        drawOfferBy: null,
        rematchVotes: new Set(),
        nudgedThisTurn: false,
      };
      rooms.set(room.id, room);
      for (const [color, p] of Object.entries(room.players)) {
        const s = io.sockets.sockets.get(p.socketId);
        s.join(room.id);
        socketRoom.set(p.socketId, room.id);
        s.emit('matchFound', { roomId: room.id, color, opponent: room.players[opponent(color)].name });
      }
      startTurnClock(room);
      emitState(room);
    });

    socket.on('cancelMatch', () => {
      if (waiting?.socketId === socket.id) waiting = null;
    });

    socket.on('move', ({ from, to } = {}) => {
      const c = ctx(socket);
      if (!c || !validPos(from) || !validPos(to)) return;
      const { room, color } = c;
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
      if (!c || !validPos(pos)) return;
      const { room, color } = c;
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
      if (room.game.winner || room.game.turn === color || room.nudgedThisTurn) return;
      if (Date.now() - room.turnStartedAt < NUDGE_AFTER_MS) return;
      room.nudgedThisTurn = true;
      io.to(room.id).emit('nudged', { by: color });
    });

    socket.on('resign', () => {
      const c = ctx(socket);
      if (!c || c.room.game.winner || !c.color) return;
      finish(c.room, opponent(c.color), 'resign');
    });

    socket.on('offerDraw', () => {
      const c = ctx(socket);
      if (!c || c.room.game.winner || !c.color || c.room.drawOfferBy) return;
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
      if (!c || !c.room.game.winner || !c.color) return;
      const { room, color } = c;
      if (![WHITE, BLACK].every((k) => room.players[k].connected)) {
        return sendError(socket, 'Opponent has left. Find a new match.');
      }
      room.rematchVotes.add(color);
      if (room.rematchVotes.size === 2) {
        // Swap colours so the other player moves first this time.
        const { w, b } = room.players;
        room.players = { w: b, b: w };
        for (const k of [WHITE, BLACK]) {
          io.sockets.sockets.get(room.players[k].socketId)?.emit('matchFound', {
            roomId: room.id, color: k, opponent: room.players[opponent(k)].name,
          });
        }
        return newMatch(room);
      }
      emitState(room);
    });

    socket.on('leaveRoom', () => leave(socket, 'left'));
    socket.on('disconnect', () => leave(socket, 'disconnected'));
  };
}

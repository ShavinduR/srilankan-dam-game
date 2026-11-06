import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { applyMove, applyBlow } from '../game/engine.js';
import { beep, vibrate } from '../game/feedback.js';
import { useReactionFeed } from './useReactionFeed.js';

/**
 * Online controller. The SERVER is authoritative; we apply moves optimistically
 * with the shared engine for snappy UI, then the next 'state' event overwrites us.
 *
 * phase: 'idle' | 'searching' (public queue) | 'lobby' (private room, waiting for friend)
 *        | 'joining' (joining a friend's room) | 'playing'
 */
export function useOnlineGame(onToast) {
  const [phase, setPhase] = useState('idle');
  const [myColor, setMyColor] = useState(null);
  const [room, setRoom] = useState(null);
  const [lobby, setLobby] = useState(null);           // { code, size }
  const [clockOffset, setClockOffset] = useState(0);
  const [connected, setConnected] = useState(socket.connected);
  const [searchStartedAt, setSearchStartedAt] = useState(null);
  const roomRef = useRef(room);
  roomRef.current = room;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const searchRef = useRef(null);                      // { name, size } to re-queue after a reconnect
  const toast = useRef(onToast);
  toast.current = onToast;
  const [reactions, pushReaction] = useReactionFeed();

  useEffect(() => {
    const handlers = {
      connect: () => {
        setConnected(true);
        // The server drops queued players whose socket disconnected → queue again.
        if (phaseRef.current === 'searching' && searchRef.current) socket.emit('findMatch', searchRef.current);
      },
      disconnect: () => setConnected(false),
      waiting: () => setPhase('searching'),
      roomCreated: (l) => { setLobby(l); setPhase('lobby'); },
      roomExpired: () => { toast.current?.('Your room code expired. Create a new one.', 'error'); setPhase('idle'); setLobby(null); },
      joinError: ({ message }) => { toast.current?.(message, 'error'); setPhase('idle'); },
      matchFound: ({ color, resumed }) => {
        setMyColor(color);
        setPhase('playing');
        setLobby(null);
        searchRef.current = null;
        if (resumed) toast.current?.('✅ Reconnected — game resumed!');
        else beep(880);
      },
      state: (r) => { setClockOffset(r.serverNow - Date.now()); setRoom(r); },
      nudged: ({ by }) => {
        if (by === roomRef.current?.game.turn) return;
        toast.current?.('👉 අදින්න! Your opponent is waiting — make your move!', 'nudge');
        vibrate([200, 100, 200]); beep(520, 250);
      },
      blown: () => vibrate(150), // the capture sound is played by GameScreen
      reaction: (r) => { pushReaction(r); beep(880, 50, 0.05); },
      opponentReconnected: () => toast.current?.('✅ Your opponent is back!'),
      drawDeclined: () => toast.current?.('Draw offer declined.'),
      opponentLeft: () => toast.current?.('Opponent left the game.'),
      sessionReplaced: () => {
        toast.current?.('This game was opened in another tab.', 'error');
        setPhase('idle'); setRoom(null);
      },
      errorMsg: (m) => toast.current?.(m, 'error'),
    };
    for (const [e, h] of Object.entries(handlers)) socket.on(e, h);
    return () => { for (const [e, h] of Object.entries(handlers)) socket.off(e, h); };
  }, [pushReaction]);

  const ensureConnected = () => { if (!socket.connected) socket.connect(); };

  const findMatch = useCallback((name, size) => {
    ensureConnected();
    searchRef.current = { name, size };
    setSearchStartedAt(Date.now());
    setPhase('searching');
    socket.emit('findMatch', { name, size });
  }, []);

  const createRoom = useCallback((name, size) => {
    ensureConnected();
    socket.emit('createRoom', { name, size });
    setLobby(null);
    setPhase('lobby');
  }, []);

  const joinRoom = useCallback((name, code) => {
    ensureConnected();
    setPhase('joining');
    socket.emit('joinRoom', { name, code });
  }, []);

  /** Cancel searching / close the lobby / leave the game (leaving an active game = resign). */
  const leave = useCallback(() => {
    socket.emit(phaseRef.current === 'playing' ? 'leaveRoom' : 'cancelMatch');
    searchRef.current = null;
    setPhase('idle'); setRoom(null); setMyColor(null); setLobby(null);
  }, []);

  const optimistic = (fn) => {
    const r = roomRef.current;
    if (!r || r.pausedAt || !socket.connected) return { ok: false };
    const res = fn(r.game);
    if (res.ok) setRoom({ ...r, game: res.state });
    return res;
  };

  const ctrl = room && phase === 'playing' && {
    mode: 'online',
    gameKey: `online#${room.roomId}#${room.gameNo ?? 1}`,
    roomCode: room.code,
    game: room.game,
    myColor,
    players: room.players,
    turnStartedAt: room.turnStartedAt,
    pausedAt: room.pausedAt,
    clockOffset,
    connected,
    nudgeAfterMs: room.nudgeAfterMs,
    turnLimitMs: room.turnLimitMs,
    warningAfterMs: room.warningAfterMs,
    drawQuietTurns: room.drawQuietTurns,
    drawOfferBy: room.drawOfferBy,
    rematchVotes: room.rematchVotes,
    move: (from, to) => {
      const res = optimistic((g) => applyMove(g, from, to));
      if (res.ok) socket.emit('move', { from, to });
      return res;
    },
    blow: (pos) => {
      const res = optimistic((g) => applyBlow(g, pos));
      if (res.ok) socket.emit('blow', { pos });
      return res;
    },
    nudge: () => socket.emit('nudge'),
    reactions,
    react: (id) => socket.emit('reaction', { id }), // server echoes it to both players
    resign: () => socket.emit('resign'),
    offerDraw: () => socket.emit('offerDraw'),
    respondDraw: (accept) => socket.emit('respondDraw', { accept }),
    rematch: () => socket.emit('rematch'),
  };

  return { phase, ctrl, lobby, connected, searchStartedAt, findMatch, createRoom, joinRoom, leave };
}

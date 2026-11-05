import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket.js';
import { applyMove, applyBlow } from '../game/engine.js';
import { beep, vibrate } from '../game/feedback.js';

/**
 * Online controller. The SERVER is authoritative; we apply moves optimistically
 * with the shared engine for snappy UI, then the next 'state' event overwrites us.
 */
export function useOnlineGame(onToast) {
  const [phase, setPhase] = useState('idle'); // idle | waiting | playing
  const [myColor, setMyColor] = useState(null);
  const [room, setRoom] = useState(null);
  const [clockOffset, setClockOffset] = useState(0);
  const roomRef = useRef(room);
  roomRef.current = room;
  const toast = useRef(onToast);
  toast.current = onToast;

  useEffect(() => {
    const handlers = {
      waiting: () => setPhase('waiting'),
      matchFound: ({ color }) => { setMyColor(color); setPhase('playing'); beep(880); },
      state: (r) => { setClockOffset(r.serverNow - Date.now()); setRoom(r); },
      nudged: ({ by }) => {
        if (by === roomRef.current?.game.turn) return;
        toast.current?.('👉 අදින්න! Your opponent is waiting — make your move!', 'nudge');
        vibrate([200, 100, 200]); beep(520, 250);
      },
      blown: () => { vibrate(150); beep(220, 200); },
      drawDeclined: () => toast.current?.('Draw offer declined.'),
      opponentLeft: () => toast.current?.('Opponent left the room.'),
      errorMsg: (m) => toast.current?.(m, 'error'),
      disconnect: () => toast.current?.('Connection lost — reconnecting…', 'error'),
    };
    for (const [e, h] of Object.entries(handlers)) socket.on(e, h);
    return () => { for (const [e, h] of Object.entries(handlers)) socket.off(e, h); };
  }, []);

  const findMatch = useCallback((name, size) => {
    if (!socket.connected) socket.connect();
    socket.emit('findMatch', { name, size });
    setPhase('waiting');
  }, []);

  const leave = useCallback(() => {
    socket.emit(phase === 'waiting' ? 'cancelMatch' : 'leaveRoom');
    setPhase('idle'); setRoom(null); setMyColor(null);
  }, [phase]);

  const optimistic = (fn) => {
    const r = roomRef.current;
    if (!r) return { ok: false };
    const res = fn(r.game);
    if (res.ok) setRoom({ ...r, game: res.state });
    return res;
  };

  const ctrl = room && {
    mode: 'online',
    game: room.game,
    myColor,
    players: room.players,
    turnStartedAt: room.turnStartedAt,
    clockOffset,
    nudgeAfterMs: room.nudgeAfterMs,
    turnLimitMs: room.turnLimitMs,
    warningAfterMs: room.warningAfterMs,
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
    resign: () => socket.emit('resign'),
    offerDraw: () => socket.emit('offerDraw'),
    respondDraw: (accept) => socket.emit('respondDraw', { accept }),
    rematch: () => socket.emit('rematch'),
  };

  return { phase, ctrl, findMatch, leave };
}

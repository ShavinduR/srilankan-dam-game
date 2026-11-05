import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, applyMove, applyBlow, endGame, opponent, TURN_LIMIT_MS, NUDGE_AFTER_MS } from '../game/engine.js';

/**
 * Pass-and-play on one device. Pure local React state driven by the shared engine.
 * Exposes the same controller shape as useOnlineGame so <GameScreen> doesn't care.
 */
export function useLocalGame() {
  const [game, setGame] = useState(createGame);
  const [turnStartedAt, setTurnStartedAt] = useState(Date.now());
  const [drawOfferBy, setDrawOfferBy] = useState(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  // Reset the turn clock whenever the side to move changes.
  useEffect(() => setTurnStartedAt(Date.now()), [game.turn, game.winner === null]);

  // 60s forfeit.
  useEffect(() => {
    if (game.winner) return;
    const left = TURN_LIMIT_MS - (Date.now() - turnStartedAt);
    const id = setTimeout(() => {
      const g = gameRef.current;
      if (!g.winner) setGame(endGame(g, opponent(g.turn), 'timeout'));
    }, Math.max(0, left));
    return () => clearTimeout(id);
  }, [turnStartedAt, game.winner]);

  const move = useCallback((from, to) => {
    const res = applyMove(gameRef.current, from, to);
    if (res.ok) { setGame(res.state); setDrawOfferBy(null); }
    return res;
  }, []);

  const blow = useCallback((pos) => {
    const res = applyBlow(gameRef.current, pos);
    if (res.ok) setGame(res.state);
    return res;
  }, []);

  return {
    mode: 'local',
    game,
    myColor: null, // null = whoever's turn it is controls the board
    players: { w: { name: 'White', connected: true }, b: { name: 'Black', connected: true } },
    turnStartedAt,
    clockOffset: 0,
    nudgeAfterMs: NUDGE_AFTER_MS,
    turnLimitMs: TURN_LIMIT_MS,
    drawOfferBy,
    rematchVotes: [],
    move,
    blow,
    nudge: () => {},
    resign: () => setGame((g) => endGame(g, opponent(g.turn), 'resign')),
    offerDraw: () => setDrawOfferBy(gameRef.current.turn),
    respondDraw: (accept) => {
      if (accept) setGame((g) => endGame(g, 'draw', 'draw-agreed'));
      setDrawOfferBy(null);
    },
    rematch: () => { setGame(createGame()); setDrawOfferBy(null); },
  };
}

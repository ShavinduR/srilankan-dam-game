import { useCallback, useEffect, useRef, useState } from 'react';
import { useReactionFeed } from './useReactionFeed.js';
import { beep } from '../game/feedback.js';
import { requestAiTurn, aiAcceptsDraw, DIFFICULTY_LABEL } from '../game/aiClient.js';
import {
  createGame, applyMove, applyBlow, endGame, opponent, countPieces,
  TURN_LIMIT_MS, WARNING_AFTER_MS, NUDGE_AFTER_MS, DRAW_QUIET_TURNS,
} from '../game/engine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TIP_KEY = 'dam.tips.blow';

/**
 * Games on this device, driven by the shared engine:
 *   - Pass & Play: two people share the phone (`ai` = null)
 *   - vs Computer: `ai` = { difficulty }; the human plays White and moves first
 * Exposes the same controller shape as useOnlineGame so <GameScreen> doesn't care.
 */
export function useLocalGame(size, { ai = null, playerName = '', notify } = {}) {
  const [game, setGame] = useState(() => createGame(size));
  const [gameId, setGameId] = useState(() => Date.now());
  const [turnStartedAt, setTurnStartedAt] = useState(Date.now());
  const [drawOfferBy, setDrawOfferBy] = useState(null);
  const [reactions, pushReaction] = useReactionFeed();
  const gameRef = useRef(game);
  gameRef.current = game;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const aiColor = ai ? 'b' : null;
  const humanColor = ai ? 'w' : null;
  const aiName = ai ? `Computer (${DIFFICULTY_LABEL[ai.difficulty]})` : null;

  const aiSay = useCallback((id, chance = 1) => {
    if (!ai || Math.random() > chance) return;
    pushReaction({ id, by: aiColor, name: 'Computer', at: Date.now() });
  }, [ai, aiColor, pushReaction]);

  // Reset the turn clock whenever the side to move changes.
  useEffect(() => setTurnStartedAt(Date.now()), [game.turn, game.winner === null, gameId]);

  // 90s forfeit.
  useEffect(() => {
    if (game.winner) return;
    const left = TURN_LIMIT_MS - (Date.now() - turnStartedAt);
    const id = setTimeout(() => {
      const g = gameRef.current;
      if (!g.winner) setGame(endGame(g, opponent(g.turn), 'timeout'));
    }, Math.max(0, left));
    return () => clearTimeout(id);
  }, [turnStartedAt, game.winner]);

  // 🤖 Computer's turn: think (in a worker), then play the turn step by step.
  useEffect(() => {
    if (!ai || game.winner || game.turn !== aiColor) return;
    let cancelled = false;
    (async () => {
      const startedWith = gameRef.current;
      await sleep(450 + Math.random() * 450);  // feels like thinking, even when it's instant
      const decision = await requestAiTurn(startedWith, ai.difficulty);
      if (cancelled) return;
      let s = gameRef.current;
      if (decision.blow) {
        const r = applyBlow(s, decision.blow);
        if (r.ok) { s = r.state; setGame(s); notifyRef.current?.('💨 The computer BLEW your piece — you skipped a capture!'); }
        await sleep(650);
        if (cancelled) return;
      }
      const before = countPieces(s.board)[humanColor];
      for (let i = 0; i < decision.steps.length; i++) {
        const [from, to] = decision.steps[i];
        const r = applyMove(s, from, to);
        if (!r.ok) break;              // shouldn't happen — the engine validated it
        s = r.state;
        setGame(s);
        if (i < decision.steps.length - 1) { await sleep(420); if (cancelled) return; }
      }
      const took = before - countPieces(s.board)[humanColor];
      if (s.winner === aiColor) aiSay('elakiri', 0.9);
      else if (took >= 2) aiSay('elakiri', 0.6);
      // Easy mode skipped a capture on purpose → teach the Blow rule (first few times).
      if (decision.missedCapture && ai.difficulty === 'easy' && !s.winner) {
        const shown = Number(localStorage.getItem(TIP_KEY) || 0);
        if (shown < 3) {
          localStorage.setItem(TIP_KEY, String(shown + 1));
          setTimeout(() => notifyRef.current?.('💡 The computer missed a capture! Tap its glowing red piece to BLOW it — before you move.', 'tip'), 500);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ai, aiColor, humanColor, game.turn, game.winner, gameId, aiSay]);

  const move = useCallback((from, to) => {
    if (ai && gameRef.current.turn === aiColor) return { ok: false, error: 'Wait for the computer.' };
    const before = gameRef.current;
    const res = applyMove(before, from, to);
    if (res.ok) {
      setGame(res.state);
      setDrawOfferBy(null);
      if (ai && res.turnEnded && res.state.lastMove?.captured?.length >= 2) aiSay('ayyo', 0.5); // you got a double!
      if (ai && res.state.winner === humanColor) aiSay('ayyo', 0.8);
    }
    return res;
  }, [ai, aiColor, humanColor, aiSay]);

  const blow = useCallback((pos) => {
    const res = applyBlow(gameRef.current, pos);
    if (res.ok) { setGame(res.state); if (ai) aiSay('ayyo', 0.7); }
    return res;
  }, [ai, aiSay]);

  const rematch = useCallback(() => {
    setGame(createGame(size));
    setGameId(Date.now());
    setDrawOfferBy(null);
  }, [size]);

  return {
    mode: ai ? 'ai' : 'local',
    gameKey: `local#${gameId}`,
    game,
    myColor: humanColor,   // null in Pass & Play = whoever's turn it is controls the board
    players: ai
      ? { w: { name: playerName || 'You', connected: true }, b: { name: aiName, connected: true } }
      : { w: { name: 'White', connected: true }, b: { name: 'Black', connected: true } },
    turnStartedAt,
    clockOffset: 0,
    pausedAt: null,
    connected: true,
    nudgeAfterMs: NUDGE_AFTER_MS,
    turnLimitMs: TURN_LIMIT_MS,
    warningAfterMs: WARNING_AFTER_MS,
    drawQuietTurns: DRAW_QUIET_TURNS,
    drawOfferBy,
    rematchVotes: [],
    move,
    blow,
    nudge: () => {},
    reactions,
    react: (id) => {
      const by = ai ? humanColor : gameRef.current.turn;
      pushReaction({ id, by, name: ai ? (playerName || 'You') : (by === 'w' ? 'White' : 'Black'), at: Date.now() });
      beep(880, 50, 0.05);
      if (ai) setTimeout(() => aiSay(Math.random() < 0.5 ? 'hoo' : 'baya', 0.4), 900);
    },
    resign: () => setGame((g) => endGame(g, ai ? aiColor : opponent(g.turn), 'resign')),
    offerDraw: () => {
      const offeredBy = ai ? humanColor : gameRef.current.turn;
      setDrawOfferBy(offeredBy);
      if (ai) {
        setTimeout(() => {
          const g = gameRef.current;
          if (g.winner) return;
          if (aiAcceptsDraw(g, aiColor)) setGame(endGame(g, 'draw', 'draw-agreed'));
          else { notifyRef.current?.('🤖 The computer declined the draw.'); aiSay('baya', 0.5); }
          setDrawOfferBy(null);
        }, 900);
      }
    },
    respondDraw: (accept) => {
      if (accept) setGame((g) => endGame(g, 'draw', 'draw-agreed'));
      setDrawOfferBy(null);
    },
    rematch,
  };
}

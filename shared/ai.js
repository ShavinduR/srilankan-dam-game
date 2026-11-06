/**
 * Computer opponent for Sri Lankan Dam. Pure functions (runs in a Web Worker on the client,
 * and in node for tests).
 *
 * The AI thinks in whole TURNS: a turn is an optional Blow followed by every step of a move
 * (a simple move, or a full multi-jump chain).
 *
 *   chooseAiTurn(state, 'easy' | 'medium' | 'hard') → { blow: [r,c] | null, steps: [[from,to], …] }
 *
 * Difficulty:
 *   easy   – random-ish; SKIPS an available capture ~40% of the time (so the player can learn
 *            to BLOW it) and only blows the player's pieces half the time.
 *   medium – 2-ply search (its move + the reply) with a little randomness.
 *   hard   – iterative-deepening alpha-beta search on a time budget.
 */
import { applyMove, applyBlow, getLegalMoves, opponent, WHITE } from './damEngine.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];
const WIN = 1_000_000;
const MAN = 100;
const KING = 320;
export const EASY_MISS_CAPTURE_RATE = 0.4;

// ---------------------------------------------------------------- move generation

/** Every complete turn (incl. full jump chains) for the side to move. */
export function generateTurns(state) {
  const out = [];
  const n = state.board.length;
  const dfs = (st, from, move, steps, captured) => {
    const res = applyMove(st, from, move.to);
    if (!res.ok) return;
    const nextSteps = [...steps, [from, move.to]];
    const nextCaptured = captured + (move.captured ? 1 : 0);
    if (!res.turnEnded && !res.state.winner && res.state.chainFrom) {
      const cont = getLegalMoves(res.state, res.state.chainFrom);
      if (cont.length) {
        for (const m of cont) dfs(res.state, res.state.chainFrom, m, nextSteps, nextCaptured);
        return;
      }
    }
    out.push({ steps: nextSteps, state: res.state, captured: nextCaptured });
  };
  if (state.chainFrom) {
    for (const m of getLegalMoves(state, state.chainFrom)) dfs(state, state.chainFrom, m, [], 0);
    return out;
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (state.board[r][c]?.color !== state.turn) continue;
      for (const m of getLegalMoves(state, [r, c])) dfs(state, [r, c], m, [], 0);
    }
  }
  return out;
}

/** The opponent piece worth blowing most (kings first). */
function bestBlowTarget(state) {
  if (!state.blowCandidates?.length || state.hasMovedThisTurn || state.blowUsed) return null;
  let best = null;
  for (const p of state.blowCandidates) {
    const piece = state.board[p[0]][p[1]];
    if (!piece) continue;
    if (!best || (piece.king && !state.board[best[0]][best[1]].king)) best = p;
  }
  return best;
}

function withBlow(state, pos) {
  if (!pos) return state;
  const r = applyBlow(state, pos);
  return r.ok ? r.state : state;
}

// ---------------------------------------------------------------- evaluation

/** Static evaluation from `color`'s point of view. */
export function evaluate(state, color) {
  if (state.winner) return state.winner === 'draw' ? 0 : state.winner === color ? WIN : -WIN;
  const n = state.board.length;
  const mid = (n - 1) / 2;
  let score = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      let v;
      if (p.king) v = KING;
      else {
        const advanced = p.color === WHITE ? n - 1 - r : r;       // rows travelled from home
        v = MAN + advanced * 4;
        if (c === 0 || c === n - 1) v += 4;                       // edge men are hard to capture
        if (advanced === 0) v += 6;                               // back row guards promotion
      }
      v += Math.round(6 - Math.abs(c - mid) - Math.abs(r - mid) * 0.5); // centre control
      score += p.color === color ? v : -v;
    }
  }
  // A pending Blow is almost a free capture for whoever is about to move.
  if (state.blowCandidates?.length && !state.hasMovedThisTurn && !state.blowUsed) {
    score += state.turn === color ? MAN * 0.9 : -MAN * 0.9;
  }
  return score;
}

// ---------------------------------------------------------------- search

class Timeout extends Error {}

function negamax(state, depth, alpha, beta, color, ctx) {
  if (++ctx.nodes % 512 === 0 && Date.now() > ctx.deadline) throw new Timeout();
  if (state.winner || depth === 0) {
    const v = evaluate(state, color);
    return Math.abs(v) >= WIN ? v + (v > 0 ? depth : -depth) : v; // prefer faster wins
  }
  const s = withBlow(state, bestBlowTarget(state));
  if (s.winner) return negamax(s, 0, alpha, beta, color, ctx);
  const turns = generateTurns(s).sort((a, b) => b.captured - a.captured);
  if (!turns.length) return evaluate(s, color);
  let best = -Infinity;
  for (const t of turns) {
    const v = -negamax(t.state, depth - 1, -beta, -alpha, opponent(color), ctx);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function scoreRoot(turns, depth, color, ctx) {
  return turns.map((t) => ({ t, v: -negamax(t.state, depth - 1, -Infinity, Infinity, opponent(color), ctx) }));
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// ---------------------------------------------------------------- public API

/**
 * Decide the computer's whole turn.
 * @returns {{ blow: number[] | null, steps: number[][][], missedCapture: boolean }}
 */
export function chooseAiTurn(state, difficulty = 'medium', { rng = Math.random, timeBudgetMs = 800 } = {}) {
  const color = state.turn;
  const level = DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';

  // 1) Blow?
  let blow = bestBlowTarget(state);
  if (blow && level === 'easy' && rng() < 0.5) blow = null; // easy doesn't always notice
  const s = withBlow(state, blow);
  if (s.winner) return { blow, steps: [], missedCapture: false };

  const turns = generateTurns(s);
  if (!turns.length) return { blow, steps: [], missedCapture: false };
  const captures = turns.filter((t) => t.captured > 0);
  const quiet = turns.filter((t) => t.captured === 0);
  const result = (t) => ({ blow, steps: t.steps, missedCapture: captures.length > 0 && t.captured === 0 });

  // 2) Easy: deliberately miss captures sometimes → teaches the Blow rule.
  if (level === 'easy') {
    if (captures.length && quiet.length && rng() < EASY_MISS_CAPTURE_RATE) return result(pick(quiet, rng));
    if (captures.length) {
      const most = Math.max(...captures.map((t) => t.captured));
      return result(pick(captures.filter((t) => t.captured === most), rng));
    }
    // Prefer moves that don't hand over a piece immediately (but not always).
    const safe = quiet.filter((t) => !generateTurns(t.state).some((r) => r.captured > 0));
    return result(pick(safe.length && rng() < 0.7 ? safe : quiet, rng));
  }

  if (turns.length === 1) return result(turns[0]);

  // 3) Medium: shallow search + noise.
  if (level === 'medium') {
    const ctx = { nodes: 0, deadline: Infinity }; // depth 2 is always fast
    const scored = scoreRoot(turns, 2, color, ctx).map((x) => ({ ...x, v: x.v + (rng() - 0.5) * 30 }));
    const top = Math.max(...scored.map((x) => x.v));
    return result(pick(scored.filter((x) => x.v >= top - 8), rng).t);
  }

  // 4) Hard: iterative deepening alpha-beta within the time budget.
  const ctx = { nodes: 0, deadline: Date.now() + timeBudgetMs };
  let best = scoreRoot(turns, 1, color, { nodes: 0, deadline: Infinity });
  for (let depth = 2; depth <= 8; depth++) {
    try {
      // search the previous best first for better pruning
      best.sort((a, b) => b.v - a.v);
      best = scoreRoot(best.map((x) => x.t), depth, color, ctx);
    } catch (e) {
      if (e instanceof Timeout) break;
      throw e;
    }
    if (Date.now() > ctx.deadline) break;
  }
  const top = Math.max(...best.map((x) => x.v));
  return result(pick(best.filter((x) => x.v === top), rng).t);
}

/** Should the computer accept a draw offer? Only when it isn't ahead. */
export function aiAcceptsDraw(state, aiColor) {
  return evaluate(state, aiColor) <= 40;
}

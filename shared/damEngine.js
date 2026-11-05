/**
 * Sri Lankan "Dam" rules engine — pure functions, no I/O.
 * Imported by BOTH the React client (local play + move hints) and the
 * Node server (authoritative validation). Never mutates input state.
 *
 * Supports 12x12 and 10x10 boards. The size is read from the board itself
 * (board.length), so every game carries its own size.
 *
 * Coordinates: row 0 is the top (Black's home), row size-1 is the bottom (White's home).
 * Dark (playable) squares: (row + col) % 2 === 1.
 */

export const BOARD_SIZES = [12, 10];
export const DEFAULT_SIZE = 12;
export const WHITE = 'w';
export const BLACK = 'b';
export const TURN_LIMIT_MS = 90_000;     // 1m30s per turn, then the player loses
export const WARNING_AFTER_MS = 60_000;  // "You will lose in 30 seconds!"
export const NUDGE_AFTER_MS = 30_000;

const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export const opponent = (color) => (color === WHITE ? BLACK : WHITE);
export const isDark = (r, c) => (r + c) % 2 === 1;
export const isValidSize = (n) => BOARD_SIZES.includes(n);
/** Rows of pieces per side: always leaves exactly 2 empty rows in the middle (12→5, 10→4). */
export const rowsPerSide = (size) => (size - 2) / 2;
export const inBounds = (r, c, size) => r >= 0 && r < size && c >= 0 && c < size;
/** White moves "up" (row decreasing), Black moves "down". */
export const forwardDir = (color) => (color === WHITE ? -1 : 1);
export const promotionRow = (color, size) => (color === WHITE ? 0 : size - 1);
export const samePos = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

export function createInitialBoard(size = DEFAULT_SIZE) {
  if (!isValidSize(size)) throw new Error(`Unsupported board size: ${size}`);
  const rows = rowsPerSide(size);
  const board = Array.from({ length: size }, () => Array(size).fill(null));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isDark(r, c)) continue;
      if (r < rows) board[r][c] = { color: BLACK, king: false };
      else if (r >= size - rows) board[r][c] = { color: WHITE, king: false };
    }
  }
  return board;
}

export function createGame(size = DEFAULT_SIZE) {
  return {
    size,
    board: createInitialBoard(size),
    turn: WHITE,
    chainFrom: null,        // [r,c] when a multi-jump is in progress (must keep jumping)
    hasMovedThisTurn: false,
    blowCandidates: [],     // opponent pieces the current player may "blow" this turn
    blowUsed: false,
    capturersAtStart: null, // own pieces that had a capture when the turn's first move was made
    lastMove: null,         // { from, to, captured: [[r,c]...] }
    lastBlow: null,         // { pos, by }
    moveCount: 0,
    winner: null,           // 'w' | 'b' | 'draw' | null
    endReason: null,        // 'no-pieces' | 'no-moves' | 'timeout' | 'resign' | 'draw-agreed' | 'disconnect'
  };
}

const cloneBoard = (board) => board.map((row) => row.map((p) => (p ? { ...p } : null)));

/** All capture moves for the piece at [r,c]. Returns [{ to, captured }]. */
export function getCaptures(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const n = board.length;
  const out = [];
  for (const [dr, dc] of DIAGONALS) {
    if (piece.king) {
      // Flying king: slide over empties, hit exactly one enemy, land on any empty square beyond.
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc, n) && !board[rr][cc]) { rr += dr; cc += dc; }
      if (!inBounds(rr, cc, n) || board[rr][cc].color === piece.color) continue;
      const victim = [rr, cc];
      rr += dr; cc += dc;
      while (inBounds(rr, cc, n) && !board[rr][cc]) {
        out.push({ to: [rr, cc], captured: victim });
        rr += dr; cc += dc;
      }
    } else {
      // Man: jumps an adjacent enemy, forward OR backward.
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (!inBounds(lr, lc, n)) continue;
      const mid = board[mr][mc];
      if (mid && mid.color !== piece.color && !board[lr][lc]) {
        out.push({ to: [lr, lc], captured: [mr, mc] });
      }
    }
  }
  return out;
}

/** Non-capturing moves for the piece at [r,c]. */
export function getSimpleMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const n = board.length;
  const out = [];
  if (piece.king) {
    for (const [dr, dc] of DIAGONALS) {
      let rr = r + dr, cc = c + dc;
      while (inBounds(rr, cc, n) && !board[rr][cc]) {
        out.push({ to: [rr, cc], captured: null });
        rr += dr; cc += dc;
      }
    }
  } else {
    const dr = forwardDir(piece.color);
    for (const dc of [-1, 1]) {
      const rr = r + dr, cc = c + dc;
      if (inBounds(rr, cc, n) && !board[rr][cc]) out.push({ to: [rr, cc], captured: null });
    }
  }
  return out;
}

/** Positions of every piece of `color` that currently has a capture available. */
export function findCapturers(board, color) {
  const list = [];
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board.length; c++)
      if (board[r][c]?.color === color && getCaptures(board, r, c).length) list.push([r, c]);
  return list;
}

/**
 * Legal moves for the piece at `from` given the full game state.
 * NOTE: captures are NOT mandatory (street rule) — a missed capture is punished via the Blow.
 * The only hard constraint: during a multi-jump chain the same piece must keep capturing.
 */
export function getLegalMoves(state, from) {
  if (state.winner) return [];
  const [r, c] = from;
  const piece = state.board[r]?.[c];
  if (!piece || piece.color !== state.turn) return [];
  if (state.chainFrom) {
    return samePos(state.chainFrom, from) ? getCaptures(state.board, r, c) : [];
  }
  return [...getCaptures(state.board, r, c), ...getSimpleMoves(state.board, r, c)];
}

export function hasAnyMove(board, color) {
  for (let r = 0; r < board.length; r++)
    for (let c = 0; c < board.length; c++)
      if (board[r][c]?.color === color &&
          (getCaptures(board, r, c).length || getSimpleMoves(board, r, c).length)) return true;
  return false;
}

export function countPieces(board) {
  const n = { w: 0, b: 0, wk: 0, bk: 0 };
  for (const row of board) for (const p of row) if (p) { n[p.color]++; if (p.king) n[p.color + 'k']++; }
  return n;
}

/** If `color` has no pieces or no moves, the other side wins. */
function checkElimination(state, color) {
  const n = countPieces(state.board);
  if (n[color] === 0) return { ...state, winner: opponent(color), endReason: 'no-pieces' };
  if (!hasAnyMove(state.board, color)) return { ...state, winner: opponent(color), endReason: 'no-moves' };
  return state;
}

function endTurn(state, blowCandidatesForNext) {
  const next = {
    ...state,
    turn: opponent(state.turn),
    chainFrom: null,
    hasMovedThisTurn: false,
    blowCandidates: blowCandidatesForNext,
    blowUsed: false,
    capturersAtStart: null,
  };
  return checkElimination(next, next.turn);
}

/**
 * Apply one step (a simple move OR a single jump). Returns { ok, state, error, turnEnded }.
 */
export function applyMove(state, from, to) {
  if (state.winner) return { ok: false, error: 'Game is over.' };
  const legal = getLegalMoves(state, from).find((m) => samePos(m.to, to));
  if (!legal) return { ok: false, error: 'Illegal move.' };

  // Snapshot which of our pieces could capture BEFORE the first step of the turn.
  const capturersAtStart = state.capturersAtStart ?? findCapturers(state.board, state.turn);

  const board = cloneBoard(state.board);
  const piece = board[from[0]][from[1]];
  board[from[0]][from[1]] = null;
  board[to[0]][to[1]] = piece;
  if (legal.captured) board[legal.captured[0]][legal.captured[1]] = null;

  const prevCaptured = state.chainFrom && state.lastMove ? state.lastMove.captured : [];
  let s = {
    ...state,
    board,
    capturersAtStart,
    hasMovedThisTurn: true,
    blowCandidates: [],          // the blow window closes the moment we move
    moveCount: state.moveCount + 1,
    lastMove: {
      from: state.chainFrom && state.lastMove ? state.lastMove.from : from,
      to,
      captured: legal.captured ? [...prevCaptured, legal.captured] : [],
    },
  };

  // Promotion: a man reaching the far row becomes a Dam (king) and the turn ends immediately.
  const promoted = !piece.king && to[0] === promotionRow(piece.color, board.length);
  if (promoted) piece.king = true;

  if (legal.captured) {
    if (!promoted && getCaptures(board, to[0], to[1]).length) {
      s = { ...s, chainFrom: to }; // must continue jumping
      return { ok: true, state: checkElimination(s, opponent(s.turn)), turnEnded: false };
    }
    return { ok: true, state: endTurn(s, []), turnEnded: true };
  }

  // Non-capturing move. Did the player ignore an available capture? → opponent may Blow.
  const missed = capturersAtStart.map((p) => (samePos(p, from) ? to : p));
  return { ok: true, state: endTurn(s, missed), turnEnded: true };
}

/** Current player removes ("blows") an opponent piece that missed a capture last turn. */
export function applyBlow(state, pos) {
  if (state.winner) return { ok: false, error: 'Game is over.' };
  if (state.hasMovedThisTurn || state.blowUsed) return { ok: false, error: 'Blow window has closed.' };
  if (!state.blowCandidates.some((p) => samePos(p, pos))) return { ok: false, error: 'That piece cannot be blown.' };
  const board = cloneBoard(state.board);
  board[pos[0]][pos[1]] = null;
  let s = { ...state, board, blowUsed: true, blowCandidates: [], lastBlow: { pos, by: state.turn } };
  s = checkElimination(s, opponent(state.turn));
  if (!s.winner) s = checkElimination(s, s.turn); // edge case: we may now be stuck
  return { ok: true, state: s };
}

export function endGame(state, winner, reason) {
  return { ...state, winner, endReason: reason, chainFrom: null };
}

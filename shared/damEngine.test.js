import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from './damEngine.js';

const empty = () => Array.from({ length: 12 }, () => Array(12).fill(null));
const W = (king = false) => ({ color: 'w', king });
const B = (king = false) => ({ color: 'b', king });
const game = (board, turn = 'w') => ({ ...E.createGame(), board, turn });

for (const [size, rows, count] of [[12, 5, 30], [10, 4, 20]]) {
  test(`${size}x${size} layout: ${count} pieces each, ${rows} rows, exactly 2 empty middle rows`, () => {
    const g = E.createGame(size);
    assert.equal(g.size, size);
    assert.equal(g.board.length, size);
    assert.deepEqual(E.countPieces(g.board), { w: count, b: count, wk: 0, bk: 0 });
    g.board.forEach((row, r) => row.forEach((p, c) => p && assert.ok(E.isDark(r, c))));
    const emptyRows = g.board.map((row, r) => (row.every((p) => !p) ? r : -1)).filter((r) => r >= 0);
    assert.deepEqual(emptyRows, [rows, rows + 1]);
    assert.ok(g.board.slice(0, rows).flat().filter(Boolean).every((p) => p.color === 'b'));
    assert.ok(g.board.slice(size - rows).flat().filter(Boolean).every((p) => p.color === 'w'));
  });
}

test('default size is 12 and unsupported sizes are rejected', () => {
  assert.equal(E.createGame().size, 12);
  assert.throws(() => E.createGame(8));
});

test('10x10: black promotes on row 9, flying king stops at the 10x10 edge', () => {
  const b = Array.from({ length: 10 }, () => Array(10).fill(null));
  b[8][1] = { color: 'b', king: false }; b[5][0] = { color: 'w', king: false };
  const r = E.applyMove({ ...E.createGame(10), board: b, turn: 'b' }, [8, 1], [9, 2]);
  assert.equal(r.state.board[9][2].king, true);
  const k = Array.from({ length: 10 }, () => Array(10).fill(null));
  k[9][0] = { color: 'w', king: true }; k[0][1] = { color: 'b', king: false };
  const moves = E.getLegalMoves({ ...E.createGame(10), board: k }, [9, 0]).map((m) => m.to);
  assert.equal(moves.length, 9); // (8,1) … (0,9)
  assert.deepEqual(moves.at(-1), [0, 9]);
});

test('timer constants: 90s limit, warning at 60s', () => {
  assert.equal(E.TURN_LIMIT_MS, 90_000);
  assert.equal(E.WARNING_AFTER_MS, 60_000);
});

test('man moves 1 step forward only', () => {
  const b = empty(); b[6][5] = W();
  const moves = E.getLegalMoves(game(b), [6, 5]).map((m) => m.to);
  assert.deepEqual(moves.sort(), [[5, 4], [5, 6]]);
});

test('man captures backward and must continue the chain', () => {
  const b = empty(); b[5][4] = W(); b[6][5] = B(); b[8][5] = B(); b[0][1] = B();
  let s = game(b);
  const caps = E.getLegalMoves(s, [5, 4]).filter((m) => m.captured);
  assert.deepEqual(caps.map((m) => m.to), [[7, 6]]);
  let r = E.applyMove(s, [5, 4], [7, 6]);
  assert.equal(r.turnEnded, false);
  assert.deepEqual(r.state.chainFrom, [7, 6]);
  // other pieces / non-captures are locked during the chain
  assert.equal(E.applyMove(r.state, [7, 6], [6, 7]).ok, false);
  r = E.applyMove(r.state, [7, 6], [9, 4]);
  assert.equal(r.turnEnded, true);
  assert.equal(r.state.turn, 'b');
  assert.equal(r.state.lastMove.captured.length, 2);
});

test('flying king moves and captures from distance', () => {
  const b = empty(); b[11][0] = W(true); b[6][5] = B(); b[0][11] = B();
  const s = game(b);
  const caps = E.getLegalMoves(s, [11, 0]).filter((m) => m.captured).map((m) => m.to);
  assert.deepEqual(caps, [[5, 6], [4, 7], [3, 8], [2, 9], [1, 10]]);
  const r = E.applyMove(s, [11, 0], [3, 8]);
  assert.equal(r.state.board[6][5], null);
});

test('promotion ends turn immediately, even mid-capture', () => {
  const b = empty(); b[2][3] = W(); b[1][4] = B(); b[1][6] = B(); b[5][0] = B();
  const r = E.applyMove(game(b), [2, 3], [0, 5]);
  assert.equal(r.state.board[0][5].king, true);
  assert.equal(r.state.turn, 'b');
});

test('BLOW: missed capture lets opponent remove the piece before moving', () => {
  const b = empty(); b[6][5] = W(); b[5][4] = B(); b[9][0] = W(); b[0][1] = B();
  let r = E.applyMove(game(b), [9, 0], [8, 1]); // ignores capture with [6,5]
  assert.deepEqual(r.state.blowCandidates, [[6, 5]]);
  const blown = E.applyBlow(r.state, [6, 5]);
  assert.ok(blown.ok);
  assert.equal(blown.state.board[6][5], null);
  assert.equal(blown.state.turn, 'b'); // black still to move
  assert.equal(E.applyBlow(blown.state, [8, 1]).ok, false);
  // if Black moves instead, the window is lost
  const moved = E.applyMove(r.state, [0, 1], [1, 2]);
  assert.ok(!moved.state.blowCandidates.some((p) => E.samePos(p, [6, 5])));
  assert.deepEqual(moved.state.blowCandidates, [[5, 4]]); // Black ALSO missed a capture → White may blow
});

test('BLOW tracks the piece if the would-be capturer itself walked away', () => {
  const b = empty(); b[6][5] = W(); b[5][4] = B(); b[0][1] = B();
  const r = E.applyMove(game(b), [6, 5], [5, 6]);
  assert.deepEqual(r.state.blowCandidates, [[5, 6]]);
});

test('capturing the last piece wins', () => {
  const b = empty(); b[6][5] = W(); b[5][4] = B();
  const r = E.applyMove(game(b), [6, 5], [4, 3]);
  assert.equal(r.state.winner, 'w');
});

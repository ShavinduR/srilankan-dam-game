import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as E from './damEngine.js';
import { chooseAiTurn, generateTurns } from './ai.js';

const empty = (n = 12) => Array.from({ length: n }, () => Array(n).fill(null));
const W = (king = false) => ({ id: Math.random(), color: 'w', king });
const B = (king = false) => ({ id: Math.random(), color: 'b', king });
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** Apply an AI decision through the real engine (proves every step is legal). */
function play(state, d) {
  let s = state;
  if (d.blow) { const r = E.applyBlow(s, d.blow); assert.ok(r.ok, 'blow legal'); s = r.state; }
  for (const [from, to] of d.steps) { const r = E.applyMove(s, from, to); assert.ok(r.ok, `step ${from}->${to} legal`); s = r.state; }
  return s;
}

test('generateTurns returns full multi-jump chains as one turn', () => {
  const b = empty(); b[7][2] = W(); b[6][3] = B(); b[4][5] = B(); b[0][11] = B();
  const turns = generateTurns({ ...E.createGame(12), board: b }).filter((t) => t.captured);
  assert.equal(turns.length, 1);
  assert.equal(turns[0].captured, 2);
  assert.equal(turns[0].steps.length, 2);
});

for (const level of ['medium', 'hard']) {
  test(`${level}: takes a free double capture`, () => {
    const b = empty(); b[7][2] = W(); b[6][3] = B(); b[4][5] = B(); b[0][1] = B(); b[11][10] = W();
    const d = chooseAiTurn({ ...E.createGame(12), board: b }, level, { rng: seeded(3) });
    assert.equal(d.steps.length, 2);
    assert.equal(d.missedCapture, false);
  });

  test(`${level}: always blows a piece that missed a capture`, () => {
    const b = empty(); b[6][5] = W(); b[5][4] = B(); b[9][0] = W(); b[0][1] = B(); b[0][9] = B();
    const missed = E.applyMove({ ...E.createGame(12), board: b }, [9, 0], [8, 1]).state;
    const d = chooseAiTurn(missed, level, { rng: seeded(5) });
    assert.deepEqual(d.blow, [6, 5]);
    play(missed, d);
  });
}

test('hard: does not walk into an obvious capture when a safe move exists', () => {
  // White man (6,5). Moving to (5,4) or (5,6)? Black at (4,3) would jump (5,4)→(6,5).
  const b = empty(); b[6][5] = W(); b[4][3] = B(); b[0][11] = B(); b[11][0] = W();
  const s = { ...E.createGame(12), board: b };
  for (let i = 1; i <= 5; i++) {
    const d = chooseAiTurn(s, 'hard', { rng: seeded(i), timeBudgetMs: 300 });
    assert.notDeepEqual(d.steps.at(-1)[1], [5, 4]);
  }
});

test('easy: sometimes skips an available capture (teaches the Blow rule)', () => {
  const b = empty(); b[6][5] = W(); b[5][4] = B(); b[9][0] = W(); b[0][1] = B();
  const s = { ...E.createGame(12), board: b };
  let missed = 0;
  const rng = seeded(11);
  for (let i = 0; i < 200; i++) if (chooseAiTurn(s, 'easy', { rng }).missedCapture) missed++;
  assert.ok(missed > 40 && missed < 130, `missed ${missed}/200`);
});

for (const size of [10, 12]) {
  test(`full ${size}x${size} games finish with only legal moves (hard vs easy, medium vs medium)`, () => {
    for (const [wl, bl] of [['hard', 'easy'], ['medium', 'medium']]) {
      let s = E.createGame(size);
      const rng = seeded(size);
      let turns = 0;
      while (!s.winner && turns < 400) {
        s = play(s, chooseAiTurn(s, s.turn === 'w' ? wl : bl, { rng, timeBudgetMs: 60 }));
        turns++;
      }
      assert.ok(s.winner, `${wl} vs ${bl} finished in ${turns} turns`);
      if (wl === 'hard') assert.equal(s.winner, 'w', 'hard should beat easy');
    }
  });
}

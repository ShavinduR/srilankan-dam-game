import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REACTIONS, getReaction } from './reactions.js';

test('quick reactions: the 4 Sinhala phrases, unique ids', () => {
  assert.deepEqual(REACTIONS.map((r) => `${r.emoji} ${r.text}`), ['😂 හූ.. හූ..', '🤔 ඇයි බයද?', '🤦‍♂️ අයියෝ', '😎 එළකිරි']);
  assert.equal(new Set(REACTIONS.map((r) => r.id)).size, REACTIONS.length);
});

test('getReaction rejects unknown ids (server only relays whitelisted reactions)', () => {
  assert.equal(getReaction('elakiri').text, 'එළකිරි');
  assert.equal(getReaction('<script>'), null);
  assert.equal(getReaction(undefined), null);
});

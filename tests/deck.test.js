import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, shuffle, rollThreat, rollReinforcement, clampSize, MIN_SIZE, MAX_SIZE } from '../js/deck.js';

// Small deterministic LCG so sequences are reproducible.
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('clampSize keeps 10..16 and falls back to 13', () => {
  assert.equal(clampSize(9), MIN_SIZE);
  assert.equal(clampSize(17), MAX_SIZE);
  assert.equal(clampSize('12'), 12);
  assert.equal(clampSize(undefined), 13);
  assert.equal(clampSize('abc'), 13);
});

test('shuffle is a permutation and does not mutate its input', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(src, seeded(1));
  assert.deepEqual([...out].sort((a, b) => a - b), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('rollThreat stays within 13..17 across the rng range', () => {
  assert.equal(rollThreat(() => 0), 13);
  assert.equal(rollThreat(() => 0.999999), 17);
  const seen = new Set();
  const rng = seeded(7);
  for(let i = 0; i < 2000; i++) seen.add(rollThreat(rng));
  assert.deepEqual([...seen].sort(), [13, 14, 15, 16, 17]);
});

test('rollReinforcement awards on rng < 0.05 only', () => {
  assert.equal(rollReinforcement(() => 0.049), true);
  assert.equal(rollReinforcement(() => 0.05), false);
  assert.equal(rollReinforcement(() => 0.9), false);
});

test('size is respected and all cards are drawn exactly once', () => {
  for(const size of [10, 13, 16]){
    const d = createDeck({ size, rng: seeded(size) });
    assert.equal(d.state().size, size);
    assert.equal(d.state().deck.length, size);
    const drawn = [];
    while(true){
      const r = d.draw();
      if(!r) break;
      drawn.push(r.card);
      d.discard();
    }
    assert.equal(drawn.length, size);
    assert.deepEqual([...drawn].sort((a, b) => a - b), Array.from({ length: size }, (_, i) => i + 1));
  }
});

test('deck + discard + active always equals size', () => {
  const d = createDeck({ size: 13, rng: seeded(3) });
  const check = () => { const s = d.state(); assert.equal(s.deck.length + s.discard.length + (s.current !== null ? 1 : 0), 13); };
  check();
  for(let i = 0; i < 13; i++){ d.draw(); check(); d.discard(); check(); }
});

test('draw is blocked while a card is active and when the deck is empty', () => {
  const d = createDeck({ size: 10, rng: seeded(9) });
  assert.ok(d.draw());
  assert.equal(d.draw(), null, 'second draw while active is blocked');
  assert.equal(d.state().sequence, 1);
  assert.equal(d.discard(), true);
  assert.equal(d.discard(), false, 'discard with nothing active is a no-op');
  for(let i = 0; i < 9; i++){ assert.ok(d.draw()); d.discard(); }
  assert.equal(d.state().deck.length, 0);
  assert.equal(d.draw(), null, 'empty deck is blocked');
});

test('restart reshuffles, rerolls threat and clears discard/active/sequence', () => {
  const d = createDeck({ size: 12, rng: seeded(11) });
  d.draw(); d.discard(); d.draw();
  d.restart();
  const s = d.state();
  assert.equal(s.deck.length, 12);
  assert.deepEqual(s.discard, []);
  assert.equal(s.current, null);
  assert.equal(s.sequence, 0);
  assert.ok(s.threatLevel >= 13 && s.threatLevel <= 17);
});

test('a seeded rng reproduces the same shuffle, threat and awards', () => {
  const run = () => {
    const d = createDeck({ size: 16, rng: seeded(2024) });
    const log = [d.state().threatLevel, ...d.state().deck];
    for(let i = 0; i < 16; i++){ const r = d.draw(); log.push(r.card, r.reinforcement ? 1 : 0); d.discard(); }
    return log;
  };
  assert.deepEqual(run(), run());
});

test('state() returns copies, not live references', () => {
  const d = createDeck({ size: 10, rng: seeded(5) });
  const s = d.state();
  s.deck.length = 0; s.discard.push(99);
  assert.equal(d.state().deck.length, 10);
  assert.deepEqual(d.state().discard, []);
});

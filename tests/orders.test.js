import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createOrders, parseWho, canExecute, archetypeOf, ARCHETYPES } from '../js/orders.js';
import { createAutoma } from '../js/automa.js';

const orders = JSON.parse(readFileSync(new URL('../data/orders.json', import.meta.url), 'utf8'));
const npo = JSON.parse(readFileSync(new URL('../data/npo.json', import.meta.url), 'utf8'));
const presets = JSON.parse(readFileSync(new URL('../data/presets.json', import.meta.url), 'utf8'));
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('orders.json: every archetype has focus, routines and a 6-card deck naming existing routines', () => {
  for(const a of ARCHETYPES){
    const d = orders.archetypes[a];
    assert.ok(d, a);
    assert.ok(d.focus.length >= 3, a + ' focus');
    assert.equal(d.deck.length, 6, a + ' deck');
    for(const label of d.deck){
      const name = label.replace(/\s*[↶↷]$/, '');
      assert.ok(d.routines[name], `${a}: ${label} names no routine`);
      assert.match(label, /[↶↷]$/, `${a}: ${label} has no arrow`);
    }
    for(const [n, r] of Object.entries(d.routines)){ assert.ok(r.steps.length >= 1 && r.fallback, `${a}/${n}`); }
  }
  assert.ok(orders.archetypes.Guardian.anchor);
  assert.equal(orders.resolver.operators.length, 5);
});

test('orders.json: tactical cards name executors from the four archetypes', () => {
  for(const c of orders.tactical.cards){
    const w = parseWho(c.who); const names = w.all || w.any;
    for(const n of names) assert.ok(ARCHETYPES.includes(n), `${c.id}: ${n}`);
    assert.ok(c.steps.length >= 1 && c.fallback, c.id);
    assert.equal(typeof c.squad, 'boolean', c.id);
  }
  const ids = orders.tactical.cards.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('parseWho / canExecute handle and/or', () => {
  assert.deepEqual(parseWho('Guardian or Battler'), { any: ['Guardian', 'Battler'] });
  assert.deepEqual(parseWho('Marksman and Guardian'), { all: ['Marksman', 'Guardian'] });
  assert.equal(canExecute('Guardian or Battler', new Set(['Battler'])), true);
  assert.equal(canExecute('Marksman and Guardian', new Set(['Marksman'])), false);
  assert.equal(canExecute('Brawler', new Set(['Marksman'])), false);
});

test('archetypeOf reads the first word of a behaviour line', () => {
  assert.equal(archetypeOf('Battler, or Guardian if this NPO has a weapon marked with an asterisk (*).'), 'Battler');
  assert.equal(archetypeOf('Marksman.'), 'Marksman');
  assert.equal(archetypeOf('Nope'), null);
});

test('routine decks draw all 6 cards, then reshuffle the discard', () => {
  const o = createOrders({ orders, rng: seeded(5) });
  const seen = [];
  for(let i = 0; i < 6; i++){ const r = o.drawRoutine('Marksman'); seen.push(r.label); assert.ok(r.steps.length); assert.ok(['', '↶', '↷'].includes(r.arrow)); }
  assert.deepEqual([...seen].sort(), [...orders.archetypes.Marksman.deck].sort());
  assert.equal(o.state().routine.Marksman.remaining, 0);
  const again = o.drawRoutine('Marksman');
  assert.ok(again.name);
  assert.equal(o.state().routine.Marksman.remaining, 5);
  assert.equal(o.drawRoutine('Nope'), null);
});

test('tactical draw skips cards nobody can execute and returns null when nobody can', () => {
  const o = createOrders({ orders, rng: seeded(9) });
  const r = o.drawTactical(new Set(['Marksman']));
  assert.ok(r);
  assert.ok(canExecute(r.who, new Set(['Marksman'])), r.id);
  for(const id of r.skipped) assert.ok(!canExecute(orders.tactical.cards.find(c => c.id === id).who, new Set(['Marksman'])));
  const none = o.drawTactical(new Set());
  assert.equal(none, null);
  assert.equal(o.state().tactical.remaining + o.state().tactical.discard.length, orders.tactical.cards.length);
});

test('automa with orders: event cards draw a tactical order, drawRoutine draws for the chosen NPO', () => {
  const orks = npo.factions.find(f => f.id === 'ork').units;   // Gretchin Marksman, Boy Battler, Nob Battler
  const a = createAutoma({ config: { faction: 'ork', ...presets.custom, orders }, npoCatalog: orks, rng: seeded(3) });
  a.addNpo('boy'); a.addNpo('gretchin');
  a.startTurningPoint(); a.startFirefight();
  let r; do { r = a.npoTurn(); } while(r.result !== 'event');
  assert.ok(r.order, 'a tactical order was drawn');
  assert.ok(canExecute(r.order.who, new Set(['Battler', 'Marksman'])));
  const routine = a.drawRoutine(1);
  assert.equal(routine.archetype, 'Battler');
  assert.ok(['ADVANCE', 'ASSAULT', 'CLEAR'].includes(routine.name));
  assert.equal(a.archetypeOfUnit(2), 'Marksman');
  const json = a.serialize();
  assert.ok(!JSON.parse(json).cfg.orders, 'orders data is not duplicated into the save');
  const b = createAutoma({ config: { faction: 'ork', ...presets.custom, orders }, npoCatalog: orks, rng: seeded(99) });
  b.restore(json);
  assert.deepEqual(b.state().orders, a.state().orders);
});

test('automa with orders but no executor falls back to activate', () => {
  const orks = npo.factions.find(f => f.id === 'ork').units;
  const a = createAutoma({ config: { faction: 'ork', ...presets.custom, orders }, npoCatalog: orks, rng: seeded(4) });
  a.addNpo('boy');
  a.startTurningPoint(); a.startFirefight(); a.expendAll();
  let r; do { r = a.npoTurn(); } while(r.result !== 'event');
  assert.equal(r.order, null);
  assert.equal(r.activate, false);
});

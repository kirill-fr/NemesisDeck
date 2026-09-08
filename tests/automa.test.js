import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAutoma, validateTable, lookup, rollD3, rollD6 } from '../js/automa.js';

const npo = JSON.parse(readFileSync(new URL('../data/npo.json', import.meta.url), 'utf8'));
const presets = JSON.parse(readFileSync(new URL('../data/presets.json', import.meta.url), 'utf8'));
const orks = npo.factions.find(f => f.id === 'ork').units;   // Gretchin 0.5, Boy 2, Nob 3
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const mission = id => presets.missions.find(m => m.id === id);
const make = (m, seed = 1, extra = {}) => createAutoma({ config: { faction: 'ork', ...m, ...extra }, npoCatalog: orks, rng: seeded(seed) });

test('presets: every table covers 1..13 exactly once and gambits are well-formed', () => {
  for(const m of [...presets.missions, presets.custom]){
    assert.ok(validateTable(m.table), m.id);
    assert.ok(m.gambit.d3 || m.gambit.fixed != null, m.id + ' gambit');
    assert.ok(m.startingPoints >= 10, m.id);
  }
});

test('validateTable rejects gaps, overlaps and unknown results', () => {
  assert.throws(() => validateTable([{ from: 1, to: 12, result: 'activate' }]), /not covered/);
  assert.throws(() => validateTable([{ from: 1, to: 13, result: 'activate' }, { from: 5, to: 5, result: 'skip' }]), /twice/);
  assert.throws(() => validateTable([{ from: 1, to: 13, result: 'nemesis' }]), /bad result/);
});

test('lookup finds the row for a card', () => {
  const t = mission('erosion-of-power').table;
  assert.equal(lookup(t, 1).result, 'activate');
  assert.equal(lookup(t, 8).result, 'activate');
  assert.equal(lookup(t, 9).result, 'reinforce');
  assert.equal(lookup(t, 13).result, 'skip');
  assert.equal(lookup(t, 14), null);
});

test('dice helpers stay in range', () => {
  const rng = seeded(3);
  for(let i = 0; i < 500; i++){ const a = rollD3(rng), b = rollD6(rng); assert.ok(a >= 1 && a <= 3); assert.ok(b >= 1 && b <= 6); }
  assert.equal(rollD6(() => 0), 1); assert.equal(rollD6(() => 0.999), 6);
});

test('setup: starting points cap the NPOs, leftover goes to the pool', () => {
  const a = make(mission('erosion-of-power'));           // 15 points
  assert.equal(a.addNpo('nob').ok, true);                // 3
  assert.equal(a.addNpo('nob').ok, true);                // 6
  assert.equal(a.addNpo('boy').ok, true);                // 8
  assert.equal(a.addNpo('boy').ok, true);                // 10
  assert.equal(a.addNpo('boy').ok, true);                // 12
  assert.equal(a.addNpo('boy').ok, true);                // 14
  assert.deepEqual(a.addNpo('boy'), { ok: false, reason: 'points' });
  assert.equal(a.addNpo('gretchin').ok, true);           // 14.5
  assert.equal(a.state().setupSpent, 14.5);
  a.finishSetup();
  assert.equal(a.state().pool, 0.5);
  assert.equal(a.state().roster.length, 7);
});

test('NPO limit is enforced on setup and reinforcement', () => {
  const a = make(mission('erosion-of-power'), 1, { npoLimit: 3, startingPoints: 30 });
  a.addNpo('gretchin'); a.addNpo('gretchin'); a.addNpo('gretchin');
  assert.deepEqual(a.addNpo('gretchin'), { ok: false, reason: 'limit' });
  assert.equal(a.affordable().length, 0);
});

test('turning point 1: players have initiative, no gambit, deck rebuilt with 13 cards', () => {
  const a = make(mission('erosion-of-power'));
  a.addNpo('boy');
  const t = a.startTurningPoint();
  assert.equal(t.tp, 1);
  assert.equal(t.initiative, 'players');
  assert.equal(t.gambit, 0);
  assert.equal(t.roll, null);
  assert.equal(a.state().deckRemaining, 13);
  assert.equal(a.state().phase, 'strategy');
});

test('turning point 2+: gambit adds D3 (or fixed) and initiative is rolled', () => {
  const a = make(mission('erosion-of-power'), 7);
  a.addNpo('boy');
  a.startTurningPoint(); a.startFirefight(); a.endTurningPoint();
  const t = a.startTurningPoint();
  assert.equal(t.tp, 2);
  assert.ok(t.gambit >= 1 && t.gambit <= 3);
  assert.ok(t.roll.players >= 1 && t.roll.npo <= 6);
  assert.ok(['players', 'npo', 'tie'].includes(t.initiative));

  const b = make(mission('ambush'), 7);                   // fixed 1
  b.addNpo('boy'); b.startTurningPoint(); b.startFirefight(); b.endTurningPoint();
  assert.equal(b.startTurningPoint().gambit, 1);
  b.setFlag('extractionDone');
  b.startFirefight(); b.endTurningPoint();
  const g = b.startTurningPoint().gambit;
  assert.ok(g >= 1 && g <= 3, 'D3 after extraction');
});

test('npoTurn draws 13 unique cards, then reshuffles, and resolves by table', () => {
  const a = make(mission('erosion-of-power'), 11);
  a.addNpo('boy');
  a.startTurningPoint(); a.startFirefight();
  const seen = [];
  for(let i = 0; i < 13; i++){
    const r = a.npoTurn();
    seen.push(r.card);
    assert.equal(r.result, lookup(a.config.table, r.card).result);
    if(r.result === 'activate') assert.equal(r.activate, true);
  }
  assert.deepEqual([...seen].sort((x, y) => x - y), Array.from({ length: 13 }, (_, i) => i + 1));
  assert.equal(a.state().deckRemaining, 0);
  const again = a.npoTurn();
  assert.ok(again.card >= 1 && again.card <= 13, 'reshuffled when empty');
  assert.equal(a.state().discard.length, 1);
});

test('reinforce rows add points and list what the pool can buy, most expensive first', () => {
  const a = make(mission('erosion-of-power'), 2, { startingPoints: 13 });
  a.addNpo('nob'); a.addNpo('nob'); a.addNpo('nob'); a.addNpo('boy');   // 11, pool 2 after setup
  a.startTurningPoint(); a.startFirefight();
  let r;
  do { r = a.npoTurn(); } while(r.result !== 'reinforce');
  assert.equal(r.points, 1);
  assert.equal(r.pool, 3);
  assert.deepEqual(r.affordable.map(x => x.id), ['nob', 'boy', 'gretchin']);
  assert.equal(a.addNpo('nob', { fromPool: true }).ok, true);
  assert.equal(a.state().pool, 0);
  assert.deepEqual(a.addNpo('gretchin', { fromPool: true }), { ok: false, reason: 'points' });
});

test('activate rows report whether any NPO is ready', () => {
  const a = make(mission('erosion-of-power'), 5);
  a.addNpo('boy');
  a.startTurningPoint(); a.startFirefight();
  a.expendAll();
  let r; do { r = a.npoTurn(); } while(r.result !== 'activate');
  assert.equal(r.activate, false);
  assert.equal(r.readyCount, 0);
});

test('conditional points ask the UI unless a flag already answers', () => {
  const a = make(mission('outmanoeuvre'), 9);
  a.addNpo('boy');
  a.startTurningPoint(); a.startFirefight();
  let r; do { r = a.npoTurn(); } while(r.card !== 9);
  assert.equal(r.pending, true);
  assert.equal(r.needs, 'playersControlObjective');
  assert.deepEqual(a.state().pending, { card: 9, needs: 'playersControlObjective' });
  assert.equal(a.npoTurn().pending, true, 'no new draw while pending');
  const before = a.state().pool;
  const done = a.resolvePending({ playersControlObjective: true });
  assert.equal(done.points, -1);
  assert.equal(done.pool, before - 1);
  assert.equal(done.activate, true, 'then: activate');
  assert.equal(a.state().pending, null);

  const b = make(mission('ambush'), 4);
  b.addNpo('boy'); b.setFlag('extractionDone');
  b.startTurningPoint(); b.startFirefight();
  let s; do { s = b.npoTurn(); } while(s.result !== 'reinforce');
  assert.equal(s.pending, undefined);
  assert.equal(s.points, 2);
});

test('roster edits: wounds, orders, ready; zero wounds removes the NPO', () => {
  const a = make(mission('erosion-of-power'));
  const { unit } = a.addNpo('boy');
  assert.equal(a.setWounds(unit.uid, 4), true);
  assert.equal(a.state().roster[0].wounds, 4);
  a.setWounds(unit.uid, 99);
  assert.equal(a.state().roster[0].wounds, 10, 'capped at max');
  a.setOrder(unit.uid, 'engage'); a.setReady(unit.uid, false);
  assert.equal(a.state().roster[0].order, 'engage');
  assert.equal(a.state().roster[0].ready, false);
  a.setWounds(unit.uid, 0);
  assert.equal(a.state().roster.length, 0);
});

test('a seeded run is reproducible', () => {
  const run = () => {
    const a = make(mission('erosion-of-power'), 2024);
    a.addNpo('nob'); a.addNpo('boy'); a.addNpo('boy');
    const out = [];
    for(let t = 0; t < 3; t++){
      const s = a.startTurningPoint(); out.push(s.gambit, s.initiative);
      a.startFirefight();
      for(let i = 0; i < 6; i++){ const r = a.npoTurn(); out.push(r.card, r.result); }
      a.endTurningPoint();
    }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('serialize/restore round-trips the full state', () => {
  const a = make(mission('outmanoeuvre'), 33);
  a.addNpo('nob'); a.addNpo('boy');
  a.startTurningPoint(); a.startFirefight(); a.npoTurn(); a.npoTurn();
  a.setFlag('something');
  const json = a.serialize();
  const b = make(mission('outmanoeuvre'), 99);
  b.restore(json);
  const sa = a.state(), sb = b.state();
  assert.deepEqual(sb.roster, sa.roster);
  assert.deepEqual(sb.discard, sa.discard);
  assert.equal(sb.deckRemaining, sa.deckRemaining);
  assert.equal(sb.pool, sa.pool);
  assert.equal(sb.tp, sa.tp);
  assert.deepEqual(sb.flags, { something: true });
  assert.equal(b.npoTurn().card, JSON.parse(json).deck.at(-1), 'continues from the same deck');
});

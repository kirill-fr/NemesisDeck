import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/npo.json', import.meta.url), 'utf8'));
const ARCHETYPES = ['Brawler', 'Marksman', 'Battler', 'Guardian'];
const units = data.factions.flatMap(f => f.units.map(u => ({ ...u, faction: f.id })));

test('8 factions, 24 NPOs, 4 behaviour archetypes', () => {
  assert.equal(data.factions.length, 8);
  assert.equal(units.length, 24);
  assert.deepEqual(Object.keys(data.behaviours).sort(), [...ARCHETYPES].sort());
});

test('every faction has id, name, colour and an allegiance trait', () => {
  for(const f of data.factions){
    assert.match(f.id, /^[a-z]+$/);
    assert.ok(f.name && /^#[0-9a-f]{6}$/i.test(f.colour), f.id);
    assert.ok(f.trait && f.trait.title && f.trait.rules.length >= 1, f.id + ' trait');
  }
});

test('unit ids are unique and stats are well-formed', () => {
  const ids = units.map(u => u.id);
  assert.equal(new Set(ids).size, ids.length);
  for(const u of units){
    assert.match(u.id, /^[a-z0-9-]+$/, u.name);
    assert.ok([2, 3].includes(u.apl), u.name + ' apl');
    assert.match(u.move, /^\d″$/, u.name + ' move');
    assert.match(u.save, /^[2-6]\+$/, u.name + ' save');
    assert.ok(Number.isInteger(u.wounds) && u.wounds > 0, u.name + ' wounds');
    assert.ok([0.5, 1, 2, 3].includes(u.points), u.name + ' points');
    assert.ok(u.keywords.length >= 2, u.name + ' keywords');
    assert.ok(u.weapons.length >= 1, u.name + ' weapons');
    for(const w of u.weapons){
      assert.ok(['ranged', 'melee'].includes(w.type), w.name);
      assert.ok(Number.isInteger(w.atk) && /^[2-6]\+$/.test(w.hit) && /^\d+\/\d+$/.test(w.dmg), u.name + ' ' + w.name);
    }
  }
});

test('behaviour text starts with a known archetype', () => {
  for(const u of units){
    const first = u.behaviour.split(/[ ,.]/)[0];
    assert.ok(ARCHETYPES.includes(first), `${u.name}: ${u.behaviour}`);
  }
});

test('behaviour archetypes have a description and an ordered step list', () => {
  for(const [name, b] of Object.entries(data.behaviours)){
    assert.ok(b.desc.length > 40, name);
    assert.ok(b.steps.length >= 4, name);
    assert.match(b.steps[0], /^\*\*(Fight|Fall Back)\*\*/, name + ' first step');
  }
});

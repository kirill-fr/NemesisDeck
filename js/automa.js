// Automa engine: the NPO side of a Joint Ops game, pack-agnostic.
// Pure module: no DOM, no timers; every random decision goes through rng.
//
//   const a = createAutoma({ config, npoCatalog, rng });
//   a.addNpo('boy'); a.startTurningPoint(); a.npoTurn(); ...
//
// config = {
//   faction: 'ork',
//   startingPoints: 15,                 // budget for NPOs set up before the battle
//   gambit: { d3: 1 } | { fixed: 1 },   // points added to the pool each TP after the first
//   gambitWhen: [ { flag: 'extractionDone', gambit: { d3: 1 } } ],  // optional overrides once a flag is set
//   table: [ { from, to, result, points?, then?, condition? } ],  // activation card table
//   npoLimit: 10,
//   deckSize: 13,
// }
// table results: 'activate' | 'reinforce' | 'skip' | 'event' | 'custom'
// points may be a number or { if: '<contextKey>', then: n, else: m } (asks the UI).

import { shuffle } from './deck.js';

export const RESULTS = ['activate', 'reinforce', 'skip', 'event', 'custom'];

export function rollD(sides, rng = Math.random){ return 1 + Math.floor(rng() * sides); }
export function rollD3(rng = Math.random){ return rollD(3, rng); }
export function rollD6(rng = Math.random){ return rollD(6, rng); }

export function validateTable(table, deckSize = 13){
  const covered = new Array(deckSize + 1).fill(false);
  for(const row of table){
    if(!(row.from >= 1 && row.to <= deckSize && row.from <= row.to)) throw new Error(`bad range ${row.from}-${row.to}`);
    if(!RESULTS.includes(row.result)) throw new Error(`bad result ${row.result}`);
    for(let i = row.from; i <= row.to; i++){
      if(covered[i]) throw new Error(`card ${i} covered twice`);
      covered[i] = true;
    }
  }
  for(let i = 1; i <= deckSize; i++) if(!covered[i]) throw new Error(`card ${i} not covered`);
  return true;
}

export function lookup(table, card){
  return table.find(r => card >= r.from && card <= r.to) || null;
}

export function createAutoma({ config, npoCatalog, rng = Math.random }){
  const cfg = {
    deckSize: 13, npoLimit: 10, startingPoints: 0, gambit: { d3: 1 },
    ...config,
  };
  validateTable(cfg.table, cfg.deckSize);
  const catalog = new Map(npoCatalog.map(n => [n.id, n]));

  let tp = 0;
  let phase = 'setup';               // setup | strategy | firefight | end
  let initiative = null;             // 'players' | 'npo'
  let deck = [];
  let discard = [];
  let pool = 0;
  let setupSpent = 0;
  let roster = [];
  let nextUid = 1;
  let pending = null;                // { card, row, needs } awaiting resolvePending()
  const flags = {};                  // mission flags set by the players (e.g. extractionDone)
  for(const f of cfg.flags || []) flags[f.id] = !!f.default;
  const log = [];

  const note = (type, data = {}) => { log.push({ tp, type, ...data }); };
  const cost = id => { const n = catalog.get(id); if(!n) throw new Error(`unknown NPO ${id}`); return n.points; };
  const onBoard = () => roster.length;

  function rebuildDeck(){
    deck = shuffle(Array.from({ length: cfg.deckSize }, (_, i) => i + 1), rng);
    discard = [];
    note('reshuffle');
  }

  // --- roster -------------------------------------------------------------
  function addNpo(npoId, { fromPool = false } = {}){
    const n = catalog.get(npoId);
    if(!n) throw new Error(`unknown NPO ${npoId}`);
    if(onBoard() >= cfg.npoLimit) return { ok: false, reason: 'limit' };
    if(phase === 'setup'){
      if(setupSpent + n.points > cfg.startingPoints) return { ok: false, reason: 'points' };
      setupSpent += n.points;
    }else if(fromPool){
      if(pool < n.points) return { ok: false, reason: 'points' };
      pool -= n.points;
    }
    const unit = { uid: nextUid++, npoId, name: n.name, wounds: n.wounds, maxWounds: n.wounds, order: 'conceal', ready: true, arrivedTp: tp };
    roster.push(unit);
    note('spawn', { uid: unit.uid, npoId, fromPool });
    return { ok: true, unit: { ...unit } };
  }
  function removeNpo(uid){
    const i = roster.findIndex(u => u.uid === uid);
    if(i < 0) return false;
    const [u] = roster.splice(i, 1);
    note('remove', { uid, npoId: u.npoId });
    return true;
  }
  function setWounds(uid, wounds){
    const u = roster.find(x => x.uid === uid); if(!u) return false;
    u.wounds = Math.max(0, Math.min(u.maxWounds, wounds));
    if(u.wounds === 0) return removeNpo(uid);
    return true;
  }
  function setOrder(uid, order){ const u = roster.find(x => x.uid === uid); if(!u) return false; u.order = order === 'engage' ? 'engage' : 'conceal'; return true; }
  function setReady(uid, ready){ const u = roster.find(x => x.uid === uid); if(!u) return false; u.ready = !!ready; return true; }
  function readyCount(){ return roster.filter(u => u.ready).length; }

  // What the pool can buy right now, most expensive first (threat principle: spend it all).
  function affordable(){
    return [...catalog.values()]
      .filter(n => n.points <= pool && onBoard() < cfg.npoLimit)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
      .map(n => ({ id: n.id, name: n.name, points: n.points }));
  }

  // --- turning point ------------------------------------------------------
  function finishSetup(){
    if(phase !== 'setup') return false;
    pool += cfg.startingPoints - setupSpent;   // unused points go to the reinforcement pool
    note('setup-done', { spent: setupSpent, pool });
    phase = 'end';
    return true;
  }

  function startTurningPoint(){
    if(phase === 'setup') finishSetup();
    if(phase !== 'end') return null;
    tp++;
    phase = 'strategy';
    roster.forEach(u => { u.ready = true; });
    rebuildDeck();
    pending = null;
    let gambit = 0;
    if(tp > 1){
      let g = cfg.gambit;
      for(const w of cfg.gambitWhen || []) if(flags[w.flag]) g = w.gambit;
      gambit = g.fixed != null ? g.fixed : rollD3(rng) * (g.d3 || 1);
      pool += gambit;
      note('gambit', { points: gambit, pool });
    }
    let roll = null;
    if(tp === 1){
      initiative = 'players';
    }else{
      roll = { players: rollD6(rng), npo: rollD6(rng) };
      initiative = roll.npo > roll.players ? 'npo' : roll.players > roll.npo ? 'players' : 'tie';
    }
    note('initiative', { initiative, roll });
    return { tp, gambit, pool, initiative, roll, affordable: affordable() };
  }

  // Ties are decided by the side that did not have initiative last TP; NPOs always take it.
  function setInitiative(who){ initiative = who === 'npo' ? 'npo' : 'players'; note('initiative-set', { initiative }); return initiative; }

  function startFirefight(){ if(phase !== 'strategy') return false; phase = 'firefight'; return true; }

  // --- NPO turn -----------------------------------------------------------
  function drawCard(){
    if(!deck.length) rebuildDeck();
    const card = deck.pop();
    discard.push(card);
    return card;
  }

  function resolveRow(card, row, context = {}){
    const out = { card, result: row.result, row: { ...row } };
    if(row.result === 'reinforce'){
      let pts = row.points;
      if(pts && typeof pts === 'object'){
        const known = pts.if in flags ? flags[pts.if] : (pts.if in context ? context[pts.if] : undefined);
        if(known === undefined) return { card, pending: true, needs: pts.if, row: { ...row } };
        pts = known ? pts.then : pts.else;
      }
      pool = Math.max(0, pool + (pts || 0));
      out.points = pts || 0;
      out.pool = pool;
      out.affordable = affordable();
    }
    if(row.result === 'activate' || row.then === 'activate'){
      out.activate = readyCount() > 0;
      out.readyCount = readyCount();
    }
    if(row.result === 'custom') out.text = row.text || '';
    note('card', { card, result: row.result, points: out.points });
    return out;
  }

  function npoTurn(context = {}){
    if(phase !== 'firefight') return null;
    if(pending) return { ...pending, pending: true };
    const card = drawCard();
    const row = lookup(cfg.table, card);
    const res = resolveRow(card, row, context);
    if(res.pending) pending = res;
    return res;
  }

  function resolvePending(context){
    if(!pending) return null;
    const { card, row } = pending;
    const res = resolveRow(card, row, context);
    if(!res.pending) pending = null;
    return res;
  }

  function setFlag(name, value = true){ flags[name] = !!value; note('flag', { name, value: !!value }); return { ...flags }; }

  function expendAll(){ roster.forEach(u => { u.ready = false; }); }

  function endTurningPoint(){
    if(phase !== 'firefight') return false;
    phase = 'end';
    pending = null;
    note('tp-end');
    return true;
  }

  // --- state --------------------------------------------------------------
  function state(){
    return {
      tp, phase, initiative, pool, setupSpent,
      startingPoints: cfg.startingPoints, npoLimit: cfg.npoLimit, faction: cfg.faction,
      deckRemaining: deck.length, discard: [...discard],
      roster: roster.map(u => ({ ...u })),
      pending: pending ? { card: pending.card, needs: pending.needs } : null,
      flags: { ...flags },
      log: log.slice(-50),
    };
  }
  function serialize(){
    return JSON.stringify({ v: 1, cfg, tp, phase, initiative, deck, discard, pool, setupSpent, roster, nextUid, pending, flags, log });
  }
  function restore(json){
    const s = JSON.parse(json);
    if(s.v !== 1) throw new Error('unsupported save');
    ({ tp, phase, initiative, deck, discard, pool, setupSpent, roster, nextUid, pending } = s);
    for(const k of Object.keys(flags)) delete flags[k];
    Object.assign(flags, s.flags || {});
    log.length = 0; log.push(...s.log);
    return state();
  }

  return {
    config: cfg,
    addNpo, removeNpo, setWounds, setOrder, setReady, expendAll, affordable,
    finishSetup, startTurningPoint, setInitiative, startFirefight, npoTurn, resolvePending, endTurningPoint, setFlag,
    state, serialize, restore,
  };
}

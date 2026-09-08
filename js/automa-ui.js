// Joint Ops automa: DOM wiring for the setup and game screens.
// Rules live in automa.js; data comes from data/npo.json and data/presets.json.
import { createAutoma } from './automa.js';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const pts = n => Number.isInteger(n) ? String(n) : String(n).replace('0.5', '½');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

// Nemesis Operatives dossier, p.36: which ready NPO activates when several could.
const ACTIVATION_PRIORITY = [
  'Can perform the **Shoot** or **Fight** action (per its behaviour) and is the most threatening doing so',
  'Is not in cover from a player operative',
  'Is closer to a player operative',
];
const QUESTIONS = {
  playersControlObjective: 'DO PLAYER OPERATIVES CONTROL ONE OR MORE OBJECTIVE MARKERS?',
  extractionDone: 'HAS A PLAYER OPERATIVE PERFORMED COORDINATE EXTRACTION?',
};

const SAVE_KEY = 'nemesisdeck.automa.v1';
const storage = {
  get(){ try{ return JSON.parse(localStorage.getItem(SAVE_KEY)); }catch(e){ return null; } },
  set(v){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(v)); }catch(e){} },
  clear(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} },
};

export function createAutomaUi({ bindPress, sfx, glitch, frameTitle }){
  const root = $('automa');
  const setup = $('automaSetup');
  const game = $('automaGame');
  let data = null;               // { npo, presets }
  let faction = null;
  let mission = null;
  let counts = {};               // npoId -> number
  let automa = null;
  let lastInitiative = 'players';
  let lastResult = null;         // last resolved card, re-shown after a reload
  let restoring = false;

  // --- persistence ----------------------------------------------------------
  function save(){
    if(!automa || restoring) return;
    const s = automa.state();
    storage.set({
      v: 1, faction: faction.id, mission: mission.id, tp: s.tp, engine: automa.serialize(),
      ui: { panel: s.phase === 'firefight' ? 'firefight' : 'strategy', lastInitiative, lastResult,
            strategyLines: $('aStrategyLines').innerHTML, tieOpen: !$('aTie').hidden },
    });
  }
  function hasSave(){ const v = storage.get(); return v && v.v === 1 ? { tp: v.tp, mission: v.mission } : null; }
  function abandon(){ storage.clear(); location.reload(); }

  async function load(){
    if(data) return data;
    const [npo, presets] = await Promise.all([
      fetch('data/npo.json').then(r => r.json()),
      fetch('data/presets.json').then(r => r.json()),
    ]);
    data = { npo, presets };
    return data;
  }

  // --- setup screen -------------------------------------------------------
  function renderFactions(){
    const el = $('aFactions');
    el.innerHTML = data.npo.factions.map(f =>
      `<button class="deck-option pixel-text${faction && faction.id === f.id ? ' selected' : ''}" data-faction="${f.id}">${esc(f.name).toUpperCase()}</button>`).join('');
    el.querySelectorAll('button').forEach(b => bindPress(b, () => selectFaction(b.dataset.faction)));
  }
  function renderMissions(){
    const el = $('aMissions');
    const list = [...data.presets.missions, data.presets.custom];
    el.innerHTML = list.map(m =>
      `<button class="deck-option pixel-text${mission && mission.id === m.id ? ' selected' : ''}" data-mission="${m.id}">${esc(m.name).toUpperCase()} <span class="a-pts">// ${m.startingPoints} PTS</span></button>`).join('');
    el.querySelectorAll('button').forEach(b => bindPress(b, () => selectMission(b.dataset.mission)));
  }
  function spent(){ return faction ? faction.units.reduce((s, u) => s + (counts[u.id] || 0) * u.points, 0) : 0; }
  function onBoard(){ return Object.values(counts).reduce((s, n) => s + n, 0); }
  function renderForce(){
    const el = $('aForce');
    if(!faction || !mission){ el.innerHTML = '<div class="a-note pixel-text">SELECT ALLEGIANCE AND MISSION_</div>'; $('aTotal').textContent = ''; $('aPlacement').textContent = ''; $('aDeploy').disabled = true; return; }
    const budget = mission.startingPoints, limit = mission.npoLimit || 10;
    el.innerHTML = faction.units.map(u => {
      const n = counts[u.id] || 0;
      const canAdd = spent() + u.points <= budget && onBoard() < limit;
      return `<div class="a-row${n ? ' on' : ''}" data-id="${u.id}">
        <span class="a-name pixel-text">${esc(u.name).toUpperCase()}</span>
        <span class="a-pts pixel-text">${pts(u.points)} PT · W${u.wounds}</span>
        <button class="a-step" data-dec="${u.id}" ${n ? '' : 'disabled'}>-</button>
        <span class="a-count pixel-text">${pad(n)}</span>
        <button class="a-step" data-inc="${u.id}" ${canAdd ? '' : 'disabled'}>+</button>
      </div>`; }).join('');
    el.querySelectorAll('[data-inc]').forEach(b => bindPress(b, () => step(b.dataset.inc, +1)));
    el.querySelectorAll('[data-dec]').forEach(b => bindPress(b, () => step(b.dataset.dec, -1)));
    const s = spent();
    $('aTotal').innerHTML = `SPENT <b>${pts(s)}</b> / ${budget} PTS // NPO <b>${pad(onBoard())}</b> / ${limit} // POOL <b>${pts(budget - s)}</b>`;
    $('aPlacement').textContent = mission.placement || '';
    $('aDeploy').disabled = onBoard() === 0;
    $('aDeploy').textContent = `DEPLOY // ${pad(onBoard())} NPO`;
  }
  function selectFaction(id){ faction = data.npo.factions.find(f => f.id === id); counts = {}; sfx('ui'); glitch('light'); renderFactions(); renderForce(); }
  function selectMission(id){ mission = [...data.presets.missions, data.presets.custom].find(m => m.id === id); counts = {}; sfx('ui'); glitch('light'); renderMissions(); renderForce(); }
  function step(id, d){ counts[id] = Math.max(0, (counts[id] || 0) + d); sfx('ui'); renderForce(); }

  // --- game screen --------------------------------------------------------
  function status(){
    const s = automa.state();
    $('aTp').textContent = pad(s.tp);
    $('aInit').textContent = s.initiative === 'npo' ? 'NPO' : s.initiative === 'players' ? 'PLAYERS' : s.initiative === 'tie' ? 'TIE' : '--';
    $('aPool').textContent = pts(s.pool);
    $('aOnBoard').textContent = pad(s.roster.length) + ' / ' + s.npoLimit;
    document.querySelectorAll('.a-rosterbtn').forEach(b => { b.textContent = `ROSTER // ${pad(s.roster.filter(u => u.ready).length)} READY`; });
    frameTitle.textContent = `JOINT OPS // ${mission.name.toUpperCase()} // TP ${pad(s.tp)}`;
    $('aDiscard').textContent = s.discard.length ? s.discard.map(pad).join(' ') : '—';
    $('aDeckLeft').textContent = s.deckRemaining;
    save();
    return s;
  }

  function spawnRows(list, container){
    if(!list.length){ container.innerHTML = '<div class="a-note pixel-text">NOTHING AFFORDABLE // POINTS STAY IN THE POOL</div>'; return; }
    container.innerHTML = list.map(n => `<div class="a-row a-spawn" data-id="${n.id}">
      <span class="a-name pixel-text">${esc(n.name).toUpperCase()}</span>
      <span class="a-pts pixel-text">${pts(n.points)} PT</span>
      <button data-spawn="${n.id}">SPAWN</button></div>`).join('');
    container.querySelectorAll('[data-spawn]').forEach(b => bindPress(b, () => {
      const r = automa.addNpo(b.dataset.spawn, { fromPool: true });
      if(r.ok){ sfx('draw'); glitch('light'); }
      const s = status();
      spawnRows(automa.affordable(), container);
      if(container === $('aSpawnList')) $('aSpawnHint').textContent = s.pool ? `POOL ${pts(s.pool)} PTS` : 'POOL EMPTY';
    }));
  }

  function renderFlags(){
    const el = $('aFlags');
    const flags = mission.flags || [];
    el.hidden = !flags.length;
    if(!flags.length) return;
    const s = automa.state();
    el.innerHTML = flags.map(f => `<button class="music-option${s.flags[f.id] ? ' selected' : ''}" data-flag="${f.id}">${esc(f.label).toUpperCase()} // ${s.flags[f.id] ? 'YES' : 'NO'}</button>`).join('');
    el.querySelectorAll('[data-flag]').forEach(b => bindPress(b, () => { automa.setFlag(b.dataset.flag, !automa.state().flags[b.dataset.flag]); sfx('ui'); renderFlags(); }));
  }

  function strategyPhase(){
    lastResult = null;
    const t = automa.startTurningPoint();
    const lines = [];
    if(t.tp === 1) lines.push(`FIRST TURNING POINT // <b>PLAYERS</b> HAVE INITIATIVE`);
    else{
      lines.push(`INITIATIVE ROLL-OFF // PLAYERS <b>${t.roll.players}</b> VS NPO <b>${t.roll.npo}</b> → ${t.initiative === 'tie' ? 'TIE' : '<b>' + t.initiative.toUpperCase() + '</b>'}`);
      lines.push(`NPO STRATEGIC GAMBIT // <b>+${t.gambit}</b> PTS → POOL <b>${pts(t.pool)}</b>`);
    }
    lines.push(`ACTIVATION DECK RESHUFFLED // <b>13</b> CARDS`);
    lines.push(`NPO PASS AFTER THEIR GAMBITS`);
    $('aStrategyLines').innerHTML = lines.map(l => `<div>${l}</div>`).join('');
    const tie = $('aTie');
    tie.hidden = t.initiative !== 'tie';
    $('aBeginFirefight').disabled = t.initiative === 'tie';
    if(t.initiative !== 'tie') lastInitiative = t.initiative;
    renderFlags();
    spawnRows(t.affordable, $('aSpawnList'));
    $('aSpawnHint').textContent = t.pool ? `POOL ${pts(t.pool)} PTS` : 'POOL EMPTY';
    $('aPlacementGame').textContent = mission.placement || '';
    $('aStrategy').hidden = false; $('aFirefight').hidden = true;
    status();
    sfx('restart'); glitch('card');
  }

  function decideTie(who){
    automa.setInitiative(who);
    lastInitiative = who;
    $('aTie').hidden = true; $('aBeginFirefight').disabled = false;
    $('aStrategyLines').insertAdjacentHTML('beforeend', `<div>TIE DECIDED // <b>${who.toUpperCase()}</b> HAVE INITIATIVE</div>`);
    sfx('ui'); status();
  }

  function beginFirefight(){
    automa.startFirefight();
    lastResult = null;
    $('aStrategy').hidden = true; $('aFirefight').hidden = false;
    const card = $('aCard'); card.classList.remove('drawn');
    $('aCardNum').textContent = '--';
    $('aResult').innerHTML = 'PRESS NPO TURN<br><span class="blink">_</span>';
    $('aMemo').innerHTML = `<div>FIREFIGHT PHASE // <b>${lastInitiative.toUpperCase()}</b> ACTIVATE FIRST</div><div>ON EVERY NPO TURN DRAW ONE CARD, EVEN IF ALL NPO ARE EXPENDED. NPO DO NOT COUNTERACT.</div>`;
    status(); sfx('access'); glitch('card');
  }

  function behaviourMemo(){
    const s = automa.state();
    const types = [...new Set(s.roster.map(u => u.npoId))].map(id => faction.units.find(u => u.id === id));
    if(!types.length) return '<div>NO NPO ON THE BOARD // SKIP</div>';
    return `<div class="a-beh">${types.map(u => {
      const arch = u.behaviour.split(/[ ,.]/)[0];
      const b = data.npo.behaviours[arch];
      return `<details><summary>${esc(u.name).toUpperCase()} // ${md(u.behaviour).toUpperCase()}</summary>
        <div>${md(b.desc)}</div><ol>${b.steps.map(st => `<li>${md(st)}</li>`).join('')}</ol></details>`; }).join('')}</div>`;
  }

  function showResult(r){
    lastResult = r.pending ? null : r;
    const card = $('aCard');
    card.classList.remove('drawn'); void card.offsetWidth; card.classList.add('drawn');
    $('aCardNum').textContent = pad(r.card);
    const memo = $('aMemo');
    if(r.pending){
      $('aResult').textContent = 'QUERY';
      memo.innerHTML = `<div><b>${QUESTIONS[r.needs] || r.needs.toUpperCase()}</b></div><div class="a-yesno"><button data-answer="1">YES</button><button data-answer="0">NO</button></div>`;
      memo.querySelectorAll('[data-answer]').forEach(b => bindPress(b, () => { const res = automa.resolvePending({ [r.needs]: b.dataset.answer === '1' }); sfx('ui'); showResult(res); }));
      status(); return;
    }
    const parts = [];
    if(r.result === 'reinforce'){
      $('aResult').textContent = `${r.points >= 0 ? '+' : ''}${r.points} POOL`;
      parts.push(`<div>REINFORCEMENT POINTS // <b>${r.points >= 0 ? '+' : ''}${r.points}</b> → POOL <b>${pts(r.pool)}</b></div>`);
      if(r.row.note) parts.push(`<div>${esc(r.row.note).toUpperCase()}</div>`);
      parts.push(`<div class="a-force" id="aMemoSpawn"></div>`);
      if(r.row.then === 'activate') parts.push(`<div>THEN <b>ACTIVATE ONE NPO</b></div>`);
    }
    if(r.result === 'activate' || r.row.then === 'activate'){
      if(r.result === 'activate') $('aResult').textContent = r.activate ? 'ACTIVATE ONE NPO' : 'NO READY NPO // SKIP';
      if(r.activate){
        parts.push(`<div>READY NPO: <b>${pad(r.readyCount)}</b>. IF SEVERAL COULD ACTIVATE, PICK THE ONE THAT:</div><ol>${ACTIVATION_PRIORITY.map(x => `<li>${md(x)}</li>`).join('')}</ol>`);
        parts.push(`<div class="a-act" id="aMemoReady"></div>`);
        parts.push(behaviourMemo());
      }else parts.push('<div>ALL NPO EXPENDED // ALTERNATE BACK TO THE PLAYERS</div>');
    }
    if(r.result === 'skip'){ $('aResult').textContent = 'NO EFFECT'; parts.push(`<div>${esc(r.row.note || 'NO EFFECT').toUpperCase()}</div><div>ALTERNATE BACK TO THE PLAYERS</div>`); }
    if(r.result === 'event'){ $('aResult').textContent = 'EVENT'; parts.push(`<div>${esc(r.row.note || 'EVENT').toUpperCase()}</div><div>EVENT DECK NOT CONFIGURED YET // TREAT AS NO EFFECT</div>`); }
    if(r.result === 'custom'){ $('aResult').textContent = 'CUSTOM'; parts.push(`<div>${esc(r.text).toUpperCase()}</div>`); }
    memo.innerHTML = parts.join('');
    const sp = $('aMemoSpawn'); if(sp) spawnRows(r.affordable || automa.affordable(), sp);
    readyRows();
    status();
  }

  // Ready NPOs on the board with a button to mark the chosen one as activated (expended).
  function readyRows(){
    const el = $('aMemoReady'); if(!el) return;
    const ready = automa.state().roster.filter(u => u.ready);
    el.innerHTML = ready.map(u => `<div class="a-row" data-uid="${u.uid}">
      <span class="a-name pixel-text">${esc(u.name).toUpperCase()} #${u.uid}</span>
      <span class="a-pts pixel-text">W ${u.wounds}/${u.maxWounds} · ${u.order.toUpperCase()}</span>
      <button data-activated="${u.uid}">DONE</button></div>`).join('');
    el.querySelectorAll('[data-activated]').forEach(b => bindPress(b, () => { automa.setReady(Number(b.dataset.activated), false); sfx('discard'); readyRows(); status(); }));
  }

  function npoTurn(){
    const r = automa.npoTurn();
    if(!r) return;
    sfx('draw'); glitch('card');
    showResult(r);
  }

  // --- roster overlay -----------------------------------------------------
  function renderRoster(){
    const s = automa.state();
    $('aRosterCount').textContent = `${pad(s.roster.length)} / ${s.npoLimit} // POOL ${pts(s.pool)}`;
    const el = $('aRosterList');
    if(!s.roster.length){ el.innerHTML = '<div class="a-note pixel-text">NO NPO ON THE BOARD_</div>'; return; }
    el.innerHTML = s.roster.map(u => `<div class="a-unit${u.ready ? '' : ' expended'}" data-uid="${u.uid}">
      <button class="a-uname" data-card="${u.npoId}">${esc(u.name).toUpperCase()} #${u.uid}</button>
      <button class="a-utog a-uorder${u.order === 'engage' ? ' engage' : ''}" data-order="${u.uid}">ORDER: ${u.order.toUpperCase()}</button>
      <button class="a-utog a-uready${u.ready ? '' : ' expended'}" data-ready="${u.uid}">${u.ready ? 'READY' : 'EXPENDED'}</button>
      <button class="a-step" data-wdec="${u.uid}">-</button>
      <div class="a-w${u.wounds <= Math.ceil(u.maxWounds / 2) ? ' low' : ''}">${u.wounds}<small>/ ${u.maxWounds} W</small></div>
      <button class="a-step" data-winc="${u.uid}" ${u.wounds >= u.maxWounds ? 'disabled' : ''}>+</button>
    </div>`).join('');
    const uid = b => Number(b.dataset.order || b.dataset.ready || b.dataset.wdec || b.dataset.winc);
    el.querySelectorAll('[data-order]').forEach(b => bindPress(b, () => { const u = automa.state().roster.find(x => x.uid === uid(b)); automa.setOrder(u.uid, u.order === 'engage' ? 'conceal' : 'engage'); sfx('ui'); renderRoster(); }));
    el.querySelectorAll('[data-ready]').forEach(b => bindPress(b, () => { const u = automa.state().roster.find(x => x.uid === uid(b)); automa.setReady(u.uid, !u.ready); sfx('ui'); renderRoster(); }));
    el.querySelectorAll('[data-wdec]').forEach(b => bindPress(b, () => { const u = automa.state().roster.find(x => x.uid === uid(b)); automa.setWounds(u.uid, u.wounds - 1); sfx(u.wounds - 1 <= 0 ? 'discard' : 'ui'); if(u.wounds - 1 <= 0) glitch('card'); renderRoster(); status(); }));
    el.querySelectorAll('[data-winc]').forEach(b => bindPress(b, () => { const u = automa.state().roster.find(x => x.uid === uid(b)); automa.setWounds(u.uid, u.wounds + 1); sfx('ui'); renderRoster(); }));
    el.querySelectorAll('[data-card]').forEach(b => bindPress(b, () => openDatacard(b.dataset.card)));
    save();
  }
  function openRoster(){ renderRoster(); $('aRoster').hidden = false; sfx('ui'); glitch('light'); }
  function closeRoster(){ $('aRoster').hidden = true; sfx('ui'); readyRows(); status(); }

  function openDatacard(npoId){
    const u = faction.units.find(x => x.id === npoId); if(!u) return;
    const arch = u.behaviour.split(/[ ,.]/)[0];
    const b = data.npo.behaviours[arch];
    const t = faction.trait;
    $('aDatacardBody').innerHTML = `<div class="a-dc">
      <div class="a-h pixel-text"><span>NPO DATACARD</span><b>${esc(faction.name).toUpperCase()}</b></div>
      <h3>${esc(u.name).toUpperCase()}</h3>
      <div class="a-kw">${u.keywords.map(esc).join(', ').toUpperCase()}</div>
      <div class="a-stats"><div><small>APL</small><b>${u.apl}</b></div><div><small>MOVE</small><b>${esc(u.move)}</b></div><div><small>SAVE</small><b>${esc(u.save)}</b></div><div><small>WOUNDS</small><b>${u.wounds}</b></div><div><small>POINTS</small><b>${pts(u.points)}</b></div></div>
      <table><tr><th>WEAPON</th><th class="n">ATK</th><th class="n">HIT</th><th class="n">DMG</th><th>WR</th></tr>
      ${u.weapons.map(w => `<tr><td>${w.type === 'ranged' ? '▸' : '✕'} ${esc(w.name)}${w.optional ? '*' : ''}</td><td class="n">${w.atk}</td><td class="n">${esc(w.hit)}</td><td class="n">${esc(w.dmg)}</td><td>${esc(w.rules) || '—'}</td></tr>`).join('')}</table>
      <div class="a-rule"><b>BEHAVIOUR:</b> ${md(u.behaviour)}</div>
      ${u.rules.map(r => `<div class="a-rule"><b>${esc(r.title).toUpperCase()}:</b> ${md(r.text)}</div>`).join('')}
      <div class="a-rule"><b>${arch.toUpperCase()}:</b> ${md(b.desc)}<ol>${b.steps.map(st => `<li>${md(st)}</li>`).join('')}</ol></div>
      <div class="a-trait"><b>ALLEGIANCE TRAIT // ${esc(t.title).toUpperCase()}</b><br>${t.rules.map(md).join('<br>')}</div>
      <section class="controls"><button id="aDatacardClose">CLOSE DATACARD</button></section>
    </div>`;
    bindPress($('aDatacardClose'), () => { $('aDatacard').hidden = true; sfx('ui'); });
    $('aDatacard').hidden = false; sfx('ui'); glitch('light');
  }

  function endTurningPoint(){
    automa.endTurningPoint();
    strategyPhase();
  }

  function deploy(){
    automa = createAutoma({ config: { faction: faction.id, ...mission }, npoCatalog: faction.units });
    for(const u of faction.units) for(let i = 0; i < (counts[u.id] || 0); i++) automa.addNpo(u.id);
    automa.finishSetup();
    setup.hidden = true; game.hidden = false;
    strategyPhase();
    return automa;
  }

  async function resume(){
    const v = storage.get();
    if(!v || v.v !== 1) return false;
    await load();
    faction = data.npo.factions.find(f => f.id === v.faction);
    mission = [...data.presets.missions, data.presets.custom].find(m => m.id === v.mission);
    if(!faction || !mission) return false;
    restoring = true;
    automa = createAutoma({ config: { faction: faction.id, ...mission }, npoCatalog: faction.units });
    automa.restore(v.engine);
    lastInitiative = v.ui.lastInitiative || 'players';
    document.body.classList.add('mode-automa');
    root.hidden = false; setup.hidden = true; game.hidden = false;
    const s = automa.state();
    if(v.ui.panel === 'strategy'){
      $('aStrategyLines').innerHTML = v.ui.strategyLines || '';
      $('aTie').hidden = !v.ui.tieOpen; $('aBeginFirefight').disabled = !!v.ui.tieOpen;
      renderFlags(); spawnRows(automa.affordable(), $('aSpawnList'));
      $('aSpawnHint').textContent = s.pool ? `POOL ${pts(s.pool)} PTS` : 'POOL EMPTY';
      $('aPlacementGame').textContent = mission.placement || '';
      $('aStrategy').hidden = false; $('aFirefight').hidden = true;
    }else{
      $('aStrategy').hidden = true; $('aFirefight').hidden = false;
      $('aCard').classList.remove('drawn'); $('aCardNum').textContent = '--';
      $('aResult').innerHTML = 'PRESS NPO TURN<br><span class="blink">_</span>';
      $('aMemo').innerHTML = `<div>SESSION RESTORED // TP <b>${pad(s.tp)}</b> FIREFIGHT PHASE</div>`;
      if(s.pending) showResult(automa.npoTurn());
      else if(v.ui.lastResult) showResult(v.ui.lastResult);
    }
    restoring = false;
    status();
    return true;
  }

  async function start(){
    await load();
    document.body.classList.add('mode-automa');
    root.hidden = false; setup.hidden = false; game.hidden = true;
    frameTitle.textContent = 'JOINT OPS // AUTOMA SETUP';
    renderFactions(); renderMissions(); renderForce();
  }

  bindPress($('aDeploy'), deploy);
  bindPress($('aBeginFirefight'), beginFirefight);
  bindPress($('aNpoTurn'), npoTurn);
  bindPress($('aEndTp'), endTurningPoint);
  bindPress($('aRosterBtn1'), openRoster);
  bindPress($('aRosterBtn2'), openRoster);
  bindPress($('aRosterClose'), closeRoster);
  bindPress($('aExpendAll'), () => { automa.expendAll(); sfx('discard'); renderRoster(); });
  document.querySelectorAll('#aTie [data-init]').forEach(b => bindPress(b, () => decideTie(b.dataset.init)));
  bindPress($('aAbandon'), abandon);
  return { start, resume, hasSave, load, get automa(){ return automa; } };
}

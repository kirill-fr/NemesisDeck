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
    frameTitle.textContent = `JOINT OPS // ${mission.name.toUpperCase()} // TP ${pad(s.tp)}`;
    $('aDiscard').textContent = s.discard.length ? s.discard.map(pad).join(' ') : '—';
    $('aDeckLeft').textContent = s.deckRemaining;
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
        parts.push(behaviourMemo());
      }else parts.push('<div>ALL NPO EXPENDED // ALTERNATE BACK TO THE PLAYERS</div>');
    }
    if(r.result === 'skip'){ $('aResult').textContent = 'NO EFFECT'; parts.push(`<div>${esc(r.row.note || 'NO EFFECT').toUpperCase()}</div><div>ALTERNATE BACK TO THE PLAYERS</div>`); }
    if(r.result === 'event'){ $('aResult').textContent = 'EVENT'; parts.push(`<div>${esc(r.row.note || 'EVENT').toUpperCase()}</div><div>EVENT DECK NOT CONFIGURED YET // TREAT AS NO EFFECT</div>`); }
    if(r.result === 'custom'){ $('aResult').textContent = 'CUSTOM'; parts.push(`<div>${esc(r.text).toUpperCase()}</div>`); }
    memo.innerHTML = parts.join('');
    const sp = $('aMemoSpawn'); if(sp) spawnRows(r.affordable || automa.affordable(), sp);
    status();
  }

  function npoTurn(){
    const r = automa.npoTurn();
    if(!r) return;
    sfx('draw'); glitch('card');
    showResult(r);
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
  document.querySelectorAll('#aTie [data-init]').forEach(b => bindPress(b, () => decideTie(b.dataset.init)));
  return { start, load, get automa(){ return automa; } };
}

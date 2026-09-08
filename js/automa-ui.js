// Joint Ops automa: DOM wiring for the setup and game screens.
// Rules live in automa.js; data comes from data/npo.json and data/presets.json.
import { createAutoma } from './automa.js';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const pts = n => Number.isInteger(n) ? String(n) : String(n).replace('0.5', '½');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createAutomaUi({ bindPress, sfx, glitch, frameTitle }){
  const root = $('automa');
  const setup = $('automaSetup');
  const game = $('automaGame');
  let data = null;               // { npo, presets }
  let faction = null;
  let mission = null;
  let counts = {};               // npoId -> number
  let automa = null;

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

  // --- game screen (turning point flow lands in the next build) -----------
  function deploy(){
    automa = createAutoma({ config: { faction: faction.id, ...mission }, npoCatalog: faction.units });
    for(const u of faction.units) for(let i = 0; i < (counts[u.id] || 0); i++) automa.addNpo(u.id);
    automa.finishSetup();
    const s = automa.state();
    sfx('access'); glitch('card');
    frameTitle.textContent = `JOINT OPS // ${mission.name.toUpperCase()} // TP ${pad(s.tp)}`;
    setup.hidden = true; game.hidden = false;
    $('aGameSummary').innerHTML = `FORCE DEPLOYED: <b>${pad(s.roster.length)}</b> NPO // POOL <b>${pts(s.pool)}</b> PTS<br>${s.roster.map(u => esc(u.name).toUpperCase()).join(' · ')}`;
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
  return { start, load, get automa(){ return automa; } };
}

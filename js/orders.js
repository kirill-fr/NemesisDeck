// NPO orders: per-archetype routine decks and one tactical deck.
// Pure module; rng injectable. Data shape: data/orders.json.
import { shuffle } from './deck.js';

export const ARCHETYPES = ['Brawler', 'Marksman', 'Battler', 'Guardian'];

export function archetypeOf(behaviourText){
  const first = String(behaviourText || '').split(/[ ,.]/)[0];
  return ARCHETYPES.includes(first) ? first : null;
}

// "Guardian or Battler" -> any of; "Marksman and Guardian" -> all of;
// "Brawler and Guardian or Battler" -> a Brawler AND (a Guardian or a Battler). Returns groups: every group needs one of its options.
export function parseWho(who){
  return who.split(/ and /).map(g => g.split(/ or /).map(s => s.trim()));
}
export function canExecute(who, readyArchetypes){
  return parseWho(who).every(group => group.some(a => readyArchetypes.has(a)));
}

export function createOrders({ orders, rng = Math.random }){
  const routine = {};   // archetype -> { draw, discard }
  for(const [arch, def] of Object.entries(orders.archetypes)){
    routine[arch] = { draw: shuffle(def.deck, rng), discard: [] };
  }
  const tactical = { draw: shuffle(orders.tactical.cards.map(c => c.id), rng), discard: [] };

  function parseCard(label){
    const m = label.match(/^(.*?)\s*([↶↷])?$/);
    return { name: m[1].trim(), arrow: m[2] || '' };
  }

  function drawRoutine(archetype){
    const d = routine[archetype];
    if(!d) return null;
    if(!d.draw.length){ d.draw = shuffle(d.discard, rng); d.discard = []; }
    const label = d.draw.pop();
    d.discard.push(label);
    const { name, arrow } = parseCard(label);
    const def = orders.archetypes[archetype].routines[name];
    return { archetype, name, arrow, label, steps: def.steps, fallback: def.fallback, focus: orders.archetypes[archetype].focus, anchor: orders.archetypes[archetype].anchor || null };
  }

  // Draw tactical cards until one has an executor among the ready archetypes.
  function drawTactical(readyArchetypes){
    const ready = readyArchetypes instanceof Set ? readyArchetypes : new Set(readyArchetypes);
    const total = tactical.draw.length + tactical.discard.length;
    const skipped = [];
    for(let i = 0; i < total; i++){
      if(!tactical.draw.length){ tactical.draw = shuffle(tactical.discard, rng); tactical.discard = []; }
      const id = tactical.draw.pop();
      tactical.discard.push(id);
      const card = orders.tactical.cards.find(c => c.id === id);
      if(canExecute(card.who, ready)) return { ...card, skipped };
      skipped.push(id);
    }
    return null;
  }

  function state(){
    return {
      routine: Object.fromEntries(Object.entries(routine).map(([k, v]) => [k, { remaining: v.draw.length, discard: [...v.discard] }])),
      tactical: { remaining: tactical.draw.length, discard: [...tactical.discard] },
    };
  }
  function serialize(){ return { routine, tactical }; }
  function restore(s){
    for(const k of Object.keys(routine)) if(s.routine[k]) routine[k] = { draw: [...s.routine[k].draw], discard: [...s.routine[k].discard] };
    tactical.draw = [...s.tactical.draw]; tactical.discard = [...s.tactical.discard];
  }

  return { drawRoutine, drawTactical, state, serialize, restore, effects: orders.tactical.effects, resolver: orders.resolver, activationPriority: orders.activationPriority };
}

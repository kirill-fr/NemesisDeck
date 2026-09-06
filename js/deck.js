// Pure Nemesis deck engine. No DOM, no timers, no audio.
// Every random decision takes an injectable rng (a function returning [0,1))
// so tests can be deterministic and the behaviour stays byte-identical to
// the original inline script: Fisher-Yates shuffle, threat 13..17, 5% award.

export const MIN_SIZE = 10;
export const MAX_SIZE = 16;
export const DEFAULT_SIZE = 13;

export function clampSize(count){
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Number(count) || DEFAULT_SIZE));
}

export function shuffle(a, rng = Math.random){
  a = [...a];
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rollThreat(rng = Math.random){
  return 13 + Math.floor(rng() * 5);
}

export function rollReinforcement(rng = Math.random){
  return rng() < 0.05;
}

export function createDeck({ size = DEFAULT_SIZE, rng = Math.random } = {}){
  const total = clampSize(size);
  let deck = [];
  let discard = [];
  let current = null;
  let sequence = 0;
  let threatLevel = null;

  function reset(){
    deck = shuffle(Array.from({ length: total }, (_, i) => i + 1), rng);
    discard = [];
    current = null;
    sequence = 0;
    threatLevel = rollThreat(rng);
  }

  // Draw the next card. Returns { card, reinforcement } or null when blocked
  // (a card is already active, or the deck is empty).
  function draw(){
    if(current !== null || !deck.length) return null;
    current = deck.pop();
    sequence++;
    return { card: current, reinforcement: rollReinforcement(rng) };
  }

  // Move the active card to the discard pile. Returns false when nothing is active.
  function discardCurrent(){
    if(current === null) return false;
    discard.push(current);
    current = null;
    return true;
  }

  function state(){
    return { size: total, deck: [...deck], discard: [...discard], current, sequence, threatLevel };
  }

  reset();
  return { draw, discard: discardCurrent, restart: reset, state };
}

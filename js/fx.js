// CRT glitch effects: one-shot terminal glitch and the rare idle glitch scheduler.

export function createFx({ panel, screen, card }){
  function glitch(strength='light'){
    if(!panel || !screen) return;
    panel.classList.remove('terminal-jolt');
    screen.classList.remove('glitch-flash');
    card.classList.remove('card-glitch');
    void panel.offsetWidth;
    panel.classList.add('terminal-jolt');
    screen.classList.add('glitch-flash');
    if(strength==='card') card.classList.add('card-glitch');
    setTimeout(()=>{
      panel.classList.remove('terminal-jolt');
      screen.classList.remove('glitch-flash');
      card.classList.remove('card-glitch');
    },190);
  }

  // Rare idle glitch: short and intentionally infrequent.
  function scheduleIdleGlitch(){
    const delay=3200+Math.random()*6200;
    setTimeout(()=>{
      if(document.visibilityState==='visible' && Math.random()<.78) glitch(Math.random()<.22?'card':'light');
      scheduleIdleGlitch();
    },delay);
  }

  return { glitch, startIdleGlitch: scheduleIdleGlitch };
}

// Background loop + boot sting (<audio> elements in index.html).

export function createTracks({ bgTrack, mechanicusTrack, bootOverlay }){
  // bg loop is preload="none" (1.8 MB); warm it on the first touch of the boot screen
  // so it is buffered by the time INITIALIZE is pressed.
  if(bgTrack && bootOverlay){
    bootOverlay.addEventListener('pointerdown', ()=>{ try{ bgTrack.load(); }catch(e){} }, { once:true, passive:true });
  }

  function startBackground(enabled){
    if(!bgTrack) return;
    bgTrack.volume = 0.045;
    if(!enabled){ bgTrack.pause(); bgTrack.currentTime=0; return; }
    const p = bgTrack.play();
    if(p && p.catch) p.catch(()=>{});
  }

  function stopAll(){
    if(bgTrack){ bgTrack.pause(); bgTrack.currentTime=0; }
    if(mechanicusTrack){ mechanicusTrack.pause(); mechanicusTrack.currentTime=0; }
  }

  function playSting(){
    if(!mechanicusTrack) return;
    try{
      mechanicusTrack.pause();
      mechanicusTrack.currentTime=0;
      mechanicusTrack.volume=0.045;
      const p=mechanicusTrack.play();
      if(p && p.catch) p.catch(()=>{});
    }catch(e){}
  }

  return { startBackground, stopAll, playSting };
}

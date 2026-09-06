// Synthesized terminal SFX (WebAudio). Moved verbatim from the inline script.

let audioCtx = null;
let masterGain = null;

function ensureAudio(){
  try{
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.396;
      masterGain.connect(audioCtx.destination);
    }
    if(audioCtx.state === 'suspended') audioCtx.resume();
    return true;
  }catch(e){ return false; }
}

export function tone(freq=120, duration=.06, type='square', volume=.12, slide=0){
  if(!ensureAudio()) return;
  const now=audioCtx.currentTime;
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  osc.type=type;
  osc.frequency.setValueAtTime(freq,now);
  if(slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),now+duration);
  gain.gain.setValueAtTime(0.0001,now);
  gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume),now+.008);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(now); osc.stop(now+duration+.015);
}

export function noise(duration=.045, volume=.055, highpass=900){
  if(!ensureAudio()) return;
  const length=Math.max(1,Math.floor(audioCtx.sampleRate*duration));
  const buffer=audioCtx.createBuffer(1,length,audioCtx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<length;i++) data[i]=(Math.random()*2-1)*(1-i/length);
  const src=audioCtx.createBufferSource();
  const filter=audioCtx.createBiquadFilter();
  const gain=audioCtx.createGain();
  filter.type='highpass'; filter.frequency.value=highpass;
  gain.gain.value=volume;
  src.buffer=buffer; src.connect(filter); filter.connect(gain); gain.connect(masterGain);
  src.start();
}

// kind: 'draw' | 'discard' | 'restart' | 'access' | anything else = short UI blip
export function sciFiSound(kind){
  if(!ensureAudio()) return;
  const burst=(base, steps=5, gap=13, vol=.14)=>{
    for(let i=0;i<steps;i++){
      setTimeout(()=>{
        const f=base*(0.72+Math.random()*.75);
        tone(f,.018+Math.random()*.025,i%2?'square':'sawtooth',vol*(.72+Math.random()*.35),(Math.random()-.5)*120);
        noise(.014+Math.random()*.024,vol*.42,500+Math.random()*2400);
      },i*gap);
    }
  };
  if(kind==='draw'){
    burst(155,7,12,.19);
    tone(68,.13,'sawtooth',.20,180);
    setTimeout(()=>tone(410,.05,'square',.16,-260),58);
  }else if(kind==='discard'){
    burst(105,6,11,.18);
    tone(220,.08,'square',.16,-175);
  }else if(kind==='restart'){
    burst(82,8,15,.17);
    tone(54,.18,'sawtooth',.18,220);
  }else if(kind==='access'){
    burst(70,9,20,.12);
    tone(48,.32,'sawtooth',.13,110);
  }else{
    burst(245,4,9,.13);
  }
}

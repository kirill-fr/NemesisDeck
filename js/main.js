// Bootstrap + DOM wiring. Game rules live in deck.js; this file only
// translates button presses into engine calls and engine state into DOM.
import { createDeck, clampSize, DEFAULT_SIZE } from './deck.js';
import { sciFiSound } from './sfx.js';
import { createTracks } from './tracks.js';
import { createFx } from './fx.js';

const $ = id => document.getElementById(id);
const reinforcementNotice = $('reinforcementNotice');
const card = $('card');
const empty = $('empty');
const num = $('num');
const drawBtn = $('drawBtn');
const discardBtn = $('discardBtn');
const restartBtn = $('restartBtn');
const bootOverlay = $('bootOverlay');
const bootConfirm = $('bootConfirm');
const bootStatus = $('bootStatus');
const frameTitle = $('frameTitle');
const accessSequence = $('accessSequence');
const threatReveal = $('threatReveal');
const threatIntroValue = $('threatIntroValue');
const threatValue = $('threatValue');
const threatIntroOverlay = $('threatIntroOverlay');
const threatIntroNumber = $('threatIntroNumber');
const deckOptions = [...document.querySelectorAll('.deck-option')];
const musicOptions = [...document.querySelectorAll('.music-option')];
const musicQuestion = $('musicQuestion');
const deckPrompt = $('deckPrompt');
const praiseOverlay = $('praiseOverlay');
const praiseTyped = $('praiseTyped');
const bootPraiseTyped = $('bootPraiseTyped');

const tracks = createTracks({ bgTrack: $('bgTrack'), mechanicusTrack: $('mechanicusTrack'), bootOverlay });
const fx = createFx({ panel: document.querySelector('.panel'), screen: document.querySelector('.screen'), card });
const terminalGlitch = fx.glitch;

let totalCards = DEFAULT_SIZE;
let game = null;            // createDeck() instance; null until INITIALIZE
let musicEnabled = true;
let gameSequence = 0;
let praiseTypingTimer = null;
let welcomePraisePlayed = false;

fx.startIdleGlitch();

const EMPTY = { deck: [], discard: [], current: null, sequence: 0, threatLevel: null };
const state = () => game ? game.state() : EMPTY;

function playWelcomePraise(){
  if(welcomePraisePlayed) return;
  welcomePraisePlayed = true;
  const phrase='PRAISE THE OMNISSIAH';
  if(praiseTypingTimer) clearInterval(praiseTypingTimer);
  if(bootPraiseTyped) bootPraiseTyped.textContent='';
  terminalGlitch('light');
  let i=0;
  praiseTypingTimer=setInterval(()=>{
    i++;
    if(bootPraiseTyped) bootPraiseTyped.textContent=phrase.slice(0,i);
    if(i%3===0) sciFiSound('ui');
    if(i>=phrase.length){
      clearInterval(praiseTypingTimer);
      praiseTypingTimer=null;
    }
  },110);
  tracks.playSting();
}

function showThreatLevel(){
  const t = state().threatLevel;
  threatIntroValue.textContent=String(t).padStart(2,'0');
  threatValue.textContent=String(t).padStart(2,'0');
}

function pulse(btn){
  [drawBtn,discardBtn,restartBtn].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  setTimeout(()=>btn.classList.remove('active'),280);
}

function update(){
  const { deck, discard, current, sequence } = state();
  $('deckCount').textContent=String(deck.length).padStart(2,'0');
  $('discardCount').textContent=String(discard.length).padStart(2,'0');
  $('activeCount').textContent=current===null?'--':String(current).padStart(2,'0');
  $('deckSmall').textContent=String(deck.length).padStart(2,'0');
  $('discardSmall').textContent=String(discard.length).padStart(2,'0');
  $('seqSmall').textContent=String(sequence).padStart(2,'0')+'/'+String(totalCards).padStart(2,'0');

  if(current===null){
    card.classList.remove('active');
    empty.style.display='block';
    empty.innerHTML=deck.length
      ? 'PRESS DRAW CARD<br><span class="blink">_</span>'
      : 'SEQUENCE COMPLETE<br>RESTART REQUIRED';
  }else{
    empty.style.display='none';
    card.classList.add('active');
    num.textContent=String(current).padStart(2,'0');
  }

  drawBtn.disabled=current!==null || deck.length===0;
  discardBtn.disabled=current===null;
}

function restart(){
  sciFiSound('restart');
  terminalGlitch('card');
  pulse(restartBtn);

  game.restart();
  showThreatLevel();
  setTimeout(showThreatIntro, 350);
  update();

  if(threatValue){
    threatValue.classList.remove('blink');
    void threatValue.offsetWidth;
    threatValue.classList.add('blink');
    setTimeout(()=>threatValue.classList.remove('blink'),700);
  }
}

function showReinforcementPoint(){
  if(!reinforcementNotice) return;
  reinforcementNotice.classList.remove('active');
  void reinforcementNotice.offsetWidth;
  reinforcementNotice.classList.add('active');
  setTimeout(()=>reinforcementNotice.classList.remove('active'), 2150);
}

function draw(){
  const s = state();
  if(s.current!==null || !s.deck.length) return;
  sciFiSound('draw');
  terminalGlitch('card');
  const result = game.draw();
  if(result && result.reinforcement) showReinforcementPoint();
  pulse(drawBtn);
  update();
}

function discardCurrent(){
  if(state().current===null) return;
  sciFiSound('discard');
  terminalGlitch('light');
  game.discard();
  pulse(discardBtn);
  update();
}

function bindPress(el, handler){
  let handledByPointer = false;

  if (window.PointerEvent) {
    el.addEventListener('pointerup', function(e){
      if (el.disabled) return;
      handledByPointer = true;
      e.preventDefault();
      handler();
      setTimeout(()=>handledByPointer=false, 300);
    }, {passive:false});
  }

  el.addEventListener('touchend', function(e){
    if (el.disabled || handledByPointer) return;
    e.preventDefault();
    handler();
  }, {passive:false});

  el.addEventListener('click', function(e){
    if (el.disabled || handledByPointer) return;
    e.preventDefault();
    handler();
  });
}

function selectMusic(enabled){
  musicEnabled = enabled;
  musicOptions.forEach(b=>b.classList.toggle('selected', (b.dataset.music==='on')===musicEnabled));
  bootStatus.textContent='MUSIC: '+(musicEnabled?'ENABLED':'DISABLED')+' // SELECT DECK_';
  sciFiSound('ui');
  terminalGlitch('light');
}

function prepareSequenceSetup(){
  gameSequence++;
  tracks.stopAll();
  bootOverlay.classList.remove('hidden');
  bootStatus.style.display='block';
  bootStatus.textContent='SEQUENCE '+String(gameSequence).padStart(2,'0')+' // CONFIGURE_';
  document.getElementById('deckPicker').style.display='grid';
  bootConfirm.style.display='block';
  document.querySelector('.boot-title').style.display='block';
  const bootPraise = document.getElementById('bootPraise');
  if(bootPraise) bootPraise.style.display='block';
  document.querySelector('.boot-title').textContent='NPO TERMINAL BOOT // SEQUENCE '+String(gameSequence).padStart(2,'0');
  document.querySelector('.boot-sub').style.display='block';
  if(musicQuestion) musicQuestion.style.display='block';
  if(deckPrompt) deckPrompt.style.display='block';
  accessSequence.classList.remove('active');
  threatReveal.classList.remove('active');
  threatIntroValue.textContent='--';
  threatValue.textContent='--';
  game=null;
  if(praiseTypingTimer){clearInterval(praiseTypingTimer);praiseTypingTimer=null;}
  // TODO(owner): #praiseOverlay / #praiseTyped are never activated anywhere. Planned feature or leftover?
  if(praiseTyped) praiseTyped.textContent='';
  if(praiseOverlay){praiseOverlay.classList.remove('active','exiting');praiseOverlay.setAttribute('aria-hidden','true');}
  update();
  setTimeout(playWelcomePraise,220);
}

function selectDeckSize(count){
  totalCards = clampSize(count);
  deckOptions.forEach(b=>b.classList.toggle('selected', Number(b.dataset.count)===totalCards));
  bootConfirm.textContent='INITIALIZE DECK // '+String(totalCards).padStart(2,'0');
  bootStatus.textContent='SEQUENCE SIZE: '+String(totalCards).padStart(2,'0')+' // READY_';
  sciFiSound('ui');
  terminalGlitch('light');
}

function showThreatIntro(){
  if(!threatIntroOverlay || !threatIntroNumber) return;
  threatIntroNumber.textContent = String(state().threatLevel);
  threatIntroOverlay.classList.remove('active');
  void threatIntroOverlay.offsetWidth;
  threatIntroOverlay.classList.add('active');
  terminalGlitch('light');
  setTimeout(()=>threatIntroOverlay.classList.remove('active'), 2200);
}

function initializeDeck(){
  game = createDeck({ size: totalCards });
  showThreatLevel();
  setTimeout(showThreatIntro, 350);
  frameTitle.textContent='IMPERIAL DATA TERMINAL // NPO-'+String(totalCards).padStart(2,'0');
  bootStatus.style.display='none';
  document.getElementById('deckPicker').style.display='none';
  bootConfirm.style.display='none';
  document.querySelector('.boot-title').style.display='none';
  const bootPraise = document.getElementById('bootPraise');
  if(bootPraise) bootPraise.style.display='none';
  document.querySelector('.boot-sub').style.display='none';
  if(musicQuestion) musicQuestion.style.display='none';
  if(deckPrompt) deckPrompt.style.display='none';
  accessSequence.classList.add('active');
  threatReveal.classList.remove('active');
  tracks.startBackground(musicEnabled);
  sciFiSound('access');
  terminalGlitch('card');
  setTimeout(()=>{
    threatReveal.classList.add('active');
    sciFiSound('draw');
    terminalGlitch('card');
  },1050);
  setTimeout(()=>{
    bootOverlay.classList.add('hidden');
    update();
  },2600);
}

musicOptions.forEach(btn=>bindPress(btn,()=>selectMusic(btn.dataset.music==='on')));
deckOptions.forEach(btn=>bindPress(btn,()=>selectDeckSize(btn.dataset.count)));
bindPress(bootConfirm, initializeDeck);

bindPress(drawBtn, draw);
bindPress(discardBtn, discardCurrent);
bindPress(restartBtn, restart);

selectMusic(true);
prepareSequenceSetup();

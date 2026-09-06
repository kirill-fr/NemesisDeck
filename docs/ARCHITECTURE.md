# Architecture

Static site, no build. `index.html` is markup only and loads CSS files and one ES module.

## CSS: ordered slices

`css/` files are contiguous slices of the original single stylesheet, linked in this exact order:

1. `tokens.css` – `@font-face`, `:root` variables and the first few rules.
2. `base.css` – reset, panel/screen chrome, header, layout, card, stats, buttons, bottom frame.
3. `effects.css` – glitch layer, CRT noise and shake.
4. `boot.css` – boot overlay, deck/music selector, praise transmission.
5. `terminal.css` – late overrides (font force, mobile safety), access sequence, praise overlay, threat intro.

**The order matters.** Later files override earlier ones, often with `!important` (see BACKLOG). Reordering rules
across files changes the cascade; concatenating the files in order must still reproduce the original stylesheet.

## JS modules

```
main.js    DOM lookups, screen flow (boot → access sequence → terminal), button wiring (bindPress)
deck.js    pure engine, no DOM/timers/audio; all randomness through an injectable rng
sfx.js     WebAudio synth: tone(), noise(), sciFiSound(kind)
tracks.js  <audio> handling: background loop, boot sting, first-touch warm-up
fx.js      terminalGlitch() and the idle glitch scheduler
```

### Engine contract (`deck.js`)

```js
const game = createDeck({ size, rng = Math.random });
game.draw()     // -> { card, reinforcement } | null when blocked (card active or deck empty)
game.discard()  // -> true | false when nothing is active
game.restart()  // reshuffle, clear discard, reroll threat
game.state()    // -> { size, deck, discard, current, sequence, threatLevel } (copies)
```

Invariants covered by `tests/deck.test.js`: every card drawn exactly once, `deck + discard + active === size`,
draw blocked while active/empty, restart resets, seeded rng reproduces the same run.

Random call order is the same as the original inline script (shuffle, then threat; on draw: pop, then the
5% award roll) so a seeded run of the new code matches a seeded run of the old one.

## Screen flow

1. **Boot overlay**: music on/off, deck size 10..16, INITIALIZE. `prepareSequenceSetup()` resets it; the
   "PRAISE THE OMNISSIAH" typewriter and the boot sting fire 220 ms after load.
2. **INITIALIZE**: `createDeck()`, access sequence animation (1050 ms reveal, 2600 ms overlay hide), threat intro
   overlay at 350 ms, background loop starts if music is on.
3. **Terminal**: DRAW / DISCARD / RESTART. RESTART reshuffles in place and shows the threat intro again; it does not
   return to the boot overlay (deck size and music can only be changed by reloading).

## Assets

- `assets/audio/bg-loop.mp3` 1.8 MB, `preload="none"`, warmed with `load()` on the first `pointerdown` inside
  the boot overlay. `assets/audio/mechanicus-sting.mp3` 13 KB, `preload="auto"`.
- `assets/fonts/`: Star Crush (headings), Pixelify Sans 400/700 (body). The two Pixelify weights are preloaded.

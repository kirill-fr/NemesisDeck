# Backlog

Things noticed during the untangling that were deliberately left alone. Nothing here changes behaviour until
the owner says so.

## Owner questions (TODO(owner))

- `#praiseOverlay` / `#praiseTyped` ("first-draw Omnissiah transmission") have CSS and reset code but are never
  activated. Planned feature or leftover?
- On INITIALIZE the THREAT LEVEL intro overlay (350 ms) overlaps the ACCESS TERMINAL box, which already shows
  the threat level. Keep both, or show the intro only on RESTART?
- Deck size: code allows 10..16, the owner mentioned 11..16.
- `<html lang="ru">` with an all-English UI.
- Reinforcement points are a 2-second toast and are not counted anywhere. Running total in the side box?
  Manual +/- as well (the rulebook awards them in other ways too)?
- RESTART reshuffles silently. Return to the config screen, or add a separate NEW SEQUENCE button?
- Licences: Pixelify Sans is OFL. Star Crush: unknown. Music: provenance unknown. No LICENSE file (MIT suggested).

## Reported by the owner

- "The game resets by itself when the card sits for a long time or the screen turns off." Mobile browsers discard
  background tabs; there is no persistence, so a reload is a lost game. Fix: persist state in `localStorage`
  and restore on load.
- "Buttons and music stopped working." No repro steps yet. Likely the same tab-discard case plus a suspended
  AudioContext after the page comes back. Needs steps to reproduce.
- Body font: owner wants LowresPixel-Regular.otf instead of Pixelify Sans (Star Crush stays for headings).
- Wanted: an NPO stats menu (datacards), a random events "hardcore" deck, harder bots, and a flow that returns
  to the boot screen after a game ends.

## Code smells kept on purpose (behaviour-preserving phase)

- **27 `!important`** in the stylesheet: `tokens.css` (2: heading font), `terminal.css` (25: the "Force Pixelify
  Sans" block, the `.panel` animation reset, and the whole `@media (max-width:560px)` mobile block). They exist
  because later sections override earlier ones; folding them into `base.css` needs a cascade pass with
  computed-style diffing.
- Pixelify Sans **400** is loaded but nothing renders with it (everything is 700 or Star Crush).
- Five inline aquila SVGs. They are not identical copies (different rects/sizes), so no `<use>` dedupe.
- `bindPress()` binds `pointerup` + `touchend` + `click` with a 300 ms guard and no `pointerdown` check, so a
  scroll that ends on a button fires it.
- The boot sting is played on load and is blocked by autoplay policy on first visit; the error is swallowed.
  The WebAudio context is also created on load (console warnings). Play both on the first user gesture instead.
- Idle glitch timer runs forever; `prefers-reduced-motion` is handled in CSS only.
- `viewport-fit=cover` is set but no `env(safe-area-inset-*)` is used.
- Buttons have no `type="button"`; `<svg aria-label>` and duplicate unnamed landmarks flagged by html-validate
  (rules disabled in `.htmlvalidate.json` for now).
- `gameSequence` is always 1 (`prepareSequenceSetup()` runs once).

## Later

- Persist `{ size, deck, discard, current, sequence, threatLevel, musicEnabled, reinforcements }`.
- Reinforcement counter in the side box.
- Undo last draw.
- PWA (`manifest.json` + service worker, scope `/NemesisDeck/`).
- Datacards drawer from `data/npo.json`.
- Keyboard shortcuts on desktop, seed in the URL hash.
- Re-encode the background loop to Opus (~1.4 MB) with mp3 fallback, or get the source from the owner.

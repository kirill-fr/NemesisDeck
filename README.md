# NemesisDeck

A one-screen companion for **Kill Team** games against NPOs (non-player operatives). It replaces the physical
numbered Nemesis deck: pick a deck size, and the terminal draws random card numbers for you, tracks the
active card and the discard pile, and rolls a threat level for the sequence.

Live: <https://nazardesignstar.github.io/NemesisDeck/>

Design, copy, sound and music: **Nazar Design**.

## What it implements

- Deck of `N` numbered cards, `N` = 10..16 (default 13). Fisher-Yates shuffle.
- **DRAW CARD** pops the next card. Blocked while a card is active or the deck is empty.
- **DISCARD ACTIVE CARD** moves the active card to the discard pile.
- **RESTART SEQUENCE** reshuffles the full deck, clears the discard pile and rerolls the threat level.
- Threat level: `13 + d5 - 1` (13..17), rolled on INITIALIZE and on every RESTART.
- On each draw there is a 5% chance of a **+1 NPO REINFORCEMENT POINT** notice.

## Run locally

No build step, no dependencies. The site is plain HTML + CSS + ES modules and must be served over HTTP
(modules do not load from `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Tests (Node 20+):

```sh
node --test
```

## Layout

```
index.html        markup only
css/              tokens, base, effects, boot, terminal (ordered slices, see docs/ARCHITECTURE.md)
js/               main (DOM wiring), deck (pure engine), sfx, tracks, fx
assets/           audio, fonts
tests/            node --test suites
docs/             ARCHITECTURE.md, BACKLOG.md
```

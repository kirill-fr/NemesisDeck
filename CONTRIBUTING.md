# Contributing

Thanks for helping. The owner reviews on a phone, so small and boring PRs win.

## Workflow

1. Fork, then branch from `main`: `yourname/<topic>`.
2. Commit as `type(scope): imperative summary` (`chore`, `fix`, `refactor`, `feat`, `docs`).
3. Serve locally (`python3 -m http.server`), click through boot → config → INITIALIZE → draw → discard → restart
   at a phone width (390 px) and a desktop width. Run `node --test`.
4. Open a PR with: what changed, why, before/after screenshots, `index.html` size, test output.

## Non-negotiables

- **The live site never breaks.** GitHub Pages deploys `main` as-is. Every commit must work without a build step.
  Relative paths only: the site lives under `/NemesisDeck/`, not `/`.
- **Zero runtime dependencies.** Dev tooling (Node for tests, a static server) is fine.
- **One concern per PR, under ~200 lines of diff.** Split if it grows.
- **Design belongs to the owner.** The CRT look, the copy, the SFX and the music are not up for redecoration
  in a refactor PR. Propose visual changes in an issue first.
- **No copyrighted assets.** Reuse what is in the repo; anything new is original or plain text.
- **When the owner's intent is unclear, don't guess.** Leave a `TODO(owner):` comment and raise it in the PR.

## Licence

TODO(owner): the repository has no LICENSE file yet. MIT is suggested for the code; fonts and music keep their own
terms (see docs/BACKLOG.md).

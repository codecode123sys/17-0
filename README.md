# 17–0

Draft an 8-man all-time NFL roster — a decade of history at a time via a
franchise + era spinner — then simulate a full season: a real 17-game
schedule inside a randomly-assigned division, real standings and seeding,
and a full playoff bracket, all against a simulated season for the other
31 teams.

`reference/17-0.html` is the original single-file prototype this project
was ported from — kept as the source of truth for game data and rules.
Don't hand-edit it; change the ported modules under `src/` instead.

## Stack

Vite + React + TypeScript, plain CSS (design tokens ported from the
prototype, light/dark via `prefers-color-scheme`), Vitest for the
simulation engine. No backend — best-record persistence is `localStorage`.

## Layout

- `src/data/` — the player pool and team/division data. QB/RB/WR/TE from
  2000 onward are rated from real nflverse stats by `scripts/`; everything
  else (DEF at any era, anyone pre-2000) is hand-curated — see
  `scripts/README.md` for why that split exists and how to re-run it.
- `src/engine/` — pure, DOM-free simulation logic: the draft slot machine
  (`draft.ts`), the season/league/playoff sim (`season.ts`), the
  Monte Carlo preseason projection (`projection.ts`), and generated
  team-badge/portrait data (`visuals.ts`). Has its own Vitest suite.
- `src/state/useGame.ts` — the screen/draft/season state machine
- `src/screens/`, `src/components/` — the React UI

## Commands

```bash
npm install
npm run dev      # start the dev server
npm test         # run the engine test suite
npm run build    # type-check + production build
```

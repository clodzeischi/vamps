# Vamps

A Three.js + React + TypeScript browser game for GitHub Pages (Vite).
`npm run dev`, `npm run build`, `npm test`, `npm run format` (Prettier; run
it before committing).

**Start every session by reading [docs/WEB_PORT.md](docs/WEB_PORT.md)**, a
short index: status, core decisions, architecture, open questions, and a
table of the design docs in `docs/design/`. Open only the design docs the
task touches. When a decision is made or changed, update the design doc it
belongs to (the current rule, not its history) and append one line to
[docs/DECISIONS.md](docs/DECISIONS.md) (no need to read the log).

## Checks, by stage

- **While working:** `npx tsc --noEmit` and the tests for the area touched
  (`npx vitest run src/tactical`). Seconds.
- **Before a commit:** `npm test` (all unit tests, ~10 s); `npm run e2e:quick`
  (~1.5 min) only if menus, screens or the HUD changed.
- **Before a deploy or at a milestone:** `npm run e2e`, the full browser
  journeys (~3.5 min). Not after every feature.

## Looking at the 3D

`scene.html` shows any setup of the battle view from its URL (bank blocks or
a generated map, doors shut/open/broken, winter, rain, night, level, camera;
the parameters are listed in `src/scene/main.ts`). `npm run shot -- <dir>
"<name>|<query>" …` screenshots it (or another dev page) and prints page
errors. Use it to check a look instead of building a page or playing to it.

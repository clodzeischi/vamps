# Vamps: web port

A browser rebuild of Vamps: an XCOM-like covert war against vampires on a
Three.js globe, with a turn-based tactical layer. This is the index: read it
at the start of a session, then open only the design docs the task touches.

Live: https://clodzeischi.github.io/vamps/ (every push to `main` deploys via
`.github/workflows/deploy.yml`, which runs the unit tests and the build).
Commands and checks: CLAUDE.md. Vitest has its own `vitest.config.ts`.

## Status (2026-11-28)

Playable: the full geoscape loop (the houses' networks climbed from nest to
lair, the intelligence section's Find and Fix, dispatch, missions,
cover-ups, research, base building, transfers, equipment, the dark web),
the campaign spine (Act I, the fall of Padua, the hostage years, the
return, Montségur), and the battlescape (skirmish and campaign; every map
from the block generator but the lairs, the rural and light urban blocks drawn in the
block editor; destructible doors and glass;
blood, impacts, blasts and fire).

**Next:** escalation and open war ([geoscape.md](design/geoscape.md)),
then a polish and balance pass.

## Design docs

| Doc | Covers |
|---|---|
| [story.md](design/story.md) | Premise, lore, the six bloodlines, the campaign arc, the cardinal and the elders, chronicles |
| [geoscape.md](design/geoscape.md) | Regions and support, installations, aircraft, leads and missions, operatives, secrecy and open war, time |
| [economy.md](design/economy.md) | Funding, budget targets, pledges, losing, the dark web |
| [intelligence.md](design/intelligence.md) | The houses' networks, analysts and the section (Find, Fix), true and false leads, climbing to the lair |
| [research.md](design/research.md) | The tree: the spine to defeat Agnes, samples, the houses' weaknesses, feeding, branches, researched items |
| [base.md](design/base.md) | Staff and leads, research and engineering queues, captives, the building and synergy, cargo, equipment |
| [inventory.md](design/inventory.md) | The inventory grid, magazines, fire modes, suppressors, the ground in battle |
| [covert.md](design/covert.md) | HUMINT agents, cover-ups, judged events |
| [ui.md](design/ui.md) | Principles, screen structure, the console look, emblem, geoscape models, keys |
| [tactical.md](design/tactical.md) | Battlescape rules, vampires, concealment, maps, campaign integration, controls |
| [levels.md](design/levels.md) | Terrains, gameplays, the block generator and blocks, what's still to come |
| [block-design.md](design/block-design.md) | Drawing a block: the workflow, room sizes and layout rules, outside, playing well, versions, the checks |
| [item-art.md](design/item-art.md) | Item models and icons: the Blender pipeline, conventions, the rig |
| [tooling.md](design/tooling.md) | Batch simulator, dev pages, build scripts, props palette, audio, journeys |
| [ASSET_LIST.md](ASSET_LIST.md) | Models still to make |
| [DECISIONS.md](DECISIONS.md) | Decision log. Append only; no need to read it |

When a decision is made or changed: update the design doc it belongs to
(the current rule, not its history) and add one line to DECISIONS.md.
Design docs state rules and intent; numbers and implementation live in the
code they point to.

## Core decisions

| Topic | Decision |
|---|---|
| Platform | Static site on GitHub Pages, **desktop only** (mouse and keyboard, 1280px+) |
| Stack | Vite + TypeScript, Three.js, React; game rules in plain TS with no DOM |
| Time | Real time with pause on the geoscape (events pause it); tactical is turn-based |
| Detection | No radar. The intelligence section finds **leads**, true or false with honest confidence; stations and agents are collection |
| Operatives | Named, permadeath, stats grow with use. Catholic religious under vows; no backgrounds |
| Losing | The last base lost, half the regions hostile, or three month-ends in debt |
| Open war | Secrecy 0 forces it; one-way |
| Saves | Browser storage plus export/import; **no migrations until 1.0** (an older save is refused) |

## Architecture

```
src/
  sim/       game rules, no DOM or Three.js; deterministic from a seed (RNG state saved)
    core/      state, clock, time, rng, geo, player commands
    people/    personnel, aptitudes, skill checks, equipment, inventory
    base/      the building, research, engineering, transfers
    economy/   funding, the ledger, the dark web
    intel/     the section, networks, HUMINT, judged rolls, operations
    missions/  dispatch, teams in the field, routes, auto-combat
    campaign/  new campaign, story and objectives, secrecy, media, cover-ups
    bots/      automated players and headless batch games
  tactical/  battle rules (state, setup, movement, harm, doors, commands, turns), AI, ballistics
    map/       the grid; mapgen.ts → blockgen.ts + blockbank.ts (lair.ts for lairs); blocks, pieces, paths
  data/      content tables (regions, bloodlines, research, equipment, names…)
  save/      slots, autosave, export/import, validation
  render/    Three.js: globe/, battle/ (BattleView and its layers), shaders/
  ui/        React screens, HUD, panels; Zustand store
  audio/     music and effects
  scene/, gallery/, editor/   dev pages (never built into the game)
public/assets/  textures, models, portraits, music, sfx
scripts/        data builders, Blender scripts, batch runner, screenshots
```

* The UI never mutates game state directly: it calls commands in `sim/`.
* Saves are JSON (`STATE_VERSION` in `sim/core/state.ts`); on load every
  shape is checked and a damaged save refused, not repaired. A campaign
  battle under way is saved with the campaign; skirmishes aren't.
* Tests: Vitest beside the code (`*.test.ts`), deterministic seeds.

## Open questions

* **Escalation and open war**: how open war plays, what the houses do as
  secrecy falls; base defence maps for a found lair's assault.
* **One-year win**: bots don't win in 12 months; reach per base is the
  limit. Levers: base cost, jets, escalation.
* **Night strikes**: the auto-combat is kinder than the tactical bot at
  night against several vampires. Revisit after playtesting.
* **Balance**: support thresholds; staff salaries ([research.md](design/research.md)).
* **Encumbrance**: what weight is measured against (there's no Strength).
* **Tone and subtitle**: how serious or pulpy?

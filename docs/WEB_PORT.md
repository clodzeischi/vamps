# Vamps: web port

A browser rebuild of Vamps: an XCOM-like covert war against vampires, played
on a Three.js globe with a turn-based tactical layer. This file is the index:
read it at the start of a session, then open only the design docs the task
touches.

Live: https://clodzeischi.github.io/vamps/ (repo github.com/clodzeischi/vamps;
every push to `main` deploys via `.github/workflows/deploy.yml`).
Commands: `npm run dev`, `npm run build`, `npm test`, `npm run batch`.
Vitest has its own `vitest.config.ts` (Vitest 3 bundles an older Vite).

## Status (2026-11-17)

Playable: the full geoscape loop (SIGINT and HUMINT leads, dispatch,
missions, cover-ups, research, base building, transfers, equipment, the
dark web), the campaign spine (Act I, the fall of Padua, the hostage
years, the return, victory at Montségur), and the tactical battlescape
(skirmish and campaign battles, all site kinds, lairs and Montségur).

**Next:** escalation and open war (see [geoscape.md](design/geoscape.md),
"Secrecy and open war"), then a polish and balance pass. Tactical items
still to build are listed in [tactical.md](design/tactical.md).

## Design docs

| Doc | Covers |
|---|---|
| [design/story.md](design/story.md) | Premise, lore, the six bloodlines, the campaign arc and acts, the cardinal and the elders, chronicles, portraits |
| [design/geoscape.md](design/geoscape.md) | Regions, installations, support, aircraft and flights, leads and missions, agents, secrecy and open war, time |
| [design/economy.md](design/economy.md) | Funding, budget targets, pledges, debt and losing, the dark web |
| [design/research.md](design/research.md) | The full research tree (design, not built): topics, house weaknesses rolled at start, new rooms, manufactured items |
| [design/base.md](design/base.md) | Research and engineering, captives, the base building and synergy, people, cargo and transfers, per-agent equipment |
| [design/inventory.md](design/inventory.md) | The inventory grid (hand, pockets, backpack), item sizes, magazines, fire modes, suppressors, the ground in battle |
| [design/covert.md](design/covert.md) | HUMINT assets, cover-ups, judged events (who to send) |
| [design/ui.md](design/ui.md) | Screen structure, the Reliquary look, fonts, icons, tooltips, keys |
| [design/tactical.md](design/tactical.md) | Battlescape rules, vampires, maps, campaign integration, controls, what's left |
| [design/levels.md](design/levels.md) | Levels from authored blocks (design, not built): terrains, missions and their layouts, the block bank and map scripts, the assets each block needs |
| [design/tooling.md](design/tooling.md) | Batch simulator and bots, calibration, build scripts, art and audio pipelines |
| [ASSET_LIST.md](ASSET_LIST.md) | Blender asset list (items, level props, room modules) |
| [DECISIONS.md](DECISIONS.md) | Decision log. Append only; no need to read it |

When a decision is made or changed: update the design doc it belongs to
(state the current rule, not its history) and add one line to
DECISIONS.md.

## Core decisions

| Topic | Decision |
|---|---|
| Platform | Static site on GitHub Pages, **desktop only** (mouse and keyboard, 1280px+) |
| Stack | Vite + TypeScript, Three.js for 3D, React for UI, game rules in plain TS with no DOM |
| Time | Real-time with pause and speeds on the geoscape; events pause the clock. Tactical is turn-based |
| Detection | No radar or interception. SIGINT and HUMINT produce **leads**; bases deploy teams within aircraft reach |
| Agents | Named individuals, permadeath, stats grow with use. Catholic religious under the three vows; no backgrounds |
| Losing | Losing the last Operational Base, half the regions hostile, or three month-ends in debt |
| Open war | Secrecy 0 forces it; one-way |
| Saves | Browser storage plus export/import |

## Architecture

```
src/
  sim/       game rules: state, clock, AI, leads, economy… No DOM, no Three.js.
             Deterministic from a seed; the RNG state is saved.
  tactical/  battle rules, map generator, pathfinding, AI. Plain TS, own RNG.
  data/      content tables (regions, bloodlines, research, equipment, names…)
  save/      slots, autosave, export/import, schema version and migrations
  render/    Three.js: GlobeView (geoscape), BattleView (battlescape)
  ui/        React: screens, HUD, panels; Zustand store (ui/store.ts)
  audio/     music and sound effects
public/assets/  textures, region map, portraits, music, sfx
scripts/        data builders and the batch runner
```

* The UI never mutates game state directly: it calls commands in `sim/`.
* Saves: JSON `{ format: "vamps-save", version, savedAt, state }`, state
  version 8 (`STATE_VERSION` in `sim/state.ts`). On load, check the version,
  run migrations, validate references, and repair rather than crash. A
  campaign battle under way is saved with the campaign (autosave slot,
  after every command) and loading goes straight back into it; one that
  won't unpack is dropped and reopens as its Contact event. Skirmishes
  aren't saved.
* Tests: Vitest beside the code (`*.test.ts`), deterministic seeds.

## Open questions

* **Escalation and open war**: what the bloodlines do as secrecy falls
  (raids, base assaults) and how open war plays. The idle bot never loses
  within a year because nothing escalates yet.
* **One-year win**: bots don't win in 12 months. Reach per base is the
  limit, not money or intel. Levers: base cost, jets, escalation, reach.
* **Night strikes**: the auto-combat is kinder than the tactical bot at
  night against several vampires. Revisit after human playtesting.
* **Support thresholds** need a balance pass. The research tree is being
  redesigned ([research.md](design/research.md)); salaries are open there.
* **Base raids**: a battle map built from the base's floors, with the
  hangar beside it? Does a SIGINT centre fall with an evicted base (yes
  today)?
* **Encumbrance**: what weight is measured against (there's no Strength).
* **Tone and subtitle**: is there a subtitle? How serious or pulpy?

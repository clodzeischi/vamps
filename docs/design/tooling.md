# Tooling: simulation, dev pages, scripts, assets

## Code layout and formatting

Grouped by subject (folders in [WEB_PORT.md](../WEB_PORT.md)), one concern
to a file; a long function is a sequence of named steps. Prettier formats
everything (`npm run format`): 100 columns, double quotes; hand-laid tables,
JSON, CSS and docs are left alone (`.prettierignore`).

## Batch simulator

`npm run batch` plays hundreds of headless campaigns in parallel and prints
p10 / median / p90 and a monthly timeline (JSON to `reports/`). Options:
`--games --months --difficulty --policy --seed --threads --out`. Policies:
`idle`, `responder`, `builder`, `campaign` (`sim/bots/bot.ts`). Bots read
judged-event hints perfectly (an upper bound).

Latest (campaign bot, 12 months): game over a few percent; a median of 1
house destroyed; nobody wins in a year (reach per base is the limit); the
idle bot never loses (no escalation yet).

Also: `PROBE=1 npx vitest run src/sim/bots/probe.test.ts` (6 months
answering everything); `CALIBRATE=1` for the tactical calibration.

## Dev pages (dev server only, never built)

* **Map gallery** (`npm run gallery`): seeds of the real generator per
  setting and size, every level, a tile readout, overlays (lamps, landing
  zone, spawns, grid, **flags** from `src/gallery/checks.ts`). State in the
  URL hash; `?long` the long layout, `?winter` snow.
* **Scene preview** (`npm run scene`): one setup of the battle view from
  its URL (blocks or a generated map, doors, weather, night, level,
  camera, effects set off and frozen mid-flight; parameters in
  `src/scene/main.ts`). `npm run shot -- <dir>
  "<name>|<query>" …` screenshots it or any dev page and prints page
  errors, starting a dev server if none is up (and GL warnings: a failed draw is
  otherwise silent).
* **Block editor** (`npm run blocks`): [levels.md](levels.md). Saves
  through a dev-server endpoint (`scripts/block-files.mjs`).
* **Material preview** (`npm run materials`): every procedural material on
  samples, close-ups, and at night with a circling lamp.

## Build scripts

* `build-regions.mjs`, `build-adjacency.mjs`, `build-places.mjs`: the
  region map, neighbours, town names. `build-icons.mjs`: the game-icons.net
  icons in use. `build-emblem.py`: the OPV emblem and favicon.
* `export-geo-models.sh`: every geoscape model from
  `~/Documents/Blends/Vamps/geoscape/` to `public/assets/models/` (the rule
  each .blend follows is at its top; mesh material names pick the game's
  shader).
* `build-props.py` / `export-props.py`: the battlescape prop kit, built
  from code into `props.blend`, exported as GLBs without images. The rules
  (scale, grid, anchors) are at the top of build-props.py. Rebuilding
  overwrites the .blend: hand edits, then export only. To redo a few
  props without touching the rest: `ONLY=car_,pickup` builds just those
  into a scratch .blend, swap them into props.blend, and export them with
  export-props.py's second argument (the same prefixes).
* `build-items.py` / `export-items.py`: inventory items ([item-art.md](item-art.md)).

**Pieces**: every model beyond the base kit is a row in
`tactical/map/pieces.ts` (footprint, cover, skin, menu group, anchor). The
editor and the rules read it; the view loads a piece's model when a map
uses it. To add one: build, export, add a row (`pieces.test.ts` checks the
model exists).

## Props: one palette material

Every prop shares one material: 8 × 8 flat swatches in three textures
(colour, roughness/metalness, glow). A face's UVs sit on one swatch's
centre; recolouring a part means moving its UVs (swatch names in
build-props.py). Nearest filtering, no mipmaps, so swatches don't bleed.
Under 400 triangles a prop (vehicles 750), no normal or AO maps. Vehicle
body panels alone use `enamel_white`, so the game can split and tint them.

## Art

Earth maps in `public/assets/earth/` at 2048 × 1024 (sources in
`art/earth/`). Portraits: [story.md](story.md). Models to make:
[ASSET_LIST.md](../ASSET_LIST.md).

## Audio

* **Licences**: music from OpenGameArt (CC0; the battle tracks CC-BY 3.0),
  effects CC0 or CC-BY (Pixabay, the Baradari pack). **Every track must be
  credited in README.md and the in-game Credits.** Bensound is out (no
  game use).
* **Music** (`audio/music.ts`): a playlist per screen with crossfades; a
  battle plays stealth tracks until an enemy is alerted, then combat, or
  the boss track once an elder is. MP3 at 128 kbps CBR, all tracks within
  1 dB of +2.5 dB ReplayGain.
* **Effects** (`audio/sfx.ts`): a click per control, a cue per event kind;
  gunfire one sample a round, panned and fading with distance (a machine
  gun's full burst plays its burst recording); blows, falls, explosions;
  glass breaking (a window's pane small, a glass door or wall large) and a
  wooden door smashed, one sound for all that breaks at once.
  Numbers in `GUN_SOUND`, `BLOW_SOUND`.
* **Loops** (rain, wind, traffic, wildlife) are **FLAC**, not MP3 (the MP3
  encoder's padding leaves a gap each loop), mono, made seamless by
  trimming, cutting where the end matches the start and a 120 ms
  crossfade; check the decoded samples. Not positional; none underground.
* Four volume sliders (master, music, effects, ambience) in Settings and
  both pause menus.

## Journeys (Playwright)

`npm run e2e` plays the built game (~3.5 min); `e2e:quick` leaves out the
battles, resilience and the monkey, and also runs in WebKit. They run only
locally; deploys run the unit tests. When to run which: CLAUDE.md,
"Checks, by stage". First time: `npx playwright install chromium webkit`.

* Any page error, console error, GL warning (a draw that failed) or failed
  request fails the test (`e2e/game.ts`). Bugs found by hand get a journey.
* Saves are made fresh each run by bots (`e2e/saves.ts`).
* Longer hunts: `MONKEY_STEPS=2000 MONKEY_SEED=5 npx playwright test
  monkey`; `BATTLE_MS=150000 npx playwright test battle`.
  `E2E_SOFTWARE=1` renders without the graphics card.
* Failures leave a screenshot and trace in `reports/e2e/`. The e2e build
  puts the store on window (`ui/handles.ts`).

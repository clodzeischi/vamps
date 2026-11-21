# Tooling: simulation, scripts, assets

## Batch simulator

`npm run batch` plays hundreds of headless campaigns in parallel (worker
threads; ~500 twelve-month games a second on 16 cores) and prints p10 /
median / p90 plus a monthly timeline; full JSON goes to `reports/`
(git-ignored). Options: `--games`, `--months`, `--difficulty`, `--policy`,
`--seed`, `--threads`, `--out`. Runner `sim/batch.ts`, bots `sim/bot.ts`.

Policies: `idle`, `responder` (answers every lead), `builder`, `campaign`
(builds a base abroad at once, survives the fall, puts stations over lesser
homelands, attacks lairs). Bots read judged-event hints perfectly (an upper
bound), kit up from the armoury, and don't use escorts, wings or transfers.

Latest findings (campaign bot, 12 months): game over a few percent; a
median of 1 bloodline destroyed; **nobody wins in a year** (reach per base
is the limit); the idle bot never loses (no escalation yet).

Other harnesses: `PROBE=1 npx vitest run src/sim/probe.test.ts` (a bot
answering everything for 6 months); `CALIBRATE=1` for the tactical
calibration ([tactical.md](tactical.md)). A dev-only `window.vamps` store
hook lets browser checks open screens directly.

## Map gallery

`npm run gallery` opens `gallery.html` (dev server only; not in the game or
its build). It pages through seeds of the real generator
(`tactical/mapgen.ts`) per setting, size and basement: a grid of
thumbnails at one level, and a detail view with every level, counts, and
a readout of the tile under the mouse. Overlays: lamps, landing zone,
spawns, grid, and **flags** (checks in `src/gallery/checks.ts`; today a
prop or lamp on either side of a doorway). The view lives in the URL hash,
so a link reopens the same maps. Code: `src/gallery/`.

## Material preview

`npm run materials` opens `materials.html` (dev server only): every
procedural material in `render/shaders/materials.ts` on a sample (scenery
on a slab and block, model materials on a turning figure and gun), a
close-ups grid of all of them, and night with a circling lamp. Code:
`src/gallery/materials.ts`.

## Build scripts

* `scripts/build-regions.mjs <natural-earth-dir>`: region map PNG and
  `regions.generated.json`.
* `scripts/build-adjacency.mjs`: neighbours (drops contacts made only by
  overseas territories).
* `scripts/build-places.mjs`: ~7,200 towns for installation names.
* `scripts/build-icons.mjs`: the game-icons.net icons in use.
* `scripts/build-emblem.py` (Pillow, NumPy): the OPV emblem masks in
  `public/assets/emblem/` and `public/favicon.png` from `art/emblem/opv-logo.png`.
* `scripts/export-geo-models.sh [blend-dir]`: exports every geoscape model
  (`~/Documents/Blends/Vamps/geoscape/` by default) to
  `public/assets/models/<kind>.glb` through `scripts/export-geo-model.py`
  (run inside Blender; the rule each .blend follows is at its top). It
  rebuilds each Holo material's nodes so Blender previews the game's look,
  saves the .blend, and exports every mesh with its material's name (the
  game picks its shader by it). One file: `Blender -b <file.blend> --python
  scripts/export-geo-model.py -- public/assets/models/<kind>.glb
  [gold|blue|brass|green]`; a palette argument sets every mesh's material.

## Art

* Earth maps in `public/assets/earth/` at 2048×1024 (1024 made city lights
  blocky). Normal map JPG q90; specular a one-channel PNG. Sources in
  `art/earth/`.
* Portraits: see [story.md](story.md).
* Blender assets: [ASSET_LIST.md](../ASSET_LIST.md).

## Audio

* Music in `public/assets/music/`, named by role: `menu.mp3`, `geo1.mp3`,
  `geo2.mp3`, `stealth1.mp3`, `stealth2.mp3`. All CC0 from OpenGameArt.
  Encode at 128 kbps CBR (`lame --mp3input -b 128 --cbr -q 0`); keep
  sources already below that. **Every track must be credited in README.md
  and the in-game Credits.** Bensound is out (they refuse game use).
  Combat and boss tracks are still open.
* `audio/music.ts`: a playlist per screen, 2.5 s crossfade, starts on the
  first input. Volume applies at once on a squared curve (`loudness`).
* Sound effects in `public/assets/sfx/`, CC0: a click for any control and
  one cue per kind of event (lead, coverup, monthly, vampire, complete).
  `audio/sfx.ts`. Volume = master × effects.

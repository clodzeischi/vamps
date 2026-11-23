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

## Block editor

`npm run blocks` opens `blocks.html` (dev server only): draws map blocks
level by level with the battle view as a 3D preview, checks them, and
saves them to `src/data/blocks/` through a dev-server endpoint
(`scripts/block-files.mjs`, `/__blocks`). Use and extension:
[levels.md](levels.md), "The block editor". Code: `src/editor/`.

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
* `scripts/build-props.py`: builds the battlescape prop kit from code into
  `~/Documents/Blends/Vamps/battlescape/props.blend` (one object per prop)
  and writes the palette textures to `public/assets/props/`; an optional
  third argument renders contact sheets. `scripts/export-props.py` exports
  each object in that .blend to `public/assets/props/<name>.glb`. Edit by
  hand in Blender, then export only: rebuilding overwrites the .blend. The
  rule each prop follows (scale, grid, anchors) is at the top of
  build-props.py. Furniture over several tiles is centred on its
  footprint, its back to the wall face.

## Props: one palette material

Every battlescape prop shares one material, `Props`: three 256 px textures
of 8 × 8 flat swatches (32 px each): `palette.png` (colour),
`palette_mr.png` (glTF: G roughness, B metalness) and `palette_em.png`
(glow). A face's UVs all sit on one swatch's centre, so it takes that
swatch's colour, gloss, metal and glow; recolouring a part means moving its
UVs. The swatch names (oak, brick, steel, lamp_warm…) are listed in
build-props.py. In the game: load the palette once and share one material
across props, sample with nearest filtering and no mipmaps (or clamp mips at
the 8 × 8 level) so neighbouring swatches don't bleed, and treat the emissive
swatches as the lamps' faces (the light itself is still the game's).
Budget: under 400 triangles a prop, no normal or AO maps.

## Art

* Earth maps in `public/assets/earth/` at 2048×1024 (1024 made city lights
  blocky). Normal map JPG q90; specular a one-channel PNG. Sources in
  `art/earth/`.
* Portraits: see [story.md](story.md).
* Blender assets: [ASSET_LIST.md](../ASSET_LIST.md).

## Audio

* Music in `public/assets/music/`, named by role: `menu.mp3`, `geo1.mp3`,
  `geo2.mp3`, `stealth1.mp3`, `stealth2.mp3`, `battle1.mp3`, `battle2.mp3`,
  `boss1.mp3`. From OpenGameArt, CC0 except the battle tracks (Matthew
  Pablo and HorrorPen, CC-BY 3.0).
  Encode at 128 kbps CBR (`lame --mp3input -b 128 --cbr -q 0`); keep
  sources already at or below that. All tracks sit at about +2.5 dB
  ReplayGain (within 1 dB): `--scale` from the best source, checked by
  decoding; the quietest (`stealth1`) has no headroom to go louder.
  **Every track must be credited in README.md and the in-game Credits.**
  Bensound is out (they refuse game use).
* `audio/music.ts`: a playlist per screen, 2.5 s crossfade, starts on the
  first input. A battle plays the stealth tracks until any enemy is alerted
  (the team spotted, or a pod woken by noise), then combat (`battle1`,
  `battle2`), or the boss track (`boss1`, looped) once an elder is; either
  for the rest of it (`music.setBattleMood`, from the battle screen).
  Volume applies at once on a squared curve (`loudness`).
* Sound effects in `public/assets/sfx/`, CC0: a click for any control and
  one cue per kind of event (lead, coverup, monthly, vampire, complete).
  `audio/sfx.ts`. Volume = master × effects.

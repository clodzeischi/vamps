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

Every model beyond the base kit is a **piece**: a row in
`src/tactical/pieces.ts` (footprint, cover, skin, menu group, anchored on
its footprint's middle or on the wall behind it, optional extra models). The
block editor's Props menu and the rules read that table. The battle view
loads the base kit (`PROP_NAMES` in `render/props.ts`) up front and a
piece's models only when a map uses them, then redraws the level. To add a
piece: build its model, export, add a row (`pieces.test.ts` checks every
row has its model).

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
Budget: under 400 triangles a prop (a vehicle up to 500), no normal or AO maps.
Vehicles' body panels use the `enamel_white` swatch and nothing else on
them does: the game splits those faces off and tints them per vehicle.

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
  `audio/sfx.ts`. Volume = master × effects; the loops (rain, wind,
  traffic, wildlife, the rotor) master × **ambience**, their own slider
  (default 50%). All four sliders are in the main menu's Settings, the
  geoscape's pause menu, and the battlescape's **Sound** button (top right,
  beside Quit).
* Loops (`sfx.loop`, a gain eased on top of the effects volume): WAV, not
  MP3, whose encoder padding leaves a gap each time round. Made seamless by
  trimming silence, cutting where the end best matches the start, and a
  120 ms equal-power crossfade. The helicopter's rotor (Pixabay licence)
  plays while it turns, full at 20 m from the camera and falling off as 1/d.
* Gunfire (`GUN_SOUND` in `render/BattleView.ts`): one sample a round,
  played left or right and fading with distance (full within 22 m), pitch
  ±4%; the SMG fires the pistol's. Machine guns fire single rounds only in
  reaction: the M240B's own, borrowed by the M249. A machine gun's full burst plays its own
  burst recording (a burst cut short, round by round). A burst animates as
  one sequence: one lean, the tracers at the recordings' rate of fire
  (SMG 0.075 s, carbines 0.11, M249 0.088, M240B 0.097), then what the
  rounds did. Shots out of sight are heard at 0.35. Suppressed rounds and
  the reload play at 0.4 and 0.6. Sources: Pixabay one-shots and the
  Baradari pack (CC BY 3.0), cut, mono, matched on their loudest 100 ms.
* Blows (`BLOW_SOUND`): a knife that lands plays one of four stabs at
  random, claws the tearing slash, at the one struck; a miss is a swish from
  the striker (lower for claws). Under gunfire (0.5–0.8). A body that falls
  (dead, or into torpor) thuds as it hits the ground.
* Explosions: the incendiary goes off with the grenade explosion where it
  lands (gain 1.3, so it carries past gunfire). A rocket launches with
  `rocket-launch`, flies visibly (45 m/s, a short trail) and goes off with
  `explosion-rocket` (gain 1.4) as its damage shows. `bang` waits for the
  UV and smoke grenades.
* Ambience (`BattleView.ambient`, on in battles, off in the editor), in
  layers, none under ground: wildlife in `urban` and `rural` (birds by day,
  crickets at night, none in winter, quiet in the rain); traffic in the city
  (0.4 in `urban`, behind the wildlife; 0.6 at night); rain wherever it
  falls; wind over `rural` in winter, day and night. Not positional, at
  0.35 of the effects volume (wind 0.25). Loops are mono WAV
  slices, matched in loudness (RMS); they load when a battle first asks for
  them, not with the interface sounds.

## Journeys (Playwright)

`npm run e2e` plays the built game in Chromium (about 3 minutes);
`npm run e2e:quick` leaves out the battles, the resilience tests and the
monkey. First time: `npx playwright install chromium webkit`; locally the quick set also runs in
WebKit, Safari's engine. GitHub runs the
quick set on every push (`.github/workflows/e2e.yml`), beside the deploy
and not before it.

* Any page error, console error or failed request fails the test
  (`e2e/game.ts`). Bugs found by hand get a journey.
* Saves are made fresh each run by bots (`e2e/saves.ts`): campaigns at
  several ages, and the first of every kind of event.
* `menu`, `geoscape`, `events`, `battle`: what a player does, screen by
  screen. `resilience`: deploys, old settings, WebGL, and that everything
  fits from 1280×720 up. `monkey`: seeded random play.
* Longer hunts: `MONKEY_STEPS=2000 MONKEY_SEED=5 npx playwright test monkey`;
  `BATTLE_MS=150000 npx playwright test battle`. `E2E_BLOOM=1` turns bloom
  on; `E2E_SOFTWARE=1` renders as GitHub's runners do.
* Failures leave a screenshot and a trace in `reports/e2e/`.
* The e2e build (`--mode e2e`) puts the store on window (`ui/handles.ts`);
  the real build doesn't.

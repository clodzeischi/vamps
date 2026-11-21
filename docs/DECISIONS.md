# Decision log

One line per decision, newest last. The current rules live in the design
docs (see [WEB_PORT.md](WEB_PORT.md)); this is only the trail. Entries before
2026-11-17 are in git history (docs/WEB_PORT.md before the docs split).

* 2026-11-17: docs split into an index (WEB_PORT.md), design docs per system
  (docs/design/) and this log. Build histories, superseded designs and old
  balance findings removed.
* 2026-11-18: room for ten agents; squad cards small, the selected one grows;
  health bars over heads are HTML; an enemy's bar shows the hit chance and
  grows into its card on hover.
* 2026-11-18: inventory grid, Paradise Cracked style (docs/design/inventory.md):
  hand, armour, helmet, two 2×2 pockets, a 4×5 backpack; items by size;
  magazines needed to reload; burst fire; suppressed pistol and carbine;
  items on the ground in battle; use items from pockets or backpack. Save v8.
* 2026-11-18: battle HUD after Paradise Cracked (mouse still Wasteland 3):
  action panel bottom left around the active item; backpack strip; an item
  stays active while more of it are carried. Overwatch and hunker removed:
  reaction fire is automatic at end of turn, crouching is visual by low
  cover. Sneak toggle (1.5× move, half the spotting distance). Small squad
  cards show numbers only; no card tooltip. Inventory doubles as the
  character sheet and cycles through the squad.
* 2026-11-18: action panel buttons are icons only (name in the tooltip), in
  two styled groups: round steel agent buttons (sneak, backpack, inventory)
  and a brass weapon console (active item, fire modes, reload).
* 2026-11-18: melee and other reach actions need a clear step (no wall,
  window or prop between, no corner cut); friends block paths like foes;
  no hovered-tile outline (the move projection shows the destination).
* 2026-11-18: hit chance reworked: agent aim 50 + Combat/2, range bands
  (point blank +25 to +40, close, long); a move stops on first sight of a new
  enemy and refunds the rest; enemy "overwatch" is just reaction fire (tag
  REACT); health bars drop per hit with a white trailing ghost; battle log
  tones tint the text only.
* 2026-11-18: aim lines: hovering a reachable tile draws red lines to the enemies shootable from it, with the hit chance.
* 2026-11-18: map gallery (`npm run gallery`, `gallery.html`, `src/gallery/`): a dev-only page to page through generated maps and flag layout problems; not part of the game build.
* 2026-11-18: battlescape world units are metres: tile 1.5 × 1.5 m, level 2.5 m (2.4 m ceiling + 0.1 m slab), agents 1.78 m.
* 2026-11-18: battlescape look: plain merged surfaces (no tile seams); lamp light baked into a light volume with traced shadows (no real-time point lights; the level never changes).
* 2026-11-18: battlescape materials are procedural shaders patched into the standard material (render/shaders/): asphalt with cracks and markings, brick with a procedural normal map; textures only for what must be drawn.
* 2026-11-18: every battlescape skin and the units have procedural materials (render/shaders/materials.ts catalogue); model materials (cloth, leather, gun metal, brass, polymer, wood) ride on the object; preview page npm run materials.
* 2026-11-19: more relief on brick (14 mm, recessed shadowed joints) and paving (12 mm bevels, darker rims, slabs settled askew); grass and dirt bump 1.8.
* 2026-11-19: a loading screen before every battle, until the view has compiled its shaders and drawn.
* 2026-11-19: the wheel steps a level on every mouse notch; the level changes by itself only with the actor in focus (selecting an agent, its own move to another floor, each seen enemy starting to act), not after a shot or a throw.
* 2026-11-19: scenery colour variation toned to 45% around the base colour (tone() after each scenery feature) so units and items read; relief and lamp light kept strong; models untouched.
* 2026-11-19: vehicles are objects over several tiles: car 2×3 and SUV 2×4 (half cover), truck 2×6 (full cover); parked in parking lanes and nose-in car-park rows.
* 2026-11-19: town roads 8 tiles wide (parking, two traffic lanes, parking) with 2-tile pavements; urban maps 38/44/50 (nest/den/haven); a T junction a third of the time; rural lane 4 wide.
* 2026-11-19: town kerbs (look only): roads 15 cm down with kerbstones, block corners on a junction rounded (2-tile radius); zebra crossings two tiles deep.
* 2026-11-19: kerb corners radius 3 tiles; grass and cobble lot corners round the same centre (radius 1 tile) so the pavement keeps its width; building corners and straight-kerb corners stay square.
- 2026-11-19: Town layout pass. Houses stand against the street side of the lot or behind a 2-tile front garden, with the front door on the street and a paved walk from every door. Car parks are at road height with kerbs, a 3-wide dropped-kerb driveway into a straight aisle, nose-in bays with painted dividers, and the road kept clear in front. Parks get a footpath, benches beside it, spaced random trees and a street hedge with gaps. Street lamps go every 8 tiles along the kerb, staggered across the road, with street trees halfway between on tree-lined sides. Blocks are found before cars are parked (fixes lots spilling over the pavement).
- 2026-11-19: New battle sites and looks. Winter skin: snow on surfaces open to the sky, slush on roads, falling snow; campaign snow by latitude and month. Apartment block setting: a tall corridor block where a helicopter lands on the roof (map.airLz). Industrial setting: a warehouse yard with the blood bank underneath. Town landmarks (hospital, supermarket) become the hideout for rescues. Petrol stations and corner shops dress towns, with lit signs and canopies (look only) and ceiling lights indoors. Campaign split: town 55, country 25, apartments 10, industrial 10; 70% of rescues are at a landmark.
- 2026-11-19: The OPV emblem (goat's skull, sword, cross pattée) replaces all cross imagery: loading screen and the Faith stat icon; masks tinted iron and brass in CSS.
- 2026-11-19: The OPV emblem also heads the main menu (left of the title) and is the favicon.
- 2026-11-19: Plaza trees in one symmetric ring a tile in from the edge (corners in, gaps near 4, clear of the rotor), benches on all sides or none, no street trees along it. Ceiling fittings light by day as well as night; corner shops get them.
- 2026-11-19: Arrival dispatch reads "Begin mission?" / "<agents> arrived in <city>", with a picture by insertion: jet = free fall, helicopter = rooftop landing, charter or airline = passport control.
- 2026-11-19: Commercial flights fly a golden hologram airliner on the geoscape (glTF from Blender, 0.05 globe units across), not the dot.
- 2026-11-19: Charter flights fly a golden hologram business jet on the geoscape (0.04 globe units, smaller than the airliner's 0.05).
- 2026-11-19: Our leased jet flies a golden hologram military transport on the geoscape (0.05 globe units), on missions, joining teams and ferries.
- 2026-11-19: Our helicopter flies a golden hologram helicopter on the geoscape (0.035 globe units); its rotors spin while it flies and the clock runs.
- 2026-11-20: Leaning: behind full cover at its end, units lean one step to the side to see, shoot and throw round it (both sides). Aim lines lose the hit chance and become red flowing glows like the path, from the lean side where leaning is needed.
- 2026-11-20: Closed doors: block sight, full cover, 4 TU to open (walking through or from beside the doorway), never shut again; exterior and commercial doors start closed 90%, residential 60%. Floor-to-ceiling glass on shopfronts and luxury penthouse floors, shattered by shots and fire. Door lamps are wall brackets over the door. Walls are drawn full height on the level shown.
- 2026-11-20: Windows break like glass walls (shots through, fire against) and leave a bare sill, unchanged for the rules; shards fly away from the shooter or the fire.
- 2026-11-20: Campaign battles save mid-fight: the whole battle (map included) rides on the mission in the campaign save, autosaved after every command and on page close; Save & quit in battle; loading goes straight back in. Skirmishes aren't saved.
- 2026-11-20: Ballistic shooting replaces the hit chance: weapon base accuracy × skill (Combat, Insight) × mode makes a cone; each round is traced through walls, glass, props and figures (friendly fire included); shotgun pellets; CEP rings instead of percentages; Ctrl force fire. Shot geometry moves to tactical/geometry.ts.
- 2026-11-20: SIGINT stations show a blue hologram radio tower (0.06 globe units) in place of their disc; dim while being built.
- 2026-11-20: Bases show a pale brass hologram compound (0.05 globe units across) in place of their disc; ground models are sized by footprint, and the export takes every mesh at least 5% the size of the largest.
- 2026-11-20: One rule for geoscape models: 1 Blender metre = 0.001 globe units, origin where it sits, one body mesh plus *_rotor parts, palette by material name; the game applies no per-model fit, centring or colour table.
- 2026-11-20: HUMINT assets show a green hologram OSS spearhead medallion (20 m) for every kind, in place of the per-kind glyphs. Base model turned 180 degrees.
- 2026-11-20: Research tree redesigned to X-COM depth (docs/design/research.md, not built): ~98 topics across virology, forensics and INTERPOL, JSOC targeting, archives and theology, old money; per-house strain, provirus, history and ledgers; house weaknesses (UV band + 2 of 9) rolled at campaign start; 9 new rooms; researched items made in a per-base production queue, never bought.
- 2026-11-21: Research tree: silver is market ammunition (5× a magazine, ×1.5 against one rolled house, Huaca favoured), not research; garlic, sedative darts and Haem hunger dropped from the weakness pool (Thin skin, Slow clotting added); folklore is garbled rumour; per-house feeding level makes vampires feral or refined; the Duval brothers guard Agnes at Montségur.

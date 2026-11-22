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
- 2026-11-21: Battlescape prop kit: 45 low-poly props (architecture edge pieces, street, interior) built from code in Blender, all on one 8x8 swatch palette material (colour, roughness/metal, glow); exported one GLB per prop to public/assets/props/ (docs/design/tooling.md, "Props").
- 2026-11-21: The battle view places the prop kit (looks only): window and door frames with leaves, exterior trim on brick/plaster/stone (plinth, band, cornice, quoins, downpipes, AC units), crate/bin/park bench/table models, model street and wall lamps (street lamp heads reach 1 m over the road, the baked light with them), manholes and drains; boxes until the kit loads; none in lairs or Montsegur.
- 2026-11-21: Flats get furniture over several tiles (map.furniture, LOW underneath): sofa 2x1, TV stand 2x1, king bed 2x2 at real sizes (tiles stay 1.5 m); a living room and a bedroom per flat. Apartment windows follow one rhythm per face, the same on every floor. Tables face open floor, chairs only where reachable.
- 2026-11-21: Rain weather (look only): drizzle, wet glossy surfaces open to the sky, puddles with planar reflections of the street (a Reflector rendered by hand, half resolution); skirmish Weather choice (clear, rain, snow); campaign rain about one battle in four by latitude.
- 2026-11-22: Levels to be assembled from authored blocks, X-COM style (docs/design/levels.md, design): four generic terrains (dense urban, light urban, rural, industrial), missions with their own layouts, 12x12-tile blocks with nodes for spawns and patrols, map scripts per mission and terrain, a block editor; the procedural layout code goes.
- 2026-11-22: Blocks are 12x12 tiles; feeding and recovery missions are in; blocks turn on the map (never mirrored) only so their front faces a road, car park or landing zone. Block editor built (npm run blocks; files in src/data/blocks/, loaded by data/blockBank.ts). Open war is to be a change of gear (heavy weapons, suppressors off), designed separately.
- 2026-11-22: Blocks record intent (format 2): floors carry their exterior and interior wall skins (or no walls), walls follow wherever a floor meets a different one, and edges hold only exceptions (door, window, glass, no wall, wall). The editor paints floors with walls, places openings, and its 3D preview uses the skirmish camera (wheel steps levels).
- 2026-11-22: Blocks are 10x10 tiles (multiples 10x20, 20x20); a road meets a corridor block's edge as pavement 1, road 8, pavement 1. Kind and front are replaced by a type (corridor, structure, open) and per-side links (which types may stand there, or void for the map edge); neighbours must agree both ways; maps fill by matching sides (constraint solving with backtracking) around the blocks a mission script pins. Props and furniture are one editor tool.
- 2026-11-22: Four tactical gameplays: deathmatch (nest 4x4, den 4x5, lair 5x5; the baseline), horde (survive waves from the map edges: monastery or church 4x4 with 3/4/5 waves by difficulty, OPV base 5x5; the battle for Padua is doomed and overpowered, waves held decide how many staff and how much research escape), extraction (3x5: evade capture, rescue there and back; reinforcements on notice), sabotage (3x5: plant evidence unseen, steal quiet or loud). Killing everyone wins only deathmatch. Enemies enter at edge entry points the generator places on rim tiles.
- 2026-11-22: Missions revised: five gameplays (deathmatch nest/den/lair scaling like scout/cargo/mothership, lairs built by hand; horde; extraction incl. the double agent's ambush; theft = recovery; feeding 4x4, start anywhere, save civilians, swings support, likelier at low secrecy); planting evidence stays a covert op. Monastery: a team lost holding it gains support, bailing costs heavily. Padua: roof extraction, bail any turn, each wave held saves staff and research. The fall is now set by Perfecti intel 60 (the CDF inside-man report, day 28 to 45), strikes a week later when 3+ operators are home; Agnes's intel 0.7x in Act I; until the battle exists those at the base escape by the roof.
- 2026-11-22: Maps are made from authored templates (a skeleton per gameplay pinning target, landing and exit; road layouts per terrain), filled by matching sides; about 20 candidates are scored (separate routes, sightlines, cover rhythm, a high point, approach time, variety, a landmark) and the best kept. Chosen over pure constraint solving; reversible.
- 2026-11-22: Roads come from rules per terrain, not a fixed set of layouts (dense: 1-2 roads each way, a T-end, alleys from sides; light: a main road or a Z road that turns into an alley, 0-2 side roads or cul-de-sacs; rural: 0-1 lane with one bend, a farm track; industrial: perimeter road on 1-2 edges, at most one through road). Mission skeletons stay authored templates.
- 2026-11-22: Access rule for maps: blocks mark entrance sides; every entrance faces a corridor or an open block that reaches one (car parks and yards chain to the road), car park drives and yard gates meet a road, cul-de-sacs are faced by houses, farm tracks end in the farmyard, and a building nothing can reach is not placed.
- 2026-11-22: Scope: about 10 blocks per terrain plus 10 shared (list in levels.md), roads, fields and woods generated. Three tiers: 1 deathmatch on light urban and rural with the generator and simple stairs; 2 dense urban, industrial, feeding, rescues on blocks; 3 horde, theft, evading capture, switchback, footbridge, cuttings. Stairs are pieces with no standing on them (a flight is one step); height from levels only, no slopes.

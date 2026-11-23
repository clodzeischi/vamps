# Blender asset list

A list of what needs modelling, in priority order. **P1** = needed for the
tactical layer (T-milestones); **P2** = needed once research unlocks it;
**P3** = flavour and variety. "Shares mesh" means one model with a material
or attachment swap, which is cheap.

Item tiers follow the research tree (`src/data/research.ts`):
**T0** conventional, bought → **T1** UV (Ultraviolet weaponry, UV munitions)
→ **T2** haematology and armour research (haemolytic agent, ceramic, pheromone
blockers) → **T3** late game (captured vampire tech, synthetic plasma).

Target: about 60 inventory items, roughly XCOM: UFO Defense (≈45) plus a bit
of Phoenix Point's variety, but in only three tiers, because our setting is
contemporary and grounded.

Each inventory item needs: the held or worn **mesh** (low poly, for the
battle view) and a **square inventory icon** (render from Blender, transparent
background, the same camera and light rig for all items).

---

## 1. Inventory items (priority)

### 1.1 Sidearms
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 1 | Compact 9mm pistol (concealable) | T0 | P1 | plainclothes default |
| 2 | Service pistol, full size | T0 | P1 | |
| 3 | .357 revolver | T0 | P3 | heavier hit, 6 shots |
| 4 | Machine pistol | T0 | P3 | burst, poor range |
| 5 | Pistol with UV tactical light | T1 | P2 | shares #2 mesh, add light |
| 6 | Pistol suppressor | T0 | P2 | attachment, keeps concealment |
| 7 | Flare pistol | T0 | P2 | lights up an area, burns a little |

### 1.2 Long guns
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 8 | Pump shotgun | T0 | P1 | tactical default |
| 9 | Semi-auto combat shotgun | T0 | P2 | |
| 10 | Sawn-off double barrel | T0 | P3 | concealable, rural feel |
| 11 | Compact SMG | T0 | P1 | |
| 12 | Suppressed SMG | T0 | P2 | shares #11 + suppressor |
| 13 | Assault rifle / carbine | T0 | P1 | tactical default |
| 14 | Bolt-action hunting rifle with scope | T0 | P2 | |
| 15 | Designated marksman rifle | T0 | P3 | |
| 16 | Light machine gun | T0 | P3 | heavy, loud |
| 17 | UV-rail rifle (rifle + under-barrel UV emitter) | T1 | P2 | shares #13 + attachment |
| 18 | UV lance (shoulder-fired UV projector, battery pack) | T1 | P2 | signature weapon, short cone |
| 19 | Flamethrower, backpack | T1 | P3 | fire = double damage to vampires |
| 20 | Grenade launcher, single shot | T0 | P3 | fires the grenade types below |

### 1.3 Crossbows and launchers (quiet, anti-vampire)
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 21 | Hunting crossbow | T0 | P2 | quiet; bolt pins a body in torpor |
| 22 | Pistol crossbow | T0 | P3 | concealable |
| 23 | Speargun / bolt launcher with haemolytic injector bolts | T2 | P3 | finishes from range |

### 1.4 Melee and finishers
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 24 | Combat knife | T0 | P1 | civilian default |
| 25 | Wooden stake (plain, hand carved) | T0 | P1 | finisher |
| 26 | Stake mallet | T0 | P3 | pairs with #25 |
| 27 | Spring-loaded stake gun (pneumatic, captive-bolt style) | T1 | P2 | finisher, faster |
| 28 | Machete | T0 | P2 | |
| 29 | Fire axe | T0 | P3 | also breaches doors |
| 30 | Silver-edged sabre / Order blade (ceremonial) | T1 | P3 | lore item |
| 31 | Haemolytic auto-injector (finisher syringe) | T2 | P1 | finisher, the other option |
| 32 | Telescopic baton | T0 | P3 | non-lethal, for thralls and civilians |
| 33 | Stun gun / taser | T0 | P2 | thralls, captures |

### 1.5 Grenades and throwables
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 34 | Frag grenade | T0 | P1 | |
| 35 | Incendiary grenade (thermite) | T0 | P1 | tactical default, 3×3 fire |
| 36 | Molotov cocktail | T0 | P2 | cheap fire, a bottle and a rag |
| 37 | Smoke grenade | T0 | P2 | |
| 38 | Flashbang | T0 | P2 | |
| 39 | Road flare (hand flare) | T0 | P1 | plainclothes default; light |
| 40 | UV flare / UV grenade (burst of sunlight) | T1 | P2 | signature item |
| 41 | Holy water flask / vial | T0 | P3 | faith item, splash |
| 42 | Garlic / pheromone-blocker aerosol canister | T2 | P2 | "Pheromone blockers" research |
| 43 | Breaching charge | T0 | P3 | doors and walls |
| 44 | Tripwire mine / claymore | T0 | P3 | |

### 1.6 Ammo (magazine meshes, can share one mesh per calibre, colour bands per type)
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 45 | Pistol magazine | T0 | P1 | |
| 46 | Rifle magazine | T0 | P1 | |
| 47 | SMG magazine | T0 | P2 | |
| 48 | Shotgun shells (box or bandolier) | T0 | P1 | |
| 49 | Dragon's breath shells (incendiary) | T1 | P2 | shares #48, red |
| 50 | UV rounds (phosphor-tipped) | T1 | P2 | "UV munitions", shares mags, violet band |
| 51 | Silver / hollow-point rounds | T0 | P3 | shares mags |
| 52 | Crossbow bolts (wood, steel, injector) | T0–T2 | P2 | one quiver, three bolt heads |
| 53 | UV battery pack | T1 | P2 | for UV lance and UV-rail |
| 54 | Fuel canister for flamethrower | T1 | P3 | |

### 1.7 Armour (worn on the agent body; also needs a paperdoll/icon)
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 55 | Civilian clothes (no armour), several outfits | T0 | P1 | men's/women's variants |
| 56 | Soft vest, concealable under a shirt | T0 | P1 | plainclothes default |
| 57 | Tactical vest with plates and pouches | T0 | P1 | tactical default |
| 58 | Composite armour suit | T1 | P2 | "Composite armour" research |
| 59 | Ceramic plate carrier | T2 | P2 | "Ceramic plate"/"Ceramic inserts" |
| 60 | Neck guard / gorget (anti-bite collar) | T1 | P2 | small, very on-theme |
| 61 | Helmet with NVG mount | T0 | P2 | |
| 62 | Night-vision goggles | T0 | P2 | vampires see in the dark |
| 63 | Full-face respirator (pheromone protection) | T2 | P2 | |
| 64 | Priest's cassock / clerical disguise | T0 | P3 | civilian variant |
| 65 | Medical scrubs / police uniform disguises | T0 | P3 | civilian variants for hospital and police missions |

### 1.8 Medical and support
| # | Item | Tier | Pri | Notes |
|---|---|---|---|---|
| 66 | First-aid kit (pouch) | T0 | P1 | |
| 67 | Trauma kit / combat medkit | T1 | P2 | "Field medicine", "Combat surgery" |
| 68 | Blood bag / plasma bag | T0 | P2 | heals bleeding |
| 69 | Synthetic plasma injector | T3 | P3 | "Synthetic plasma" |
| 70 | Tourniquet | T0 | P3 | |
| 71 | Adrenaline / stim injector | T0 | P3 | |
| 72 | Sedative dart / syringe (for thralls) | T0 | P3 | captures |
| 73 | Restraints, zip-ties | T0 | P2 | captures |
| 74 | Containment body bag / UV-lined coffin crate | T1 | P2 | taking a vampire in torpor |
| 75 | Rosary / crucifix / reliquary | T0 | P2 | Faith vs domination; lore |
| 76 | Radio, earpiece | T0 | P3 | |
| 77 | Handheld thermal scanner | T1 | P3 | spots hidden thralls, like the motion scanner |
| 78 | Camera / evidence kit | T0 | P3 | cover-up flavour |
| 79 | Lockpick set / bolt cutters | T0 | P3 | |
| 80 | Grappling hook / rope | T0 | P3 | matches vampire climbing |

**Minimum P1 set to start the tactical layer (≈20 meshes):** 1, 2, 8, 11, 13,
24, 25, 31, 34, 35, 39, 45, 46, 48, 55, 56, 57, 66.

---

## 2. Level props

Locations come from the event and cover-up texts (counted in `src/sim`,
`src/data`): police stations, churches and chapels, hospitals and morgues,
labs, hangars and airports, trains and stations, convents, basements and
cellars, offices, bars and clubs, farms, castles and estates, mines, ports and
ships, schools, banks, a museum, a library, a hotel. Plus the ones you named:
mansions, blood farms, rural gas stations.

### 2.1 Shared kit (used everywhere, model first)
Walls, floors, doors (wood, steel, glass, double), windows (breakable),
stairs, railings, ladders; tables, chairs, sofas, beds, shelves, filing
cabinets, desks, computers, phones, TVs, lamps (floor, desk, ceiling, a
**switchable light source**, since darkness matters), light switches, fuse
box/breaker (cutting the lights is a tactic), crates, barrels, pallets,
dumpsters, bins, cars (sedan, van, pickup, police car, ambulance, hearse),
streetlights, fences (chain-link, wooden, iron), hedges, trees, rocks,
bodies (human corpse, drained corpse, body bag), blood decals (pools,
smears, drag marks), debris, sandbags.

Cover classes to keep in mind: **full cover** (walls, cars, counters,
vending machines) and **half cover** (tables, crates, low walls, beds).

### 2.1b The prop kit, first batch (built)
In `public/assets/props/` (pipeline in [tooling.md](design/tooling.md),
"Props"); placed by the battle view as in
[tactical.md](design/tactical.md), "Props" (not yet used: gutter, awning,
bollard, litter bin, jersey barrier, utility pole and cabinet, planter,
pallet, oil drum, cardboard boxes, filing cabinet, shelving, wardrobe,
server rack, locker: they wait for map skins of their own). Chosen to work in any country and
any decade from the 1990s on: the parts of a building that make a box read
as architecture, plus the clutter every street and room has.

* **Architecture (edge and corner pieces):** window_casement (wood),
  window_modern (aluminium), window_blinds (insert), door_frame, door_wood
  and door_steel (leaves, two per doorway), plinth, band_course, cornice
  (each with a *_corner), quoins, downpipe, gutter, awning, ac_unit,
  wall_lamp.
* **Street:** street_lamp, bollard, bench, litter_bin, dumpster,
  jersey_barrier, utility_pole, utility_cabinet, manhole, drain_grate,
  planter, crate, pallet, oil_drum, cardboard_boxes.
* **Interior:** desk, desk_computer, office_chair, chair, table,
  filing_cabinet, shelving, wardrobe, server_rack, locker; and furniture
  over several tiles (the flats'): sofa with end table and lamp (2 × 1),
  tv_stand (2 × 1), bed (king size, nightstands, foot bench, rug; 2 × 2).

### 2.1c Second batch: the shared blocks (built, in the block editor)
For the shared block set (levels.md, "The bank"): the tells that name each
block. All in the same .blend and palette; one tile unless noted.

* **Petrol station and convenience store:** fuel_pump (on its island, both
  faces), shelf_gondola (snacks both sides), shelf_wall (tall, single sided),
  drinks_fridge (two doors, lit), ice_chest, checkout_counter (2 × 1, till
  and sweets rack), atm, news_rack, propane_cage, price_sign (pylon, lit
  prices both faces).
* **Coffee shop:** coffee_counter (2 × 1, pastry case, espresso machine),
  cafe_table (with two chairs), a_frame_sign.
* **Fast food:** fastfood_counter (2 × 1, menu boards hung behind),
  booth (2 × 1), menu_board (drive-through).
* **Car park and park:** boom_barrier (the arm over two more tiles along
  +X), pay_station, shopping_trolley, picnic_table, swing_set (2 × 1).
* **Church and graveyard:** pew (2 × 1), altar (2 × 1, on its step),
  lectern, candle_stand, gravestone, gravestone_cross, grave_tomb.
* **Office (desk-top sets, as desk_computer):** desk_laptop, desk_papers.

### 2.1d Third batch: dense urban, run down (built, in the block editor)
Urban decay for the tenement blocks. One tile unless noted; edge pieces sit
on an outside wall like the architecture.

* **Tenement (edge pieces):** fire_escape (landing over 2 tiles, its stair
  through a hatch to the landing 2.5 m below), fire_escape_ladder (the
  lowest landing, a drop ladder), boarded_window and window_bars (inserts
  over a window), satellite_dish, balcony_laundry; mailboxes (lobby).
* **Yards and court:** chainlink_fence, chainlink_barbed, chainlink_torn
  (2 × 1 runs on the tiles' middle line), basketball_hoop, bleachers (2 × 1).
* **Street:** bus_shelter (2 × 1, a pane smashed), fire_hydrant,
  wheelie_bins, street_lamp_broken, dumpster_overflow.
* **Junk and grime:** burning_barrel (the flames on the glowing `fire`
  swatch), trash_bags, trash_pile, tyre_stack, mattress_dumped,
  armchair_dumped, rubble_pile; decals as thin props: graffiti_tag,
  graffiti_scrawl, wall_grime (on walls), ground_cracks, ground_grime (on a
  tile's floor).

### 2.1e Kitchens and bathrooms (built, in the block editor)
One tile each, the back to the wall. Kitchen units fill their tile edge to
edge (base cupboards, worktop, tiled splashback, wall cupboards), so a row
of them reads as one kitchen.

* **Kitchen:** kitchen_counter (microwave, kettle, toaster), kitchen_sink
  (sink, drainer, plate rack), kitchen_stove (cooker between two short
  counters, hood), kitchen_fridge (fridge-freezer and a tall cupboard),
  kitchen_counter_cluttered (run down: a door off, a cupboard hanging open,
  pizza boxes, bottles, grease), washing_machine (and a laundry basket).
* **Bathroom:** toilet_clean, toilet_grimy (no seat, stains, the cistern
  lid askew), basin (pedestal, mirror cabinet), basin_vanity (run down:
  cracked mirror, rust, a door off), bath (1.5 m, curtain half drawn),
  shower (cubicle, its door open).

### 2.1f Entrances and posters (built, in the block editor)
* **entrance_stoop**, **entrance_stoop_rundown**: edge pieces outside a
  street door, over the tile in front of it. Floors stay flat (no ramps),
  so the stoop is a 12 cm landing and one step, read by its brick cheek
  walls with railings, the canopy and lamp over the door, the buzzer panel
  and the house number. The run-down one: a cracked step, a railing torn
  off, the canopy sagging, the lamp dead.
* **Posters** (thin edge pieces): posters_flyposted (layered, torn),
  posters_missing (three MISSING notices with faces), billboard_peeling
  (3 m, a corner peeling) on outside walls; posters_room (a band poster
  and a calendar) on an inside face.

### 2.1g Industrial (built, in the block editor)
* **Warehouse:** pallet_racking (three loaded levels), pallet_racking_mixed
  (drums, an empty pallet, sacks), pallet_boxes, pallet_sacks, forklift
  (2 × 1, forks toward -X), pallet_jack, roller_shutter and
  roller_shutter_open (doorway edge pieces, the drum housing inside),
  loading_dock (edge: seal, bumpers, dock lamp, bollards), ibc_tank,
  gas_cylinders, workbench, tool_chest.
* **Works:** cnc_machine, drill_press, conveyor (2 × 1), control_panel,
  generator (2 × 1), pipe_manifold (its runs join a neighbour's along X),
  storage_tank, chemical_drums.
* **Data centre:** server_row (three racks and a cable tray, 2 × 1),
  cooling_unit, ops_console (2 × 1, six screens).
* **Yard:** shipping_container and container_open (4 × 2, the vehicle
  kind's footprint, doors at +X), guard_booth.

### 2.1h Light urban (built, in the block editor)
* **House:** front_porch (edge over 2 tiles: deck, posts, railing open in
  the middle, roof, light), garage_door (edge over 2 tiles), picket_fence
  and privacy_fence (2 × 1 runs), picket_gate, mailbox_post, garden_shed,
  basement_boiler (furnace and water heater).
* **Backyard:** bbq_grill, patio_set (umbrella, four chairs), sun_lounger,
  trampoline (2 × 2), sandbox, lawnmower, veg_bed, doghouse,
  rotary_clothesline, wheelbarrow, woodpile, bicycle.
* **Small clinic:** exam_table, clinic_reception (2 × 1), waiting_chairs
  (2 × 1), medicine_cabinet, privacy_screen, wheelchair, hospital_bed
  (2 × 1), iv_stand.

### 2.1i Rural (built, in the block editor)
* **Farm:** rail_fence, barbed_fence, farm_gate (2 × 1 runs), hay_round,
  hay_stack, hay_feeder, water_trough, chicken_coop, stall_front (an edge
  piece inside a barn), saddle_rack, tool_rack, rocking_chair.
* **Machinery:** tractor and hay_wagon (2 × 1, fronts toward -X),
  cultivator, fuel_tank_farm, propane_tank (2 × 1).
* **Structures:** silo (2 × 2, 8.5 m), grain_bin (2 × 2), windmill (6 m),
  well, cellar_door (edge, outside a house wall), scarecrow.
* **Crops (a tile each):** crop_corn (tall: blocks the view), crop_wheat,
  pumpkin_patch.

### 2.1j Lairs (built, in the block editor)
Two tastes for the elder's house; a lair takes one. Pieces against a wall
have their back to it (+Y).

* **Old money:** four_poster_bed (2 × 2), chesterfield (2 × 1),
  wingback_chair, fireplace_grand (a fire in the grate, mirror over the
  mantel), grand_piano (2 × 2), bookcase, chandelier (hung from the
  ceiling, its origin on the floor), dining_long (2 × 1, six chairs,
  candelabra), portrait_gilt, suit_of_armour, grandfather_clock,
  persian_rug (2 × 2), billiard_table (2 × 1), coffin_antique (2 × 1, on a
  bier, its lid slid back, candles).
* **Modern minimalism:** platform_bed (2 × 2, light under it), sofa_modern,
  lounge_chair, dining_glass, kitchen_island (pendants over it),
  media_wall (screen and linear fire), sculpture, art_canvas, wine_wall,
  coffin_modern (2 × 1, a black pod, red light in its seam).
* **Either:** blood_fridge (bags on rails), feeding_chair (straps, a drain,
  a stain, a tray of instruments).

Next batch, by payoff: entrance stoop (steps and cheek walls), balcony with
railing, railing/fence run, bus shelter, sign post, parked-car clutter
(tyres, traffic cone), kitchen counter, toilet and basin, hospital bed and
IV stand, pew, gravestone.

### 2.2 By location
| Location | Key props | Pri |
|---|---|---|
| **Hospital** | hospital beds with rails, IV stands, heart monitors, curtains on rails, gurneys, wheelchairs, nurses' station counter, waiting-room chairs, vending machine, medicine cabinets, crash cart, operating table and lamp, elevator doors, **blood bank fridge** with bags | P1 |
| **Morgue** | steel autopsy table, body drawers wall (opening), body bags, scales, instrument trays, sheet-covered corpse, floor drain | P1 |
| **Police station** | front desk with glass, holding cells (bars, cell doors), interrogation table + one-way mirror, lockers, evidence room shelves, gun rack, desks with monitors, whiteboard/cork board with case photos, water cooler, patrol cars | P1 |
| **Church / chapel** | pews, altar, pulpit, lectern, confessional, baptismal font, candles and candle stands (light), crucifix, statues, stained-glass windows, organ, bell rope, votive rack | P1 |
| **Crypt / church basement** | sarcophagi, stone coffins, bone niches/ossuary, iron gate, torch sconces, broken stone, vampire resting coffin | P1 |
| **Convent / monastery** | cells with cots, refectory long tables, cloister columns, well, kitchen hearth, library desks and lecterns, herb garden beds | P2 |
| **Mansion / estate / castle** | grand staircase, chandelier, four-poster bed, fireplace, armchairs, grand piano, portraits, bookcases (one secret door), long dining table with candelabra, suits of armour, wine cellar racks and casks, heavy curtains (blackout = vampire lair), billiard table, greenhouse | P1 |
| **Blood farm** | chained cots/beds, IV drip rigs, collection bags on racks, cages, drained bodies, medical fridges, generator, tarp walls, buckets, hooks, a converted barn or warehouse shell | P1 |
| **Rural gas station** | fuel pumps (explodable), canopy, shop shelves, fridges, counter and till, coffee machine, ice chest, restroom, propane cage, oil drums, payphone, pickup trucks, neon sign | P1 |
| **Farm / barn** | hay bales, tractor, troughs, stalls, silo, farmhouse kitchen, root cellar door, scarecrow, barbed-wire fence, well | P2 |
| **Lab / research facility** | lab benches, fume hood, centrifuge, microscopes, freezers, specimen jars, containment cell (glass), server racks, keycard doors, biohazard bins | P2 |
| **Warehouse / docks / port** | shipping containers, forklift, pallet racks, cranes, bollards, rope coils, rowing boat, ship deck parts, gangway | P2 |
| **Hangar / airport** | small aircraft, helicopter, tool chests, fuel truck, baggage carts, airport seating, check-in desk, security scanner | P2 |
| **Train station / train** | platform benches, ticket machines, departure board, train car interior (seats, luggage racks), sleeper compartment, rails | P2 |
| **Bar / nightclub** | bar counter with stools, bottles shelf, booths, pool table, jukebox, DJ booth, dance floor lights, VIP lounge sofas, back office safe | P2 |
| **Motel / hotel** | reception desk, motel room set (bed, TV, bathroom), ice machine, room doors on an outside walkway, luggage cart | P2 |
| **Office / bank** | cubicles, office chairs, copier, vault door, safe deposit boxes, teller counter, conference table | P3 |
| **Mine** | timber supports, mine cart and rails, lanterns, rock walls, dynamite crate | P3 |
| **School / library / museum** | desks, blackboard, lockers, bookcases, display cases, plinths with exhibits, mummy or relic | P3 |
| **Village / street (outdoor)** | house facades, market stalls, wells, benches, phone box, bus stop, parked cars | P2 |
| **Cemetery** | gravestones, mausoleum, open grave, iron fence, groundskeeper shed | P2 |
| **Order base** (our own, base view) | briefing table, map wall, armoury racks, chapel corner, containment cell (UV-lit), infirmary beds | P3 |

### 2.3 Vampire-specific props (used across locations)
coffin (modern and antique), blackout-taped windows, soil-filled crate (lair
earth), feeding chair with straps, thrall shrine or offering table, ritual
circle decal, bloodline sigils (one per bloodline, as decals), drained
victim, cocoon or nest of sheets in a cellar.

---

## 3. Suggested order
1. Shared kit (2.1) walls/doors/furniture plus the P1 item set (1.x).
2. Three P1 locations that cover the most events: **police station,
   church + crypt, hospital + morgue**.
3. Mansion, blood farm, rural gas station.
4. P2 items as research comes in, then P2 locations.

---

## 4. Base building (modular office block)

Design in WEB_PORT.md 3.7b: a **3 × 3 × 3 office building**, a basement
and two floors above ground, a core (lift and stairs) in the centre column,
a ring of 8 rooms per floor, a helipad on the roof and a hangar beside it. The base view
is a cutaway: the floors above the selected one fade out.

**Module unit:** one tile (e.g. 8 m × 8 m, 3.5 m floor to floor). Every
room module is a **floor slab + inner walls** that snap to the core and to
their two ring neighbours. Two shapes are needed: **edge tile** (one
outside wall) and **corner tile** (two outside walls). Inner walls need a
**solid** and an **open/doorway** variant, so a 3-room wing can read as one
open-plan space (shows synergy at a glance).

Every room needs: an **office** state (unbuilt rooms look like ordinary
offices: desks, cubicles, cover staff), an **under construction** state (plastic sheeting, ladders,
work lights), a **built** state, and a **UI icon**.

### 4.1 The shell
| Asset | Pri | Notes |
|---|---|---|
| Core, per floor | P1 | **lift and stairs** (both are walkable on the raid map): lift shaft and doors, stair flights, fire door, extinguisher, floor sign; basement, ground and roof variants |
| Basement ring | P1 | concrete walls (no facade), pipes, boiler, ducts, a ramp or loading door |
| Facade panel, edge | P1 | windows with blinds (open/closed), spandrel; 2–3 styles (glass, brick, concrete) per region |
| Facade panel, corner | P1 | matches the above |
| Floor slab / ceiling | P1 | carpet tile, ceiling tiles with lights, raised floor variant for server rooms |
| Inner wall, solid and open | P1 | plaster partition, glass partition variant |
| Roof | P1 | parapet, AC units, water tank, roof access hut, aerials |
| Helipad (roof) | P1 | H marking, lights, windsock; one helicopter sits here |
| Hangar beside the building | P1 | a detached shed or warehouse: roller door, apron, tool chests, fuel bowser, engine stand; must stand alone on a raid map |
| SIGINT mast and dishes (roof) | P2 | appears with the SIGINT centre, bigger at level 2 |
| Street front | P2 | pavement, entrance canopy, company sign (cover business), parked cars, bike rack, bins; a loading bay at the back |

### 4.2 Rooms
| Room | Dressing props | Pri |
|---|---|---|
| **Entrance: lobby and security checkpoint** (fixed, ground floor front middle) | glass entrance doors, reception desk with the cover company's logo, waiting chairs, plant; then the checkpoint: turnstiles or security gates, metal detector arch, X-ray bag scanner, guard booth with CCTV monitors, a reinforced door to the core | P1 |
| **Quarters** | bunk beds or office-converted dorm, lockers, footlockers, kitchenette, crucifix on the wall | P1 |
| **Laboratory** | benches, microscopes, fume hood, centrifuge, sample freezers, whiteboard, autopsy table for remains | P1 |
| **Workshop** | workbenches, drill press, welding bay, weapon parts, crates, UV lamp rig on a test bench | P1 |
| **Containment** | 3 cells (glass or bars), UV light bars, observation desk, restraint chair, drain, cold-storage drawers; blacked-out windows | P1 |
| **SIGINT centre L1** | operator desks, monitors, headsets, radio racks, wall map with pins, server rack | P1 |
| **SIGINT centre L2** | adds a wall of screens, more server racks, analysts' cork board; roof mast grows | P2 |
| **Armoury** (if added) | gun racks (re-use item meshes), ammo crates, cleaning bench, stake racks | P3 |
| **Infirmary** (if added) | hospital beds, monitors, IV stands (re-use hospital props) | P3 |
| **Chapel** (if added) | small altar, a few chairs, candles, icons (re-use church props) | P3 |

### 4.3 People and life
Office staff as cover (suits, cleaners; they fill unbuilt rooms), scientists in lab coats, engineers
in overalls (the agent rig with different clothes), plus a few office
props for the empty and cover rooms: cubicles, office chairs, printers,
water cooler, potted plants.

Most dressing re-uses props from section 2 (hospital, lab, police desks,
church), so the new work is the shell (4.1) and the room arrangements.

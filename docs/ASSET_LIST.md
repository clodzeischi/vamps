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

## 4. Base rooms (modular grid)

Design in WEB_PORT.md 3.7b: a 6 × 6 grid seen as a cutaway from above.
Each room is a **tile module**: floor, four wall sides (with an open
"doorway" variant on each side so neighbours connect), a ceiling that is
hidden in the base view, and its own dressing. Tile size: pick one unit
(e.g. 10 m × 10 m, 4 m high) and build everything to it; hangars are
2 × 2 tiles.

Every room needs: an **empty/under construction** state (scaffolding, plastic
sheeting, work lights), a **built** state, and a small **UI icon** for the
build menu.

| Room | Footprint | Dressing props | Pri |
|---|---|---|---|
| **Access lift** (fixed) | 1 × 1 | freight lift platform, cage doors, call panel, guard desk, metal detector | P1 |
| **Corridor** | 1 × 1 | straight, corner, T and cross pieces; pipes and cable trays, strip lights, fire doors, signage | P1 |
| **Hangar** | 2 × 2 | roof hatch or blast doors, helipad markings, jet or helicopter (from the aircraft models), tool chests, fuel bowser, gantry, engine stand | P1 |
| **Quarters** | 1 × 1 | bunk beds, lockers, footlockers, crucifix on the wall, small desk, shared washroom corner | P1 |
| **Laboratory** | 1 × 1 | lab benches, microscopes, fume hood, centrifuge, sample freezers, whiteboard, autopsy table for remains | P1 |
| **Workshop** | 1 × 1 | workbenches, lathe, drill press, welding station, weapon racks being worked on, crates of parts, a UV lamp rig | P1 |
| **Containment** | 1 × 1 | 3 cells with glass or bars, UV light bars in the ceiling, observation desk, restraint chair, drain, cold-storage drawer for remains | P1 |
| **SIGINT centre, level 1** | 1 × 1 | operator desks with monitors, headsets, radio racks, tape recorders, wall map with pins, server rack | P1 |
| **SIGINT centre, level 2** | 1 × 1 | adds: big wall of screens, more server racks, a satellite dish or antenna mast on the surface above, analyst cork board | P2 |
| **Armoury** (if added) | 1 × 1 | gun racks (re-use the inventory item meshes), ammo crates, cleaning bench, stake racks | P3 |
| **Infirmary** (if added) | 1 × 1 | hospital beds, monitors, IV stands (re-use hospital props) | P3 |
| **Chapel** (if added) | 1 × 1 | small altar, a few pews, candles, icons (re-use church props) | P3 |

**Surface above the base** (shown at the top of the cutaway, or as the
base's establishing shot): the cover building per base type (a seminary
or monastery for Padua, a warehouse, a farmhouse; a parish church for a
church cell), plus the hangar's roof hatch and the SIGINT mast.

**Shared base kit:** bedrock/soil cutaway edge for the grid border, empty
excavated tile, rock wall, light fittings, pipes, vents, cable runs,
emergency lights (red alert state), a few human staff figures in lab coats
and overalls (they can be the agent rig with different clothes).

Most dressing re-uses props from section 2 (hospital, lab, police desks,
church), so the rooms are mostly the shell modules plus re-arranged props.

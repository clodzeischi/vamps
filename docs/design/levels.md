# Levels: terrains, missions, the block bank

**Design; the block editor is built** (`npm run blocks`, below), the
generator and the bank are not. It replaces the procedural layout described in
[tactical.md](tactical.md), "Maps": the rules, the renderer, the save
format and the prop kit stay as they are.

## The idea

A battle map is assembled from **authored blocks**, as in X-COM, rather
than grown tile by tile. A player shrugs at the same petrol station on
four maps; they notice at once a shop with its shelves at odd angles, or a
bedroom with a dining table beside the bed. Authored blocks also teach:
the second time a player sees the suburban house, they know where the back
door and the stairs are, and play smarter for it.

* **Generic world.** No regional architecture or materials. Every block
  must pass for Sydney, Toronto, Hong Kong or Nairobi: stucco, brick,
  concrete, steel, glass. Variety comes from weather, time of day,
  material swaps and arrangement, not from cultural styling.
* **Recognisable at a glance.** Show a block to a stranger and they should
  name it ("a convenience store by a petrol station", "a run-down block
  of flats", "a hospital waiting room"). Every block has a few
  **tells**: the props and shapes that name it (see Assets).
* **The generator only arranges.** A script per mission and terrain picks
  blocks, rotates them and puts them on a grid. It never invents a room,
  places furniture or cuts a doorway. Plans, furniture, lamps, spawn
  points and patrol routes all come with the block.

## 1. Terrains

Four terrains cover every fight we want; lairs and Montségur stay authored
whole, as they are now.

| Terrain | Reads as | Typical blocks | Now |
|---|---|---|---|
| **Dense urban** | a city's inner streets: tall, close, run-down in places | apartment towers, walk-up tenements with shops below, office blocks, a bar or club, alleys and back courts, a small square | `apartments` |
| **Light urban** | a suburb or small town | detached and terraced houses, a corner shop, a petrol station, a church, a park, a car park, a hospital, a supermarket | `urban` |
| **Rural** | a farm and a country road | farmyard (house, barn), fields, woods, a roadside petrol station, a chapel and graveyard, sheds | `rural` |
| **Industrial** | a works on the city's edge | warehouse, container yard, loading docks, workshops, a gatehouse, tanks and pipes; the blood bank below | `industrial` |

Dense and light urban share the road blocks and some buildings (hospital,
supermarket, car park). Weather (clear, rain, snow) and day or night apply
to all four.

## 2. Missions

Each mission is a distinct way to play, on familiar ground. Variety comes
from multiplying a few axes, not from piling up content:
**mission × terrain × day or night × weather × arrival × kit**. Five
mission kinds on four terrains, by day or night, plainclothes or tactical,
already give more distinct fights than a campaign uses.

The first three are the strikes we have now, made distinct by layout. The
next two map to leads we already have (rescue, double agent). Feeding and
recovery are new: both are in, as new lead outcomes (how the campaign
offers them is still to design).

| Mission | X-COM parallel | Objective | Play | Size (blocks) |
|---|---|---|---|---|
| **Nest strike** | small UFO | Burn the nest: one building, a fledgling and its keepers | short breach and clear; by day a stealthy approach to a sleeping vampire | 3 × 3 |
| **Den strike** | medium UFO | Clear a working site with a basement: a front business (garage, shop, clinic, warehouse) | outer guards, then a building, then a basement; choose the way in | 4 × 4 |
| **Haven strike** | large UFO | Kill or take the elder in their residence (big house, penthouse, estate) | a guarded, many-storey building; fight up or down; the elder dominates | 4 × 4 |
| **Rescue** | (none) | Reach the prisoner, free them, get them out alive | a route in and a route out; speed, escorting | 4 × 4 |
| **Ambush** (a double) | crash-site ambush in reverse | Survive and reach the extraction point | start surrounded at a meeting place; break out | 3 × 3 |
| **Feeding** (new) | terror site | Stop a feeding in a public place; save civilians | civilians in the open, secrecy lost per witness or death | 4 × 4 |
| **Recovery** (new) | (none) | Take the evidence (records, samples) and leave | a heist: stealth favoured, fighting optional | 3 × 3 |

**Lair** stays as it is (authored whole: churchyard, catacombs, crypt).

### Rough layouts

One letter per 12 × 12 block. `═ ║ ╬ ╦` roads, `L` the landing zone
(plaza, park, car park or field), `X` the target block, `·` filler drawn
from the terrain's pool, `E` extraction. Each layout is a template:
the script rotates and mirrors it and draws the blocks.

```
Nest (light urban)     Den (industrial)        Haven (dense urban)
 ·  ·  X                ·  ·  ·  ·              ·  X  X  ·
═══╬═══                ════╦═══════             ═══╬════════
 L  ·  ·                ·  ║  X  X              ·  ║  ·  L
                        L  ║  X  X              ·  ║  ·  ·
X is a house, flat     the warehouse (24×24)   X a tower (12×24); the
or lock-up             with its basement       roof is a second way in

Rescue (light urban)   Ambush (any town)       Feeding (dense urban)
 ·  ·  ·  E             ·  ·  ·                 ·  ·  ·  ·
════╬══════            ═══╬═══                 ═══╬════════
 ·  ║  X  X             ·  M  E                 L  ║  X  ·
 L  ║  X  X            M: the meeting place    ·  ║  ·  ·
X: the hospital or     (café, car park, park); X: a bar or club,
supermarket (24×24)    enemies come from 3     civilians in the
                       sides                   street around it
```

Each mission has its own landing logic: a strike lands away from the
target with cover between; a rescue puts extraction on the far side from
the landing zone; an ambush starts the team inside the meeting block. The
target block carries the spawn points for the vampires and the prisoner.

## 3. The block bank

### The block

* **12 × 12 tiles** (18 m), or a multiple (12 × 24, 24 × 24) for big
  buildings. Twelve fits our streets: a road block is pavement 2, road 8,
  pavement 2. A suburban lot is a house of 8 × 10 with its garden and
  path; maps of 3, 4 or 5 blocks a side come to 36, 48 or 60 tiles (the
  current maps are 34–50).
* **Every level**: tiles (floor skin), edges (wall, window, door, glass,
  each with its skin), stairs, props (with facing), multi-tile furniture,
  lamps, signs, canopies, vehicles and parking slots. A block has as many
  storeys as it needs; the map takes the tallest.
* **Tags**: terrains it suits; its kind (road straight, junction, T,
  corner, building, yard, open ground, landing zone); which side is its
  front (onto the street); the missions it can be a target for.
* **Nodes** (X-COM's route nodes): points with a role (vampire's rest,
  thrall post, patrol, civilian, prisoner, loot, extraction) and links
  between them for patrol routes. Spawns are drawn from nodes that suit
  the mission, so the elder ends up in the master bedroom because someone
  put it there.
* **Variants without new authoring**:
  * turning on the map (four ways; never mirrored, so signs read): a
    script turns a block only so its front faces a road, a car park or
    the landing zone, so a shop's door is always on the street;
  * a wall material picked from the block's set (brick, plaster, render),
    and window and door styles to match;
  * optional props (a chance each: a parked car, bins, a second crate);
  * door states and broken glass, as now.

  Furniture positions never vary.

### Authoring

Blocks are JSON in `src/data/blocks/`, one file per block, drawn in a
**block editor**: a dev page like the map gallery. It paints floors, edges
and props on a grid, level by level, with a 3D preview through the battle
view. It also places nodes and checks the block as you work:
connectivity, doors clear, furniture fronts open, recognisable tells
present. Hand-written plans in text would do for a first few blocks, but
not for sixty.

### The block editor

`npm run blocks` opens `blocks.html` (dev server only, never built into
the game). The block is drawn top down, level by level, with the battle
view's own 3D preview beside it (day or night, clear, rain or snow), so
what you draw is what a map will show.

* **Tools** (keys 1–7): floor (shift-drag fills a rectangle), walls
  (walls, windows, doors, glass on tile edges; drag along a line;
  shift-drag walls a room round), props (low or high cover), furniture
  (from its corner; T turns it), stairs, lamps (ceiling, wall, street),
  nodes (spawn and event points by role). Right button erases;
  Alt-click picks up what's under the pointer.
* **Levels**: `[` and `]` (or the header buttons) step levels; add a
  storey above or a basement below.
* **The block**: id (its file name), name, size (12 × 12 to 24 × 24),
  terrains, kind, front, the missions it can be a target for, wall skins
  a map may swap in, notes.
* **Checks** as you work (click one to go to its level): tiles that can't
  be reached from the street, stairs with no floor above, broken or boxed-in
  furniture, props in doorways, nodes where nobody can stand, a building
  with no front, a target block missing its vampire, elder, prisoner or
  thrall nodes.
* Undo and redo (Ctrl+Z, Ctrl+Shift+Z), Save (Ctrl+S) to
  `src/data/blocks/<id>.json`, Duplicate (a copy under a new id), Delete.
* **The file** (`tactical/blocks.ts`): each level is rows of characters,
  a tile each, and two grids of edges, each character named in the
  block's legends; furniture, lamps, nodes and the rest as lists. It reads
  in a diff. `data/blockBank.ts` loads every file and checks it; a test
  fails if one is malformed or misnamed.
* **Extending it**: a new tool is one entry in `src/editor/tools.ts`. Its
  menus can come from the game's own lists, so a new skin, furniture kind,
  terrain, block kind, mission or node role (in `tactical/map.ts` and
  `tactical/blocks.ts`) shows up in the editor without touching it.
  Signs, canopies, vehicles and patrol links are in the file format
  already; their tools are still to come.

### Map scripts

One script per mission and terrain, in X-COM's style. A sketch:

```
den / industrial:  size 4×4
  road line across at row 1 (junction where lines meet)
  target  "warehouse" 24×24  in the far half
  landing "yard_open" or "car_park"  on an edge, ≥ 2 blocks from target
  fill    industrial pool, each block at most twice
  nodes   vampires: target's "rest" nodes; thralls: "post" anywhere,
          a third outside the target
```

Commands: lay a road line, place a block (by name or tag, where, how
many), fill the rest from a pool (weights and repeat limits), and choose
between variants of the script by chance. The generator then stitches the
blocks: kerbs are drawn as now from skins, and road blocks line up by
construction. It takes spawns from nodes and checks connectivity, as now,
though a failure means a bad block, not a repair job.

### What goes

`floorPlan` (random room splits), `thinStorey`, `furnish` and `fit`, the
lot logic in `urban()`, `rural()` and most of `sites.ts` become blocks and
scripts. The planned sites (apartment tower, warehouse, hospital,
supermarket, petrol station, corner shop) are the first blocks, converted
from their code.

### A first bank

About 45 blocks gives each terrain enough to fill a map without repeats
showing in one battle:

* **Roads** (shared by the towns): straight, junction, T, corner, end;
  variants with a bus stop, a zebra crossing, a lay-by. Rural: a lane
  straight, a bend, a farm gate.
* **Light urban** (~12): detached house ×3, terraced pair, corner shop
  with a flat above, petrol station (24 × 12), church with graveyard
  (24 × 24), park, playground, car park, garage and workshop, hospital
  and supermarket (24 × 24).
* **Dense urban** (~10): apartment tower (12 × 24), walk-up tenement with
  shops below ×2, office block, bar or club with a basement, back court
  and alley ×2, small square, hotel.
* **Rural** (~8): farmyard (24 × 24), field (crop, pasture), woods ×2,
  chapel and graveyard, sheds, roadside petrol station.
* **Industrial** (~8): warehouse with the blood bank (24 × 24), container
  yard, loading docks, workshop, gatehouse and fence, tanks and pipes,
  open yard.

## 4. Assets: what each block needs to read

The test is whether a stranger can name the block. "Have" is a model in
the prop kit; "box" is drawn as a box today; the rest is missing.

| Block | Tells (what names it) | Have | Box only | Missing |
|---|---|---|---|---|
| Convenience store and petrol station | pumps under a lit canopy, shelves of goods, drinks fridges with lit fronts, counter and till, sign | dumpster, ac_unit, wall lamp | pump, shelves, counter, fridge | shelves with stock, glowing fridge fronts, till and counter, ice chest, ATM, newspaper rack, price sign |
| Run-down apartment block | entrance stoop and canopy, mailboxes, stairwell railings, balconies, satellite dishes, laundry, graffiti, rubbish bags | sofa, TV stand, bed, table, chairs, wardrobe | (none) | kitchen counter (sink, stove, fridge), bathroom (toilet, basin, bath), balcony and railing, stoop, mailbox bank, satellite dish, bin bags, **decals** (graffiti, stains, posters) |
| Hospital waiting room and ward | rows of linked seats, reception desk, wayfinding signs, beds with rails, curtains, IV stands, wheelchairs | filing cabinet, desk, computer | hospital bed | linked seating, reception desk, ward bed, curtain rail, IV stand, wheelchair, vending machine, signs |
| Suburban house | pitched roof, porch, garage door, fence and gate, kitchen, living room, bedrooms | sofa, TV, bed, table, chairs, wardrobe | (none) | **pitched roof**, porch and steps, garage door, garden fence and gate, mailbox, kitchen set, bathroom set, garden shed |
| Office block | cubicles, desks with screens, copier, water cooler, reception, meeting room | desk, computer, office chair, filing cabinet | (none) | cubicle partitions, reception desk, copier, water cooler, meeting table, ceiling light grid |
| Bar or club | bar counter with stools and bottles, booths, pool table, dance floor, neon | (none) | counter | bar and back shelf, stools, booths, pool table, DJ booth, neon signs |
| Church and graveyard | pews, altar, lectern, stained glass, candles, gravestones | (none) | pew (bench), altar, grave | pew, altar, lectern, stained-glass window, candle stands, gravestones, lychgate |
| Warehouse and yard | pallet racking, forklift, pallets, containers, roller shutters, docks | pallet, crate, oil drum, cardboard boxes | rack, container | racking with goods, forklift, roller shutter door, dock leveller, gatehouse barrier |
| Farmyard | barn, tractor, hay, troughs, fences, silo | crate | hay, fence | tractor, trough, silo, field fence, gate, crops |
| Street | bus shelter, traffic lights, road signs, bins, phone box | street lamp, bench, bollard, bins, manhole, drain, utility pole and cabinet, planter | (none) | bus shelter, traffic light, road signs, phone box, newspaper box |

Beyond props, five engine pieces carry most of the reading:

* **Decals**: graffiti, stains, posters, road paint, blood. They make the
  biggest difference between "flat" and "run-down" for the least work.
* **Pitched roofs** (the look only; flat roofs stay walkable): a house
  reads as a house at once.
* **Interior surfaces**: wallpaper, tile, carpet, lino as wall and floor
  skins, so a kitchen, a bathroom and an office don't share floorboards.
* **Lit fronts and screens**: fridges, vending machines, neon signs and
  monitors on the emissive swatches; at night they light a block.
* **New edges**: a roller shutter (a door that opens slowly or not at all)
  and a balcony railing (half cover, on an edge).

## Next

1. The bank: the first blocks (houses, barns, shops, apartment modules),
   drawn in the editor; the planned sites converted from code.
2. The generator: map scripts, stamping turned blocks, spawns from nodes;
   light urban first, then the rest.
3. Feeding and recovery as lead outcomes and objectives.

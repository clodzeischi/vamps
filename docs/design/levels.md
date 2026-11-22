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

Four terrains cover every fight we want; lairs (Montségur among them) are
built whole by hand, each with its own challenges.

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

Five **gameplays**, each a different way to win. Deathmatch is the
baseline and the most common; the others exist so that a quiet agent
with low Combat and high Tradecraft has missions where they are the
right pick. Killing everyone wins only a deathmatch.

| Gameplay | Win | Missions | Size (blocks) |
|---|---|---|---|
| **Deathmatch** | kill or take every enemy | nest, den, lair | 4 × 4, 4 × 5, 5 × 5 |
| **Horde** | survive N waves | attack on an OPV base, defending a monastery or church | 5 × 5, 4 × 4 |
| **Extraction** | get across the map, or there and back | evading capture (the double agent's ambush), rescuing a hostage or VIP | 3 × 5 |
| **Theft** | take the item and get out | stealing an item (a recovery lead) | 3 × 5 |
| **Feeding** | save the civilians | stopping a feeding | 4 × 4 |

Planting evidence stays a covert op ([covert.md](covert.md)), not a
battle.

### Deathmatch

We find a nest, den or lair and dispatch a team. Little stealth: it ends
in violence. The three scale like X-COM's scout, cargo ship and
mothership:

* **Nest** (4 × 4): a suburban house or a farm. One real vampire (a
  challenge early on), a couple of thralls, a handful of familiars. Light
  small arms, low stats, disorganised.
* **Den** (4 × 5): two vampires, a handful of thralls; more organised,
  better weapons. A front business with a basement.
* **Lair** (5 × 5): the elder, surrounded by very dangerous vampires.
  **Built by hand**, each with its own challenges (several ways in, and
  so on), not from the bank; to be designed when we get there.

The target block is pinned in the far half; the team lands away from it
with cover between.

### Horde

Waves of vampires come from the map edges; the team holds. Usually at
night.

* **Defending a monastery or church** (4 × 4, the commoner): a friendly
  house asks for help against an assault. Survive **3 waves on easy, 4 on
  medium, 5 on hard**. A team lost holding it still **gains support**
  (they gave their lives for it); a team that bails **loses support
  heavily**.
* **Attack on an OPV base** (5 × 5): our own installation under assault.
  **The battle for Padua** is the first: the fall of Act I
  ([story.md](story.md)), doomed. Agnes's forces are grossly overpowered,
  all elites, high level and heavily armed, to show the player what they
  are up against. The base is lost whatever happens. **The extraction
  zone is on the roof**: the team can bail on turn 1 and lose every
  scientist, project and bonus; each wave held gets more staff and
  research out. It strikes while the team is home (at least 3
  operators).

### Extraction

A long map (3 × 5): the start on one short edge, the goal on the other.
Enemies hold the ground between; **reinforcements come when we are
noticed**.

* **Evading capture**: one operative crosses hostile ground from one end
  to the other without being killed. This is the double agent's ambush.
* **Rescuing a hostage or VIP**: the team lands at one end, reaches the
  hostage at the other, and brings them back. The way back is through
  ground that is now awake: twice the danger.

### Theft

The same long map and the same trip there and back. Stealing the item
(records, samples: the recovery lead) can be quiet or loud; being caught
brings more reinforcements.

### Feeding

A feeding in a public place (4 × 4). The team starts **anywhere on the
map**, and must get civilians out while the vampires chase them. A quick
way to win or lose support in a region: it can happen even where support
is low, and happens more often as secrecy falls.

### Enemy entry points

Reinforcements and horde waves arrive at **entry points on the map's
edges**, as in Phoenix Point. The script names which edges (a horde's far
sides, an extraction's whole length); the generator puts entry points on
the walkable rim tiles of the blocks on those edges, roads first. No
block needs to author them.

## 3. The block bank

### The block

* **10 × 10 tiles** (15 m, X-COM's own size), or a multiple (10 × 20,
  20 × 20) for big buildings. Maps of 4 or 5 blocks a side come to 40 or
  50 tiles (the current maps are 34–50).
* **Roads**: where a road meets a corridor block's edge it is always
  pavement 1, road 8, pavement 1 (in each 10 tiles), so any two road ends
  line up. The road keeps its 8 tiles (parking, two lanes, parking); the
  pavement is narrower than today's 2, and a building's own block adds
  frontage (a front garden, a forecourt, a wider pavement) as it likes.
* **Every level, as meant, not every wall**: each tile's floor, and for a
  building its exterior and interior wall skins; what stands on it (a
  prop, stairs); multi-tile furniture, lamps, signs, canopies, vehicles
  and parking slots. **Walls follow from the floors**: a walled floor gets
  a wall on every edge where it meets a different floor, the exterior skin
  against open ground or nothing, the interior skin against another
  walled floor; like floors join with no wall. Edges record only the
  exceptions: a door, a window, glass, no wall (an opening), or a wall
  where none would be (between two rooms of one floor). Doors and windows
  take the skin of the wall they stand in. A block has as many storeys as
  it needs; the map takes the tallest.
* **Type**: a **corridor** (a road and its pavements: how the map is
  crossed), a **structure** (anything with a building on it), or **open**
  ground (fields, parks, car parks, plazas, the landing zone).
* **Sides**: for each side, which types may stand next to it, and whether
  it may be the **map's edge** (void). Unticked sides allow anything but
  the edge; ticks restrict. Two blocks are neighbours only if each allows
  the other's type on the sides that meet. That says everything a "front"
  did and more:
  * a shop's street side allows only corridor; a corner shop, two sides;
  * a road straight north–south allows corridor north and south only, so
    it never sits beside a road running the other way;
  * two businesses whose backs allow only structure stand back to back,
    and the yards they leave behind make an **alley**: close work for a
    shotgun, a bad place for a meeting;
  * a block that must be on the map's edge (a field at the outskirts)
    allows only void there.
* **Tags**: terrains it suits; the missions it can be a target for.
* **Nodes** (X-COM's route nodes): points with a role (vampire's rest,
  thrall post, patrol, civilian, prisoner, loot, extraction) and links
  between them for patrol routes. Spawns are drawn from nodes that suit
  the mission, so the elder ends up in the master bedroom because someone
  put it there.
* **Variants without new authoring**:
  * turning on the map (four ways; never mirrored, so signs read): its
    sides turn with it, and the generator only turns it where they fit,
    so a shop's door is always on the street;
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

* **Tools** (keys 1–6):
  * **Floor**: pick the floor, then walls round it (exterior and interior
    skins) or no walls (pavement, parking, a yard). Paint or shift-drag a
    rectangle: a building's walls appear as you paint.
  * **Doors & windows**: the exceptions on those walls (door, window,
    glass, no wall, wall); drag along a line; right-click restores what
    the floors give.
  * **Props**: one list for one-tile props (low or high cover) and
    furniture over several tiles (from its corner; T turns it); the
    room's walls stay. **Stairs**, **lamps** (ceiling, wall, street),
    **nodes** (spawn and event points by role).

  Right button erases; Alt-click picks up what's under the pointer.
* **Levels**: `[` and `]`, the header buttons, or the mouse wheel over the
  3D view (the skirmish camera: WASD pans, Q / E turn, the wheel steps a
  level); add a storey above or a basement below.
* **The block**: id (its file name), name, size (10 × 10 to 20 × 20),
  terrains, type, a grid of sides against types (and the map's edge), the
  missions it can be a target for, wall skins a map may swap in, notes.
  Each side of the grid view shows a strip in the colours of what may
  stand there.
* **Checks** as you work (click one to go to its level): tiles that can't
  be reached from the street, stairs with no floor above, broken or boxed-in
  furniture, props in doorways, nodes where nobody can stand, a side
  where nothing may stand, a corridor side whose road doesn't meet the
  edge the standard way, a side no block in the bank can fit yet (a dead
  end), a target block missing its vampire, elder, prisoner or thrall
  nodes.
* Undo and redo (Ctrl+Z, Ctrl+Shift+Z), Save (Ctrl+S) to
  `src/data/blocks/<id>.json`, Duplicate (a copy under a new id), Delete.
* **The file** (`tactical/blocks.ts`, format 2): each level is rows of
  characters (floors, things on them, and the exceptions on west and north
  edges), each character named in the block's legends ("wood/brick/plaster",
  "low:crate", "door"); furniture, lamps, nodes and the rest as lists.
  `compile()` turns a block into the map the rules and renderer see. It reads
  in a diff. `data/blockBank.ts` loads every file and checks it; a test
  fails if one is malformed or misnamed.
* **Extending it**: a new tool is one entry in `src/editor/tools.ts`. Its
  menus can come from the game's own lists, so a new skin, furniture kind,
  terrain, block type, mission or node role (in `tactical/map.ts` and
  `tactical/blocks.ts`) shows up in the editor without touching it.
  Signs, canopies, vehicles and patrol links are in the file format
  already; their tools are still to come.

### Map scripts: templates, fill, score

A map is made in three layers. The interest comes from the first two,
which are authored; only the filling is left to chance. (Chosen over
pure constraint solving, which gives more variety but plainer maps;
reversible.)

**1. A skeleton per gameplay.** Small authored templates that pin the
target, the landing zone and the exit, and leave the rest of the grid
empty. A few per gameplay; `═║` roads, `L` landing, `X` target, `E` exit,
`·` filler:

```
Deathmatch (den, 4×5)        Horde (monastery, 4×4)       Extraction / theft (3×5)
 ·  ·  ·  ·                   ·  ·  ·  ·                  L  ·  ·
═══════╦════                  ·  X  X  ·    X: church,    ══╦════
 ·  ·  ║  X  X                ·  X  X  ·    graveyard     ·  ║  ·     ← checkpoint
 ·  ·  ║  X  X  ← alley       ·  ·  ·  ·    waves from    ·  ║  ·
 L  ·  ║  ·  ·    behind      ring of open ground,        ════╩══
                              cover at the edges          ·  X  ·    X / E at far end
```

* **Deathmatch**: the target in the far half, the landing on the
  opposite edge with at least two blocks between, a road across the way
  (crossing it is a decision); a den's structure-to-structure side gives
  a back way in through the alley.
* **Horde**: the defended building in the middle, a ring of open ground
  round it, cover at the edges where the waves come in.
* **Extraction and theft**: a lane with a fast route (the road) and a
  quiet one (back gardens, alleys), a choke point half way, the same
  ground again on the way back.
* **Feeding**: a public block in the middle (a plaza, club, market),
  buildings round it; the team starts scattered at the edges and inside.

**2. Road rules per terrain**, not road pictures (as X-COM's map scripts
drew roads at random rows and columns): the principles stay, the exact
network changes every map. Roads decide which way fronts face and where
the long sightlines are.

| Terrain | Roads |
|---|---|
| Dense urban | 1–2 roads each way at inner rows and columns; one may end at a T; alleys between back-to-back buildings come from the sides (and every building with no other way in gets one) |
| Light urban | 1 main road across, or a **Z road**: in from one edge, a left turn, a right turn, and on to the far edge as an alley; 0–2 side roads off the main road, each to the edge or ending in a cul-de-sac |
| Rural | 0–1 lane, straight or with one bend; perhaps a farm track to the farmyard; the rest fields and woods |
| Industrial | a perimeter road along 1–2 edges (or round a corner), yards and works inside, at most one road through |

**Every way in reaches a road.** Each block marks its **entrance
sides** (a front door, a drive, a gate, a field gate), and the generator
requires:

* every entrance side faces a corridor (road, lane, alley, farm track),
  or an open block whose own entrance does (a shop onto its car park, a
  shed into its yard; yards may chain);
* a car park's drive and a yard's gate meet a road;
* a dead end leads somewhere: a cul-de-sac has houses facing it, a farm
  track ends in the farmyard;
* a building no entrance can reach is not placed (its slot takes open
  ground).

The mission skeleton adds its own conditions ("a road crosses between
landing and target"; "a road runs the length"); a road network that
breaks them is rolled again before filling.

Each template names the terrain pool and limits, e.g.:

```
den / industrial:  size 4×5, skeleton "den-far", roads by the industrial rule
  target  a "den" structure, 20×20, in the far half
  landing an open block on the edge, ≥ 2 blocks from the target
  fill    industrial pool, each block at most twice
  nodes   vampires: the target's vampire nodes; thralls: thrall nodes
          anywhere, a third outside the target
```

**3. Fill, then generate several and keep the best.** The generator pins
the skeleton's and roads' blocks (turned so their sides fit), then fills
the rest by matching sides: each empty slot keeps the blocks (and turns)
that could still go there, the most constrained slot is filled first
(weighted by the pool, within repeat limits), and its neighbours' choices
narrow. If a slot runs out of choices it backs up and tries another.
Sides on the map's rim must allow void. It stamps the blocks, drops the kerb where a drive meets a road (the
road block's pavement tiles in front of a block's tarmac on an entrance
side become tarmac too), draws kerbs from the skins as now, and takes spawns from the nodes.

Filling takes milliseconds, so it makes about 20 candidates and scores
each with pathfinding and line of sight. A hard rule failed throws a
candidate out; the rest are ranked:

* **Routes**: at least two separate ways from landing to target (three
  on 5 × 5).
* **Sightlines**: no straight open run longer than about 15 tiles
  without cover, except along roads.
* **Cover rhythm**: cover every few tiles along each route.
* **Height**: at least one high point (roof, upper floor) overlooking
  the objective.
* **Approach**: two or three turns of movement from landing to first
  contact.
* **Variety**: no block more than twice; one landmark per map, so the
  player knows where they are.

The same scores, run over the bank, show which blocks need fixing.

Open: whether the player picks between two or three **insertion points**
(front or back, roof or street) in deathmatch, theft and extraction.
### What goes

`floorPlan` (random room splits), `thinStorey`, `furnish` and `fit`, the
lot logic in `urban()`, `rural()` and most of `sites.ts` become blocks and
scripts. The planned sites (apartment tower, warehouse, hospital,
supermarket, petrol station, corner shop) are the first blocks, converted
from their code.

### Stairs and height

Nobody stands at mid height. A staircase is a **piece** (like furniture:
a footprint, a facing, a kind), and its tiles can't be stood on:
movement takes a flight as **one step** from the tile at its foot to the
tile at its head, at one TU cost. Without the TU, the path stops at the
foot. Reaction fire catches a climber only at either end; sight and
grenades pass over a flight.

| Kind | Footprint | Use | Tier |
|---|---|---|---|
| Outdoor flight | 2 × 2 (2 wide, 2 long) | city steps, a loading dock | 1 |
| Indoor flight | 1 × 2 | inside buildings | 1 |
| Switchback | 2 × 2 | in on one side, a landing half way, out on the other side a level up | 3 |

No ramps or slopes. Height comes from levels: **raised** ground is open
floor with no walls on an upper level (a deck, a dock, a terrace) behind
a **railing** (a new edge: half cover, see-through); **sunk** ground is a
cutting a level down (a canal, a railway, a ravine) crossed at ground
level, a road rule of its own (tier 3).

### The bank

About **10 blocks per terrain and 10 shared**, roughly X-COM's 15–20 per
terrain over half its terrains. **Roads, fields and woods are generated**
from the rules, not drawn; a few special road blocks may be drawn later
(bus stop, zebra crossing, roadworks, a footbridge). Rotation and skin
swaps multiply what is drawn. Lairs and OPV bases are built by hand.

| Set | Blocks | Tier |
|---|---|---|
| **Shared** (10) | car park ×2; petrol station with a convenience store ×2 (10 × 20); coffee shop; fast food; park ×2; corner store (a flat above); church and graveyard (20 × 20) | 1 (church 3) |
| **Light urban** (10) | colonial home ×4 (one with a basement); backyard ×4; garage and workshop with a basement (a den); small clinic | 1 |
| **Rural** (10) | ranch home ×3 (one with a cellar); yard, unfenced ×3; barn ×2 (one with a cellar); machine shed; silo yard | 1 |
| **Dense urban** (10) | two-storey businesses with alleys ×3 (one with a basement); apartment block ×3; large apartments (20 × 10, 3–4 storeys) ×2; hospital (20 × 20); bar or club with a basement | 2 |
| **Industrial** (10) | warehouse ×3 (one with the blood bank below); container yard ×3; workshop; gatehouse and fence; loading docks; office and lab | 2 |

### Build order

Blocks replace the procedural maps **one terrain at a time**; the old
generator keeps the rest working. Each tier leaves a finished game, and
the next is built only if the last plays well.

1. **Tier 1, the block system ships.** Deathmatch (as now) on light
   urban and rural; the shared set but the church; the generator
   (skeletons, road rules, generated fields and woods, fill by sides,
   access, scoring); the outdoor and indoor flights.
2. **Tier 2, more ground, cheap gameplays.** Dense urban and industrial
   (dens with basements); feeding (deathmatch plus civilians); rescues
   moved onto blocks.
3. **Tier 3, the expensive systems.** Horde (waves, the battle for Padua,
   the church and monastery; Padua's roof escape stands in until then),
   theft and evading capture, the switchback, the footbridge, cuttings
   and bridges.

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

Tier 1 (see Build order):

1. Stair pieces (outdoor and indoor flights) and the railing edge, in the
   map, movement, the battle view and the editor.
2. The entrance sides in the editor, for the access rule.
3. The bank: the tier 1 blocks, drawn in the editor.
4. The generator for light urban and rural.

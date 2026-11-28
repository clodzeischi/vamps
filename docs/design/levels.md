# Levels: terrains, missions, the block generator

Every battle map but the lairs and Montségur (built whole, `lair.ts`) is
assembled from **blocks** by `tactical/map/blockgen.ts`. The bank is drawn
in code (`tactical/map/blockbank.ts`), to be joined, then replaced, by
blocks drawn in the block editor. Rules, renderer and props:
[tactical.md](tactical.md). `gallery.html` shows the maps (`?long` the long
ones); `scene.html` shows blocks in 3D.

## The idea

Authored blocks, arranged, as in X-COM. A player notices a shop with
shelves at odd angles; they don't mind the same petrol station on four
maps, and they learn it: the second time, they know where the back door
is.

* **Generic world**: every block passes for Sydney, Toronto, Hong Kong or
  Nairobi. Variety from weather, time of day, materials and arrangement.
* **Recognisable at a glance**: each block has a few **tells** that name
  it ("a convenience store by a petrol station").
* **The generator only arranges**: plans, furniture, lamps and spawn
  points come with the block.
* **Cover, concealment and avenues of approach**, with roads as the main
  dividers.

## Terrains

| Terrain | Setting | Blocks |
|---|---|---|
| Light urban | `urban` | houses on deep lots, bungalow, corner shop, petrol station, the workshop den, car park, park, allotments |
| Rural | `rural` | farmhouse, barn over a cellar, cottage, crop fields, woods, paddock, machine shed, chapel and graveyard |
| Dense urban | `apartments` | towers of 5–6 storeys (one a hotel), walk-up tenements over shops with back courts, a bar, lock-up storage, the corner shop. Tall, after X-COM 2's city maps: rooftops at different heights reward position and recon |
| Industrial | `industrial` | warehouse, container yard, tank farm, factory, scrapyard, timber yard, cold store over the blood bank, workshop units, lock-ups; each works fenced from the next |

**Landmarks** (hospital, supermarket) are used only as a chosen hideout.
Open industrial yards are wanted: getting a team across open ground fast is
a mechanic of its own.

## Gameplays

Killing everyone wins only a deathmatch; the others give a quiet,
high-Tradecraft operative missions where they're the right pick.

| Gameplay | Win | Missions | Built |
|---|---|---|---|
| Deathmatch | kill or take every enemy | nest, den, haven | yes |
| Extraction | across the map, or there and back | rescuing a hostage (built, on the long map); evading capture (the double agent's ambush) | rescue only |
| Theft | take the item and get out | a recovery lead | no |
| Horde | survive the waves | defending a church or monastery (3/4/5 waves by difficulty); the battle for Padua (Act I: doomed, the roof is the way out, each wave held gets more staff out) | no |
| Feeding | save the civilians | stopping a feeding: the team starts anywhere | no |

Reinforcements and waves come from **entry points on the map's edges**
(Phoenix Point), placed by the generator on the rim, roads first; blocks
don't author them. A lesser house's assault on a base, once its lair is
found, is a defence that can be won, not a horde.

## The generator

* **A unit of 8 tiles.** Blocks are 8 × 8 to 16 × 16; maps 5 units a side
  (nest), 6 (den, haven), or 4 × 7 long (extraction).
* **Roads first, as the dividers**: one unit wide, all road (parking, two
  lanes, parking; a country lane is dirt between verges), by rule: one
  across, two parallel, a T, a Z, an L, a cross; a long map one the length
  (straight or a dog-leg), often with a cross street as the choke point.
  Kept only if every unit is within two of a road in a straight line.
* **Every lot fronts a road**: the ground along each road is cut into lots
  1–2 units wide and deep, each taking a block turned to face it; a shallow
  lot that would strand the unit behind it isn't placed. Blocks bring their
  own frontage (pavement, forecourt, hedge and gate).
* **The landing** is an open lot on the edge (a long map's near end); the
  **target** a structure tagged for the mission, at least half the map away
  (or the named landmark). Two ways in: by road (where a road leaves the
  map, farthest from the target) and by helicopter (the landing lot).
* **Best of 20**: candidates with ground cut off from the landing are
  thrown out; the rest are scored on **approach by exposure** (a quiet
  route crossing the street once against a fast one along it), cover along
  the route, open runs, high ground near the target, the walk (2–3.5
  turns, 4–6 long), road share and variety. Measured: roads 28–40% of the
  ground, the target across a road from the landing in 61 maps of 64.
* Each block is checked on its own: every floor reachable from its front,
  every flight with ground at both ends. A stairwell is 3 wide (two
  flights and the landing that joins each floor).

## Blocks

* **Floors make the walls**: each tile's floor (and, for a building, its
  exterior and interior wall skins); a wall wherever a walled floor meets
  a different floor. Edges record only the exceptions: door, roller door
  (`garage`), sliding door (`slide`), window, glass, railing, no wall, an
  extra wall. Doors and windows take the skin of the wall they're in.
* Props, multi-tile furniture (`tactical/map/pieces.ts`), flights, lamps,
  signs, canopies, vehicles, parking bays and **nodes** (spawn and route
  points by role).
* **Type** (corridor, structure, open), **terrains**, **targets** (the
  missions it can be the hideout for).
* **Variants for free**: turning (never mirrored, so signs read), wall
  skins from the block's set, car paint per map, door states.

**The block editor** (`npm run blocks`, `src/editor/`) draws blocks level
by level with the battle view's 3D preview, checks them as you work
(reachability, stairs, props in doorways, nodes, entrances) and saves
JSON to `src/data/blocks/` (format: `tactical/map/blocks.ts`). Its menus
come from the game's own lists, so new skins, pieces and roles appear
without touching it.

## Height

No ramps. A **flight** is a piece whose tiles nobody stands on: one step
from foot to head (outdoor 2 × 2, indoor 1 × 2). Raised ground is an upper
level behind a **railing** (half cover, seen over). Still to come: the
switchback flight, and sunk ground (a canal, a railway cutting) as a road
rule.

## What blocks still need to read

The prop kit covers every terrain and the lairs. Missing:

* **Engine**: decals (graffiti, stains, road paint, blood), pitched roofs
  (the look; flat roofs stay walkable), interior skins (wallpaper, tile,
  carpet, lino), lit fronts at night, balcony railings.
* **Props**: office (cubicles, reception, copier, water cooler), bar (back
  shelf, stools, booths, pool table, neon), hospital (curtain rails,
  vending machine, signs), church (stained glass, lychgate), street (bus
  shelter, traffic lights, road signs, phone box).

## Next

1. The bank: editor-drawn blocks beside, then instead of, the code-drawn
   ones; about ten per terrain.
2. Gameplays on the long map (extraction, theft, evading capture), entry
   points for reinforcements, then horde.
3. Open: a choice of insertion points (front or back, roof or street).

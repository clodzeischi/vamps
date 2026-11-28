# Block design: how blocks are made

How to draw a map block that reads at a glance, passes a common-sense look
and plays like X-COM. What blocks are and how maps use them:
[levels.md](levels.md). The rural bank (`src/data/blocks/`, drafts in
`scripts/blocks/rural.ts`) was made this way; use it as the worked example.

## The workflow

1. **List the families** for the terrain: about ten, each a thing a player
   names at a glance (a farmhouse, a chapel, a grain yard). Mix sizes: most
   16 × 16, a few 8 × 16 or 16 × 8, at least one 8 × 8 so every lot can be
   filled. Several families are mission targets; at least one has a basement
   (den and haven targets).
2. **Brief each one in a line**: what it is, its tells, who would be there,
   how it plays (ways in, cover, high ground). The brief goes in the block's
   notes.
3. **Plan buildings room by room in tiles** (a tile is 1.5 m, a storey 2.5 m):
   which rooms, their sizes (table below), what opens off what, where the
   stairs go, the doors, then the windows, then the furniture.
4. **Draft**: in code with the kit (`scripts/blocks/kit.ts`; a terrain's
   drafts in `scripts/blocks/<terrain>.ts`), or paint it in the editor
   (`npm run blocks`). Code is quicker for first drafts and for variants
   (options, `mirror()`); the editor for touching up.
5. **Check**: `npm run draft -- <terrain> [ids]` writes each draft and prints
   the editor's checks (the editor shows the same as you paint). Fix until it
   says no problems; `npm test` also runs them on every block.
6. **Look at it in 3D**, every level, as a player would
   (`npm run shot -- <dir> "name|blocks=<id>&level=0&dist=24&at=8,8"`;
   `level=-1` a basement, `level=1` upstairs, `turn=180` to see what the
   near wall hides). Go through the common-sense list below, room by room.
7. **Look at it in maps**: `scene.html?map=<setting>&size=den&seed=3` (and a
   few seeds), and `BLOCKGEN_REPORT=6 npx vitest run src/tactical/map/blockgen.test.ts -t report`.
8. From then on the JSON is the block. Edit it in the editor; the drafting
   runner won't overwrite a block changed since it wrote it
   (`scripts/blocks/written.json`) unless that block is named with `--force`.

## Buildings

### Rooms by use, sized by use

| Room | Tiles | Opens off |
|---|---|---|
| Kitchen | 4 × 4 to 5 × 5 | hall, front or back door, dining room |
| Living room | 4 × 4 to 5 × 5 | hall, kitchen (open plan is fine) |
| Dining room | 3 × 4 to 4 × 4 | hall, kitchen |
| Hall, landing | 2 wide where the stairs are | front door, every room on its floor |
| Bedroom | 3 × 3 to 4 × 5 | hall, landing, living room in a cottage |
| Bathroom | 2 × 2 to 3 × 3, never bigger than a bedroom | hall, landing, back lobby |
| WC | 1 × 2 to 2 × 2 | hall |
| Utility, boot room, back porch | 1 × 3 to 3 × 3 | kitchen, hall; the back or side door |
| Pantry, box room, store | 1 × 3 to 2 × 3 | kitchen or dining room; landing or bedroom |
| Office | 2 × 3 to 4 × 3 | hall, living room |
| Garage | 4 × 6 for a car, 4 × 8 with a bench | utility or hall (a door through), roller door out |
| Barn, shed | big; bays of 2 for vehicles | roller doors, a door for people |

* **Never**: a bathroom or WC opening off the kitchen or the living room
  (a back lobby is fine); a bathroom bigger than the bedroom or the garage;
  a bedroom you reach through another bedroom (a box room is fine).
* **Upstairs** holds the bedrooms and the bathroom where there is an
  upstairs. The stairs rise from a hall or a stair hall, never from a room's
  only way through.
* **Stairs**: an indoor flight is 1 × 2. Its foot (the tile before it) and
  head (the tile past it, a level up) need floor, and the head must lead
  somewhere: nothing standing on the tile next to it. Upstairs the flight's
  tiles are open (the stairwell); draw the landing's floor over them.
* **Rooms of the same floor** need a wall between them: in the editor paint
  a wall exception; in the kit, each `room()` is walled from the next.

### Ways in and through

* At least two ways into every building: a front door and a back or side
  door, a roller door and a door. One way in only where it's the point
  (a crypt).
* A garage joins the house by a door (into the utility or the hall); a barn
  can drive through.
* Doors on a room's edge with a clear tile either side; never onto a
  flight's tile; never into furniture.

### Windows

* In the run of a wall: never on an edge at a corner of the building, never
  where an inside wall meets the outside one (half of it behind the wall's
  end). A room two tiles wide can't have one; leave a WC without.
* One or two to a room on each outside wall; the sink under the kitchen's.
* Ground-floor windows let both sides shoot; upstairs and loft windows are
  the high ground over the approaches.

### Furniture

* Its back to a wall, its front onto floor someone can stand on (the
  editor's check). Turn it to face into the room.
* **Kitchen**: units in a run along one wall, the sink under the window,
  the fridge at the end of the run; a corner stays empty or holds a piece
  whose front is free (a fridge facing a sink is wrong). A table in the
  middle (`low:table`: a table and chairs on boards or tiles, a desk on
  concrete).
* **Living room**: the sofa facing the TV with a tile between; chairs and a
  bookcase against the walls.
* **Bedrooms**: the bed's head to a wall, nothing at its foot; the wardrobe
  facing open floor, not the bed. A double (`bed`, 2 × 2) for the main
  bedroom, singles (`bed_single`) for a child's or a spare room.
* **Bathroom**: toilet, bath and basin each facing a free tile.
* Nothing that boxes a tile in (the editor flags tiles that can't be
  reached) and nothing in a doorway.
* Pieces "on a wall" need one: a dumped mattress stands against a wall, not
  in a clearing.

### Vehicles and height

* In a garage, shed or lean-to: nosed toward the way out (the side that's
  open, or the roller door), the floor between clear, and three clear tiles
  of drive outside. On a drive: nosed in or out, never across the gate.
* **Nothing taller than a storey under a floor or a roof**: a tractor, a
  silo, a grain bin stand outdoors (a tractor's cab comes up through a loft).

### Materials and levels

* Floors as floor/exterior/interior skins; a family's versions may change
  the exterior (stone, brick, plaster, metal), not the plan's sense.
* A cellar under a building, reached by a hatch or stair from a back room
  (a tack room, a vestry); it's where they sleep: coffins, a blood fridge,
  candles.
* Flat roofs with no stair up are out of reach by design.

## Outside

* **Frontage**: a hedge, fence or wall along the lane with gaps for gates:
  a path to the front door, a 2-wide gap for a drive. Two gaps give a choice
  of way in.
* **Hedges are high cover, fences low**; a gate is a gap (a gate piece is a
  fence); leave a broken rail somewhere on a long fence.
* **Everything walkable is reached from the front row** (each of its tiles
  is on the road): close the corners where a hedge meets a fence or a
  building, and don't let a vehicle or a stack cut a strip off.
* **Fields**: crops are seen through and give no cover, so lines of low
  cover with gaps (square bales) and a little high cover (round bales, trees
  in the hedgerows) make them playable. A track across or through.
* **Woods**: trees scattered by a hash, never in lines, no two trunks
  touching, undergrowth between; a clearing as the tell.
* **Yards**: tanks, drums and pallets along the edges and in short lines;
  no bare run longer than about five tiles on a way in.

## Playing well

* Every building is a small fight: two or three ways in, windows to shoot
  through, half cover inside (pews, stall rails, bales, tables), and a
  heart (the cellar, the upstairs) reached through the building.
* High ground over the approaches: a loft or upper windows looking down on
  the yard and the lane.
* Nodes where people would be: vampires where they sleep, thralls at the
  doors and in the yard, the prisoner in a small closed room (a pantry, an
  office), patrols outside along a route. (The generator doesn't read nodes
  yet; draw them anyway: the editor checks targets have them.)

## Variety: families and versions

* Each family has its base block and two or three **versions**
  (`variantOf`: the base's id; the editor's Duplicate sets it). A map counts
  a family as one block (picked as often, at most twice) and uses another
  version the second time.
* A version keeps the family's tells and changes the rest: mirrored (never
  a block with signs), another material, another plan, other dressing
  (a garage instead of the drive, a picket fence instead of the hedge, a
  lean-to, the tractor outside instead of the wagon inside).
* Don't make two families the same building in other clothes.

## Looking at a block: what tripped us up

* One-tile boxes (`high:hay`, `low:planks`) draw as plain boxes: use the
  pieces' models (round bales, woodpiles).
* The near wall hides the front row of rooms: shoot it again with
  `turn=180` before deciding something's missing.
* Ceiling lights show as white bars when the level above is hidden; normal.
* Door colours and some facade dressing (downpipes, air-conditioning units)
  come from the renderer, not the block.

## The checks

The editor (and `npm test`, on every block) flags:
* a tile that can't be reached from the front (roofs excepted);
* a hole at street level (no ground; the floor tool's right-click erases it);
* stairs with nowhere to step on or off;
* a piece whose front is blocked, or that's broken by something on its tiles;
* a prop or a lamp in a doorway;
* a window at a corner or where an inside wall meets it;
* anything between a roller door and what drives out of it, or on the
  drive outside it;
* a node on a tile nobody can stand on; targets without their nodes;
* no front entrance; an entrance side nobody can walk out of;
* a variant of a block that isn't in the bank.

# Tactical: the battlescape

XCOM-style, **turn-based**, on a grid with several whole levels (no
half-levels or slopes). Crude procedural maps; units are boxes with smaller
boxes for weapons. Mouse controls follow Wasteland 3; the HUD follows
Paradise Cracked.

Code: `src/tactical/` (plain TS, own seeded RNG, tests), drawn by
`render/BattleView.ts` with a React HUD. Exact numbers live in
`tactical/rules.ts` (weapons, cover) and `tactical/battle.ts` (units, TU).

## Rules

* **Time units.** Agents get 40 + Combat/2 a turn (52–68 for a recruit);
  thralls 50, vampires 72, the eldest 80. Walking 4 TU a tile (a stair tile 8, a flight of
  stairs 16 in one step, a climb 12). Snap shot 35% of the unit's TU, aimed shot 60%, blow
  or throw 35%; small actions a fixed few. The player moves all units, then
  every enemy moves.
* **Reaction fire** is automatic: when the player ends the turn, every agent
  with a gun, rounds in it and the TU for a snap shot holds them, and snaps
  at enemies moving in sight (a cone half again as wide, no crits) as often
  as the TU last.
  There is no overwatch or hunker action.
* **Sneak** (toggle, free): steps cost 1.5×; while the team is concealed, an
  enemy must come twice as close to spot the agent. For stacking on a door
  before a breach by day, while the vampires keep indoors.
* **Movement** is any-angle (Theta*, `tactical/path.ts`), costed by distance
  walked. No unit walks through another, friend or foe. An agent who sees
  an enemy the team hadn't seen stops on that tile and keeps the TU for
  the rest of the way.
* **Reach** (melee, finishing a body, freeing a prisoner, a trauma kit) is
  one step: the next tile on the level, with no wall, window or prop
  between, and no reaching round a corner.
* **Shooting is ballistic** (`tactical/ballistics.ts`); there is no hit
  chance. A weapon has a **base accuracy**: the cone's σ in degrees for an
  average shooter's snap shot (M110 0.7°, rifle 1.1°, suppressed rifle 1.3°, pump
  shotgun 1.6°, semi-auto shotgun 1.7°, M249 1.9°, M240B 2.1°, pistol
  2.2°, suppressed pistol 2.5°, SMG 2.6°). The shooter's skill
  (0.7 × Combat + 0.3 × Insight, 0–100; an agent's Combat is read from its
  aim, 50 + Combat/2; enemies have only aim) scales it from ×1.4 (none) to
  ×0.6 (a master). Aimed ×0.55, burst ×1.3 a round, reaction fire ×1.5, a
  shot from concealment ×0.85.
  * Each round leaves the muzzle (shoulder height of the standing figure:
    a shooter rises over low cover to fire, from the lean tile if leaning)
    in a random direction in the cone (a normal spread) and flies until it
    meets something: a wall, a closed door, the wall under a sill or over a
    window or doorway, a prop (low props to their height; a car only to its
    body, its windows are glass), a tall prop, a floor or ceiling, solid
    earth, or a **figure, friend or foe** (an upright cylinder, 0.3 m round,
    as tall as drawn: crouched beside low cover two thirds of that; bodies
    lying down aren't hit). Glass and whole windows it passes break.
  * A shot at a unit aims at the middle of what shows of it over the cover
    facing the shooter (its chest in the open).
  * The **shotgun** fires 8 pellets sharing the damage, each scattered a
    further 5° about the shot's own error: close work, and two enemies
    close together can both be hit.
  * Damage: a unit hit takes the weapon's damage (a shotgun: its share per
    pellet), a crit ×1.5 (rolled once per unit hit: the weapon's crit,
    + (Insight − 30)/5 for agents, +40 if it was flanked from where the shot
    came; none on reaction fire), less armour. Melee isn't ballistic: a
    blow lands on the attacker's aim (5–95).
  * **Rockets** (the rocket launcher, 1 a load): the rocket flies like a
    round and goes off where it stops (on whoever it struck; a rocket that
    leaves the map is gone). Everyone within 2 tiles the blast reaches (on
    its level, not through walls) takes 30–50 in full at the centre, ×0.65
    a tile out, ×0.35 at the edge; no crit; the shooter's own side too.
    The ground it reached burns for a turn and the glass round it breaks;
    it's heard like gunfire.
  * **Force fire** (hold Ctrl, click a spot): a shot at a tile, not a
    unit: chest height over it, or at whoever stands there. It needn't be
    seen; range 16 tiles. For glass, the doorway behind an enemy, a corner.
  * The player sees no number: hovering an enemy draws the shot's **CEP**
    round the aim (half the rounds land inside; a faint ring twice as wide
    holds nearly all), and its card gives the CEP in metres for each fire
    mode. A shot with ours or a bystander near the line of fire (within
    about a tile of it) says so in its tooltip and the force-fire hint.
  * The AI weighs shots by a rough trigonometric estimate (the share of a
    normal spread over the target's exposed width and height at that
    distance, ignoring what's in the way); it's never shown.
  Enemies holding TU at the end of their turn react the same way agents do.
* **Walls sit on the edges between tiles**: wall (blocks, full cover),
  window (sight through, half cover), doorway, closed door, glass. Props
  fill tiles.
* **Doors** (`E.SHUT`): a closed door blocks sight both ways and is full
  cover. Opening it costs 4 TU (`TU_COST.door`): either walk through (the
  path counts the 4 TU; the walker stops at the door, opens it, goes on;
  no diagonal past a closed door), or **Open the door** from a tile beside
  it: either side of the doorway, or posted up against the wall on the
  next tile along it, on either side. Both sides open doors (enemies by
  walking through). Once open it stays open; no one shuts it. Exterior
  doors start closed 90% of the time, doors inside shops, the hospital and
  the works (tile or concrete floors) 90%, doors inside homes and flats
  60%. Doorways side by side (a double door) share one state. Lairs have
  open doorways only.
* **Glass** (`E.GLASS`): floor-to-ceiling panes: seen and shot through, no
  cover, not walked through. Any shot through a pane (hit or miss) and any
  fire against it shatters it; the frame is then open (walkable).
  **Windows break the same way** (`E.SILL` after): the glass goes, the
  sill stays, and for the rules nothing else changes (half cover, seen
  and climbed through). On
  shopfronts (the supermarket all along, corner shops 85%, the petrol
  kiosk's front 90%), and on half of apartment blocks (luxury ones) the top
  two floors are 70% glass all round, for building-to-building shots.
* **Leaning** (`rules.ts` leans, sightPoint): a unit behind full cover (a
  wall, tree, truck) at the cover's end leans out one step to the side to
  look, shoot or throw round it: the side tile must be open to step to and
  not have the same full cover. Only round cover lying between unit and
  target; if both sides see the target, the side nearer it. Range counts
  from the tile stood on; the shot (odds, the target's cover, flanking)
  from the lean tile. Leaning works for both sides and for sight, reaction
  fire and the AI. Blows don't lean. Units are drawn sliding out and back.
* **HP**: an agent's HP is their Vitality (30–50 for a recruit). Thralls
  24–30, vampires 48, the eldest 120 (armour 6), helicopter 84. Tactical
  armour 6. Crits ×1.5; every hit does at least 1.
* **Bleeding out**: an agent at 0 HP bleeds for 3 turns (unless crit or
  overkilled by 18+); an adjacent agent can stabilize. Downed agents
  survive a win; left behind after a loss or withdrawal, they are lost.
* **Win** when every enemy is dead (a body in torpor doesn't count); lose
  when every agent is down; withdraw when every survivor evacuates from the
  landing zone.
* Pods wake when a member sees an agent, is shot at, or hears gunfire
  within 12 tiles. Unaware enemies patrol; once they've heard the team, they
  hunt from turn 4.

**Stats on the map**: Combat = aim, TU, melee; Vitality = HP; Faith =
resisting domination; Tradecraft = concealment; Insight = crits and
spotting.

## Vampires

* **Torpor**: bullets and claws drop a vampire into torpor for 2 turns at
  night, 3 by day; it rises with 40% health. An adjacent agent **finishes**
  it with the haemolytic agent (quiet, keeps concealment), or **takes it
  alive** for containment. Fire or the sun destroys a body in torpor.
* **Fire**: an incendiary covers 3×3 up to 10 tiles away for 2 turns;
  double damage to vampires, ignoring armour. Enemies keep out of it.
* **The sun**: by day vampires don't go outdoors; one caught outside burns.
  Below ground is always night.
* **Night**: humans see 9 tiles (16 to anything lit or burning); vampires
  see 20. Maps get lamps.
* **Climbing**: up a wall face to a parapet or in at an upper window.
* **Domination**: once a battle, will (55) + d40 vs Faith + d40; the agent
  loses their next turn. The eldest tries every turn it can't claw.

| Line | Trait (`tactical/traits.ts`) |
|---|---|
| Ashgrove | +2 thralls |
| Huaca | rises a turn sooner |
| Carcassonne | will +15 |
| Sahel | thralls +12 HP |
| Jade | unseen beyond 5 tiles until they strike |
| Nullarbor | go out by day; half the sun's damage |

## Concealment

Plainclothes arriving by jet or hired flight start concealed; a helicopter
or tactical kit gives the team away. While concealed, an enemy spots an
agent only within 8 − Tradecraft/10 tiles (2–6; halved, at least 1, while
sneaking). Shots from concealment have a cone ×0.85. Shooting, throwing or being
spotted ends it, except a suppressed shot that drops its target.

## Maps

**Scale**: the 3D view works in metres. A tile is 1.5 × 1.5 m; a level is
2.5 m floor to floor (2.4 m to the ceiling, a 0.1 m slab). Agents stand
1.78 m, vampires 1.89 m; doorways are 2 m tall, window sills 0.9 m, half
cover about 1 m. Rules count in tiles, except shots: they fly in metres
through the same walls, sills, props and figures that are drawn, so those
sizes live with the rules (`tactical/geometry.ts`, re-exported by
`render/scale.ts` with the look-only sizes).

**Look**: blocks are plain coloured surfaces, merged so a floor, a wall
run or a fence of one material is one box with no seams between tiles.
**Materials are procedural shaders, not textures** (`render/shaders/`, see
its README; preview with `npm run materials`). Every map skin has one, as a
floor, a wall or a prop (`surfaceFor` in `shaders/materials.ts`): asphalt
with cracks and worn markings (traffic keeps right), grass, dirt, pavement,
flagstones, crypt floor, floorboards, roofing felt, brick, plaster, ashlar,
rock, carved stone, wood of several kinds, leaves, bark, hay, car paint and
glass, street metal. Units wear model materials (canvas for agents, velvet
for vampires, wool for others; gun metal for weapons), which ride on the
moving object. Textures are kept for what must be drawn (faces, signs,
insignia). **Lamp light is baked** when the
map loads (`render/lightVolume.ts`): a light volume (4 cells a tile, 10 a
level) with each lamp's light traced through walls, window and door
openings, floors, stairwells and props, so lamps cast shadows; every
surface and unit reads it in the shader. Street lamps light at night;
braziers and ceiling fittings (shops, offices, corridors) always; fire
adds its light when it starts. The moon casts
real-time shadows. Units don't block lamp light.

**To be replaced** by maps assembled from authored blocks
([levels.md](levels.md), design). What follows is the current, procedural
generator.

Seeded from the mission id (`tactical/mapgen.ts`). Every walkable tile must
be reachable from the landing zone; pockets are repaired or a doorway is
knocked through.

* **Urban** (38 / 44 / 50 tiles for nest / den / haven): two roads 8
  tiles wide (12 m: a parking lane, two traffic lanes, a parking lane),
  crossing, or a time in three a T; a pavement 2 tiles wide round every
  block; lots inside (BSP buildings with shared stairwells, walkable roofs,
  basements; car parks; parks; the landing plaza), big lots split by an
  alley. Blocks are found before anything is parked.
* **Town layout** (simple, logical, not realistic):
  * *Houses* stand up against the street side of their lot (a corner lot:
    both streets), or set back two tiles behind a front garden, sometimes
    hedged along the pavement. The first door faces the street. Every door
    gets a paved walk to the pavement (straight out, or the shortest way
    over the grass). The yard behind gets a few trees (never side by side,
    never against the house) and the bins by the back door.
  * *Car parks* are at road height, with kerbs round them like the road. A
    driveway three tiles wide crosses the pavement (a dropped kerb) and
    carries straight on as the aisle. Bays are three wide, nose-in on each
    side, with painted dividers (`map.bayLines`). Nothing is parked in the
    road in front of the driveway. A lot with no street side that can take
    a driveway becomes a park.
  * *Parks*: a two-tile footpath from the street through to the far side
    (a cross on a big park), benches beside it, and trees scattered at
    random but spaced. A hedge runs along the street, open where the path
    comes out.
  * *The plaza*: one ring of trees a tile in from its edge, a tree on each
    corner of the ring and the rest evenly spaced (gaps near 4, never under
    3, each side its own mirror); none within rotor reach of the landing
    zone. Benches midway between trees on every side or on none. The
    street along the plaza gets no street trees (its ring lines it).
  * *Street furniture* is regular. Street lamps stand on the kerb line
    every 8 tiles, staggered from one side of the road to the other. A lamp
    steps one tile aside off a driveway, and none goes on a rounded corner.
    Some sides of a street are tree-lined: a tree halfway between each pair
    of lamps, except in front of a door, a walk or a driveway, and along
    the plaza. A bin
    sometimes stands by a lamp post. Outside doors often get their own
    lamp: a bracket lamp on the wall over the doorway (`Light.wall`), its
    light falling on the tile outside.
* **Vehicles** (`map.vehicles`, the look; their tiles carry the rules): two
  tiles across; a car 3 long and an SUV 4 (half cover), a truck 6 (full
  cover). Parked in the parking lanes facing their side's traffic, never
  within 3 tiles of a junction, now and then one stopped in a traffic
  lane; nose-in rows in car parks; one by the farmhouse.
* **Props** (the look only, `render/props.ts`; the kit in
  [tooling.md](tooling.md), "Props"): low-poly models on one palette
  material, drawn over what the rules see. Windows get a frame (casement in
  brick, plaster, stone; aluminium in metal, clinic and industrial), and
  two in five with a room behind them get blinds. Doorways get a frame and
  two leaves (steel in metal, clinic and industrial), shut or swung into the
  room. Outside walls in brick, plaster or stone get a plinth, band courses,
  a cornice, corner pieces, quoins on brick corners, a downpipe on a corner
  in three and an air-conditioner on a plain wall in a dozen. Crates,
  bins (a dumpster), park benches (not pews) and tables (desk, computer and
  office chair on tile or concrete; a table and two chairs elsewhere) are
  models in place of their boxes; other props are still boxes. A table or
  desk faces open floor with its back to a wall where it has one, and its
  chairs go only on sides someone can reach (both on the open side when
  the back is to a wall; none when hemmed in). Street lamps
  reach a metre over the road (the baked light moves with the head); a
  wall lamp is a lantern. Town roads get manholes and kerbside drains. None
  in lairs or at Montségur. Until the kit loads, all of it is boxes.
* **Kerbs** (the look only, `render/kerbs.ts`): town roads and car parks
  sit 15 cm below the pavement with granite kerbstones; a block's corners on a junction are
  rounded (radius 3 tiles), the corner tile drawn as road (units on it
  stand on the road). Grass or cobbles in the lot's corner round the same
  centre (radius 1 tile), so the pavement keeps its width round the bend;
  a building's corner, or one where the kerb runs straight (the map's
  edge, the closed side of a T), stays square. Nothing is placed on those
  3 × 3 corner tiles. Markings for wide roads: edge lines 3 m in (the
  parking lanes outside), a zebra two tiles deep before each junction, the
  stop line before it.
* **Furniture** (`map.furniture`, flats only for now): pieces over
  several tiles, LOW (half cover) underneath, drawn whole: a sofa (2 × 1)
  with an end table, a TV stand (2 × 1), a king-size bed with nightstands
  and a bench at its foot (2 × 2). Each faces a way (`dx`, `dy`): its back
  to a wall (a sofa or TV may back onto a window, a bed only a wall), clear
  of doorways and stairs, with the floor in front of it kept clear. The
  repair that unblocks pockets removes a piece whole.
* **Rural** (28–36): farmhouse, barn, sheds, a dirt lane 4 wide, fields, woods.
* **Apartments** (34 / 38 / 42; 4 / 5 / 6 storeys): one tall block on a
  street (`tactical/sites.ts`). A corridor runs through every floor with
  flats either side (two rooms each), a stairwell at each end and a lobby
  off the street. Every floor has the same plan, and the windows follow one
  rhythm per face (every other tile, or two in three), so they stack in
  columns; a luxury block glazes its top two floors alike. In each flat,
  one room is the living room (a TV stand and a sofa facing it, to the far
  wall or standing free) and one the bedroom (a double bed), plus a table
  or a crate now and then. The roof is walkable, with a cellar below. Behind the
  block is a car park, reached by a driveway down the side; there's a lawn
  on the other side and a forecourt in front. **A helicopter lands on the
  roof** (`map.airLz`), so the team fights down; arriving by road starts in
  the street. Vampires sleep in the cellar (or on the ground floor), and
  thralls are on any floor.
* **Industrial** (36 / 40 / 44): a fenced works yard on a street, entered
  through a gate.
  * The warehouse hall holds pallet racking two storeys high, with a gallery
    round it (open over the floor), offices at one end and dock doors with
    trucks backed up to them.
  * Shipping containers, pallets and a gatehouse stand in the yard.
  * Under the warehouse is **the blood bank**: cold stores full of fridges,
    a lab and a ward, where the vampires sleep.
  * A helicopter lands in the open yard; arriving by road starts at the gate.
* **Landmarks** (town, `landmark`): the hideout is a recognisable
  building, raised on a big lot on a street in the far half of the map.
  * *Hospital*: two storeys of wards off a corridor (beds), a lobby with
    the reception desk, the morgue below, an ambulance at the kerb and a
    red sign.
  * *Supermarket*: a glass front with the doors in the middle, checkouts,
    aisles of shelving, fridges along the back, a stockroom when the lot is
    deep enough, and a green sign.
* **Town dressing**:
  * Now and then a *petrol station*: the forecourt at road height with a
    driveway in and one out, two pump islands under a lit canopy, and a
    kiosk at the back.
  * A quarter of the houses are *corner shops*: shelving and a counter
    downstairs, a ceiling light in each room, glass along the street, a lit
    sign over the door (mini mart, pharmacy, bakery…). Houses and flats have
    no lights of their own.
  * Signs and canopies are the look only (`map.signs`, `map.canopies`). A
    canopy shows with the level above, like a roof.
  * Indoors and under canopies, lamps are ceiling fittings (`ceiling`),
    with no post.
* **Winter** (`winter`, the look only, any setting but the lairs): snow
  lies on every surface that looks up at the open sky, so floors indoors,
  basements and anything under a roof stay clear. Lawns are full, pavements
  partly cleared, roads grey slush; roofs, car roofs and tree crowns are
  capped. Snow falls; the sky is overcast. (`render/shaders/snow.ts`: a
  snow map gives each tile the level of whatever is topmost over it.)
* **Rain** (`rain`, the look only; never with snow, not in lairs): a
  drizzle falls; faces open to the sky go darker and glossier (floors more
  than walls, streaked), indoors stays dry. Puddles stand in broad hollows,
  most on roads and car parks, some on pavements, earth and roofs, hardly
  any on lawns: flat, dark, mirror-smooth and ringed by raindrops. They
  and wet floors reflect the street: the scene is drawn mirrored in the
  street's plane each frame at half resolution (a three `Reflector`, kept
  out of the scene) and the ground level's puddles sample it; a roof's
  puddles catch only the sky. Overcast by day, darker at night.
  (`render/shaders/rain.ts`.)
* **Lair** (44×44, three levels): churchyard and chapel; catacombs (~9 rock
  rooms, a tree plus two loops); a crypt hall where the eldest stands.
  **Montségur** has a broken curtain wall on a rocky slope and a bigger
  hall.
* The hideout is the far building; vampires inside or below, thralls spread
  out.

## Balls to the walls

A skirmish mode for the fun of it (`MAYHEM` in `tactical/battle.ts`; Mode
in the skirmish setup, which then hides Kit). Six agents in tactical kit:
M249, M240B, two rocket launchers, M110, semi-auto shotgun, three loads
each and two extra incendiaries. Thralls carry the same kinds of guns
(×1.5 health); vampires carry machine guns, rocket launchers and
shotguns instead of claws, with ×3 health and ×1.75 time. Everyone is
awake from the start (combat music at once). The town is already burning:
75% of glass broken, 60% of cars alight, 4% of the open ground on fire,
none within a tile of anyone or 3 of the landing zone; these fires last
the battle.

## Campaign integration

**Saving a battle** (`tactical/save.ts`): a campaign battle under way is
kept on its mission (`PendingBattle.live`: the title and the whole battle,
the map's byte arrays as base64). It's written to the autosave slot when
the battle starts, after every command (before its playback, so closing
the tab mid-animation keeps it), when the page is closed, and by **Save &
quit** (top right; back to the main menu). Loading a save with a battle
under way goes straight into it, at the turn and TU it was left, the first
agent who can act selected; the battle log starts afresh. The whole map is
saved rather than regenerated, as doors and glass change it and the
generator may change between versions. A battle that won't unpack is
dropped on load (it starts over from its Contact event). Settling the
battle clears it and autosaves.

`tactical/campaign.ts`. A mission's fight posts a **Contact** event: **Take
command** opens the battle, **Leave it to the team** auto-resolves. Either
way the play is replayed from the saved random state, so the outcome feeds
the same debrief. With `tactical.on` off (tests, batch) everything
auto-resolves.

* The battle uses the mission's agents (current HP), their gear for the
  chosen kit, research effects, the site, the bloodline, the local hour and
  how they arrived.
* **Where** (by the mission's seed): town 55%, country 25%, an apartment
  block 10%, a works yard 10%; lairs keep their own. A rescue is
  mostly (70%) at a hospital or a supermarket in town.
* **Winter**: snow in winter months (December–February in the north,
  June–August in the south; a month either side when farther than 48° from
  the equator), likelier the farther from the equator, never within 35° of
  it (`snowy()`).
* **Rain**: otherwise about one battle in four (30% in the tropics, 15%
  in the dry belts at 12–32°, 28% beyond; `rainy()`), not at lairs.
* The **helicopter** sits by the landing zone and can be shot down (the
  aircraft is lost). With it on the pad at the win, all loot is lifted out;
  otherwise only crates carried by agents (one each, dropped on death).
* **Rescues**: free the prisoner (one action); they move as ours and must
  survive.
* A team all killed or taken on a hired flight just ends; our own aircraft
  flies home empty.

## Screen and controls

* Walls stand their full storey height on every level shown, the level
  looked at included (XCOM); the levels above it are cut away.
* Closed doors are drawn as a wooden leaf in the frame; an open one swings
  in against the indoor side. Glass is a pane between metal rails. A
  shattered pane or window bursts into shards thrown the way the blow
  went (away from the shooter, or out from the fire), through the far
  side; they fall, skid along the floor and fade.

* Squad cards, numbered, top left, room for ten agents. Unselected: name,
  HP and TU as numbers only. The selected agent's card grows: weapon and
  rounds, HP and TU bars (blue: can still attack; gold: the attack's
  reserve). No tooltip.
* Over each unit a small HTML health bar (`BattleView.placeHeads`), with
  SNEAK / DOM (an enemy holding for reaction: REACT), or TORPOR / BLEEDING /
  STABLE for a body. Health drops as each hit lands in playback; the part
  lost shows white, then slides down to the new value.
  Hovering a seen enemy grows the bar into its card (name, type, Vitality,
  weapon; the selected agent's CEP there in each fire mode, the crit, and
  notes: flanked, leaning out, who's in the line of fire).
* Units next to low cover are drawn crouched, and shots treat them so.
* Objectives as plain text top right under Quit. The last three messages
  float above the action bar; "All messages" opens them in place by turn.
  The log shows only what the team saw.
* **The action panel**, bottom left (Paradise Cracked), icons only (the
  name leads each tooltip), in two groups that look different: the
  **agent's** round steel buttons, lit blue when on (Sneak, Backpack,
  Inventory, in that order), and the **weapon console** beside them: the
  active item large in a recessed well (the weapon in hand and its rounds,
  or an item held ready), with square brass keys in a sunken tray below
  (snap, aimed, burst if the weapon has it; reload set apart at the end). **Backpack** opens a strip of the grenades and trauma kits
  carried: pick one and it's held ready in place of the weapon (click where
  to throw it, or who to patch). It stays ready while there's another of the
  kind; after the last, the weapon is back. Right click or Esc: the weapon.
  See [inventory.md](inventory.md).
* Evacuate and End turn bottom right. End turn's tooltip: agents with TU and
  ammo left react to enemy movement. Target and finish/free/stabilize/
  take-alive/patch chips centred at the bottom.
* Move range: blue outline (time to attack), yellow only beyond it. The path
  is a glowing ribbon (Chaikin-smoothed); the hovered tile itself isn't
  outlined.
* Aim lines (Phoenix Point): hovering a tile the agent can reach draws a
  red glow from it to every seen enemy that could be attacked from there,
  pulses running toward the target like the path's. No hit chance on it. A
  target only seen leaning out of tall cover gets its line from that side.
* Enemies seen on a level cut away show as a red pin with an up arrow;
  seen enemies off screen get an edge arrow (click to look).
* **Mouse**: left selects and attacks (with Ctrl held: force fire at the
  spot, an amber CEP ring showing where), right moves; right-drag pans,
  middle-drag turns and tilts; the wheel steps the level (no zoom): every
  mouse notch steps, however small its delta; a trackpad steps once per
  ~120 px. The level shown changes by itself only with the actor in focus:
  selecting an agent, the selected agent's own move to another floor, and
  on the enemy's turn each seen enemy as it starts to act. Not after a shot
  or a throw.
* **Keys**: 1–8 agents (again: camera to them), Tab next, Enter end turn, T
  shoot (in the fire mode chosen), M fire mode, L reload, U backpack, G an
  incendiary ready, C sneak, I inventory, X evacuate, WASD pan, Q/E rotate,
  R/F levels.
* **Skirmish** (main menu tab): ground (town, farm, apartments,
  industrial), landmark (town: none, hospital, supermarket), weather (clear, rain, snow), site,
  bloodline, night/day, kit, arrival and rescue are set there, not in battle.

## Balance

`tactical/bot.ts` is a beginner bot (no incendiaries, flanking or
concealment); `tactical/calibrate.test.ts` (`CALIBRATE=1`) compares it with
the auto-combat. Latest: nest and den near 100% both; haven at night 93%
bot; lair with 8 agents 20% bot vs 57% auto. At night against several
vampires the auto-combat is kinder than the bot; a good player should sit
between. Revisit after human playtesting.

## Still to build

Agreed in the last review of the C++ game (2026-11-17):

* **UV flare**: thrown, steady low UV for the rest of the mission; vampires
  won't enter its area; harmless to humans.
* **Sparkle**: UV flash grenade; kills vampires for good and destroys
  bodies in torpor in the blast; humans immune.
* **Smoke** (C++: −3 tiles of sight), **frag grenade**.
* **More stealth** (sneak is the start): daytime raids where the vampires
  keep indoors and the team stacks on a door before the breach.
* **Encumbrance** (C++: 1 TU per point over Strength; the measure here is
  undecided).
* **Haemolytic Dart Gun** (finish from range), **Night Optics** (C++: 14
  tiles at night instead of 9), **Motion Tracker**, **Haem Serum** (a strong
  heal from vampire tissue).
* Later: destructible terrain; base defence maps; perhaps infiltration or
  heist missions for cover-ups.

**Rejected**: morale, panic and berserk; spreading fire; Molotov and
demolition charge; Napalm Projector, Anti-Materiel Rifle; Exo-Frame and
sealed suit (pheromone blockers do that job); black-market mercenaries;
stakes.

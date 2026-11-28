# Tactical: the battlescape

XCOM-style, turn-based, on a grid of whole levels (no slopes). Mouse after
Wasteland 3, HUD after Paradise Cracked. Code: `src/tactical/` (plain TS,
own seeded RNG), drawn by `render/battle/`. Numbers live in
`tactical/rules.ts` (weapons, cover) and `tactical/battle.ts` (units, TU).

## Rules

* **Time units**: operatives 40 + Combat/2 a turn; thralls 50, vampires 72,
  the eldest 80. Walking 4 TU a tile (a flight of stairs 16, a climb 12);
  snap shot 35% of the unit's TU, aimed 60%, blow or throw 35%. The player
  moves every unit, then every enemy moves.
* **Reaction fire** is automatic: an operative left with a loaded gun and
  the TU for a snap shot fires at enemies moving in sight (wider cone, no
  crits). No overwatch or hunker. Enemies react the same way.
* **Sneak** (free toggle): steps cost 1.5×; while concealed, enemies must
  come twice as close to spot the operative.
* **Movement** is any-angle (Theta*), costed by distance. Nobody walks
  through anybody. An operative who spots a new enemy stops there and keeps
  the TU.
* **Reach** (melee, finishing, freeing, patching) is the next tile with
  nothing between and no corner cut.
* **Shooting is ballistic** (`tactical/ballistics.ts`), no hit chance.
  Each weapon has a cone (σ for an average snap shot); skill
  (0.7 Combat + 0.3 Insight) scales it ×1.4 to ×0.6; aimed ×0.55, burst
  ×1.3 a round, reaction ×1.5, from concealment ×0.85. Each round flies
  from the shoulder until it meets a wall, a closed door, a sill or lintel,
  a prop to its height, a floor, earth, or a **figure, friend or foe**
  (bodies lying down aren't hit). It breaks the glass it passes.
  * A shot aims at the middle of what shows of the target over its cover.
  * **Range** is as far as the shooter sees (16 tiles by day or to what's
    lit; less in the dark). A **scope** sees and shoots further where
    there's light: the H&K 416s 22 tiles, the M110 and the Carl Gustav 30;
    the team sees what the scope sees.
  * **Shotgun**: 8 pellets, each doing its own damage, scattered 5° more:
    brutal close in, where most land, weak far off; for alleys and
    crowds. The CEP shown is the pellets' spread.
  * **Damage**: the weapon's, crit ×1.5 (weapon crit + Insight; +40
    flanked; none on reaction), less armour, at least 1. Melee isn't
    ballistic: a blow lands on the attacker's aim.
  * **Rockets** go off where they stop: 30–50 in full within a tile,
    ×0.65 and ×0.35 further out (radius 2, not through walls), the
    shooter's side too; the ground burns a turn, glass breaks, doors break.
  * **Force fire** (Ctrl-click): at a tile, chest height, unseen, 16 tiles.
  * The player sees no number: hovering shows the **CEP** ring, and the
    enemy's card the CEP per fire mode and who's in the line of fire. The
    AI weighs shots by a rough estimate it never shows.
* **Edges between tiles**: wall (full cover, blocks sight), window (half
  cover, seen through), doorway, closed door, glass, railing. Props fill
  tiles.
* **Doors**: a closed door blocks sight and is full cover. Opening costs 4
  TU, walking through or from beside it (either side, or posted up on the
  next tile along the wall); it stays open. Exterior doors and doors in
  shops and works start shut 90% of the time, doors in homes 60%. Roller
  and glass sliding doors are two doorways wide and open as one. A shut
  **glass door** is glass to the rules (seen and shot through, no cover)
  that can be opened. **Broken doors**: a blast breaks every door around
  it; shotgun pellets blow in a closed door; any round breaks a glass door.
  Broken, it's an open doorway for good. Lairs have open doorways only.
* **Glass** (shopfronts; the top floors of luxury blocks): seen and shot
  through, no cover, not walked through. A round or a fire shatters it,
  leaving an open frame. A broken **window** keeps its sill: still half
  cover.
* **Leaning**: behind full cover at its end, a unit steps out a tile to
  look, shoot or throw round it (the side tile open, without the same
  cover). Works for both sides, for sight, reactions and the AI.
* **HP**: an operative's Vitality (30–50 a recruit); thralls 24–30,
  vampires 48, the eldest 120.
* **Bleeding out**: an operative at 0 HP bleeds 3 turns (not after a crit
  or 18+ overkill); a neighbour can stabilize. Downed operatives survive a
  win; left behind after a loss or withdrawal, they're lost.
* **Win** when every enemy is dead (torpor doesn't count); **lose** when
  every operative is down; **withdraw** when every survivor evacuates from
  the landing zone.
* **Rescue**: the prisoner is held beside a vampire on guard that never
  leaves its post (it fights whoever comes in reach). Saved if alive at a
  win, or cut loose and got out to the landing zone.
* **Pods** wake on seeing an operative, being shot at, or gunfire within 12
  tiles; unaware enemies patrol, alerted ones hunt from turn 4.

Stats on the map: Combat (aim, TU, melee), Vitality (HP), Faith (resisting
domination), Tradecraft (concealment), Insight (crits, spotting).

## Vampires

* **Torpor**: bullets and claws drop a vampire for 2 turns (3 by day); it
  rises at 40%. A neighbour **finishes** it (quiet) or **takes it alive**.
  Fire or the sun destroys a body in torpor.
* **Fire**: an incendiary burns 3 × 3 for 2 turns, double to vampires
  through armour.
* **The sun**: by day vampires keep indoors; one caught out burns. Below
  ground is always night.
* **Night**: humans see 7/9/11 tiles at new/half/full moon (9 below
  ground, 16 to anything lit); vampires 20.
* **Climbing**: a wall face to a parapet or an upper window.
* **Domination**: once a battle, will + d40 against Faith + d40; the
  operative loses a turn. The eldest tries every turn it can't claw.

| Line | Trait (`tactical/traits.ts`) |
|---|---|
| Ashgrove | +2 thralls |
| Huaca | rises a turn sooner |
| Carcassonne | will +15 |
| Sahel | thralls +12 HP |
| Jade | unseen beyond 5 tiles until they strike |
| Nullarbor | go out by day; half the sun's damage |

Strains, weaknesses and researched gear: [research.md](research.md).

## Concealment

Plainclothes arriving by jet or hired flight start concealed; a helicopter
or tactical kit gives the team away. Concealed, an operative is spotted
only within 8 − Tradecraft/10 tiles (halved sneaking). Shooting, throwing
or being spotted ends it, except a suppressed shot that drops its target.

## Maps

* **Scale**: a tile 1.5 m, a level 2.5 m. Shots fly in metres through the
  same walls, sills, props and figures that are drawn
  (`tactical/map/geometry.ts`).
* **From blocks** ([levels.md](levels.md)): every setting but the lairs.
  Nest 40 tiles a side, den and haven 48, a rescue the long 32 × 56. Every
  tile reachable from the landing zone but flat roofs with no stair. In by
  road (`map.lz`) or by helicopter (`map.airLz`).
* **The hideout**: a structure tagged for the site, with a basement when
  the mission asks; a **landmark** (hospital, supermarket) when named.
  Vampires in it or below; thralls in it, nearby and outdoors; never on a
  roof.
* **Vehicles** (2 tiles across: car 3 long and SUV 4 half cover, truck 6
  full) park on straight town roads and come with blocks. Fire burns them
  out; the wreck keeps its cover.
* **Lairs** (44 × 44, three levels): churchyard and chapel, catacombs, the
  crypt hall where the eldest stands. **Montségur**: a broken curtain wall
  on a rocky slope and a bigger hall.

**The look** (all render-only; see the files):

* Procedural shaders, not textures (`render/shaders/`, `npm run
  materials`); lamp light baked into a light volume with shadows
  (`lightVolume.ts`); the moon casts real-time shadows.
* Props on one palette material (`props.ts`; tooling.md); doors built from
  boxes (`doors.ts`); kerbs, rounded corners and road markings
  (`kerbs.ts`); vehicles as painted models, wrecks when burnt
  (`vehicles.ts`).
* **Trees and hedges** (`trees.ts`): a few grown shapes stacked, turned
  and tinted per tile. A tree's crown is the storey above, shown only with
  that level (XCOM); on its own level the trunk stands cut. Crowns stop
  short of buildings.
* **Winter** (`snow.ts`): snow on whatever faces the open sky. **Rain**
  (`rain.ts`): wet surfaces and reflecting puddles outdoors. Neither in
  lairs.
* Walls stand their full storey on every level shown; levels above are cut
  away.

## Effects

`render/battle/effects.ts`; only the look, nothing in the rules or the
save. The rules say what each round struck (a unit, or a surface's skin and
its face), and the view answers by the surface:

* **All at once**: everything a round did (glass and doors broken, the
  damage, a body falling) plays the moment its tracer lands, a burst's
  round by round, a rocket's when it goes off.
* **Rounds**: a muzzle flash; metal sparks and may ricochet (a streak
  glancing off), stone puffs dust and chips, wood splinters, earth and
  grass throw clods (snow in winter); hard surfaces keep a bullet hole.
* **Blood**: a red mist, drops flung on the way the round or blow went,
  spattering the floor and a wall close behind; a vampire's near black.
  A body lying down (dead, in torpor, one of ours down) bleeds a pool that
  spreads over some seconds; a vampire's stays as a stain if it rises.
* **Glass** bursts the way the blow went, glitters, skitters and leaves
  glass strewn, most of it on the far side. **Doors** blown in throw
  splinters and planks (a garage's steel: sparks and scraps).
* **Blasts**: a flash, a fireball rolling up into smoke, debris and sparks,
  a ring along the ground, soot, and the camera shaken (less when unseen).
  A flashbang flashes white, a strobe flickers, UV glows violet.
* **Fire**: tongues of flame, a glow, embers and thin smoke rising; each
  tile scorched the first time it burns.
* What falls doesn't pass through walls. The marks (blood, soot, holes,
  glass, splinters) last the fight, hidden with the levels cut away; a
  loaded battle keeps only the pools and the soot under fires still
  burning.

## Balls to the walls

A skirmish mode (`MAYHEM`): six operatives in heavy kit (machine guns,
rockets, a sniper, a semi-auto shotgun); thralls with the same guns and
×1.5 health; vampires with guns, ×3 health, ×1.75 time. Everyone awake.
The town already burning: most glass broken, most cars alight, fires on
the ground (none near anyone).

## Campaign integration

`tactical/campaign.ts`. A mission's fight posts a **Contact** event: **Take
command** opens the battle, **Leave it to the team** auto-resolves. The play
first runs on a throwaway copy to find the fight, then for real from the
saved random state once it's settled, so the outcome feeds the same
debrief. With `tactical.on` off (tests, batch) everything auto-resolves.

* The battle takes the mission's operatives (current HP), their gear for
  the chosen kit, research, the site, the bloodline, the local hour and
  how they arrived.
* **Where**: town 55%, country 25%, apartments 10%, works 10%; a rescue
  mostly at a hospital or supermarket, on the long map.
* **Weather**: snow in winter months away from the equator (`snowy()`);
  otherwise rain about one battle in four (`rainy()`).
* The **helicopter** drops the team and leaves; after a win it lifts all
  loot. By jet or hired flight, only the crates operatives carry.
* **Saving**: a campaign battle under way is saved with the campaign
  (autosave after every command, the whole map kept); loading goes
  straight back in. One that won't unpack restarts from its Contact event.
  Skirmishes aren't saved.

## Screen and controls

* **Squad cards** top left; the selected one shows weapon, rounds, HP and
  TU bars (blue: can still attack; gold: the attack's reserve).
* **Over each unit** a health bar with its state (SNEAK, REACT, TORPOR,
  BLEEDING…); hovering a seen enemy grows it into its card.
* **Action panel** bottom left: the operative's buttons (Sneak, Backpack,
  Inventory) and the weapon console (the active item, fire modes, reload).
  Backpack opens a strip of grenades, kits and devices to hold ready
  ([inventory.md](inventory.md)). Evacuate and End turn bottom right;
  action chips (finish, free, stabilize, take alive, patch) bottom centre.
* **Move range**: blue (time to attack), yellow beyond; the path a glowing
  ribbon. **Aim lines** (Phoenix Point) from a hovered tile to every enemy
  attackable from there. Enemies on a level cut away show as pins;
  off-screen ones as edge arrows.
* **Mouse**: left selects and attacks (Ctrl: force fire), right moves,
  right-drag pans, middle-drag turns, the wheel steps the level (no zoom).
  The level follows the actor in focus, not shots.
* **Keys**: 1–8 operatives, Tab next, Enter end turn, T shoot, M fire mode,
  L reload, U backpack, G incendiary, C sneak, I inventory, X evacuate,
  WASD pan, Q/E rotate, R/F levels.
* **Skirmish** (main menu): ground, landmark, weather, site, bloodline,
  day or night, moon, kit (plainclothes come by road, tactical by
  helicopter), rescue, mode.

## Balance

`tactical/bot.ts` is a beginner bot; `calibrate.test.ts` (`CALIBRATE=1`)
compares it with the auto-combat. Nest and den near 100% both; haven at
night 93% bot; lair with 8 operatives 20% bot against 57% auto. At night
against several vampires the auto-combat is kinder than the bot. Revisit
after human playtesting.

## Still to build

* Smoke, frag grenade; more stealth (daytime raids, stacking on a door);
  encumbrance (what it's measured against is open); finishing a body from
  range.
* Later: destructible terrain beyond doors and glass; base defence maps;
  infiltration missions for cover-ups.

**Rejected**: morale, panic and berserk; spreading fire; Molotovs and
demolition charges; anti-materiel rifle; exo-frames and sealed suits;
mercenaries; stakes.

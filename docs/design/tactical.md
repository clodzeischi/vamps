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
  thralls 50, vampires 72, the eldest 80. Walking 4 TU a tile (stairs 8, a
  climb 12). Snap shot 35% of the unit's TU, aimed shot 60% (+15 aim), blow
  or throw 35%; small actions a fixed few. The player moves all units, then
  every enemy moves.
* **Reaction fire** is automatic: when the player ends the turn, every agent
  with a gun, rounds in it and the TU for a snap shot holds them, and snaps
  at enemies moving in sight (−15 aim, no crits) as often as the TU last.
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
* **Hit chance** = aim (agents 50 + Combat/2, 62–77 for a recruit; thralls
  55) + range − cover + height (+10), clamped 5–95%, with the breakdown in
  the tooltip. Range bands for guns: point blank (the next tile) pistol and
  SMG +30, rifle +25, shotgun +40; close (to 4 tiles) pistol +10, SMG +15,
  shotgun +20; none to the weapon's far range; beyond it, so much a tile.
  Enemies holding TU at the end of their turn react the same way agents do.
  Cover is directional: half −20, full −40. A flanked
  target gives +40 crit. Reaction shots −15, no crits. Insight adds
  (Insight − 30)/5 crit.
* **Walls sit on the edges between tiles**: wall (blocks, full cover),
  window (sight through, half cover), doorway. Props fill tiles.
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
sneaking). Shots from concealment get +15. Shooting, throwing or being
spotted ends it, except a suppressed shot that drops its target.

## Maps

Seeded from the mission id (`tactical/mapgen.ts`). Every walkable tile must
be reachable from the landing zone; pockets are repaired or a doorway is
knocked through.

* **Urban** (28–36 tiles): a street grid, lots, BSP buildings with shared
  stairwells, walkable roofs, basements; cars, walls, bins.
* **Rural**: farmhouse, barn, sheds, fields, woods.
* **Lair** (44×44, three levels): churchyard and chapel; catacombs (~9 rock
  rooms, a tree plus two loops); a crypt hall where the eldest stands.
  **Montségur** has a broken curtain wall on a rocky slope and a bigger
  hall.
* The hideout is the far building; vampires inside or below, thralls spread
  out.

## Campaign integration

`tactical/campaign.ts`. A mission's fight posts a **Contact** event: **Take
command** opens the battle, **Leave it to the team** auto-resolves. Either
way the play is replayed from the saved random state, so the outcome feeds
the same debrief. With `tactical.on` off (tests, batch) everything
auto-resolves.

* The battle uses the mission's agents (current HP), their gear for the
  chosen kit, research effects, the site, the bloodline, the local hour and
  how they arrived.
* The **helicopter** sits by the landing zone and can be shot down (the
  aircraft is lost). With it on the pad at the win, all loot is lifted out;
  otherwise only crates carried by agents (one each, dropped on death).
* **Rescues**: free the prisoner (one action); they move as ours and must
  survive.
* A team all killed or taken on a hired flight just ends; our own aircraft
  flies home empty.

## Screen and controls

* Squad cards, numbered, top left, room for ten agents. Unselected: name,
  HP and TU as numbers only. The selected agent's card grows: weapon and
  rounds, HP and TU bars (blue: can still attack; gold: the attack's
  reserve). No tooltip.
* Over each unit a small HTML health bar (`BattleView.placeHeads`), with
  SNEAK / DOM (an enemy holding for reaction: REACT), or TORPOR / BLEEDING /
  STABLE for a body. Health drops as each hit lands in playback; the part
  lost shows white, then slides down to the new value.
  A seen enemy the selected agent can shoot shows the hit
  chance in the fire mode chosen; hovering it grows the bar into its card
  (name, type, Vitality, weapon, the chance in each mode and why).
* Units next to low cover are drawn crouched (the look only).
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
* Aim lines (Wasteland 3): hovering a tile the agent can reach draws a red
  line from it to every seen enemy that could be shot from there (in the
  fire mode chosen), with the chance to hit at the line's middle.
* Enemies seen on a level cut away show as a red pin with an up arrow;
  seen enemies off screen get an edge arrow (click to look).
* **Mouse**: left selects and attacks, right moves; right-drag pans,
  middle-drag turns and tilts; the wheel steps the level (no zoom). The
  level shown follows the selected agent.
* **Keys**: 1–8 agents (again: camera to them), Tab next, Enter end turn, T
  shoot (in the fire mode chosen), M fire mode, L reload, U backpack, G an
  incendiary ready, C sneak, I inventory, X evacuate, WASD pan, Q/E rotate,
  R/F levels.
* **Skirmish** (main menu tab): ground, site, bloodline, night/day, kit,
  arrival, rescue are set there, not in battle.

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

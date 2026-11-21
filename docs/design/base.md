# Bases: research, captives, the building, people and cargo, equipment

## Research and engineering

Code: `data/research.ts` (tree, effects), `sim/research.ts`.

* **Staff** are named lay people (`GameState.staff`): a $20k vetting fee,
  then a salary. A monthly pool of 6 scientist and 6 engineer candidates
  (name and origin, no stats). Lab holds 10 scientists, workshop 10
  engineers. Padua starts with one of each and 4 of each staff.
* **Projects run at one base with assigned staff** (1.5 points a day each).
  Material (remains, a captive, a free hangar) must be at that base. A
  one-off project can't run at two bases at once; repeatable ones can. What
  is learned is known everywhere. Engineering also costs materials.
* The tree today: 20 projects in `data/research.ts`. It is being replaced
  by the full tree in [research.md](research.md) (topics, house weaknesses,
  new rooms, manufactured items).
* **Planned (from the C++ game):** research breakthroughs (a daily chance a
  random project jumps 30%: 4% / 2% / 0.5% by difficulty). Progress stays a
  percentage.

## Captives and remains

* **Containment** (3 cells) costs $40k a month full or empty.
* Capture leads bring a thrall back if a cell is free. Won strikes may take
  a thrall or a vampire alive (taken in battle from torpor).
* **Vampires can be destroyed** (remains to cold storage); **thralls are
  human** and can only be released, or **turned** into an informant
  ([covert.md](covert.md)).
* Remains travel only by helicopter; a jet team burns the bodies.

## The building

The Order hides in plain sight, so a base is **an office building**
(`sim/building.ts`, base screen › Construction).

* 3 × 3 × 3: a basement and two floors. The centre column is the core (lift
  and stairs), so each floor is a ring of 8 rooms. The ground-floor front
  middle tile is the fixed **lobby and security checkpoint**: 23 buildable
  rooms. Unbuilt rooms are ordinary office space. Any room on any floor.
* **Hangars** stand beside the building, one aircraft each (helicopter or
  jet), as a count, not grid rooms.
* **Synergy**: same-kind rooms in a straight line of 3 (along a floor side,
  or a stacked column) +20% each; an adjacent pair +10% each. Each room
  counts in one group; the best grouping is solved exactly. Affects project
  speed (labs, workshops), interrogation (containment) and healing
  (quarters).
* **Quarters**: 8 beds a room. Everyone at a base takes a bed and keeps it
  while away; hiring needs a free bed.
* **SIGINT centre**: a room that listens like a SIGINT station ($600k, 10
  days, $100k a month per level); level 2 after Signal analysis, ×1.5. No
  synergy.
* Clearing a room refunds nothing and is blocked while in use. A church
  cell is a single floor ring of 8.
* **Not built:** the Three.js cutaway view (needs the room meshes,
  ASSET_LIST.md section 4) and raid maps.

## People, aircraft and cargo

Code: `sim/transfers.ts`. Phoenix Point style.

* **Aircraft capacity** is one number (helicopter 8). Loads: a person 1, a
  vampire's remains 2 (helicopter only), a captive 2 (needs a cell kept at
  the destination), an armoury crate 0.25. The load bar is segmented, one
  coloured segment per thing aboard.
* **Ferry flights** move an aircraft and its load to another base (beds,
  cells and hangar space reserved at departure); they can change course in
  the air. **Airline transfers** move people ($3,000 a head, a day or more).
  **Courier**: trauma kits only ($150 an item; never weapons or armour).
* Aircraft are selectable on the globe with their own panel; "Fly to…" puts
  the globe in an order mode.
* After a fight with several aircraft, the **Haul** window shares captives
  and bodies between them (or burns a body, releases a captive) before take
  off. What doesn't fit is burned.
* Goods and artifacts are an Order-wide stock (no transport needed).
* No pilots. Losing an aircraft loses everything aboard. The bots don't use
  escorts, wings or transfers.

## Per-agent equipment

Code: `data/equipment.ts`, `sim/equipment.ts`.

* Each agent has a loadout (`Agent.gear`): a grid of hand, armour, helmet,
  two pockets and a backpack ([inventory.md](inventory.md)), edited in
  Personnel › agent › Equip against the base's **armoury**
  (`Installation.armoury`, a count per item).
* **Kit stays the team's choice** and decides what goes along: civilian
  items with any kit; plainclothes items (pistols, compact SMG, soft vest,
  trauma kit, magazines) with plainclothes or tactical; tactical items
  (carbines, shotgun, plate carrier, helmet, incendiaries) only with
  tactical. A weapon left behind means a knife.
* Standard issue: a pistol, two magazines and a soft vest. Padua's founding armoury fits a
  full tactical helicopter team.
* Gear travels and dies with the agent. Incendiaries, trauma kits and
  magazines are used up.
* Not built: UV weapons and other researched items (research effects are
  still team-wide). Planned items are listed in [tactical.md](tactical.md).

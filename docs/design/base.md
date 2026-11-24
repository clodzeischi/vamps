# Bases: research, captives, the building, people and cargo, equipment

## Research and engineering

Code: `data/research.ts` (tree, effects), `sim/research.ts`,
`sim/science.ts` (the research queue), `sim/engineering.ts` (workshop
queues), `data/aptitudes.ts` and `sim/aptitudes.ts` (people's aptitudes).

* **Staff** are named lay people (`GameState.staff`): a $20k vetting fee,
  then a salary. A monthly pool of 6 scientist and 6 engineer candidates,
  their aptitudes shown before hiring. Lab holds 10 scientists, workshop 10
  engineers. Padua starts with one of each and **two scientists and two
  engineers**, so hiring decisions come at once (outputs to be tuned).
* What is learned is known everywhere. The tree today: 20 projects in
  `data/research.ts`, being replaced by the full tree in
  [research.md](research.md).
* No breakthroughs or other luck in the work: the player picks the right
  person for the job and gets the bonus.

## Scientists and the research queue

Research is the Order's, not a base's.

**Who leads follows where the work is done.** Research and intelligence
analysis are the Order's, worked together from every base, so each has
**one lead for the Order** (the lead scientist, the lead analyst).
Engineering is a base's (an M249 is built in one workshop, not two), so
each base has its own **lead engineer**.

**Four aptitudes**, rolled like an operator's stats (35–75, the same
too-weak or too-strong reroll) and growing with the work that uses them
(as engineers', below):

| Aptitude | Covers |
|---|---|
| Biology | Physiology, blood, the virus, autopsies and biopsies, medicine |
| Psychology | The mind: domination, thralls, faith under pressure |
| Physics | Light and UV, materials, chemistry, signals hardware |
| Humanities | Archives, history, languages, theology, provenance |

Investigative disciplines (forensics, signals, money, interrogation) belong
to Intelligence ([intelligence.md](intelligence.md)), not Science.

* **One queue for the Order** (Phoenix Point style): every scientist at
  every base works the **top** topic; the next starts when it's done.
  Topics move up and down and keep their progress.
* Each topic asks for weights over the aptitudes (most one, some two). A
  scientist's points a day are `1.5 × skill / 50`, times their own lab's
  synergy, summed over the Order.
* **The lead scientist** is one for the Order, named independently of any
  topic: their aptitudes ÷ 50 multiply every other scientist's. They lead
  from wherever they are (not while in transit). Change them when the
  topic changes, or don't: that's on the player.
* **Material** (remains, a captive) must be at a base with a laboratory
  and at least one scientist; the lead needn't be there. A topic whose
  material isn't so held waits, and the queue works the next. A captive's
  questioning names the base that holds the captive.
* Research costs no materials, so there is no waste.

## Engineers and the workshop queues

Code: `data/engineers.ts`, `sim/engineering.ts`.

Engineering stays **at the base**: a base's engineers build what's in its
workshop queue, into its armoury.

**The queue** (Phoenix Point style): every engineer at the base works the
**top** job; the next starts when it's done. Jobs move up and down at any
time and keep their progress. A finished job waiting on something (a
helicopter with no free hangar) steps aside. **Orders have a quantity**:
whatever can be made more than once (goods, helicopters) is queued as "12
of these", one unit after another, each going to stores (or its hangar) as
it's done, the rest of a day's work carried into the next. Queuing more of
something already on order adds to that order, wherever it stands: the job
behind it waits for the whole order. **Materials are drawn as the work is
done**: each day's share of the job's cost, times the team's waste that
day. With no money for the day's share, work stops (the log says so once)
and goes on when there is some. Abandoning a job loses what was spent on
the unit under way and drops the rest of the order.

Nothing in the workshop says goods can be sold: they go into stores. The
dark web's Sell tab is for the player to find.

**Four aptitudes**, rolled at random as an operator's stats are:

| Aptitude | Covers |
|---|---|
| Ballistics | Weapons, ammunition, armour |
| Avionics | Aircraft (more kinds are coming, so it will matter more) |
| Electronics | Drones, night optics, sensors, SIGINT equipment, station retrofits |
| Chemistry | Medical kit, haemolytic and silencer chemistry, serum |

* Each rolls 35–75 (a junior is about 55). As with operators, a candidate
  with 3 or more of the 4 in the bottom or top quarter is rerolled.
* Aptitudes grow with work that uses them: about +1 per 15 days up to 75,
  then +1 per 45 days, to a cap of 100. A 100 should be exceedingly rare.
* A base starts with **two engineers**; more come from the monthly pool,
  with their aptitudes shown. Costs get retuned later.

**Each item has a requirement**: weights over the aptitudes that add up to
1. Most use one (a magazine: ballistics 1). Some use several (a helicopter:
avionics 0.6, electronics 0.4).

**The base's output** on an item is the sum over its engineers:

```
engineer's skill on the item = Σ weight × aptitude (× the lead's multiplier)
points a day                 = 1.5 × skill / 50
```

So an engineer at 50 works at today's 1.5 points a day, and one at 100 at 3.

**The lead engineer**: each base can name one, or none. The lead's
aptitudes become **multipliers for everyone else** at the base:
`multiplier = lead's aptitude / 50`. A lead at 50 changes nothing, at 100
doubles that aptitude for the whole team, at 30 cuts it to ×0.6. The lead
works at their own aptitudes, unmultiplied. No lead means ×1 everywhere.
The lead can be changed at any time, with effect at once: the play is to
pick the lead for the job at the top of the queue.

Worked example: a base with four engineers.

| | Ballistics | Avionics | Electronics | Chemistry |
|---|---|---|---|---|
| Ana | 78 | 40 | 32 | 55 |
| Ben | 50 | 62 | 58 | 45 |
| Chiara | 45 | 52 | 70 | 40 |
| Dario | 55 | 48 | 50 | 66 |

| Job | No lead | Best lead | Worst lead |
|---|---|---|---|
| 15 silver magazines (ballistics, 30 pts) | 4.4 days | Ana: 3.2 | Chiara: 4.8 |
| A SIGINT DF pack (electronics, 20 pts) | 3.2 days | Chiara: 2.5 | Ana: 4.6 |
| A helicopter (avionics 0.6, electronics 0.4; 200 pts) | 32.5 days | Ben: 28.4 | Ana: 41.6 |

The helicopter goes best under Ben, an all-rounder, not under the best
specialist: a lead is chosen for the whole requirement.

**Waste**: an expert team wastes less. The team's average skill on the job
(with the lead's multipliers) sets the share of the materials it uses:
`1 − (skill − 50) × 0.005`, between ×0.75 and ×1.25. Average 50 pays list
price, 100 pays three quarters, 30 pays ×1.1. The curve is a first guess.

Not yet: researched items (research.md) as engineering jobs into the
armoury; for now the queue holds today's projects and goods.

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

Code: `data/equipment.ts`, `sim/equipment.ts`. Equipment is bought on the dark web
([economy.md](economy.md)) and shipped to a base in 40 hours.

* Each agent has a loadout (`Agent.gear`): a grid of hand, armour, helmet,
  two pockets and a backpack ([inventory.md](inventory.md)), edited in
  Personnel › agent › Equip against the base's **armoury**
  (`Installation.armoury`, a count per item).
* **Kit stays the team's choice** and decides what goes along: civilian
  items with any kit; plainclothes items (pistols, compact SMG, soft vest,
  trauma kit, magazines) with plainclothes or tactical; tactical items
  (carbines, both shotguns, the M249, M240B and M110 and their ammunition, plate
  carrier, helmet, incendiaries) only with tactical. A weapon left behind means a knife.
* Standard issue: a pistol, two magazines and a soft vest. Padua's founding armoury fits a
  full tactical helicopter team.
* Gear travels and dies with the agent. Incendiaries, trauma kits and
  magazines are used up.
* Not built: UV weapons and other researched items (research effects are
  still team-wide). Planned items are listed in [tactical.md](tactical.md).

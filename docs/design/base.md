# Bases: research, captives, the building, people and cargo, equipment

## Research and engineering

Code: `data/research.ts` (tree, effects), `sim/base/research.ts`,
`sim/base/science.ts` (the research queue), `sim/base/engineering.ts` (workshop
queues), `data/aptitudes.ts` and `sim/people/aptitudes.ts` (people's aptitudes).

* **Staff** are named lay people (`GameState.staff`): a $20k vetting fee,
  then a salary. A monthly pool of 6 candidates each of scientists,
  engineers and analysts, their aptitudes shown before hiring. Lab holds
  10 scientists, workshop 10 engineers, fusion centre 10 analysts
  ([intelligence.md](intelligence.md)). Padua starts with one lab, one
  workshop and one fusion centre and **two scientists, two engineers and two analysts**, so
  hiring decisions come at once (outputs to be tuned).
* What is learned is known everywhere. The tree is being built step by
  step from [research.md](research.md) (step 1: the spine's first four
  beats).
* No breakthroughs or other luck in the work: the player picks the right
  person for the job and gets the bonus.
* **Pay follows aptitude**, for everyone (a staff salary, an operative's
  upkeep): $20k a month at 50 in every aptitude, in proportion to the mean
  (`monthlyPay`, `PAY_AT_MIDDLE`): 40s cost $16k, 60s $24k, and pay rises as
  people learn. A cheap, mediocre hire is a real choice.
* **Personnel** lists everyone at the base the same way: name, aptitudes,
  pay, status, **Let go**. Rows don't open. Leads are chosen where they
  matter: the lead scientist in Research, the lead engineer in the base's
  Workshops, the lead analyst in Intelligence; Personnel only tags them.

## Scientists and the research queue

Research is the Order's, not a base's.

**Who leads follows where the work is done.** Research and intelligence
analysis are the Order's, worked together from every base, so each has
**one lead for the Order** (the lead scientist, the lead analyst).
Engineering is a base's (an M249 is built in one workshop, not two), so
each base has its own **lead engineer**.

**Four aptitudes**, rolled like everyone's (40–60, the same too-weak or
too-strong reroll) and growing with the work that uses them (as
engineers', below):

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
  Topics are reordered by dragging and keep their progress.
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

## The research screen

`ui/screens/geoscape/ResearchScreen.tsx`, one layout for the Research
screen (Control, the Order's) and a base's **Workshops** (engineering is
the base's own: its queue, its lead engineer, what it can make; there is no
engineering tab in Research).

* **The list** has three sections: **Active**, **Available**, **Complete**.
  Active rows show the days left (research: after the topics ahead) or what
  holds them up; Available rows show the days at today's staff (research:
  every scientist on it; engineering: this base's engineers, one unit).
  Active is the queue, top first: **drag a row to reprioritise** (a gold
  line shows where it lands). No arrow buttons anywhere, the base
  Overview's queue lines included.
* **The detail is a report**, one sheet, no boxes: file line (Research
  proposal / Research report / Work order, and a serial), name, discipline,
  material; then numbered sections. No status or staff-days on it: the list
  says that. The queue controls are inside the report, under the last
  section: where it stands in the queue (progress, team, Abandon), or how
  to add it.
* **Research proposals only hint** at what a topic might give, never name
  it, and never list what it opens. Once done, the report adds **Findings**
  (what the scientists found: the hard-science world-building) and
  **Outcome** (the effect, plainly: "Wounded operatives heal half as fast
  again"), then the further work it opens. The dark web shows the proposal
  only. Engineering work orders say what they deliver up front.
* **Classification markings**, top and bottom of a research report:
  `[CLASSIFIED: SENSITIVE]` (could be sold on the dark web),
  `[CLASSIFIED: CDF ONLY]` (more sensitive), `[CLASSIFIED: OPV ONLY]`
  (of no use outside the Order: targeting). Unmarked: unclassified. A CDF or
  OPV topic is never sold. Provisional: the topics we sell are Sensitive,
  the interrogations OPV only; the full assignment waits on the new tree.

## Engineers and the workshop queues

Code: `data/engineers.ts`, `sim/base/engineering.ts`.

Engineering stays **at the base**: a base's engineers build what's in its
workshop queue, into its armoury.

**The queue** (Phoenix Point style): every engineer at the base works the
**top** job; the next starts when it's done. Jobs are reordered by dragging at any
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

* Each rolls 40–60, as every role's do. A candidate with 3 or more of the
  4 in the bottom or top quarter is rerolled.
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

Researched items are engineering jobs into the base's armoury (the Biopsy
kit, silver magazines; research.md, "As built"), beside goods into stores
and jobs on an aircraft (fuel tanks).

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
(`sim/base/building.ts`, base screen › Construction).

* 3 × 3 × 3: a basement and two floors. The centre column is the core (lift
  and stairs), so each floor is a ring of 8 rooms. The ground-floor front
  middle tile is the fixed **lobby and security checkpoint**: 23 buildable
  rooms. Unbuilt rooms are ordinary office space. Any room on any floor.
* **Hangars** stand beside the building, one aircraft each (helicopter or
  jet), as a count, not grid rooms.
* **Synergy**: same-kind rooms in a straight line of 3 (along a floor side,
  or a stacked column) +20% each; an adjacent pair +10% each. Each room
  counts in one group; the best grouping is solved exactly. Affects project
  speed (labs, workshops), the intelligence section's pace (fusion
  centres), interrogation (containment) and healing (quarters).
* **Quarters**: 8 beds a room. Everyone at a base takes a bed and keeps it
  while away; hiring needs a free bed.
* **SIGINT centre**: a room that listens like a SIGINT station ($600k, 10
  days, $100k a month per level); level 2 after Signal analysis, ×1.5. No
  synergy.
* **Fusion centre**: where analysts work, 10 a room ($500k, 10 days).
* **Storage**: one a base ($200k, 7 days), no synergy. Holds the armoury
  and stores: dark-web orders and courier parcels ship only to a base with
  storage.
* **Padua starts** with storage and a fusion centre in the basement's back
  corners (back left, back right), a SIGINT centre upstairs at the front
  right, and its quarters, lab and workshop where synergy puts them.
* **Range** (a killing house; designed, not built): needs no research.
  Operatives at the base get +1 Combat a month (up to 70). $350k, 7 days,
  $20k a month.
* Clearing a room refunds nothing and is blocked while in use. A church
  cell is a single floor ring of 8.
* **Not built:** the Three.js cutaway view (needs the room meshes,
  ASSET_LIST.md section 4) and raid maps.

## People, aircraft and cargo

Code: `sim/base/transfers.ts`. Phoenix Point style.

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

## Per-operative equipment

Code: `data/equipment.ts`, `sim/people/equipment.ts`. Equipment is bought on the dark web
([economy.md](economy.md)) and shipped to a base in 40 hours.

* Each operative has **two loadouts of their own**, each a grid of hand,
  armour, helmet, two pockets and a backpack ([inventory.md](inventory.md)):
  **Low viz** (`Agent.lowViz`, plainclothes things only) and **Full
  tactical** (`Agent.gear`). No other loadouts, and no mixing within a team:
  the team's kit picks which one everyone takes (tactical: Full tactical;
  plainclothes: Low viz; civilian: Low viz less all but a knife). Both hold
  real items, so stock is tied up in both. A loadout with nothing in the
  hand shows "knife only" at dispatch.
* Edited in the base's **Armoury** (X-COM style): the operatives on the left
  (names only), the chosen one's inventory with a Low viz / Full
  tactical toggle, over the stock (`Installation.armoury`, a count per
  item), drawn like the ground in battle: each item at its size, one stack a
  kind with its count; what the chosen loadout can't take is dim. Stacks are
  the armoury's only: an operative's grid holds one item a place. Under it,
  "Order equipment on dark web" opens the market shipping here. The courier
  is in Stores.
* **Kit stays the team's choice** and decides what goes along: civilian
  items with any kit; plainclothes items (pistols, compact SMG, soft vest,
  trauma kit, magazines) with plainclothes or tactical; tactical items
  (carbines, both shotguns, the M249, M240B and M110 and their ammunition, plate
  carrier, helmet, incendiaries) only with tactical. A weapon left behind means a knife.
* Standard issue, in both loadouts of a recruit: a pistol, two magazines
  and a soft vest. Padua's founders start with their Full tactical loadouts
  filled from the founding armoury (the best it has).
* Gear travels and dies with the operative. Incendiaries, trauma kits and
  magazines are used up.
* Not built: UV weapons and other researched items (research effects are
  still team-wide). Planned items are listed in [tactical.md](tactical.md).

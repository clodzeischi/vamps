# Bases: staff, research and engineering, the building, cargo, equipment

## Staff

Code: `sim/base/science.ts`, `sim/base/engineering.ts`,
`sim/people/aptitudes.ts`.

* **Staff** are named lay people: scientists (a lab, 10 a room), engineers
  (a workshop, 10) and analysts (a fusion centre, 10;
  [intelligence.md](intelligence.md)). A monthly pool of 6 candidates of
  each, aptitudes shown; $20k vetting, then a salary. Padua starts with two
  of each.
* **Four aptitudes each**, rolled 40–60 (a candidate too weak or strong
  all round is rerolled), growing with the work that uses them (about +1
  per 15 days to 75, slower after, capped at 100).
  * Scientists: Biology, Psychology, Physics, Humanities.
  * Engineers: Ballistics, Avionics, Electronics, Chemistry.
  * Analysts: OSINT, HUMINT, SIGINT, CI.
* **Pay follows aptitude**, for everyone: $20k a month at 50, in
  proportion to the mean (`monthlyPay`). A cheap, mediocre hire is a real
  choice.
* **Leads**: a lead's aptitudes ÷ 50 multiply everyone else's. Research
  and analysis are the Order's, worked from every base, so each has one
  lead for the Order; engineering is a base's, so each base has its own
  lead engineer. Change them when the work changes, or don't.
* No breakthroughs or luck: pick the right person and get the bonus.
* **Personnel** lists everyone at a base (aptitudes, pay, status, Let go);
  leads are chosen where they matter (Research, Workshops, Intelligence).

## Research

* **One queue for the Order** (Phoenix Point style): every scientist works
  the top topic; drag to reorder, progress kept. Points a day per
  scientist `1.5 × skill / 50` (skill: the topic's weights over the
  aptitudes, times the lead's multipliers), times their lab's synergy.
* **Material** (remains, a captive, a sample) must be at a base with a lab
  and a scientist; a topic waiting for it steps aside.
* Research costs no money and no materials. What's learned is known
  everywhere. The tree: [research.md](research.md).

## Engineering

* **A queue per base**: every engineer works the top job, drag to reorder.
  **Orders have a quantity** ("12 of these"), delivered unit by unit:
  researched items to the base's armoury, goods to stores, jobs on an
  aircraft (fuel tanks) to it. A job waiting on something (no free hangar)
  steps aside.
* **Materials are drawn as the work is done**, times the team's
  **waste**: an expert team uses less (×0.75 at 100, ×1.25 at the bottom).
  No money, no work that day. Abandoning loses the unit under way.
* Each item's requirement is weights over the engineers' aptitudes (a
  magazine: Ballistics; a helicopter: Avionics 0.6, Electronics 0.4). A
  lead is chosen for the whole requirement: an all-rounder can beat the
  best specialist.
* The workshop never says goods can be sold; the dark web's Sell tab is
  for the player to find.

## The research screen

`ResearchScreen.tsx`: one layout for Research (the Order's) and a base's
Workshops.

* **The list**: Active (the queue, top first, drag to reprioritise; days
  left or what holds it up), Available (days at today's staff), Complete.
  No arrow buttons anywhere.
* **The detail is a report**, one sheet: file line, name, discipline,
  material, numbered sections; queue controls under the last section.
* **Proposals only hint** at what a topic gives, never what it opens. Once
  done, **Findings** (the hard-science world-building) and **Outcome**
  (the effect, plainly). Work orders say what they deliver up front.
* **Classification**: `SENSITIVE` (could be sold on the dark web), `CDF
  ONLY`, `OPV ONLY` (targeting: never sold).

## Captives and remains

* **Containment** (3 cells, $40k a month full or empty). Capture leads
  and won strikes bring thralls or vampires (taken from torpor).
* Vampires can be **destroyed** (remains to cold storage); thralls are
  human: **released**, or **turned** into informants ([covert.md](covert.md)).
* Remains travel only by helicopter; a jet team burns the bodies.

## The building

An **office building** (`sim/base/building.ts`): the Order hides in plain
sight.

* 3 × 3 × 3: a basement and two floors, the core (lift, stairs) in the
  middle, so each floor is a ring of 8; the ground-floor front middle is
  the fixed lobby: **23 buildable rooms**. Unbuilt rooms are ordinary
  offices. **Hangars** stand beside it, one aircraft each.
* **Synergy**: same-kind rooms in a line of 3 (along a side or stacked)
  +20% each, a pair +10%; the best grouping solved exactly. It speeds
  labs, workshops, fusion centres, containment and quarters.
* **Rooms**: quarters (8 beds; everyone at a base keeps one, hiring needs
  one free), lab, workshop, fusion centre, containment, SIGINT centre
  (listens like a station; level 2 after research), storage (one a base:
  the armoury, and where shipments go), the training rooms and the
  researched rooms ([research.md](research.md)).
* **Training rooms**, one of each a base: each whole week (168 hours in a
  row) an operative spends at home gives +1 in its aptitude, up to 70; any
  hour away restarts the week. Tradecraft academy, Battle academy, Chapel
  (Faith, after Pastoral theology).
* Clearing a room refunds nothing and is blocked while in use.
* **Padua starts** with storage and a fusion centre in the basement, a
  SIGINT centre upstairs, quarters, lab and workshop.
* **Not built**: the 3D cutaway view and raid maps (ASSET_LIST.md).

## People, aircraft and cargo

`sim/base/transfers.ts`, Phoenix Point style.

* **Capacity** is one number (helicopter 8): a person 1, remains or a
  captive 2, an armoury crate 0.25; a segmented load bar.
* **Ferry flights** move an aircraft and its load (space reserved at
  departure; they can turn in the air). **Airline transfers** move people
  ($3,000 a head). **Courier**: trauma kits only.
* After a fight with several aircraft, the **Haul** window shares captives
  and bodies between them; what doesn't fit is burned.
* Goods and artifacts are an Order-wide stock. No pilots; losing an
  aircraft loses everything aboard.

## Equipment

`data/equipment.ts`, `sim/people/equipment.ts`. Bought on the dark web
([economy.md](economy.md)), shipped to a base with storage in 40 hours;
researched items are made.

* Each operative has **two loadouts**, each a grid (hand, armour, helmet,
  two pockets, backpack; [inventory.md](inventory.md)): **Low viz**
  (plainclothes items only) and **Full tactical**. The team's kit picks
  which everyone takes (civilian: Low viz less all but a knife). Both hold
  real items, so stock is tied up in both.
* Edited in the base's **Armoury**: operatives on the left, the chosen
  loadout over the stock (drawn like the ground in battle, a stack a
  kind), what the loadout can't take dimmed.
* **Kit decides what goes**: civilian items with any kit, plainclothes
  items (pistols, compact SMG, soft vest, kits, magazines) with
  plainclothes or tactical, tactical items (long guns, plate carrier,
  helmet, incendiaries) only with tactical.
* A recruit's standard issue: a pistol, two magazines, a soft vest. Gear
  travels and dies with the operative; consumables are used up.

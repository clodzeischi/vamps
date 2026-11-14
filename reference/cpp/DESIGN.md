# Design

This document records what the game does, where each rule lives in the code,
and where it differs from the 1994 original, so you can tune it.

## Setting (hard sci-fi)

* Six bloodlines descend from Cathar *Perfecti* who survived the pyre at
  Montsegur in 1244. "Vampirism" is a retrovirus: it gives enormous tissue
  repair at the cost of haemophagy and photosensitivity.
* The **sigils** are 13th-century carvings that encode the infection's
  genealogy. Archaeology recovers them, Genetics decodes them, History traces
  the routes, and together they reveal the lairs.
* **Domination** is neurochemical: elders exhale engineered pheromones.
  Soldiers resist with **Will** (in place of Psi), the Neuro-Blocker, and
  sealed suits.
* **Daylight** matters. Vampires in direct sun take damage each turn and try
  to get under a roof. A body in torpor left in the sun for 3 turns is destroyed.

| Bloodline | Continent | Trait |
|---|---|---|
| House Ashgrove | N. America | PR campaigns +50% |
| The Huaca Line | S. America | rises from torpor a turn sooner, heals faster |
| The Carcassonne Perfecti | Europe | stronger domination; Vampire rank can dominate too |
| The Sahel Brood | Africa | thralls and fledglings +30% HP |
| The Jade Court | Asia | flights 30% harder to detect; soldiers spot them 4 tiles later |
| The Nullarbor Kin | Oceania | half damage from sunlight |

Table: [src/data/Bloodlines.cpp](../src/data/Bloodlines.cpp)

## The campaign loop

```
bloodline AI launches an operation ─▶ flight crosses radar ─▶ detected
        │                                                       │
        │ (PR campaigns and harvests appear automatically)      ▼
        ▼                                         interceptor forces it down
  mission site on the globe  ◀───────────────────── crash site
        │
  transport arrives ─▶ battlescape ─▶ debriefing: loot, captives, XP, politics
        │
  research (needs artefacts / captives) ─▶ new gear, lair locations
        │
  six lair assaults ─▶ "Montsegur Origin" ─▶ two-stage final mission ─▶ victory
```

### Operations ([src/strategy/BloodlineAI.cpp](../src/strategy/BloodlineAI.cpp))
Each surviving bloodline acts every 9–15 days at first, dividing by
`1 + 0.2 × month` (minimum 3 days). It picks one of:

| Operation | What happens if you do nothing |
|---|---|
| Feeding Run | flight lands near a city for 2–6 h, then −2 support |
| Infiltration | lands near the weakest nation's city, +20 infiltration (defects at 100) |
| Harvest | lands *in* a city: terror-style site for 10–16 h, −10 support, −3 secrecy |
| Supply Run | flies to the lair; shooting it down always yields that line's sigil |
| PR Campaign | a premiere or book launch at a city for 5–9 days, −10 support (×Ashgrove) |

Craft types unlock by month ([src/data/Craft.cpp](../src/data/Craft.cpp)).

### Detection and interception
* Radar is checked every 10 minutes: Listening Post 1500 nm / 10%, SIGINT
  Array 2200 nm / 20%, airborne craft 600 nm / 25% (Jade ×0.7, Blood Ledgers ×1.15).
  You lose contact when a flight leaves all coverage.
* Interception ([src/strategy/Interception.cpp](../src/strategy/Interception.cpp)):
  the original's stance window (Standoff / Cautious / Standard / Aggressive /
  Disengage). At ≤50% HP the flight is forced down and most of the crew
  survives. At 0 HP it is destroyed and only 20–40% survive. Over the sea it
  leaves nothing.
* Air engagements over land cost secrecy (−2, or −4 within 150 nm of a city).

### Politics ([src/strategy/Politics.cpp](../src/strategy/Politics.cpp))
* **Secrecy** (0–100, global). At 60+ the agency is clandestine. From 30 to
  59 it is under scrutiny and construction costs +25%. Below 30 it is
  **exposed**: funding −20%, and pro-vampire nations close their airspace and
  refuse bases. At 0 the game is lost. It recovers by 0.1 per day. It drops
  from city battles, civilian deaths, wrecks or harvests left alone, bodies
  left behind, and every black-market deal.
* **Support** (−100 to +100, per nation) is zero-sum between you and the
  vampires. Each month every bloodline pushes its own continent down by
  2–5 (×PR strength × difficulty) and everyone else by 0.3. You push back
  with mission wins (+5, harvests +10, PR events +8, a destroyed lair +15
  continent-wide) and a per-nation media budget (+2·√(budget/$50k) a month).
* **Funding** = base × clamp(0.6 + support/150, 0.1, 1.4) × difficulty.
* **Defection**: support ≤ −60 at month end, or infiltration 100.
* **Lose** if secrecy reaches 0, half the nations have defected, or you end
  two months in a row in debt.

### Economy ([src/strategy/Economy.cpp](../src/strategy/Economy.cpp))
Hiring costs and salaries follow the original: soldier $40k / $20k a month,
scientist $60k / $30k, engineer $50k / $25k. Aircraft are leased (Kestrel
$500k, Lancer $600k a month). Deliveries take 1–3 days. Transfers take
6 h + distance / 400 kn.

**Black market**: 3–5 rare items plus 1–2 mercenaries, rotated monthly at
1.5–2.5× price (×0.8 after Blood Ledgers). It buys artefacts at 1.6× market.
Each deal costs 1 secrecy, with a 10% chance of a further −5.

### Research ([src/data/Research.cpp](../src/data/Research.cpp))
Costs are in scientist-days, × difficulty (Easy 0.6, Normal 1.0, Hard 1.8),
× a hidden 0.8–1.2 roll. Progress is shown in vague terms, as in the
original. Daily breakthroughs (Easy 4%, Normal 2%, Hard 0.5%) add 30% to a
random project. The path to victory:

```
Vampire Remains ─▶ Remains Analysis ─┬─▶ Thermal Necrosis ─▶ Napalm Projector
                                     ├─▶ Torpor Physiology (captive) ─▶ Haemolytic Agent, Elder Physiology (elder captive)
Sigil fragment ─▶ Sigil Analysis ────┴─▶ Retroviral Lineage ─▶ Trace the <X> Line (needs X's sigil) ─▶ lair revealed
Albigensian Records + Sigil Analysis ─▶ Cathar Codex ─┐
all six lairs destroyed + Elder Physiology ───────────┴─▶ Montsegur Origin ─▶ final mission
```

### Difficulty ([src/data/Difficulty.cpp](../src/data/Difficulty.cpp))
Starting funds, funding multiplier, research and build speed, how often lucky
events and breakthroughs happen, enemy count and stats, and vampire PR
strength.

## Battlescape

### Rules ([src/tactical/](../src/tactical/))
| Rule | Value | File |
|---|---|---|
| Move | 4 TU straight, 6 diagonal, ×2 on rough ground, +4 to open a door, 8 for stairs | Pathfinding.cpp |
| Turn / kneel / stand | 1 per 45°, 4, 8 | Actions.cpp |
| Encumbrance | each point of weight over Strength costs 1 TU | BattleUnit.cpp |
| Accuracy | Firing × mode %, ×1.15 kneeling, ×0.8 two-hander with the other hand full, −5%/tile past range | Combat.cpp |
| Damage | 0–200% of power for bullets and blades, 50–150% for fire and explosions, minus front/side/rear armour (fire halves armour) | Combat.cpp |
| Reaction fire | Reactions × TU left / max TU; higher score gets a snap shot | Combat.cpp |
| Vision | 20 tiles in a ~100° cone; at night 9 for humans (14 with Night Optics) unless the target is lit; vampires always 20; smoke costs 3 tiles | Visibility.cpp |
| Morale | allies falling cost (110 − Bravery)/5; below 50 at turn start you may panic or go berserk | Battle.cpp |
| Domination | Elder Will + bloodline bonus + d40 vs soldier Will (+suit, +blocker) + d40; morale −50, 50% chance of berserk next turn | Combat.cpp |
| Torpor | vampire at 0 HP stands up after 2 turns (night) or 3 (day) at 40% HP | Battle.cpp |
| Permanent kill | incendiary damage that drops a vampire to 0, any incendiary damage on a body in torpor, or 3 turns of sun on a body | Combat.cpp, Battle.cpp |
| Fire | burns occupants for 5–15, spreads to flammable tiles, lasts 2–4 turns | Battle.cpp |
| Victory | no enemy still standing. Bodies in torpor become captives if you have containment space; otherwise they are incinerated | Debriefing.cpp |

### Maps ([data/maps/](../data/maps/))
A 4×4 grid of hand-made 10×10 blocks makes a 40×40 map with 2 levels (1
underground). Terrain comes from the site: city for harvests and PR events,
otherwise the biome (farmland, forest, desert, arctic, jungle). Lairs and the
catacombs are cave sets; Montsegur stage 1 is ruins. Edit the `.txt` files to
change maps; the legend is in `data/maps/README.txt`.

### Enemy AI ([src/tactical/EnemyAI.cpp](../src/tactical/EnemyAI.cpp))
1. Elders try domination.
2. Target the nearest visible soldier (vampires also go after civilians).
3. Armed units shoot (never through a friend); clawed units close in and strike.
4. With no target, units in daylight run for cover; the rest patrol and close
   in on the squad after turn 4.

## Differences from the 1994 original

* **Walls fill whole tiles** rather than tile edges, because edge walls read
  badly in ASCII.
* **No flying, falling, or destructible floors.** Walls, doors, windows,
  trees and crates can be destroyed.
* **Units are a cylinder** of radius 0.35 in their tile for hit tests, and
  shots are traced in 3D, so low walls and crates are real cover.
* The shot preview **warns when a friend is in the line of fire**. The
  original didn't.
* **One interceptor per engagement** (the original allowed several).
* The **Ufopaedia is replaced by the Archive** (completed research plus lore).
* **Melee is a full attack type** (claws, knives, machetes) with its own
  accuracy stat, as in TFTD.

## Not implemented yet

* Saving during a battle
* Base defence missions (vampires assaulting your base)
* The enemy turn is shown unit by unit, but movement isn't animated
* Monthly council score and rating (the score is tracked, not shown)
* Sound and real graphics (`ui/CellGrid` and `ui/Theme.h` are the hooks)
* Balance has only been tested by the automated squad in `tests/smoke_test.cpp`.
  With a careless bot, early missions are won about 40–50% of the time;
  lairs and Montsegur are meant to need researched gear.

## Where to change things

| To change… | Edit |
|---|---|
| weapons, armour, prices, build costs | `src/data/Items.cpp` |
| enemy stats, loot, bloodline traits | `src/data/Bloodlines.cpp` |
| research costs and prerequisites | `src/data/Research.cpp` |
| facilities, aircraft | `src/data/Facilities.cpp`, `src/data/Craft.cpp` |
| difficulty | `src/data/Difficulty.cpp` |
| how often the bloodlines act | `hourlyBloodlines()` in `src/strategy/BloodlineAI.cpp` |
| secrecy / support numbers | `src/strategy/Politics.cpp`, `src/tactical/Debriefing.cpp` |
| enemy squad composition | `Battle::rollEnemyRoster()` in `src/tactical/Battle.cpp` |
| colours | `src/ui/Theme.h`, `src/tactical/Tiles.cpp`, `src/ui/GlobeView.cpp` |
| maps | `data/maps/*.txt` |

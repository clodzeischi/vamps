# Intelligence: desks, efforts, closed countries, staff with traits

**Status: proposal, not decided.** Nothing here is built. It touches
[base.md](base.md) (staff, rooms), [covert.md](covert.md) (HUMINT assets),
[geoscape.md](geoscape.md) (support, detection, teams) and
[research.md](research.md) (rooms, materials). Those docs are updated only
once the points below are agreed.

## Aims

* **Three programmes side by side**: Science (research), Engineering
  (manufacture) and **Intelligence**. Intelligence is the new one. Science
  is already well covered by the X-COM games and Phoenix Point, so
  Intelligence is where this game is different.
* **All three are Order-wide.** Projects, production and desks aren't tied
  to a base. Bases give room and capacity, not a separate queue each.
* **The whole map is in play.** About 60% of the globe (Asia, Russia, the
  Middle East) is out of the game today: support 0 or below means no
  building, and the Jade Court's ten regions have only one place to build
  (Japan, Korea and Taiwan). The player needs a way, and a reason, to get
  into a closed country without a base, and to win it over.
* **People, not headcount.** Key staff are named officers with
  traits, as leaders are in Master of Orion 2. Whom you hire and where you
  put them is a decision.

A note on names: **intel** already means a house's knowledge meter (0–100,
lairs at 100). This proposal uses **Intelligence** for the programme,
**effort** for what officers produce, and keeps "intel" for the meter.

## 1. Order-wide programmes

| | Today | Proposed |
|---|---|---|
| Where staff work | At one base, assigned to a project there | Order-wide, assigned to a project, line or desk |
| Capacity | Lab 10 scientists, workshop 10 engineers, at that base | Each lab adds 10 scientist places to the Order, each workshop 10 engineer places, each **operations room** (new) 6 officer places |
| Beds | Staff take beds at their base | Unchanged: staff live at a base and need a bed. Their *work* isn't local |
| Materials | Must be at the base doing the project | Must be at **a base with the needed room** (remains at a base with a BSL-4 suite, documents at a base with an Archive) |
| Room gates ([BSL-4] etc.) | That room at the base doing the work | That room somewhere in the Order, with the material there |
| Synergy | Speeds that base's projects | Each room's synergy adds to the Order's capacity: a lab in a line of 3 counts as 12 places, not 10 |
| Manufacture | Built at a base, into its armoury | One Order-wide queue; each order names the base it ships to (40 h, like the dark web) |
| Losing a base | Its staff and projects | Staff living there are lost; capacity falls, and projects over capacity slow down. Nothing in progress is lost |

The fall of Padua still hurts: the staff living there are lost (minus
whoever the battle for Padua saves), and so is its capacity. What changes is
bookkeeping: the player no longer re-assigns projects base by base.

## 2. Intelligence: desks and lines of effort

Detection stays as it is. SIGINT stations, centres and informants **hear**
operations, and the region a station is in still decides which house it
listens to. Intelligence adds the **active** half: officers go looking for
people and places.

### Desks

* A **desk** covers one region. The player opens one on any region, even one
  with no presence at all. Opening one is free; its officers cost their
  salaries.
* Officers are assigned to desks (any number, within the Order's officer
  capacity).
* Each desk splits its effort across four **lines of effort** with
  sliders that add up to 100%:

| Line of effort | Looks for | What it turns up |
|---|---|---|
| **Targeting** (kinetic/lethal) | The house's people and places: safehouses, personas, thralls, couriers | Site leads (nest, den, haven); **personas** (below); intel on the house; with high intel, the lair sooner |
| **HUMINT: informants** | People who see things | Informant candidates (a source lead to recruit, as today) |
| **HUMINT: access** | People who can get us in: officials, smugglers, fixers | Access and Ratline candidates; later a **safe house** offer |
| **HUMINT: influence** | People who shape opinion: editors, clergy, politicians, police chiefs | PR candidates and **patrons** (below); a small daily support drift |

What a desk finds arrives as a lead, as today: a person to meet, with a
story, recruited by an agent who travels there (Tradecraft roll, doubles
possible). Intelligence finds people; agents still have to go and recruit
them. Doubles stay the risk.

### How much a desk finds

Each line of effort rolls daily, as detection does:

```
chance a day = 1 − e^(−effort × presence × fit / 60)
effort  = sum over the desk's officers of (level × that line's share)
presence: remote (nothing there) ×0.5, an asset in the region ×1,
          a station or base ×1.25, a partner country (below) ×1.5
fit     = the line's own modifier (e.g. influence is harder where support
          is very low, informants easier where a house's operations hurt)
```

Rough feel (to be set with `npm run batch`): 3 level-1 officers all on
informants in a region with one asset turn up about 1.5 candidates a month.
The same 3 working remotely turn up about one every 40 days.

**Personas** (new, from Targeting): a named member of a house's network
("the shipping agent in Busan"). A persona is watched, not struck. While a
desk keeps Targeting on it, it adds intel each week and has a daily chance
to lead to a site. Strike the site or act on the persona (capture lead):
the persona is used up. Ignore it and it moves on after 30–45 days.

**Patrons** (new, from Influence): an access asset with standing, such as a
minister, a bishop or a police commissioner. A patron makes support drift
+0.01 a day and makes the region's **settling point** move (section 3). A
patron is expensive ($60–100k a month) and gets asset calls at twice the
usual rate.

### Fit with what exists

* The four asset kinds stay. The desk's lines are how they're found:
  informants come from informant effort; Access and Ratline from access
  effort; PR and patrons from influence effort.
* Volunteers keep coming forward unprompted. Desks make finding people a
  choice instead of luck.
* The priority house is still set by where stations stand. Desks let the
  player add a second priority by choice, even in a region with no station.

## 3. Closed countries: getting in and winning them over

### Standing

Standing is read from support and the assets the Order holds, with **no new
meter**:

| Standing | When | What the Order can do |
|---|---|---|
| **Closed** | No access asset; support 0 or below | A remote desk (×0.5). Agents travel unarmed on airlines and recruit whom the desk finds |
| **Penetrated** | An access asset in the region | Armed teams by **expeditionary operation** (below). A ratline can add a **safe house** |
| **Open** | Support +1 or more | Installations can be built (today's rule) |
| **Partner** | Support +3 and a **concordat** signed | The concordat's benefits; the region's gains last |

The ladder suits Europe after the fall as well: closed Europe in Act II is
played with the same tools.

### Why gains last: the settling point

Today support settles back toward the region's starting value, so pushing a
closed country up is a short-term rental. Proposed:

* Each region has a **settling point** (its starting support today).
* Each patron held for a full month moves it up 0.25 (most +2 from patrons).
* A **concordat** sets it to at least +3 for as long as the concordat holds.
* A house's results can move it back down: a patron killed or exposed,
  a concordat broken by a scandal at secrecy 0.

### The concordat

Offered by an event when a region first reaches +3 while the Order holds a
patron there. It costs money and one judged event with the region's
officials, then gives:

* **General**: settling point +3; pledge base 150%; the host nation's police
  share (+0.3 hearing across the region, no station needed); cover-ups there
  cost half; armed teams can go in without an access asset; local recruits
  join the monthly pool.
* **Its own benefit**, one per region. The Jade Court's regions
  (draft):

| Region | Benefit |
|---|---|
| Japan, Korea and Taiwan | Electronics: optics, sensors and drones are made at 80% cost and time, Order-wide |
| South Asia | Universities: +2 scientist and +2 engineer candidates a month; their salaries −25% |
| North China, South China | Ministry of State Security liaison: hearing ×1.5 in all of China; Jade operations there −25% |
| West China and Tibet | Monasteries keep the old records: Jade history topics −50% points |
| Mainland Southeast Asia | Mekong smugglers: local kit for expeditionary operations anywhere in Asia −40% |
| Central Asia and Mongolia | Old Soviet airfields: our jets refuel there free; reach +30% in Asia |
| Siberia and the Russian Far East | Space: a satellite downlink, every station in Asia ×1.25 |

The other closed regions (Russia, the Middle East) get their own entries
once the shape is agreed.

### The incentive to go in

1. **Money and staff** from the concordats above, and the pledges.
2. **Losing**: half the regions hostile loses the game. Asia, Russia and
   the Middle East are already most of the way there. Holding them is
   defence.
3. **The Jade Court gets stronger if left alone.** Its feeding level rises
   unchecked ([research.md](research.md)), and at feeding 90+ its operations
   in Japan, Korea and Taiwan double. That's the one region where it has
   a foothold in the open world.
4. **Jade traits** (thermal-dark vampires, [tactical.md](tactical.md)) and its
   research topics only open with contact (see research.md, "contact with
   the houses").

## 4. Expeditionary operations

Getting an armed team into a country without a base or helicopter
reach. Possible once the region is **Penetrated** (an access asset), or a
**partner**.

1. **Infiltrate.** Agents fly in on airlines, unarmed and in civilian clothes
   (today's commercial flight), any number, 8 h prep plus a day in country.
   The access asset meets them.
2. **Buy the kit locally.** The access asset (or a fixer) gets the op's kit:
   a short catalogue by region (**arms market**: restricted, ordinary or
   open; China is restricted, so pistols, SMGs and shotguns but no rifles or
   explosives). Price ×1.5 list, ready in 2–4 days, secrecy −0.2 per weapon.
   The kit is bound to the op and never enters an armoury.
3. **Hit.** The strike plays as usual. There's no helicopter, so the haul is
   on foot (as a jet team today).
4. **Exfiltrate: choose what to bring out.** After the fight the Haul window
   becomes an **exfil** window. Everything has an exfil price by ratline:

| Item | Exfil by ratline |
|---|---|
| Agents | $5k each, 3–6 days; or by airline, clean, the next day, dropping all kit |
| Kit (per crate, load 0.25) | $15k |
| Evidence | $2k (fits in a pocket) |
| Remains | $50k (cold chain), needs a ratline |
| A captive | $80k and a 15% chance the ratline is burned |
| Money seized | 20% kept by the ratline |

What isn't paid for is dumped and burned. Without a ratline, only agents
(by airline, clean) and evidence come out.

### The safe house

* Offered by a ratline asset after a successful exfil. $150k, then $40k
  a month.
* Agents can wait in it (up to 6) between ops, so the next op skips the
  infiltration.
* **Kit can be left there** instead of exfiltrated. Caching becomes the cheap
  option, and the next op in the region reuses it.
* It's a target. Each month there's a chance (higher with noise in the
  region, lower with counter-intelligence) the house finds it: an ambush
  lead, or a raid if agents are in it. Lost: everything cached.
* A safe house is the first step to a base: once the region opens (+1), it
  can be converted into a base at a discount.

## 5. Staff with traits (Master of Orion 2 style)

### Two kinds of staff

Giving traits to every one of 40 scientists is noise: +20% on one person in
forty doesn't show, and the player would have to manage 40 cards. So:

* **Staff** (scientists, engineers, analysts) stay as they are: named, a
  salary, no stats, counted as capacity. They do the work.
* **Leads** are the officers: rare, named, with portraits, 1–2 traits and a
  level that grows with use (as agents' stats do). They are what the
  player chooses.
  * Science: **principal investigators**, one per project at most.
  * Engineering: **chief engineers**, one per production line or room.
  * Intelligence: **desk officers**. Here *every* officer is a lead, since a
    desk has only a few.

A lead's traits apply to the work it leads (a project, a line, a desk).
A few rare **director** traits apply Order-wide, and only one director
per programme counts.

### Hiring

* A monthly pool of 1–2 leads per programme (6 staff candidates as now).
  The traits show before hiring, as in MoO2.
* A hiring fee ($30–80k by traits and level), then a salary (about twice a
  staff salary).
* Leads can be lost: killed in a base raid, burned (an intelligence officer
  exposed), or **turned**. One officer in about 20 is a house's mole, and a
  counter-intelligence trait or research finds them.

### Traits (draft)

Most are positive. About one candidate in four also has a **flaw**, which
makes for cheaper hires and more interesting choices.

**Science**

| Trait | Effect |
|---|---|
| Virologist | Topics in the Body branch +20% points |
| Forensic scientist | Forensics and INTERPOL topics +20% |
| Palaeographer | History topics +25%; chronicle entries 5 intel sooner |
| Theologian | Theology topics +25% |
| Forensic accountant | Old money topics +20%; ledgers +5 intel |
| Lab manager | Repeatable projects (interrogation, exploit evidence) −25% time |
| Lucky | Doubles the breakthrough chance on its project |
| Published | Research sold +30%, but goes public 15 days sooner |
| *Director:* Dean | All research +8% |

**Engineering**

| Trait | Effect |
|---|---|
| Ballistics | Ammunition made at 80% cost and time |
| Armourer | Armour made at 80% cost and time |
| Optician | Optics, sensors and lamps −20% |
| Pyrotechnician | Fire, flash and UV grenades −20%; 1 in 10 batches yields +1 |
| Tissue chemist | Items made from remains use 25% fewer |
| Production engineer | Its line +15% speed |
| *Director:* Quartermaster | All manufacture materials −10% |

**Intelligence**

| Trait | Effect |
|---|---|
| SIGINT | Hearing in its desk's region +15% |
| Targeteer | Targeting effort ×1.3; site leads it finds last 25% longer |
| Agent handler | Informant and access effort ×1.3; recruiting there +10 Tradecraft |
| Diplomat | Influence effort ×1.3; concordat events easier |
| Linguist (Mandarin, Arabic, Russian, Hindi, Japanese…) | ×1.5 effort at desks in regions speaking it; ×0.8 elsewhere |
| Counter-intelligence | Doubles from its desk halved; can screen other officers for moles |
| Fixer | Local kit for expeditionary operations in its region −30% |
| Ratline runner | Exfil in its region −40% |
| *Director:* Station chief | All desks +10% effort |

**Flaws**

| Flaw | Effect |
|---|---|
| Drinks | 5% a month it misses the month |
| Talks to journalists | Secrecy −0.2 a month |
| Ambitious | Asks for a raise every 4 months; refused, it leaves |
| Old school | Its traits ×1.25, but it won't lead a desk in a partner country |
| Compromised past | Cheap; 3× the usual chance to be turned |

### Levels

Leads start at level 1–3 and gain a level after about 60 days of work (cap
5). Level multiplies output (desk effort is officer level) and trait
effects grow by a quarter a level beyond 1. A level-5 Linguist on the
Mandarin desk is a real asset: losing them to a raid should hurt.

## What it changes in code

* `GameState.staff` loses its base for work (it keeps the base it lives
  at). `sim/research.ts` runs one Order-wide list of projects. The
  production queue (research.md, build step 1) is Order-wide.
* New `sim/intelligence.ts`: desks, efforts, daily rolls, personas,
  patrons. Candidates feed the existing source leads (`sim/humint.ts`).
* Regions get `settle` (the settling point) and `concordat`;
  `sim/economy.ts` settles support toward `settle`.
* Expeditionary operations: a new dispatch path in `sim/missions.ts` (no
  aircraft, op-bound kit), an exfil window replacing Haul for them, and safe
  houses as a light installation.
* Leads (officers) as `GameState.officers` with traits from
  `data/officers.ts`.
* A state version bump with migrations: existing staff keep working; each
  existing project becomes Order-wide.
* Bots (`sim/bot.ts`) need desk assignments and expeditionary use, or batch
  results drift.

## Build order

1. Order-wide science and engineering (with the production queue).
2. Desks and lines of effort on top of today's assets.
3. Officers with traits (intelligence first, then science and engineering
   leads).
4. Standing, settling points and concordats.
5. Expeditionary operations, exfil and safe houses.
6. Balance with `npm run batch`.

## Open questions

* **Who gets traits?** The recommendation above is leads only, with
  staff as capacity. The alternative is a trait on every staff member,
  with effects on their own contribution only. That's simpler to explain,
  but nearly invisible in play.
* **Desk size**: one region per desk, or one per house's homeland with the
  region chosen inside it? Per region is more precise; per homeland is
  fewer screens.
* **Funding in Asia**: China's funding weights (200 and 250) are a quarter of
  Germany's (1000). If concordats are to be worth it, Asian weights should
  probably rise.
* **Feeding and the Jade threat** depend on the feeding mechanic in
  research.md, which isn't built yet.
* **Exfil of agents**: can the ratline fail with an agent in it (a capture,
  like an unarmed double), or is it only money and time?
* **UI**: an Intelligence screen (desks on the globe, sliders, officers) next
  to Research and Engineering. Shortcut I?

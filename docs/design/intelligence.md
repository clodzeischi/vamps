# Intelligence: desks, efforts, closed countries, staff with stats

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
* **Queues, as in Phoenix Point.** Research is one Order-wide queue.
  Engineering is one queue per base.
* **The whole map is in play.** About 60% of the globe (Asia, Russia, the
  Middle East) is out of the game today: support 0 or below means no
  building, and the Jade Court's ten regions have only one place to build
  (Japan, Korea and Taiwan). The player needs a way, and a reason, to get
  into a closed country without a base, and to win it over.
* **HUMINT pays.** Today it is expensive and risky for what it gives
  (section 3).
* **People with stats.** Every scientist, engineer and analyst has a skill
  and an aptitude, and each department has one **lead**. Whom you hire,
  and whom you put in charge, is a judgment call: "I need an aviation
  engineer to get this helicopter built", "I need a virologist to get this
  long project over the line".

A note on names: **intel** already means a house's knowledge meter (0–100,
lairs at 100). This proposal uses **Intelligence** for the programme,
**effort** for what analysts produce, and keeps "intel" for the meter.

## 1. Queues: research Order-wide, engineering per base

### Research: one queue for the Order

Several labs around the world can work on the same question, so research
is Order-wide.

* **One queue.** All research points (every scientist at every base) go to
  the **top** topic. When it's done, the next one starts. The player
  reorders the queue at any time; progress on a topic that moves down is
  kept.
* **Blocked topics are skipped.** A topic whose material isn't at a base
  with the needed room (remains at a base with a BSL-4 suite, a captive in
  containment) is marked blocked, and the points go to the next one.
* **Capacity**: each lab holds 10 scientists. Synergy speeds that lab's
  scientists, as today.
* **Repeatable topics** (interrogation, exploit evidence) sit in the queue
  like any other, with a count ("× 3", or "repeat while material lasts").
* **Losing a base**: its scientists and their points are lost, and the
  queue goes on with fewer. Nothing in progress is lost.

### Engineering: one queue per base

A magazine is made in one place, so engineering stays **at the base**.
Engineers, their aptitudes and the lead engineer are **decided**: see
[base.md](base.md), "Engineers".

* Each base's workshops have their own queue: an item, a quantity, the
  engineer points and materials for each unit. The base's engineers work
  the **top** order, and units go to that base's armoury as each one is
  finished.
* An order can name **another base to ship to** (40 h, as the dark web).
* Materials come from Order-wide stock (money), except remains, which must
  be at that base.
* Some orders need a facility at that base: a helicopter needs a free
  hangar, a lumen lamp needs nothing special.
* Engineers move between bases by transfer, as today. Moving an aviation
  engineer to the base that's building a helicopter is a real decision.

## 2. Intelligence: desks and lines of effort

Detection stays as it is. SIGINT stations, centres and informants **hear**
operations, and the region a station is in still decides which house it
listens to. Intelligence adds the **active** half: analysts go looking for
people and places.

### Desks

* A **desk** covers one region. The player opens one on any region, even one
  with no presence at all. Opening one is free; its analysts cost their
  salaries.
* Analysts are assigned to desks, within the Order's analyst capacity (an
  **operations room**, new, holds 6). Unlike the queues, desks are
  assigned by hand: a desk is a place, not a task.
* Each desk splits its effort across four **lines of effort**, with
  sliders that add up to 100%:

| Line of effort | Looks for | What it turns up |
|---|---|---|
| **Targeting** (kinetic/lethal) | The house's people and places: safehouses, personas, thralls, couriers | Site leads (nest, den, haven); **personas** (below); intel on the house; with high intel, the lair sooner |
| **HUMINT: informants** | People who see things | Informant candidates |
| **HUMINT: access** | People who can get us in: officials, smugglers, fixers | Access and Ratline candidates; later a **safe house** offer |
| **HUMINT: influence** | People who shape opinion: editors, clergy, politicians, police chiefs | PR candidates and **patrons** (below); a small daily support drift |

What a desk finds arrives as a lead, as today: a person to meet, with a
story, recruited by an agent who travels there. Intelligence finds people;
agents still go and recruit them. A desk also **vets** what it finds
(section 3).

### How much a desk finds

Each line of effort rolls daily, as detection does:

```
chance a day = 1 − e^(−effort × presence × fit / 60)
effort  = sum over the desk's analysts of (skill × that line's share),
          ×1.5 for an analyst whose aptitude matches the line
presence: remote (nothing there) ×0.5, an asset in the region ×1,
          a station or base ×1.25, a partner country (below) ×1.5
fit     = the line's own modifier (e.g. influence is harder where support
          is very low, informants easier where a house's operations hurt)
```

Rough feel (to be set with `npm run batch`): 3 average analysts all on
informants, in a region with one asset, turn up about 1.5 candidates a
month. The same 3 working remotely turn up about one every 40 days.

**Personas** (new, from Targeting): a named member of a house's network
("the shipping agent in Busan"). A persona is watched, not struck. While a
desk keeps Targeting on it, it adds intel each week and has a daily chance
to lead to a site. Strike the site or act on the persona (capture lead):
the persona is used up. Ignore it and it moves on after 30–45 days.

**Patrons** (new, from Influence): an access asset with standing, such as a
minister, a bishop or a police commissioner. A patron makes support drift
+0.01 a day and moves the region's **settling point** (section 4). Patrons
are expensive ($60–100k a month) and get asset calls at twice the usual
rate.

### Fit with what exists

* The four asset kinds stay. The desk's lines are how they're found:
  informants from informant effort; Access and Ratline from access effort;
  PR and patrons from influence effort.
* Volunteers keep coming forward unprompted. Desks make finding people a
  choice instead of luck.
* The priority house is still set by where stations stand. Desks let the
  player add a second priority by choice, even in a region with no station.

## 3. HUMINT: make it pay

### What's wrong today

From the code (`sim/humint.ts`):

* **Getting an asset is luck.** Candidates come only from source leads
  (SIGINT, informants, volunteers), so the player can't go looking in a
  chosen region.
* **Every meeting risks an agent.** 8–25% of source leads are doubles, and
  a double always compromises the agent: an unarmed one is taken unless
  a ratline gets them out. Then the pitch is Tradecraft vs 45, so about a
  coin flip for an average agent, and one try only.
* **Keeping one is risky.** About one call every 50 days, ×1.5 in a living
  house's homeland and up to ×2 at low secrecy: one every ~17 days in a
  homeland at secrecy 0. Hard failures burn the asset; some burn every
  asset in the region (secrecy −2). Ignoring a call loses the asset 15% of
  the time.
* **The payoff is small, and never grows.** An informant hears at 0.2 (40%
  of a station for about a fifth of its cost: good on paper). But a PR asset
  gives +0.004 support a day, about +0.12 a month, a third of the
  quietest media campaign. Access and Ratline matter only in edge cases.
  An asset in its tenth month is worth what it was in its first.

### Proposed

**Safer to recruit**

* **Vetting.** A desk vets each candidate it finds. Vetting takes 3–7 days
  (faster with handling effort and a counter-intelligence analyst). A vetted
  candidate is marked *vetted*, and its chance of being a double is cut to
  a third. The player can skip vetting and go at once, at full risk.
* **Doubles from informants** drop from 15% to 8%, the same as SIGINT.
  Volunteers stay at 25%. Strangers who walk in are the risk.
* **The pitch becomes a judged event** ([covert.md](covert.md) already lists
  it as "not judged yet"), with the story hinting at the approach. A failed
  pitch isn't final: the candidate can be approached once more after 10
  days.

**Safer to keep**

* Calls every 75 days, not 50.
* Only *very hard* failures burn every asset in the region.
* An ignored call costs the asset a level (below), not a 15% chance of
  losing it.

**Worth more, and more with time**

Assets gain **levels** with service, as agents do with experience:

| Level | After | Effect |
|---|---|---|
| Fresh | recruited | As today |
| Proven | 60 days | Hearing and support ×1.5; its leads' doubles halved |
| Trusted | 150 days | Hearing and support ×2; its own perk (below) |

| Asset | Trusted perk |
|---|---|
| Informant | Can tip a site straight away (a site lead once a month at most) |
| Access | Arranges local kit for expeditionary operations at ×1.2, not ×1.5 |
| PR | Its region's settling point +0.5 while it serves |
| Ratline | Exfil along it at half price; a captive gets out without the burn risk |

A trusted asset is worth protecting, and losing one hurts. PR's base effect
rises to +0.01 a day (+0.3 a month, about a quiet media campaign).

## 4. Closed countries: getting in and winning them over

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
* The house's results can move it back down: a patron killed or exposed,
  a concordat broken by a scandal at secrecy 0.

### The concordat

Offered by an event when a region first reaches +3 while the Order holds a
patron there. It costs money and one judged event with the region's
officials, then gives:

* **General**: settling point +3; pledge base 150%; the host nation's police
  share (+0.3 hearing across the region, no station needed); cover-ups there
  cost half; armed teams can go in without an access asset; local recruits
  and staff candidates join the monthly pools.
* **Its own benefit**, one per region. The Jade Court's regions (draft):

| Region | Benefit |
|---|---|
| Japan, Korea and Taiwan | Electronics: optics, sensors and drones made at 80% cost and time at every base |
| South Asia | Universities: +2 scientist and +2 engineer candidates a month; their salaries −25% |
| North China, South China | Ministry of State Security liaison: hearing ×1.5 in all of China; Jade operations there −25% |
| West China and Tibet | Monasteries keep the old records: Jade history topics −50% points |
| Mainland Southeast Asia | Mekong smugglers: local kit for expeditionary operations anywhere in Asia −40% |
| Central Asia and Mongolia | Old Soviet airfields: our jets refuel there free; reach +30% in Asia |
| Siberia and the Russian Far East | A satellite downlink: every station in Asia ×1.25 |

The other closed regions (Russia, the Middle East) get their own entries
once the shape is agreed.

### The incentive to go in

1. **Money and staff** from the concordats above, and the pledges.
2. **Losing**: half the regions hostile loses the game. Asia, Russia and
   the Middle East are already most of the way there, so holding them is
   defence.
3. **The Jade Court gets stronger if left alone.** Its feeding level rises
   unchecked ([research.md](research.md)), and at feeding 90+ its operations
   in Japan, Korea and Taiwan double. That's the one region where it has
   a foothold in the open world.
4. **Jade's traits** (thermal-dark vampires, [tactical.md](tactical.md)) and
   its research topics only open with contact (research.md, "contact with
   the houses").

## 5. Expeditionary operations

How an armed team gets into a country without a base or helicopter reach.
Possible once the region is **Penetrated** (an access asset), or a
**partner**.

1. **Infiltrate.** Agents fly in on airlines, unarmed and in civilian
   clothes (today's commercial flight), any number, 8 h prep plus a day in
   country. The access asset meets them.
2. **Buy the kit locally.** The access asset (or a Fixer analyst at the
   desk) gets the op's kit: a short catalogue by region (**arms market**:
   restricted, ordinary or open; China is restricted, so pistols, SMGs and
   shotguns but no rifles or explosives). Price ×1.5 list, ready in 2–4
   days, secrecy −0.2 per weapon. The kit is bound to the op and never
   enters an armoury.
3. **Hit.** The strike plays as usual. There's no helicopter, so the haul is
   on foot, as with a jet team today.
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

## 6. Staff with stats, and the department lead

**Engineers are decided** ([base.md](base.md), "Engineers"): four aptitudes
rolled like an operator's (ballistics, avionics, electronics, chemistry),
items with requirements over them, and a lead engineer whose aptitudes
multiply the rest of the base's (aptitude / 50). The rest of this section
is still a proposal for scientists and analysts, and should follow the same
model once they're taken up.

Every scientist, engineer and analyst is a person with stats. With queues,
there's no per-project assignment to manage: **the stats are a hiring
decision** (who to take from the pool, who to transfer where), and the
**lead** is the one lever during play.

### Stats

| Stat | Values | Effect |
|---|---|---|
| **Skill** | 1.0–2.0 points a day (mean 1.5, today's rate) | Their contribution to any work. Grows +0.1 every 90 days worked, to 2.5 |
| **Aptitude** | One field (a few have two at lower skill; a few have none and higher skill) | ×1.5 their own points on matching work |
| **Quirk** | About 1 in 4; good or bad | Below |

Salary follows skill: about $8k at 1.0 to $18k at 2.0 (which also answers
research.md's open question on salaries: the average is about $12k).

### The lead

* Each department has **one lead**: the research queue one for the Order,
  each base's workshop one, each desk one (its **desk chief**).
* The lead's aptitude applies to the **whole department**: matching work
  +25% for everyone. In engineering, matching items also cost 20% less in
  materials (an aviation lead's helicopter costs less as well as coming
  sooner).
* A new lead takes **5 days** to take effect, so swapping leads every time
  the top of the queue changes doesn't pay. Choosing a lead is planning.

### Aptitudes (draft)

| Science | Matches |
|---|---|
| Virology | The body: virology, physiology, strains, provirus |
| Forensics | Forensics and INTERPOL |
| Signals | Signal topics, network analysis, ISR |
| Palaeography | History, archives, the houses' histories |
| Theology | Theology, the Exercises, discernment |
| Finance | Old money, ledgers |
| Materials | Armour, optics, UV and laser topics |

| Intelligence | Matches |
|---|---|
| SIGINT | +15% hearing in its desk's region |
| Targeting | Targeting effort |
| Handling | Informant and access effort; vetting faster |
| Influence | Influence effort; concordat events easier |
| Counter-intelligence | Vetting; doubles from its desk halved; screens colleagues for moles |
| Language (Mandarin, Arabic, Russian, Hindi, Japanese…) | ×1.5 on every line at desks in regions that speak it |

### Quirks (draft)

| Quirk | Effect |
|---|---|
| Lucky | Breakthroughs (base.md) twice as likely while they're on the work |
| Administrator | As lead, +10% to all the department's work, matching or not |
| Fixer (analyst) | Local kit for expeditionary operations in its desk's region −30% |
| Ratline runner (analyst) | Exfil in its desk's region −40% |
| Published (scientist) | Research sold +30%, but goes public 15 days sooner |
| Drinks | 5% a month they miss the month |
| Talks to journalists | Secrecy −0.2 a month |
| Ambitious | Asks for a raise every 4 months; refused, leaves |
| Compromised past | Cheap; 3× the chance of being turned |

### Hiring and losing

* The monthly pools (6 scientists, 6 engineers, now 4 analysts) show each
  candidate's skill, aptitude and quirk before hiring.
* Staff can be lost: killed in a base raid, walking out in debt, or
  **turned**. About 1 in 20 is or becomes a house's mole. A
  counter-intelligence analyst can find them.

## What it changes in code

* `sim/research.ts`: one Order-wide research queue; points from every lab;
  blocked topics skipped.
* Engineering: a queue per installation (with research.md's production
  queue, build step 1).
* `GameState.staff`: each member gets skill, aptitude, quirk and a kind
  (scientist, engineer, analyst). Each department stores its lead's id.
* New `sim/intelligence.ts`: desks, efforts, daily rolls, vetting, personas,
  patrons. Candidates feed the existing source leads (`sim/humint.ts`).
* `sim/humint.ts`: asset levels and perks, call rate, double shares, the
  judged pitch.
* Regions get `settle` (the settling point) and `concordat`;
  `sim/economy.ts` settles support toward `settle`.
* Expeditionary operations: a new dispatch path in `sim/missions.ts` (no
  aircraft, op-bound kit), an exfil window replacing Haul for them, and safe
  houses as a light installation.
* A state version bump with migrations: existing staff get rolled stats;
  running projects go into the queues in their current order.
* Bots (`sim/bot.ts`) need queue orders, desk assignments and expeditionary
  use, or batch results drift.

## Build order

1. The queues: research Order-wide, engineering per base (with the
   production queue).
2. Staff stats and leads.
3. The HUMINT fixes (levels, vetting, calls): these help even before desks.
4. Desks and lines of effort.
5. Standing, settling points and concordats.
6. Expeditionary operations, exfil and safe houses.
7. Balance with `npm run batch`.

## Open questions

* **How many regions?** 48 today. X-COM: UFO Defense had 16 funding
  nations (and about a dozen land zones for scoring), XCOM: Enemy Unknown
  16 countries. We're three times that. The count matters where the player
  pays or decides per region: stations, desks, assets, and the loss rule
  (24 hostile). Low-value splits are the weak spot: Russia is six regions
  with funding 80–300. Recommendation: merge Russia to two (European Russia;
  Siberia and the Far East), and Canada and Australia to one each, which
  gives 42. Keep the rest.
* **Desk size**: one region per desk, or one per house's homeland with the
  region chosen inside it?
* **Funding in Asia**: China's funding weights (200 and 250) are a quarter of
  Germany's (1000). If concordats are to be worth it, Asian weights should
  probably rise.
* **Feeding and the Jade threat** depend on the feeding mechanic in
  research.md, which isn't built yet.
* **Exfil of agents**: can a ratline fail with an agent in it (a capture,
  like an unarmed double), or is it only money and time?
* **UI**: an Intelligence screen (desks on the globe, sliders, analysts)
  next to Research and Engineering. Shortcut I?

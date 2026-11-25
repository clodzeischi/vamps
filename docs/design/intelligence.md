# Intelligence: the houses' networks, analysts, and the hunt

**Status: steps 1–4 built (`sim/networks.ts`, `sim/intel.ts`); closed
countries and the rest of section 6 decided, not built.** Replaces the earlier proposal (desks and lines of effort). Touches [story.md](story.md) (the intel meter, the fall,
chronicles), [geoscape.md](geoscape.md) (detection, leads, sites),
[covert.md](covert.md) (HUMINT agents) and [base.md](base.md) (staff).
Those docs change as each step is built.

The purpose of intelligence is to drive missions: to find the houses'
sites and decide which to hit. It follows the targeting loop: **find** a
sign of activity, **fix** it into a place you can act on, **finish** it (the
raid), **exploit** the site, and climb to the next one.

## 1. The houses are real networks

At the start of the campaign each of the six houses has a network that
exists whether the player sees it or not:

* **The lair**: the elder, where they sleep (today's haven is folded into
  it).
* **3 dens** under the lair.
* **2–4 nests** under each den.
* Every site has **personnel**, as our bases do: hunters, recruiters,
  couriers, security, PR people, a financier at a den or above, thralls.

A site's details (address, names, the story of it) are generated the first
time the player touches it, from a seed of its own, so saves stay small and
deterministic.

### Activities and what sees them

Personnel do things, and what they do can be detected. Each role's
activities lean toward one or two disciplines:

| Role | Does | Most often seen by |
|---|---|---|
| Hunter | Feeding: disappearances, bodies | OSINT (missing persons, the press), HUMINT (police) |
| Recruiter | Thralls, "paid donors", the cult-like pitch | HUMINT, OSINT (adverts, social media) |
| Courier | Moves blood, money, messages | SIGINT (phones), HUMINT (logistics) |
| Security | Guards, counter-surveillance | SIGINT; raises the site's suspicion when we watch |
| Influence | Media and influence | OSINT |
| Financier | Front companies, old money | OSINT (registries), SIGINT |
| Thrall | Day errands | HUMINT |

Today's operations (feeding, recruitment, infiltration) become what a
site's personnel do. Their damage to support stays.

## 2. The intelligence section and analysts

**Analysts** are a new staff type, hired like scientists and engineers: four
aptitudes, rolled the same way (40–60, the same reroll), growing with use,
and **one lead analyst for the Order** whose aptitudes ÷ 50 multiply every
other analyst's ([base.md](base.md), the shared model).

| Aptitude | Covers |
|---|---|
| OSINT | Open sources: the press, registries, social media. Works anywhere |
| HUMINT | People: sources, debriefs, the police reports |
| SIGINT | Traffic: phones, networks, what the stations pick up |
| CI | Counter-intelligence: is it true? Weighs the evidence; doubles, our own leaks |

Padua starts with **2 analysts**. The analysts at every base work as **one
intelligence section** for the Order, like research: the cells are spread
out but work together (a cell in New York helps one in Nairobi read traffic
out of Hong Kong). Its analysts either:

* **Find**: look for signs of activity in a chosen region or house, which
  turns up **leads**; or
* **Fix**: work one lead, which builds or breaks the case and turns up
  follow-up leads about the same site (the hospital logistician, the
  relative's police report).

**Collection** raises the odds of finding real activity rather than noise:
a SIGINT tower in the region for SIGINT, HUMINT agents there for HUMINT.
OSINT needs no collection and works in any region, but it's crude: most of
what it turns up is nothing.

## 3. Leads: true or false

A lead is a sign of a real site, or of nothing. The player doesn't know
which. **False leads are noise** in the analysis, never planted: the houses
don't run disinformation. Working a false lead turns up what isn't there
("no SIGINT anomalies", no missing-person reports, the club's books are
clean), each piece small on its own. Enough of them make the dead end
plain, but the game never says "false": the player reads the evidence.

* **Confidence** is shown on every lead, computed from the evidence the
  player holds, so it's honest: a lead at 90% is wrong one time in ten. It
  starts from its channel's share of real leads (OSINT low, HUMINT
  middling, SIGINT high; a volunteer, HUMINT that came to us, a little
  above HUMINT and likelier a trap) and moves with each piece of evidence,
  for or against. CI makes each piece count for more.
* **Discard**: the player can mark a lead false and drop it.
* **Develop**: fix it, surveil, meet a source. Each step adds evidence.
* **Commit**: raid it. The player decides when.

**A true lead's site can move.** While it's known and not yet hit, it has a
daily chance to pack up, higher the more houses the player has destroyed
and the more it's been watched. If it moves, the lead goes cold. The clues
already found toward its parent are kept.

**Raiding a false lead**: the battle map is generated with civilians and no
vampires. The team investigates, then leaves. In low-visibility kit
(plainclothes) there's no penalty. In full tactical kit, the region's
support and secrecy fall.

**Raiding a true lead**: the fight as today. Won: the region's support rises,
secrecy falls a little.

## 4. Climbing the network

Every site holds clues to the echelon above it, and the clues pool **per
house**:

* **Exploiting** a raided nest (SSE: phones, ledgers, the bodies) gives 1
  **den clue**. So does snatching or debriefing one of its personnel.
* Every **2 den clues** reveal one of the house's dens as a strong lead.
* Every **2 dens raided** reveal the **lair**.
* Killing the elder in the lair destroys the house.

**A found lair doesn't move: the house strikes first.** From the day its lair
is found until it's hit, the house has a daily chance to **assault one of
our bases** within its reach. It's a base defence the player can win:
defeat the assault, then **counter-attack** the lair and wipe out the
house. **Lose it and the base is lost**; the house and its lair stay on
the map, to be raided from another base if one can reach it. Losing the
last base loses the game, as always. Still a ticking clock, and a more
dangerous one. (Not built: base
defence maps, [geoscape.md](geoscape.md) open question "base raids".)

**Agnes's lair** is found the same way, with one difference: in Act I, the
first Perfecti den raided brings the assault on Padua (the fall,
[story.md](story.md)). That one is a **horde battle**, not a defence that can
be won: survive X turns, get the staff out, escape. If the
player never raids a Perfecti den, Agnes attacks anyway, on a random day
between 40 and 50. In Act II her network goes quiet; in Act III it can be
worked again, and the den clues already found are kept.

A house takes about **6 raids**, in varied shapes: say 2 nests and a
snatch for the den clues, 2 dens, then the lair. Six houses make about 36;
Act III needs three lesser houses destroyed (about 18), then Montségur.
Feedings, rescues, extractions and the rest come between them. The aim is
plenty to do without overstaying its welcome.

## 5. What it replaces

* **The intel meter** (0–100 per house) goes. A lair is found by climbing
  to it.
* **The fall** (story.md) is set by the first Perfecti den raided, not 60
  intel, the CDF report and the intercepts.
* **Chronicles**: one entry per raid on the house, not per 20 intel.
* **Random SIGINT leads** become the Find step. Today's lead kinds stay as
  actions on a site or its personnel: surveillance (evidence), capture
  (a snatch: a den clue), rescue (the hunters' victims), recovery (bodies
  for an autopsy), source (a person to meet).
* **HUMINT agents** become collectors: they raise the odds in their region.

## 6. Later

Kept from the earlier proposal, built after the core:

* **Closed countries**, worked from the outside in: OSINT works anywhere;
  the bottom of Jade's network reaches Japan, Korea, Taiwan and the
  diaspora, and exploiting it there reveals sites inside China; a phone
  number taken from a courier lets SIGINT follow its owner with no station
  in the region (a **selector**); the **underground Church** as a HUMINT
  network where we can't operate, at real risk to its people.
* **Expeditionary operations**: operatives in on airlines, kit bought locally
  and lost after the op, an exfil window, safe houses.
* **Finishing in a closed country**: tip off a local official (support,
  no exploitation), a proxy, or an expeditionary team.
* **HUMINT fixes**: agent levels with service, vetting, fewer calls.
* **Concordats** and settling points.

## As built (step 1)

* **Placing**: each house's network comes from the campaign seed on a
  stream of its own. Dens stand in different homeland regions; a nest
  stands in its den's region (40%), a homeland neighbour (35%) or anywhere
  in the homelands. Montségur is Agnes's lair; other lairs are a great city
  of the homelands.
* **Personnel** aren't modelled by role yet: a site's people are its
  operations. Each operation is run from an unburned nest (weight 1) or den
  (0.4), the lair only when nothing else is left. It happens in the site's
  region, a neighbour or elsewhere in the homelands (the same split).
* **A lead that leads somewhere** (the existing reveal chances) puts the
  nest behind its operation on the map. One run from a den gives a den
  clue instead. A nest found moves after 10–16 days; a den and a lair stay
  until hit.
* **Den clues**: a nest burned (SSE) 1; a snatch (a capture lead's
  interrogation succeeding) 1; a captive questioned in research (thrall 1,
  vampire 2); a turned thrall, about one a month; HUMINT bait 1 (2 at hard
  tiers). A HUMINT "intel" call reveals a nest of the house instead.
* **A failed raid** moves a nest (lost from sight) or a den (lost from
  sight and one clue lost). A lair holds.
* **Chronicle**: a page (20 of the 100 in `data/lore.ts`) per nest or den
  burned, snatch or questioning; the last page when the lair is found.
* **Assaults**, until base defence maps exist, are auto-resolved: 5 days'
  grace after the lair is found, then 5% a day on the house's nearest base
  in its homelands or within 3,000 nm of the lair. Everyone home fights in
  full kit with a home edge (+0.15) against 8 thralls and 3 vampires
  (scaled like any site); secrecy −1.5. Held or lost, the house waits 20
  days before it tries again.
* **UI**: the Bloodlines screen shows the climb as segmented bars (nests,
  den clues, dens, lair; burned, on the map, hidden) with the places found;
  a site's panel says what burning it gives, and a lair's which bases it
  may strike.

## As built (steps 2–4)

* **Analysts**: a staff kind needing only a bed (no facility), $20k vetting
  and salary, aptitudes OSINT, HUMINT, SIGINT, CI. Padua starts with 2;
  they die with it at the fall. The section's pace is 1.5 points a day per
  analyst at 50 (all four aptitudes alike, times the lead's multipliers).
* **Find** (a house, a region, or nowhere): every 6 points turns up a lead
  about an operation in scope that has none yet; where nothing is going
  on, nothing turns up (and the points are lost). Its discipline is drawn
  by collection at the operation's region, times the section's aptitude:
  OSINT 0.25 everywhere, SIGINT the station rate (`sigintRates`), HUMINT
  the agent rate (`humintRates`). Real share by discipline: **OSINT 30%,
  HUMINT 55%, SIGINT 75%** (volunteers 60%).
* **Fix** (one lead at a time): every 3 points a piece of evidence, by a
  discipline drawn the same way. A piece says "for" with probability d if
  the case is real, 1 − d if not; d is 0.6 (OSINT), 0.65 (HUMINT), 0.7
  (SIGINT), ±0.15 with the section's CI (50 is neutral), kept within
  0.55–0.9. Up to 8 pieces a case. While fixing, Find goes on at 25%.
* **Confidence** is the posterior: prior odds × each piece's likelihood
  ratio (d/(1−d) for, (1−d)/d against). Shown on every lead as "Real?",
  with the evidence list. Tested for calibration.
* **Passive leads are gone**: stations and agents are collection. Only
  volunteers still come forward on their own (HUMINT agent calls can
  still pass a lead); both send noise too, at (1 − p)/p per real lead, so
  their 60% (55%) stays honest. Only real activity sets a double's trap.
* **Follow-ups**: a piece of evidence for the case turns up a follow-up
  lead 20% of the time, on the same case (same truth, same confidence).
* **Discard** drops a lead (a real one counts as ignored when its
  operation ends). **A raid on a false lead**: nothing there; in tactical
  kit support −0.3 in the region and secrecy −1; otherwise no cost. (No
  civilian battle map yet.)
* **Sites move**: a known nest 6% a day, a den 3%, ×(1 + 0.2 per house
  destroyed); a lair never. Fixing a real lead risks its site noticing:
  3% a day it moves and the case goes cold (clues are kept).
* **UI**: the Intelligence screen (B) has a Section tab (analysts and the
  lead analyst, the Find picker with its pace and real share, the lead
  being fixed, every open lead by confidence) and the Houses tab (the
  climb). A lead's panel shows Real?, Detail (the old lead quality, which
  sets mission odds), the evidence, Work this lead and Drop it.

## Build order

1. **The networks** (built).
2. **Analysts and the intelligence section**: Find and Fix, OSINT (built).
3. **True and false leads**: confidence, discard, raids on false leads (built).
4. **Follow-up leads** across disciplines, and sites that move (built).
5. Closed countries and the rest of section 6.

The bot plays each step, so `npm run batch` keeps telling us something.

## Open questions

* **Rates**: how often activities are seen, the share of real leads per
  discipline, how fast a site moves. Set with `npm run batch`. With the
  networks the campaign bot burns about 2 sites a year and finds no lair
  (it found one in 88% of games under the intel meter): the bot doesn't
  climb on purpose yet, and the pace needs a human playtest.
* **Several leads at once**: one lead is worked at a time today; more with
  more analysts? Find keeps a 25% trickle while fixing.
* **Personnel by role** (hunters, couriers…) aren't modelled: a site's
  operations stand in for them.

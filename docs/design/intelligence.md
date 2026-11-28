# Intelligence: the houses' networks, analysts, the hunt

Built (`sim/intel/networks.ts`, `sim/intel/intel.ts`) except "Later".
Intelligence drives missions: **find** a sign of activity, **fix** it into
a place to act on, **finish** it (the raid), **exploit** the site, and
climb to the next one. There is no intel meter: a lair is found by
climbing to it.

## The networks

Each of the six houses has a real network from the campaign seed: **the
lair** (the elder; Montségur is Agnes's, other lairs a great city of the
homelands), **3 dens** in different homeland regions, **2–4 nests** under
each. A site's details are generated the first time the player touches it.

Sites run the houses' **operations** (feeding, recruitment, infiltration):
from a nest mostly, a den sometimes, the lair only when nothing else is
left, in the site's region or nearby. (Personnel by role, hunters,
couriers and the rest, aren't modelled; operations stand in for them.)

## The section

**Analysts** are staff working in a base's **fusion centre** (10 a room), with aptitudes OSINT, HUMINT,
SIGINT and CI, and a lead analyst whose aptitudes multiply the rest
([base.md](base.md)). Padua starts with 2; they die with it at the fall.
Analysts at every base work as **one section** for the Order, like
research, and either:

* **Find** in a house, a region or anywhere: points turn up leads on
  operations in scope that have none yet; where nothing is going on,
  nothing turns up.
* **Fix** one lead at a time (Find goes on at 25%): each piece of evidence
  says "for" or "against", more reliably by discipline and with the
  section's CI. A piece for the case may turn up a **follow-up lead** on
  the same case.

**Collection** sets the discipline a lead comes by: OSINT anywhere (crude),
SIGINT from a station in the region, HUMINT from agents there
([covert.md](covert.md)). Real share by discipline: OSINT 30%, HUMINT 55%,
SIGINT 75%, volunteers 60%. Stations and agents don't pass leads on their
own; only volunteers still come forward.

## Leads: true or false

A lead is a sign of a real site or of nothing. **False leads are noise**,
never planted: the houses don't run disinformation. Working a false one
turns up what isn't there; the game never says "false".

* **Confidence** ("Real?") is the honest posterior from the evidence held:
  a lead at 90% is wrong one time in ten (tested for calibration).
* **Discard**, **develop** (fix it), or **commit** (raid it) when the
  player decides.
* **Sites move**: a known nest or den has a daily chance to pack up
  (higher the more houses destroyed), and fixing a real lead risks it
  noticing; the case goes cold, clues already found are kept. A lair never
  moves.
* **Raiding a false lead**: nothing there; in tactical kit the region's
  support and secrecy fall, in plainclothes no cost. (A civilian battle
  map for it isn't built.)

## Climbing

Clues pool **per house**:

* A nest burned (exploited), a snatch, a captive questioned, a turned
  thrall, HUMINT bait: **den clues**. Every 2 reveal a den as a strong
  lead.
* Every **2 dens** raided reveal the **lair**. Killing the elder destroys
  the house.
* A failed raid moves a nest or den out of sight (a den loses a clue); a
  lair holds.
* A chronicle page per site burned, snatch or questioning; the last when
  the lair is found.

**A found lair strikes first**: from a few days after it's found, the house
may assault one of our bases in reach. Until base defence maps exist this
is auto-resolved (everyone home, full kit, a home edge); held or lost, the
house waits before trying again. Lose and the base is lost.

**Agnes**: in Act I the first Perfecti den raided brings the assault on
Padua (the fall, [story.md](story.md)); if none is, she attacks anyway
around day 40–50. Her network goes quiet in Act II and reopens in Act III,
the den clues kept.

A house takes about 6 raids; Act III needs three lesser houses destroyed
(about 18 raids), then Montségur, with feedings and rescues between.

**UI**: the Intelligence screen's Section tab (analysts, the Find picker,
the lead being fixed, open leads by confidence) and Houses tab (the climb
as segmented bars, what we know). Thresholds and pace are internal: no
"N of M" shown.

## Research

The section has no tree of its own; science improves it for good
([research.md](research.md)): SIGINT centre level 2, more follow-ups,
leads more often real, stronger SIGINT evidence, CI +10, feeding
operations easier to find, HUMINT leads from relatives, tagged thralls,
discipline boosts. Research never gives intel points. Interrogation is
paused until it's designed as a mechanic.

## Later

* **Closed countries**, worked from outside: OSINT anywhere; Jade's
  network reaching Japan, Korea, Taiwan and the diaspora reveals sites in
  China; a courier's number as a SIGINT **selector**; the **underground
  Church** as a HUMINT network, at real risk to its people.
* **Expeditionary operations** (in on airlines, kit bought locally, safe
  houses); finishing in a closed country (tip off an official, a proxy).
* Phones and laptops as loot that gives leads; HUMINT agent levels;
  concordats.
* **Not in the game**: INTERPOL, money trails, offender profiling.

## Open questions

* **Rates** (how often activity is seen, how fast sites move): set with
  `npm run batch`. The campaign bot burns about 2 sites a year and finds
  no lair; it doesn't climb on purpose yet. Needs a human playtest.
* Several leads worked at once with more analysts?

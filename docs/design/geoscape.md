# Geoscape: regions, installations, leads, missions, secrecy

## Regions

48 regions in `data/regions.json` (countries grouped, large ones split:
Russia by federal district, China N/S/W, USA by census region, Canada and
Australia E/W). `scripts/build-regions.mjs` rasterises Natural Earth into
`public/assets/regions.png` (pixel = region index) and
`data/regions.generated.json`; re-run it after editing `regions.json`. The
globe shader samples that map for borders, coverage, hover and the support
map. Neighbours share a border or a ≤160 km sea crossing
(`adjacency.generated.json`, `scripts/build-adjacency.mjs`).

**Support** is −5 (backs the vampires) to +5 (backs the OPV), fractional
inside, shown rounded. It settles slowly toward the region's start, so most
of the world stays neutral and only pushed regions turn. Bloodline media and
ignored operations push it down; our results, media campaigns and influence agents
push it up.

| Support | Installations there |
|---|---|
| +5 | no running costs |
| +3, +4 | running costs −50% |
| +1, +2 | normal; building allowed |
| 0 | +50%; no building |
| −1, −2 | +100%, monthly warning |
| −3 or lower | **evicted** (a base gets a month's warning) |

A lost base (evicted, or taken in an assault) sends its operatives and its teams
in the field to the nearest other base. Its staff, stores and any aircraft
on the ground are lost (`loseBase`, `sim/people/personnel.ts`).

## Installations

All are support-gated, built by picking the kind and clicking the globe; the
name is suggested from the nearest town (`places.generated.json`) and
editable.

* **Operational Base**: troops, aircraft, labs, quarters (see
  [base.md](base.md)). The player starts with **Base Padua**. $1.5M, 14
  days, $150k a month (halved again at +3).
* **SIGINT Station**: no troops; $300k, 6 days, $80k a month. The player starts with none: Base
  Padua's SIGINT centre listens to Italy.
* **Refuelling Station**: a quiet airstrip, $200k, 5 days, $30k a month, one
  per region. Our aircraft route through them automatically
  (`sim/missions/routes.ts`), 2 hours a stop.

**Detection** is the intelligence section's work
([intelligence.md](intelligence.md)): analysts Find leads where they are
pointed. Stations and agents are **collection**: rates add over sources
(`sigintRates` in `sim/core/commands.ts`: a station in the region 0.5, next door
0.015, a base's SIGINT centre as a station; `humintRates`: an informant
0.2), and decide how often a lead comes by SIGINT or HUMINT rather than
OSINT, which is mostly noise. Unfound operations still do their damage.

## Aircraft and flights

* **Helicopter**: bought ($900k, $35k a month, sells for half). Reach 900 nm,
  slow, lands anywhere, discreet. It drops the team, leaves, and comes back after a win to lift
  out every body and all loot; never at risk.
* **Jet**: leased ($350k a month). Long range, fast, noisier. Waits at an
  airfield, never at risk; the team burns the bodies and carries out what it
  can.
* **Hired flights**, anywhere from any base, for any target:
  * Charter: 2 operatives, civilian or plainclothes **armed**, 430 kn, 4 h prep,
    $25k + $35/nm each way, noise 0.5.
  * Commercial: 1 operative, civilian and unarmed, 380 kn, 8 h prep, a tenth of
    a charter, noise 0.2.
  A team lost on a hired flight is a sunk cost.
* A base fields as many teams as its aircraft and seats allow (about 6 when
  fully built out).

## Leads and missions

Bloodlines run **operations** (feeding, infiltration, harvest, PR, supply,
recruitment) in their homelands (`sim/intel/operations.ts`). Found ones become
**leads** with a lifetime, each real or noise with an honest confidence;
ignored real ones complete and cost support.

* Lead kinds: capture and interrogate, volunteer source, double agent (an
  ambush posing as a source), surveillance, recovery, rescue.
* **Dispatch** (`sim/missions/missions.ts`): the player picks operatives, kit (civilian,
  plainclothes, tactical; `data/kit.ts`) and aircraft. Size, kit and aircraft
  set the secrecy cost; one or two operatives in civilian clothes travel unseen.
  Several aircraft can fly together; teams from several bases can join one
  objective (wait for each other, start any time, no reinforcements).
* **On arrival** the player makes one short decision (2–4 plays per kind,
  some taking hours, such as a stakeout or waiting for daylight). Odds shown
  use only what the player can see, so a double never shows through them;
  its tells also appear as false alarms. The dispatch ("Begin mission?",
  "<operatives> arrived in <city>") shows how the team got in: our jet drops it
  in free fall, a helicopter sets down on a roof, a hired flight (charter or
  airline) goes through passport control.
* Every house is a **network** of nests, dens and a lair
  ([intelligence.md](intelligence.md)); its operations are run from those
  sites. Leads produce a capture, a recruit, a den clue, or the **nest**
  behind them, which moves after 10–16 days. Den clues find **dens**, burned
  dens find the **lair**; dens and lairs never move, and a found lair
  strikes our bases.
* Strikes and ambushes open the battlescape (or auto-resolve). Won strikes
  seize the bloodline's money (nest ~$100k, den ~$200k, lair ~$1.75M; half
  without a helicopter), and can take captives and remains. (A haven is a
  skirmish size only.)

## Operatives

* Recruits come from a monthly pool of 6. Origin is weighted by support² ×
  Catholic presence × OPV presence, names from ~25 Catholic name cultures
  (`data/names.ts`). Brothers and sisters both serve.
* **Founding team is 4** so the player fills it to their own style.
* **People are one model** (`sim/people/personnel.ts`, `data/aptitudes.ts`): every
  role (operators, scientists, engineers, analysts) has four aptitudes,
  rolled 40–60 from one monthly pool, the same no-duds-no-prodigies reroll
  (3+ of 4 in the bottom or top quarter), capped at 100, hired and let go
  the same way. A person keeps a name, a culture (where the name is from)
  and whether they're a woman; not where they were born.
* Operators' aptitudes: Combat, Tradecraft, Insight, Faith, grown by the
  jobs that use them. **Vitality** (HP) is separate: rolled 30–50, it
  doesn't grow with experience, only through research and kit.
* **HP is Vitality.** Wounds heal 6 a day (9 with field medicine). Wounded
  operatives can be sent and fight with what they have; default teams and bots
  pick only the fit.
* Upkeep, not salary (vows of poverty), by aptitude like everyone's pay
  ([base.md](base.md)).

## Secrecy and open war

* One global **Secrecy** meter (a regional one defies common sense; local
  consequences come from the bloodline that was hit). Loud actions cost it;
  it recovers 0.1 a day; cover-ups restore it ([covert.md](covert.md)).
* **Secrecy 0 forces open war, one-way.** In Act II it means exposure.
* **Not built yet: escalation and open war.** Intent (user): open war
  is the game changing gear, not only a penalty. The player answers "you
  want to throw down? Let's throw down": the suppressors come off,
  rocket launchers and heavy machine guns come in, after a first half of
  cloak and dagger. To be designed as its own effort. Draft:
  * As secrecy falls the bloodlines escalate: explosives, rockets, car
    bombs, then **assaults on OPV installations**.
  * A bloodline that was hit goes on alert: moves sites, strikes back nearby,
    pushes its media.
  * In open war the secrecy meter goes; regions openly take sides; vampires
    act overtly; the OPV gets open recruitment, heavier kit and allied
    cooperation; civilian harm costs support.
  * Pacing target: a careful player stays hidden until about month 8, a
    reckless one breaks the Masquerade around month 4.

## Time

Real time with pause and four intervals (10 min, 1 h, 6 h or 1 day per real
second), on a half dial
on the right edge of the screen: play/pause and the interval's + and − are
cut from one curved band (+ − don't start a paused clock); inside it the
date, time (UTC) and the moon's phase for the date. The moon
(`moonPhase`, `sim/core/time.ts`) sets how far
humans see in night battles ([tactical.md](tactical.md)).
Hourly,
daily and month-end ticks (`sim/core/clock.ts`); events pause the clock.

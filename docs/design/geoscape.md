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
ignored operations push it down; our results, media campaigns and PR assets
push it up.

| Support | Installations there |
|---|---|
| +5 | no running costs |
| +3, +4 | running costs −50% |
| +1, +2 | normal; building allowed |
| 0 | +50%; no building |
| −1, −2 | +100%, monthly warning |
| −3 or lower | **evicted** (a base gets a month's warning) |

## Installations

All are support-gated, built by picking the kind and clicking the globe; the
name is suggested from the nearest town (`places.generated.json`) and
editable.

* **Operational Base**: troops, aircraft, labs, quarters (see
  [base.md](base.md)). The player starts with **Base Padua**. Costs $250k a
  month (halved again at +3).
* **SIGINT Station**: no troops. The player starts with one in a random
  European region (never Italy).
* **Refuelling Station**: a quiet airstrip, $400k, 7 days, $50k a month, one
  per region. Our aircraft route through them automatically
  (`sim/routes.ts`), 2 hours a stop.

**Detection**: each bloodline operation has a daily chance `1 − e^(−rate)` to
surface as a lead. Rates add over sources (`sigintRates` in
`sim/commands.ts`): a station in the region 0.5, next door 0.015 (higher
made neighbour leads outnumber local ones), an informant 0.2, a base's
SIGINT centre as a station. Unheard operations still do their damage.

## Aircraft and flights

* **Helicopter**: bought ($900k, $35k a month, sells for half). Reach 900 nm,
  slow, lands anywhere, discreet. It waits on the tactical map, can be
  destroyed, and lifts out every body and all loot.
* **Jet**: leased ($350k a month). Long range, fast, noisier. Waits at an
  airfield, never at risk; the team burns the bodies and carries out what it
  can.
* **Hired flights**, anywhere from any base, for any target:
  * Charter: 2 agents, civilian or plainclothes **armed**, 430 kn, 4 h prep,
    $25k + $35/nm each way, noise 0.5.
  * Commercial: 1 agent, civilian and unarmed, 380 kn, 8 h prep, a tenth of
    a charter, noise 0.2.
  A team lost on a hired flight is a sunk cost.
* A base fields as many teams as its aircraft and seats allow (about 6 when
  fully built out).

## Leads and missions

Bloodlines run **operations** (feeding, infiltration, harvest, PR, supply,
recruitment) in their homelands (`sim/operations.ts`). Heard ones become
**leads** with a lifetime; ignored ones complete and cost support.

* Lead kinds: capture and interrogate, volunteer source, double agent (an
  ambush posing as a source), surveillance, recovery, rescue.
* **Dispatch** (`sim/missions.ts`): the player picks agents, kit (civilian,
  plainclothes, tactical; `data/kit.ts`) and aircraft. Size, kit and aircraft
  set the secrecy cost; one or two agents in civilian clothes travel unseen.
  Several aircraft can fly together; teams from several bases can join one
  objective (wait for each other, start any time, no reinforcements).
* **On arrival** the player makes one short decision (2–4 plays per kind,
  some taking hours, such as a stakeout or waiting for daylight). Odds shown
  use only what the player can see, so a double never shows through them;
  its tells also appear as false alarms. The dispatch ("Begin mission?",
  "<agents> arrived in <city>") shows how the team got in: our jet drops it
  in free fall, a helicopter sets down on a roof, a hired flight (charter or
  airline) goes through passport control.
* Leads produce intel, a capture, a recruit, or a **site** (nest, den,
  haven) that moves after 10–16 days. **Lairs** appear at intel 100 and
  never move.
* Strikes and ambushes open the battlescape (or auto-resolve). Won strikes
  seize the bloodline's money (nest ~$100k, den ~$200k, haven ~$300k, lair
  ~$1.75M; half without a helicopter), and can take captives and remains.
* Intel has diminishing returns per bloodline (`addIntel`).

## Agents

* Recruits come from a monthly pool of 6. Origin is weighted by support² ×
  Catholic presence × OPV presence, names from ~25 Catholic name cultures
  (`data/names.ts`). Brothers and sisters both serve.
* **Founding team is 4** so the player fills it to their own style. No duds
  or prodigies: a recruit with 4+ of 5 stats in the bottom or top quarter
  is rerolled (`data/agents.ts`).
* Stats: Combat, Vitality, Tradecraft, Insight, Faith. Faith rolls 40–70,
  the others 25–55. Used stats grow (cap 95); **Vitality doesn't grow with
  experience**, only through research and kit.
* **HP is Vitality.** Wounds heal 6 a day (9 with field medicine). Wounded
  agents can be sent and fight with what they have; default teams and bots
  pick only the fit.
* Upkeep, not salary (vows of poverty).

## Secrecy and open war

* One global **Secrecy** meter (a regional one defies common sense; local
  consequences come from the bloodline that was hit). Loud actions cost it;
  it recovers 0.1 a day; cover-ups restore it ([covert.md](covert.md)).
* **Secrecy 0 forces open war, one-way.** In Act II it means exposure.
* **Not built yet: escalation and open war.** Draft:
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

Real time with pause and 5 speeds (5 s to 1 day per real second). Hourly,
daily and month-end ticks (`sim/clock.ts`); events pause the clock.

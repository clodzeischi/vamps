# Intelligence: the houses' networks, analysts, and the hunt

**Status: decided, not built.** Replaces the earlier proposal (desks and
lines of effort). Touches [story.md](story.md) (the intel meter, the fall,
chronicles), [geoscape.md](geoscape.md) (detection, leads, sites),
[covert.md](covert.md) (HUMINT assets) and [base.md](base.md) (staff).
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
| PR | Media and influence | OSINT |
| Financier | Front companies, old money | OSINT (registries), SIGINT |
| Thrall | Day errands | HUMINT |

Today's operations (feeding, recruitment, infiltration) become what a
site's personnel do. Their damage to support stays.

## 2. The intelligence section and analysts

**Analysts** are a new staff type, hired like scientists and engineers: four
aptitudes, rolled the same way (35–75, the same reroll), growing with use,
and a **lead analyst** per base whose aptitudes ÷ 50 multiply everyone
else's ([base.md](base.md), the shared model).

| Aptitude | Covers |
|---|---|
| OSINT | Open sources: the press, registries, social media. Works anywhere |
| HUMINT | People: sources, debriefs, the police reports |
| SIGINT | Traffic: phones, networks, what the stations pick up |
| CI | Counter-intelligence: is it true? Doubles, disinformation, our own leaks |

Padua starts with **2 analysts**. Each base has an **intelligence section**.
Its analysts either:

* **Find**: look for signs of activity in a chosen region or house, which
  turns up **leads**; or
* **Fix**: work one lead, which builds or breaks the case and turns up
  follow-up leads about the same site (the hospital logistician, the
  relative's police report).

**Collection** raises the odds of finding real activity rather than noise:
a SIGINT tower in the region for SIGINT, HUMINT assets there for HUMINT.
OSINT needs no collection and works in any region, but it's crude: most of
what it turns up is nothing.

## 3. Leads: true or false

A lead is a sign of a real site, or of nothing. The player doesn't know
which.

* **Confidence** is shown on every lead, computed from the evidence the
  player holds, so it's honest: a lead at 90% is wrong one time in ten. It
  starts from its discipline's share of real leads (OSINT low, HUMINT
  middling, SIGINT high) and moves with each piece of evidence. CI makes
  each piece count for more and spots planted disinformation.
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
house. Still a ticking clock, and a more dangerous one. (Not built: base
defence maps, [geoscape.md](geoscape.md) open question "base raids".)

**Agnes's lair** is found the same way, with one difference: in Act I, the
first Perfecti den raided brings the assault on Padua (the fall,
[story.md](story.md)). That one is a **horde battle**, not a defence that can
be won: survive X turns, get the research and staff out, escape. If the
player never raids a Perfecti den, Agnes attacks anyway, on a random day
between 40 and 50. In Act II her network goes quiet; in Act III it can be
worked again, and the den clues already found are kept.

A house takes, as a rule, **3 nests, 2 dens and the lair: 6 raids**. Six
houses make 36 possible raids. Act III needs three lesser houses destroyed
(18 raids), then Montségur.

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
* **HUMINT assets** become collectors: they raise the odds in their region.

## 6. Later

Kept from the earlier proposal, built after the core:

* **Closed countries**, worked from the outside in: OSINT works anywhere;
  the bottom of Jade's network reaches Japan, Korea, Taiwan and the
  diaspora, and exploiting it there reveals sites inside China; a phone
  number taken from a courier lets SIGINT follow its owner with no station
  in the region (a **selector**); the **underground Church** as a HUMINT
  network where we can't operate, at real risk to its people.
* **Expeditionary operations**: agents in on airlines, kit bought locally
  and lost after the op, an exfil window, safe houses.
* **Finishing in a closed country**: tip off a local official (support,
  no exploitation), a proxy, or an expeditionary team.
* **HUMINT fixes**: asset levels with service, vetting, fewer calls.
* **Concordats** and settling points.

## Build order

1. **The networks**: houses, dens, nests and personnel exist; today's leads
   point at real sites; SSE gives den clues; the lair is found by climbing;
   the intel meter goes. Playable with today's UI.
2. **Analysts and the intelligence section**: Find and Fix, OSINT.
3. **True and false leads**: confidence, discard, raids on false leads.
4. **Follow-up leads** across disciplines, and sites that move.
5. Closed countries and the rest of section 6.

The bot plays each step, so `npm run batch` keeps telling us something.

## Open questions

* **Rates**: how often activities are seen, the share of real leads per
  discipline, how fast a site moves. Set with `npm run batch`.
* **Find**: does a section on Fix keep a thin trickle of Find?
* **Several leads at once**: one lead per section, or more with more
  analysts?

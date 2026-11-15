# Vamps: web port plan (Three.js)

The working design and plan for rebuilding Vamps as a browser game. Update it
whenever a decision is made or changed; future sessions start here.

Status: **iteration 1 in progress**. Steps 0–4 done. 4c added cover-up
operations, the Order's media campaigns, an economy pass, and building by
clicking the globe with a name suggested from the nearest town.
The geoscape also has a left column: "Under way" (construction, facility
upgrades, teams, cover-ups, recovering agents and media campaigns, with
progress bars) and a message log (the last three messages; click for all).
Next is step 5: research, open war, escalation, polish (last updated 2026-11-14)

Live: https://clodzeischi.github.io/vamps/ (repo github.com/clodzeischi/vamps;
every push to `main` deploys).

Commands: `npm run dev` (local server), `npm run build`, `npm test`.
Vitest has its own `vitest.config.ts` because Vitest 3 bundles an older Vite.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Platform | Static web app on **GitHub Pages**, **desktop only** (mouse + keyboard, 1280px+) |
| Stack | **Vite + TypeScript + Three.js** for 3D, **React** for menus and panels, game rules in plain TS with no UI or DOM dependency |
| Repo | **Replace the C++ code** with the web project at the repo root. The C++ code is only a reference for rules and numbers and **does not need to be preserved**: move it aside while porting, then delete it |
| Building stations | **Support-gated**, for **both SIGINT stations and Operational Bases**: you can only build in a region with enough support. Falling support first raises running costs, then the region **evicts** the installation |
| Support scale | Integer **−5 (backs the vampires) to +5 (backs the OPV)** per region. At +5 installations there pay no rent or maintenance |
| Teams | As many teams as transport allows; a base fully built out with hangars and troop facilities fields about **6** |
| Aircraft | **Leased** |
| Open war | **One-way.** Before secrecy hits 0, **cover-up operations** can restore it (off-screen ops, like XCOM 2's faction missions) |
| Auto-combat | Strike missions and base assaults use a **fast auto-combat** until the tactical layer exists |
| Agents | **Individual named agents** with stats that grow with use, and permadeath. All are Catholic and bound by the **three vows** (poverty, chastity, obedience); the OPV trains them in everything the job needs. **No backgrounds** |
| Name pool | Recruits' origins (and so their names) follow **regional support and OPV presence**: high support in China or the Middle East brings Chinese or Levantine Catholic recruits |
| Arrival decisions | When a team reaches a lead, the player gets **one short decision** (e.g. a nervous source and a van across the street: go in, abort, or switch to a snatch) |
| Deployment | The player **configures the team before every mission** (who goes, how many, what kit). Big or heavily armed teams cost secrecy; one agent in civilian clothes doesn't |
| Losing | **Losing the last Operational Base.** As secrecy falls, the vampires escalate to overt violence (explosives, rocket launchers, base assaults) |
| Lead variety | Leads come in **varied kinds**: capture and interrogate, volunteer source, double agent setting up an ambush, and more |
| Look | **Realistic night Earth**: PBR globe, city lights, atmosphere, day/night terminator, gothic black-and-gold UI |
| Lore | Keep the Cathar bloodlines / Montsegur / retrovirus lore, **re-framed for the OPV** |
| Sigil | A **sigil is a bloodline** ("killing a sigil" = destroying a bloodline) |
| Time | **Real-time with pause** and several speeds; events pause the clock |
| Funding | **Vatican stipend + regional contributions** scaled by regional support |
| Detection | **No radar, no interception.** SIGINT stations cover whole regions; Operational Bases deploy teams within a fuel/time radius |
| Leads | Detection produces **leads**. Not every lead is a fight: investigate, interrogate or detain to reveal the real vampire site |
| Covert to open war | **Secrecy collapse forces open war** (no fixed trigger) |
| Saves | Browser storage, plus **export/import** so a campaign can move to another computer |
| Iteration 1 | **Main menu + geoscape as a playable strategy loop.** No tactical combat (missions auto-resolve) |

---

## 2. Premise

**OPV, Ordo Potestatis Vera**: a secret branch of the Inquisition inside the
Vatican. Its purpose is a covert war, and later a not-so-covert one, against
vampires.

Reframed lore (carried over from the C++ version, see `docs/DESIGN.md` until it is removed):

* In 1244 the Church burned the Cathar *Perfecti* at Montsegur. Some survived,
  carrying what is now understood to be a retrovirus: enormous tissue repair at
  the cost of haemophagy and photosensitivity.
* Six **bloodlines (sigils)** descend from them and have hidden in plain sight
  for eight centuries. The OPV is, in effect, the Church cleaning up its own
  13th-century failure, which is one reason the Vatican wants it secret.
* The six sigils and their home continents (traits to be rebalanced):

| Sigil | Home | Trait (current C++ value) |
|---|---|---|
| House Ashgrove | N. America | PR campaigns +50% |
| The Huaca Line | S. America | rise from torpor sooner, heal faster |
| The Carcassonne Perfecti | Europe | stronger domination |
| The Sahel Brood | Africa | thralls and fledglings +30% HP |
| The Jade Court | Asia | harder to detect |
| The Nullarbor Kin | Oceania | half damage from sunlight |

* Bullets only put a vampire down (torpor). Fire, sunlight or the
  haemolytic agent finish it. This matters for the later tactical layer.
* End game: all six sigils destroyed, then Montsegur, the origin.

---

## 2b. Campaign arc (from the book; user, 2026-11-14)

The campaign follows the novel's arc. Target length about 12 months.

1. **Act 1: the fall (about 4–6 weeks).** The Order starts at Padua hunting
   the arch-villain, **Agnes of Toulouse**, one of the original Perfect, and
   her **Serpenta Blood Sigil** (the Carcassonne Perfecti). The early leads
   work, then point at things far beyond the Order. Act 1 is played (user
   decision), with a small economy: an extended tutorial with little to lose.
   * **Nudges outward.** Events push the player to build SIGINT stations and
     at least one Operational Base outside Europe early: volunteer sources
     and church networks reporting from other regions, leads abroad only a
     local station could follow up, and a problem in, say, North America
     that needs armed operators the player can't get there (a charter takes
     one agent and no tactical kit), so the player sees why a base abroad
     matters.
   * **The fall.** The Serpenta Sigil goes on the offensive and destroys
     Base Padua in a scripted, telegraphed assault. Support in Europe
     collapses. Whatever is in the field or outside Europe survives.
2. **The hostage years (Act 2, most of the year).** The OPV headquarters in
   the Vatican is held hostage: the Holy See can make no move or the
   vampires expose it. The stipend shrinks to a trickle and Europe is closed
   (no building or operations). **The second cell is whatever the player
   built outside Europe** before the fall (user decision: no "choose where"
   screen). Safety net (default, to confirm): a player with no base outside
   Europe gets a dormant church cell activating somewhere, bare-bones and
   weaker than one they built.
   * The cell fights the **five lesser bloodlines** (Ashgrove, Huaca, Sahel,
     Jade, Nullarbor): intel → lair → lair strike → the bloodline is
     destroyed (its operations stop; its regions recover). Each one broken
     loosens the blackmail (some stipend back) and the survivors grow bolder.
   * **Secrecy 0 while the Vatican is hostage: Agnes exposes the Order**
     (user decision). Not an instant loss: the Vatican disowns the cell, the
     stipend stops, open war begins. Very hard to come back from.
3. **Act 3: the return.** **Three of the five lesser sigils broken** (user
   decision) reopens Europe: rebuild there and end with the showdown with
   Agnes at **Montségur**.

**Built (5b step 3): Act I beats** (`BEATS` in `sim/story.ts`; each plays
once, recorded in `story.beats`):

| Day | Beat | What it teaches |
|---|---|---|
| 0 | "OPV's Standing Orders" (the cardinal, shown at start) | OPV and the 800-year war with the Serpenta Sigil; Agnes is in Europe; SIGINT, HUMINT, covert action; Base Padua, the European station, allies worldwide |
| 6 | A volunteer in São Paulo (Huaca) | the Church's people come forward where we have no ears |
| 11 | A volunteer in Boston (Ashgrove) | the same, in North America |
| 17 | A den of House Ashgrove in Boston (4 thralls, 2 vampires, 6 days) | it needs an armed team; a charter takes two agents (armed, no tactical kit), an airline one (unarmed). Left alone: US Northeast support −0.8 and "Nobody came to Boston" |
| 24 | "The name Agnes" | every Perfecti thread ends at her, and she is out of reach |
| 34 | "Where would we go?" (only with no base outside Europe) | build a base abroad, or recruit people abroad, before it's too late |
| 31+ | Serpenta intercepts (SIGINT, graded) | the trap at Padua |

**Built (5b step 2, `sim/story.ts`, `GameState.story`):**
* **Act 1 → 2, the fall** (user, like the Normandy in Mass Effect 2 striking
  the moment Shepard takes the shuttle). **Warning through SIGINT** (user):
  from day 31 until the fall, each day may bring an intercept, at the
  detection chance for what we hear of Italy (the target) and France
  (Agnes's seat). A station of our own there gives a clear warning (they
  strike when a team flies out); a neighbouring station a faint one, only
  sometimes (about a third of the time with the start's station next door);
  no coverage, no warning. From day 45, the Sigil strikes the moment a team
  leaves a European base (its aircraft in the air); if no team ever leaves,
  on day 66 anyway. Every installation in Europe is lost. **Nobody at the
  base gets out**: only agents in the field (missions, cover-ups) and
  aircraft in the air survive. Aircraft on the ground burn. Projects,
  captives and remains there are lost. Support in Europe −2.5. Survivors go
  to the nearest base outside Europe.
* **Stranded teams must get out of Europe**: a team from Padua working in
  Europe (or flying back into it) is stranded. When its work is done, its
  aircraft flies it to the refuge if it has the range (a jet reaches North
  Africa and the Middle East). Otherwise the aircraft is abandoned and the
  team goes overland on the Church's old escape routes, 4 days plus a day
  per 600 nm (Rio is about 12 days).
* **Church cell** (user: "a kick in the balls"): with no base outside
  Europe, a cell activates in the best-supported region outside Europe
  ("Cell Santiago"). It has 4 rookies, 6 beds and room for one aircraft, and
  nothing else: no aircraft, no SIGINT, no labs. It costs $60k a month (a
  parish basement), so the player can afford to rebuild. HUMINT assets
  abroad will carry over once HUMINT exists.
* **Hostage rules (Act 2)**: the stipend gets through at 15% (30% after one
  lesser sigil is broken, 45% after two). Europe contributes nothing. No
  building and no dispatches in Europe. Agnes runs no operations (she
  doesn't need to); her line's media still erodes Europe.
* **Exposure**: secrecy 0 in Act 2 means "Agnes exposes the Order": open war,
  and the stipend stops for good.
* **Act 2 → 3**: three lesser sigils broken. Europe reopens (support +1
  there, stipend 75%, Agnes's operations resume) and her lair at Montségur
  can be found (intel 100; `lairLocked` until Act 3).
* **Victory** (user): Agnes's lair destroyed. Any lesser bloodlines left
  scatter.
* UI: the act appears next to the difficulty in the HUD, the Bloodlines
  screen shows the act and progress toward the three sigils with Agnes
  "out of reach", the stipend is labelled "(hostage)" or "(disowned)", and
  a win gets its own ending.

Pacing for a year: Act 1 about 1.5 months, Act 2 about 9 (bloodlines in
parallel, roughly two months each), Act 3 about 1.5.

## 2c. People: the cardinal and the elders (user, 2026-11-15)

The player gets their work from a person, not a menu.

**Cardinal Ettore Valsecchi**, Prefect of the Ordo Potestatis Vera, is the
quest giver. Portrait: `public/assets/portraits/cardinal.jpg`.

* He signs the Act I briefings and beats.
* Every lead comes with a line of his before the intelligence. The line
  depends on how the lead came (SIGINT, informant or volunteer) and on
  the act.
* After Padua falls he comes back on **the reserve channel**: "This is
  still Ettore Valsecchi… the war continues." From then on, every dispatch
  of his is captioned "Reserve channel · the Vatican is held".
* Through Act II he sends eight **dispatches from Europe**, in order, one
  every 12–20 days: Padua's dead, her people in the Curia, the night
  trains, the preacher in Carcassonne, her letter to the Holy Father, the
  Swiss Guard, the chambers under Montségur, his own danger. These are
  lore only. They go quiet if the Order is exposed.
* He opens the line again for Act III and closes the war at Montségur.

**The elders**, one per bloodline, each with a portrait, a title, a bio and
a line spoken when their lair is found. Data is in `src/data/people.ts`.

| Bloodline | Elder | Title |
|---|---|---|
| House Ashgrove | Josiah Ashgrove | The Patriarch (a Bristol deacon, 1636; the Ashgrove Foundation) |
| The Huaca Line | Inés Quispe Sisa | The Silver Widow (Potosí, c. 1590; buried three times) |
| The Carcassonne Perfecti | Agnes of Toulouse | The Last Perfect (walked out of the fire at Montségur, 1244) |
| The Sahel Brood | Zahra of Taoudenni | The Salt Queen (salt caravans, 1340s) |
| The Jade Court | Shen Wuyou | The Chancellor (Ming secret police, 1570s) |
| The Nullarbor Kin | Cornelis Vos | The Wreck-Lord (a Dutch East India Company under-merchant, wrecked 1641) |

* **The Bloodlines screen** reveals each elder gradually:
  * at intel 25, their name and title;
  * at intel 50, their portrait and bio;
  * Agnes is known from the start.
* **Their lair:** the elder speaks in the dispatch that finds it, and the
  lair's panel shows who sleeps there.
* **Their death:** the elder appears in the dispatch that destroys their
  line.
* **Agnes signs** the fall and the exposure.

**Scenes.** A lead can show a picture of how it came in, in place of the
cardinal's portrait. It is captioned "SIGINT intercept, <region> · Passed on
by Cardinal Valsecchi".

* SIGINT leads and the Serpenta warning use the night radio tower over a
  river city (`sigint.jpg`).
* Informant and volunteer leads use a brush pass on a concrete stairwell,
  cropped to the hand-off (`humint.jpg`).

**Portraits** are 480×600 JPEG (4:5, head and shoulders, about 50 KB),
cropped from 1024×1536 renders. Until an elder has one, a dark frame with
their initials stands in. To add one, set `portrait` in `ELDERS`.

Each elder has a `prompt` in `ELDERS` for generating a portrait that
matches the existing two. Use it with this style line:
"photorealistic cinematic portrait, 2:3, half-length, dramatic low-key
lighting, muted palette, shallow depth of field, looking slightly past the
camera".

## 3. Geoscape design

### 3.1 Regions (replacing nations)

The world is divided into about **40 regions**: countries grouped logically,
and large countries split (Russia, USA, Canada, China, Brazil, Australia).
Regions are what SIGINT covers, what funds the OPV and what has a support
level. Stations are named after a city in their region (e.g. *SIGINT Station
Norilsk* in North Siberia, *SIGINT Station Baikal* in South Siberia).

**Built: 48 regions**, defined in `src/data/regions.json` (members, starting
support, funding weight, optional fixed station site such as Norilsk and
Baikal). Russia is split by federal district (Western Russia, Volga & North
Caucasus, Urals, North Siberia, South Siberia, Far East), China into North,
South and West, the USA into its four census regions, Canada into East and
West, Australia into East and West.

`scripts/build-regions.mjs <natural-earth-dir>` rasterises Natural Earth 50m
admin-0/admin-1 polygons into `public/assets/regions.png` (4096×2048, pixel =
region index, 69 KB) and writes `src/data/regions.generated.json` (label point,
area, the 8 biggest cities per region from Natural Earth populated places).
The globe shader samples that map for borders, SIGINT coverage, hover,
selection and the support map; the UI samples it on the CPU for picking.
Re-run the script after editing `regions.json`.

### 3.2 OPV installations

**Operational Base** (the player starts with **Operational Base Padua**, Italy)

* Houses deployable troops and aircraft, plus research, archives,
  containment, workshops and quarters (the old C++ base facilities are the
  reference).
* **Reach is a radius set by its aircraft's fuel and speed.** A team can only
  be sent to sites inside that reach, and travel time matters because leads
  expire.
* **Hired flights** (user decision, 2026-11-15) reach anywhere from any base
  and are available for any lead or site, not only those out of reach. Our
  own aircraft stay home. Both are in `data/aircraft.ts`.

  | | Chartered jet (`CHARTER`) | Commercial flight (`COMMERCIAL`) |
  |---|---|---|
  | Seats | 2 agents | 1 agent |
  | Kit | civilian or plainclothes, armed (a private terminal doesn't search bags) | civilian only, unarmed (airport security) |
  | Speed | 430 kn | 380 kn |
  | Prep | 4 h to book | 8 h to book and connect |
  | Cost | $25k plus $35/nm each way | a tenth of a charter: $2.5k plus $3.50/nm |
  | Noise | 0.5 | 0.2 |

  Going armed on a charter is the agents' best chance of getting out if a
  double or a trap compromises them: armed agents fight their way out,
  unarmed ones are taken. In civilian clothes, one or two passengers make
  no noise at all.
* **Helicopters are owned, jets are leased.** A **helicopter** (short range,
  slow, can land anywhere, discreet) is bought outright ($900k, then $35k a
  month for crew and maintenance; sells back for half). A **jet** (long
  range, fast, needs an airfield, more visible, so it adds to a team's
  secrecy cost) is leased ($350k a month; handed back for nothing).
* **Where the aircraft waits decides the risk and the haul** (user design):
  * A **helicopter stays on the tactical map** during the mission, on the
    landing zone, and **the enemy can destroy it**. In exchange, at the end
    of a mission it **lifts out every body and all the loot** automatically.
  * A **jet waits at an airfield** and is never at risk. But the team must
    **destroy the vampires' bodies and collect the loot by hand**, then
    reach an **extraction zone**, and **leaves with only what its units can
    carry**. A chartered jet works the same way.
  * Until the tactical layer exists (step 6), missions are auto-resolved: a
    helicopter is lost with a 35% chance when its team loses a fight and 5%
    when it wins one (`HELICOPTER_LOSS` in `sim/missions.ts`), costing 1.5
    secrecy; the crew get clear and the team comes home on a hired flight.
    Loot and bodies don't exist yet (they arrive with research, step 5).
* **Teams per base: as many as its transport allows.** Each team needs an
  aircraft and its seats; hangars and troop facilities cap how many a base
  has. A base fully built out for it fields about **6 teams** at once.
* More Operational Bases can be built later; they are expensive.

**SIGINT Station** (the player starts with **one in a random European region**, never Italy)

* Intercepts communications, finance, CCTV and hospital records.
* **Hears its own region well and its neighbours faintly.** Each vampire
  operation has a daily chance to surface as a lead: `1 − e^(−rate)`, where
  the rate sums every ready station: 0.5 for a station in the region (≈39% a
  day), 0.015 for one in a neighbouring region (≈1.5% a day)
  (`sigintRates` in `sim/commands.ts`). Stations add up: two in a region
  double the rate; one in the region plus one next door adds both.
  Neighbours share a border or a short sea crossing (≤160 km: the Channel,
  Gibraltar, the Sicilian narrows), from `src/data/adjacency.generated.json`
  (`scripts/build-adjacency.mjs`, which drops contacts made only by overseas
  territories such as French Guiana and Greenland). Activity nobody hears
  happens unseen and does its damage anyway (support loss, infiltration).
  On the globe, a station's own region gets the blue border, neighbours a
  faint one.
* No troops. Cheaper than an Operational Base. Upgrades could raise
  detection strength (more leads, sooner, better quality).

**Building**: the player picks "Build new base" or "Build new SIGINT station",
then clicks the globe. A dialog suggests a name from the nearest town in that
region ("Station Szeged", "Base Cairo"; a numeral if taken) and lets the
player change it; installations can be renamed later. Towns come from Natural
Earth's 10m populated places (about 7,200, built into
`src/data/places.generated.json` by `scripts/build-places.mjs`). A station sits
where it was clicked (the old fixed Norilsk/Baikal sites now only count as
names).

**Building rules and support erosion**

These rules apply to **SIGINT stations and Operational Bases alike**.

* Regional **support is an integer from −5 to +5** (−5 backs the vampires,
  +5 backs the OPV). Internally it can be a fractional value that is shown
  rounded, so small gains and losses accumulate.
* The bloodlines run **media campaigns** that erode regional support.
  **Ignoring incidents** (leads that expire, sites left alone) erodes it too.
* Running cost and permissions by support (draft numbers, to be tuned):

| Support | Effect on installations in the region |
|---|---|
| +5 | **no rent or maintenance** |
| +3, +4 | running costs −50% |
| +1, +2 | normal; new installations allowed |
| 0 | running costs +50%; no new installations |
| −1, −2 | running costs +100% (bribes, cover, legal pressure); warning each month |
| −3 or lower | the region **evicts** the installation: it is lost, with its coverage, troops and aircraft recalled or lost |

* An Operational Base being evicted is serious (it can end the game if it
  is the last one), so it gets a warning a month ahead and a chance to respond.
* Support is won back with the OPV's own media campaigns and successful
  operations, and later with **HUMINT** (agent networks with a more global
  reach; to be designed).

### 3.3 Leads and the operation chain

Vampire activity is no longer a flight to shoot down. Each bloodline runs
**operations** (feeding, infiltration, harvest, PR campaign, supply, recruitment)
inside regions. An operation in a covered region throws off **pings**.

```
vampire operation in a region
        │ (only if a SIGINT station covers the region)
        ▼
  SIGINT ping ──▶ LEAD on the globe (a person, place or transaction)
        │
        ▼
  deploy a team from an Operational Base in reach
        │
        ├─ investigate / surveil  ─┐
        ├─ interrogate a contact   ├─▶ no combat: resolved on the geoscape
        ├─ detain a thrall/familiar┘     (success depends on team, time, secrecy)
        │
        ▼
  more leads, or a revealed VAMPIRE SITE (camp, nest, feeding ground, lair)
        │
        ▼
  strike mission ─▶ tactical combat (iteration 1: auto-resolved)
        │
        ▼
  debrief: captives, artefacts, intel toward the sigil's lair, support and secrecy changes
```

* **Arrival decision.** Each lead resolves through one short choice on arrival,
  written for the situation. It is what makes double agents interesting
  rather than bad luck.
* **HUMINT events (later).** High support in a region yields human sources
  there, producing events elsewhere, e.g. "Because of high support in Central
  Europe, a counter-intelligence source in Warsaw reports that one of our
  assets in Madrid has likely been turned."
* **Lead variety.** The lead's kind decides what the job is, and some kinds
  are not what they seem. Draft kinds:
  * **Capture and interrogate**: snatch a familiar or thrall and question them.
  * **Volunteer source**: someone comes forward, and a quiet meeting is enough.
  * **Double agent**: looks like a volunteer source, but it's an ambush.
    Intel quality and the team's skill decide whether the setup is spotted.
  * **Surveillance**: watch a place or person over hours or days.
  * **Recovery**: a body, a hospital record, CCTV footage to retrieve before police do.
  * **Rescue**: a victim held for feeding.
* **Team configuration before every deployment.** The player picks the
  soldiers, the team size and the kit profile (draft: *civilian clothes*,
  *plainclothes armed*, *tactical*). Bigger, louder teams handle surprises
  (an ambush) better but **cost secrecy**. A lone agent in civilian clothes is
  invisible but vulnerable. Aircraft choice adds to the noise (helicopter
  over a city, jet landing).
* Leads have a **lifetime**. Ignore them and the operation completes, and the
  region's support drops.
* Each sigil's **lair** is revealed by accumulating intel on that bloodline
  (from leads, captives and research), replacing the old "trace the line"
  research.
* Non-combat outcomes (draft): success gives intel or a site; partial
  success gives a weaker lead; a blown cover costs secrecy and can tip off
  the bloodline (it relocates or counter-attacks).

### 3.3b Agents and recruitment

* Agents are individuals: name, origin, stats that grow with use, wounds,
  permadeath. Strike-team members are Catholic religious under the three
  vows, so they draw no salary; the OPV pays their **upkeep** (housing,
  training, equipment).
* Recruitment draws a monthly pool of candidates. Each candidate's origin
  region is weighted by `support² × Catholic presence × (OPV presence bonus)`,
  so early recruits are mostly European and the mix follows the player's
  reach. Names come from per-culture pools (Catholic baptismal names plus
  local surnames); each region maps to one or more cultures.
* **Experience.** Stats grow with use (cap 95): each stat a mission's play
  used rises 1–3 on a success, 0–1 otherwise; a cover-up's stat rises 1–2 on
  success, 0–1 otherwise. Debriefs and cover-up results list the gains under
  "Experience". Vitality doesn't grow with experience (user decision): it
  will rise through kit and science once research and engineering exist.
* Both brothers and sisters serve (religious vows apply to both); this is an
  assumption and easy to change.

### 3.4 Secrecy, the Masquerade and open war

* **Covert phase** (start): a global **Secrecy** meter. Loud actions cost
  secrecy: jets, firefights in cities, civilian casualties, bodies left
  behind, failed interrogations. Destroying a sigil is the loudest thing of
  all, because the bloodlines retaliate publicly. As in the C++ game, low
  secrecy makes construction more expensive and makes hostile regions
  uncooperative.
* **Cover-up operations** restore secrecy before it runs out. They are
  offered as events when secrecy is under pressure, especially after a loud
  incident, and run **off-screen**: assign agents and money, wait a few days,
  get a result (like XCOM 2's covert actions). Examples:
  * Pay off a head of national security to blame an explosion on a cell of
    radical terrorists.
  * Sneak into a police evidence room and swap a shirt soaked in vampire blood
    for one soaked in ordinary blood.
  * Lean on an editor to kill a story; plant a hoax so a real video looks fake.
  * Get a coroner to re-file a cause of death.
  Each costs money and/or agents, takes time, and can fail, sometimes making
  things worse. The offer expires if not taken.
* **Secrecy reaching 0 forces OPEN WAR, and it is one-way**: once the public
  knows about an 800-year-old war, it can't be hidden again. It is no longer
  a loss condition.
  The Vatican acknowledges the OPV, and the rules change. Draft:
  * The secrecy meter is gone. Public support per region becomes the main meter.
  * Regions openly ally with the OPV or with the bloodlines.
  * Vampires stop hiding: bigger, more frequent, overt operations.
  * The OPV gains open recruitment, heavier aircraft and gear, military
    cooperation from allied regions, and faster deployment.
  * Loud actions no longer cost secrecy, but civilian harm costs support.
* **Vampire escalation follows secrecy.** While secrecy is high, the
  bloodlines also stay quiet. As it falls they turn to tactics that can't be
  explained away as a "high-risk police warrant": explosives, rocket
  launchers, car bombs, and finally **assaults on OPV installations**.
  Escalation affects the kinds of operations they run, the danger of
  missions, and attacks on bases and stations.
* **Loss condition: the OPV loses its last Operational Base.**

### 3.5 Economy and politics

* **Funding** = Vatican stipend (reviewed monthly on performance) +
  each region's contribution × its support. Catholic regions start friendlier.
* **Support** per region is pushed down by vampire PR and unchecked activity,
  and up by successful operations and media spending.
* **Infiltration** per region: unchecked infiltration operations compromise
  a region's government (it stops funding, refuses bases).
* The game is **lost when the last Operational Base falls** (section 3.4).
  Money trouble and hostile regions lead there indirectly (no funds, no
  stations, no warning of attacks) rather than ending the game themselves.
* Recruitment, salaries, research, manufacturing and the black market carry
  over from the C++ design and are retuned later.

**Budget targets (user, 2026-11-15).** Measured in Act II (the hostage
years, the lean part), in "working bases": a base abroad with six
operators, a helicopter and a SIGINT station, about $555k a month at
ordinary support.

| Difficulty | Without trying | With good financial play |
|---|---|---|
| Novice | 2 bases | 3–4 bases |
| Inquisitor | 1 base | 2–3 bases |
| Grand Inquisitor | barely afloat with 1 | 1 base reliably + 1 remote base |

"Without trying" is the hostage stipend plus regional contributions as the
bloodlines wear support down. "Good financial play" adds rising pledges, a
workshop on production lines, and selling tissue and artifacts. Levers:
`regionalFunding` and `marketPrices` per difficulty
(`src/data/difficulty.ts`), `HOSTAGE_STIPEND` (`sim/story.ts`), `PLEDGE`
(`sim/economy.ts`), `GOODS` (`sim/market.ts`). Pinned by
`src/sim/market.test.ts`.

**Pledges (user: "as you respond to events in other nations, they should
contribute more").** Each region's contribution is multiplied by its
pledge (60%–200%, starting at 100%). What we do there this month goes on
its record:

* any operation that worked: +8%;
* a nest, den or haven burned: +12% on top;
* a lair: +50% on top;
* an artifact handed back: +10%;
* a bloodline operation we knew of and let run: −3%;
* a site we found and never hit: −5%.

Neighbouring regions get a third of every field result (word spreads). At
month end the record settles into the pledge, and the monthly report lists
who gives more and who gives less, X-COM council style. The region panel
shows the pledge and this month's record.

### 3.5b The black market (user, 2026-11-15)

"When shit gets tough you just sell off alien artifacts." Three sources,
all on one screen (Market, key K):

* **Vampire tissue.** The remains in cold storage. Worth $60k a set raw,
  $160k once Vampire physiology is done, $280k after Haematology. Each
  sale costs Secrecy −0.4, and the remains are also what vampire research
  needs.
* **Artifacts.** The bloodlines have been collecting for 800 years.
  * Dens (30%) and havens (60%) sometimes keep a piece worth $120–250k or
    $250–500k.
  * Every lair gives up its line's treasure ($1–1.6M; the Sun mask of the
    Huaca, the Book of the Perfect, and so on), plus a chance of another
    piece.
  * Each piece is either sold to a collector (Secrecy −0.5) or returned to
    a church or museum where it was taken, for support +0.5 there and +10%
    on that region's record. Six named pieces per bloodline, never the same
    one twice.
* **Products.** Production lines in the workshops: repeatable engineering
  projects that put a unit on the shelf each run and start again (paying
  materials each run) until stopped or out of money.

  | Product | Needs | Engineer-days | Materials | Price |
  |---|---|---|---|---|
  | Synthetic plasma | Haematology | 45 | $60k | $200k |
  | Pheromone blockers | Pheromones | 40 | $45k | $150k |
  | UV sterilisers | UV weaponry | 30 | $35k | $120k |
  | Ceramic inserts | Composite armour | 25 | $25k | $80k |

  Products cost no secrecy.

**Demand** keeps it from being a money printer. Each market has its own
demand meter:

* a sale pays price × demand, then knocks demand down (plasma 20%,
  inserts 10%, artifacts 20%, the others 15%);
* demand recovers 1% a day, with a floor of 10%;
* so each product sells about 1.5–3 units a month at full price.

Selling a little of everything, steadily, is the skill. A well-run
workshop (10 engineers on all four lines, selling while demand is at least
85%) nets about $510k a month on Inquisitor, $660k on Novice and $355k on
Grand, after materials and salaries.

Prices by difficulty: Novice ×1.15, Grand ×0.85. Once the Order is
exposed, nobody deals with it.

### 3.6 Time

Real-time clock with pause and about 5 speeds (from 5 sec to 1 day per real
second). Events (new lead, team arrived, research done, monthly report) pause
the clock and pop a dialog. Hourly, daily and monthly ticks as in
`strategy/Simulation.cpp`.

---

### 3.7 Research, engineering and captives (step 5a)

User decisions: **hired staff**, **labs and workshops at bases**, **captives
that need containment**.

* **Staff.** Scientists and engineers are hired at an Operational Base (a
  hiring fee, then a monthly salary: they are lay staff, unlike the
  religious agents). Each **laboratory** holds 10 scientists and each
  **workshop** 10 engineers. Base Padua starts with one lab, one workshop,
  4 scientists and 4 engineers; new bases start empty.
* **Facilities** are built like hangars: laboratory, workshop and
  **containment** (3 cells each). Losing a base loses its labs, staff,
  captives and remains.
* **Projects run at one base, with staff assigned** (user decision). The
  player starts a project at a base and assigns that base's free scientists
  (engineers); each adds a point a day, and staff can be moved on and off
  while it runs. As many projects run at once as there are staff for. A
  project never spans bases: its staff and any material it needs (vampire
  remains, a captive, a free hangar) are at its base. A one-off project
  can't run at two bases at once (the same autopsy in Paris and Dallas);
  repeatable ones can (each base builds its own helicopter, into its own
  hangar). What is learned is known everywhere. Research costs only staff
  time; engineering also costs materials, paid when the job starts. Staff on
  a project can't be let go until taken off it.
* **Research** (draft tree): field medicine (wounds heal faster); composite
  armour; signal analysis; vampire physiology (needs vampire remains or a
  captive vampire) → UV weaponry, pheromone resistance (vampires hit less),
  haematology (+5 vitality for every agent, now and future: "vitality
  through science"); interrogating a thrall or a vampire (repeatable,
  consumes the captive, gives intel on its bloodline).
* **Engineering**: ceramic plate (armour: "vitality through kit"), UV
  munitions (more damage to vampires), station retrofit (SIGINT hears more,
  at home and next door), and building a helicopter in-house (cheaper than
  buying; needs a free hangar).
* **Containment** costs $40k a month per facility, full or empty: guards,
  food and medical care kept ready (user decision). **Vampires can be
  destroyed** (their remains go to cold storage); **thralls are human and
  can't be executed**, only released to a convent hospital to free the cell.
  A captive being questioned can't be destroyed or released until the
  interrogation is abandoned.
* **Captives and remains.** A successful capture lead brings a thrall back
  if the base has a free cell. A won strike can take a thrall or a vampire
  alive, more often with a helicopter (it lifts everything out) than with a
  jet (the team carries the captive to extraction). Vampire remains come
  back only by helicopter; a jet team burns the bodies on site.

### 3.8 HUMINT: recruited assets (design, 2026-11-14)

**Built (`sim/humint.ts`):** volunteers, recruiting, the four asset types,
doubles that compromise the agent, ratlines on the map, asset calls,
disinformation offers and turned thralls.
* **Spotting a double is Insight** (user: "roll on perception"; there is no
  Perception stat, and Insight is "reading people, spotting a lie"): the
  arrival warning and the "Watch the meeting point first" sweep both roll it.
* **Asset calls** run on the cover-up machinery (`CoverUp.kind`): about one
  call per asset every 50 days (×1.5 in a living bloodline's homeland, up
  to ×2 at low secrecy), lapsing in 2–4 days. Six situations (more money,
  being followed, a cousin, a meeting tonight, something to sell, had
  enough), $5–80k, 1–4 days, one operator, a judged roll (section 3.9).
  Success: they stay, a lead, intel +5, or a 20% cheaper fee (scaled by
  tier). On a hard job a failure burns the asset, and 30% of failures (45%
  very hard) are catastrophic: every asset in the region, and secrecy −2.
  On an easy or routine job the asset stays, shaken. Ignored: 15% the asset is lost anyway. With an average
  operator an asset lasts about four to five months: tune `CALL_RATE`.
* **Disinformation offers**: about one every four weeks while we hold any
  asset (at most two open): false trail (the bloodline's next operation
  put off 10 days; its sites in the region stay 4 days longer and are
  trapped: +0.25 odds on a strike), counter-story (only where support has
  been pushed below its usual level: +0.6), bait (intel +10 on the
  bloodline). $60–180k, 3–8 days, judged; same burn rules.
* **Turned thralls**: "Turn" on a captive thrall (base Science tab). The
  best free operator at the base rolls tradecraft against 50; turned, it
  goes back as an informant in the region it was taken from, at half an
  informant's fee, with +0.1 intel a day on its bloodline. Not turned: it's
  released; 30% of the time it tells its masters (secrecy −2).
* Everything appears on the Covert actions screen and can be called off
  there (secrecy −1, no roll). Bots answer calls and take disinformation
  when money allows.
* **Leads.** SIGINT and informants share one detection rate per region
  (`1 − e^(−rate)`); an informant adds 0.2 in its own region (a station's
  own is 0.5), an access asset 0.1 where no station can be (hostile, or
  closed Europe). Volunteers come forward about any operation nobody has
  heard of, anywhere: 0.0015 a day per operation × Catholic presence ×
  support, about two a month worldwide. A volunteer is always a source.
  Doubles: SIGINT 8%, informants 15%, volunteers 25% of sources.
* **Recruiting.** Every source lead says who the person is and what asset
  they would be. On arrival, "Recruit them" is a tradecraft check
  (difficulty 45): success makes the asset, partial gets some intel, failure
  costs a little secrecy.
* **Unarmed means civilian clothes** (plainclothes kit is armed). A double
  takes the unarmed agent (the one with the best insight, who sat down)
  unless a ratline in the region gets them out (60%, $25k); an armed team
  fights its way out (the old ambush fight, +0.2 odds with a ratline). A
  sweep that spots the trap lets an unarmed team walk away.
* **Fees**: access $20k, PR $30k, ratline $15k, informant $25k a month (halved, user 2026-11-15),
  × 0.6–1.6 by the region's funding, +15% per point of hostility; fixed at
  recruitment. "HUMINT assets" in the finance panel and monthly report.
* **Access** opens hostile regions and, in Act II, its European region.
* **PR**: +0.004 support a day, and halves the bloodlines' media damage in
  its region.
* **Ratlines** lead to our nearest base (outside closed Europe), drawn as a
  dashed green route on the globe; a team stranded by the fall in a region
  with a ratline gets out in half the time ($25k).
* **The church cell** activates in the non-Serpenta region with the most
  assets.
* **UI**: green asset glyphs on the globe (square access, hexagon PR,
  triangle ratline, diamond informant); "From" and "Could become" on lead
  panels; a HUMINT section in the region panel with "Let go"; every asset
  listed on the Covert actions screen.
* **Batch** (bots recruit when the odds say so, and cut the dearest asset
  when money runs short): about 20 volunteer leads a year; bots end the
  year with 0.4–0.8 assets.

The design below is what the user decided; numbers above supersede its
placeholders. Decisions marked (user) are the user's; the
rest are proposals, and numbers are placeholders.

**What it is.** SIGINT is stations that hear bloodline operations. HUMINT is
**assets**: individual people the Order has recruited in a region, each
doing one job. A region can hold **several assets** (user). Agents don't
live with them (user): a team makes the meeting, recruits the asset, and
goes home; from then on the asset works for a monthly fee.

**Where leads come from** (user). Two sources:
* **SIGINT**: as now. **Higher quality**: few of its sources are doubles.
* **Volunteers**: random events. Someone comes forward through a parish,
  a hospital chaplain or a letter to the nunciature, in any region, with
  or without coverage. **More likely a double.**
* Placeholder shares of doubles: SIGINT about 8% (today 30%), volunteers
  about 25%; better intel (higher lead quality) lowers it further.

**Recruiting.** A source lead (SIGINT or volunteer) can be worked two ways
on arrival: **debrief** them (intel now, as today) or **recruit** them as
an asset. The person decides what kind of asset they can be: a customs
officer or police captain gives access, a journalist or a councillor PR, a
smuggler or a parish priest near a border a ratline. The lead says who the
person is, so the player knows what they are going to get.

**Asset types** (user: these three; more may follow):

| Asset | What it does | Placeholder cost |
|---|---|---|
| **Access** (a fixer, an official) | Lets teams travel and operate where they otherwise couldn't: hostile regions, and **a European region during Act II** (user: an access asset there opens that region to our teams while the Vatican is hostage). Gives intel from there: operations in the region can surface as leads without a SIGINT station. | $20k a month |
| **PR** (a journalist, a politician, a bishop's press office) | Manages opinion in the region: a steady push to support (smaller than a media campaign, but permanent and cheaper), and blunts the bloodlines' campaigns there. | $30k a month |
| **E&E ratline** (smugglers, convents, fishing boats) | An escape-and-evasion route out of the region to a safe destination. Compromised or stranded teams in or near the region escape along it: faster, cheaper and safer than going overland unaided, and the aircraft may be saved. | $15k a month, plus a fee when used |

Cost is commensurate with value (user): an access asset in a hostile,
well-funded region costs more than one in a friendly backwater; the more
an asset can do, the more it costs. Proposal: cost scales with the
region's funding weight and how hostile it is.

**Doubles** (user). A small share of sources are doubles, and **a double
always compromises the agent sent to meet it**:
* **Unarmed** (plainclothes or civilian kit): the agent is lost (taken or
  killed).
* **Armed** (tactical kit): an **escape mission**. It's tactical; until the
  tactical layer exists it's auto-resolved, with odds from the team's
  combat.
* Proposal: going armed to a meeting costs secrecy and can spook a real
  source (lower recruitment odds). That is the player's choice: safe
  meetings, or good ones.
* Proposal: an E&E ratline in the region turns a compromised team's escape
  into a run for the ratline, with better odds.
* Today's double agents (30% of SIGINT sources, sometimes spotted from the
  team's insight and the lead's intel) are replaced by this.

**On the map** (user: the ratline must be visible).
* Each asset is a small marker in its region, a different glyph per type
  (a key for access, a quill or megaphone for PR, a boat or arrow for a
  ratline).
* A ratline is drawn as a dashed route from its region to where it leads
  (the nearest safe region, or a base), like a flight path but on the
  ground.
* Region panel: a HUMINT section listing the assets there (name, type,
  cost, recruited when), with "Let go" to stop paying one.
* Proposal: a HUMINT map mode (like the support map) shading regions by
  the assets in them.

**The story.**
* **Act I nudges** (step 3): volunteers abroad come forward on their own
  ("a parish in Boston has three funerals with no bodies"). They are the
  first taste of HUMINT, and a reason to look outside Europe.
* **The fall**: assets are people, not buildings. Those outside Europe
  survive (user: the player keeps them).
* **Ratlines and the fall**: a team stranded in Europe by the fall escapes
  along a European ratline if the player built one: the payoff for
  preparing.

**Asset events** (user: "quirky decisions", like the cover-up mechanic).
Now and then an asset calls with a situation: it wants more money, thinks
it's being followed, has a cousin who wants in, needs a meeting tonight. The
player can send an operator or ignore it. Each time the dice are rolled
against the operator's **tradecraft**:
* success: the asset carries on (sometimes better: a lead, intel, a cheaper
  fee);
* **failure burns the asset**: it's gone;
* **catastrophic failure burns the whole network**: every asset in the
  region.
Proposal: ignoring the call is a smaller risk of a burn without a roll; more
calls in a bloodline's homeland and when secrecy is low.

**Turned thralls** (user). A thrall in containment can be **released as an
asset** inside its bloodline instead of interrogated, if one of our
operators passes a **tradecraft** roll to recruit them (fail: released for
nothing, or worse). Gives the player a reason to release captives.

**Disinformation** (user). An operation run through an asset, **offered like
a cover-up** (user): it arrives as an offer in a region where we have an
asset, it takes
days, money and an operator, and carries risk (a failed roll burns the
asset, a catastrophic one the network). Three kinds of offer (user):
* **false trail**: the bloodline's next operations in the region are
  delayed, or a site it holds moves somewhere we are waiting (a strike
  with better odds);
* **counter-story**: undoes one of its recent media campaigns in the
  region (the support it took comes back);
* **bait**: provoke the bloodline into exposing itself: intel toward its
  lair.
(Setting two bloodlines against each other: not for now.)

**Informant** (user: a fourth type). A plain informant **generates leads like
a SIGINT station** in its region. Balancing two pipes of information
(user: make sure of it). Proposals:
* both feed **one detection rate per region**, and the chance a lead
  surfaces is `1 − e^(−rate)`, so stacking an informant on a station
  saturates instead of doubling;
* an informant hears less than a station (rate about 0.2 against 0.5) and
  only its own region (no neighbours), but needs no local support and no
  construction, and costs about $25k a month against a station's $120k
  plus $600k to build;
* informant leads are human: their doubles share sits between SIGINT's and
  volunteers';
* informants are burned by asset calls like any asset, so they're cheap
  but fragile, where stations are expensive but solid;
* the batch simulator sets the target: leads per month for a player with
  full coverage should stay where SIGINT alone puts it today, whatever
  the mix.

**Covert actions screen** (user; **built**: HUD "Covert", key C). Every
covert action under way and every offer waiting, in one place: cover-ups
now, and later disinformation and asset calls. **Anything under way can be
called off at any time** (user): the money is spent, the agents come home,
secrecy −1, and there is no final roll, so nothing can fail or backfire.
Offers link to the review panel.

**The church cell** (user: "a lifeline"). After the fall, with no base
outside Europe, the cell activates in the region of the player's best asset;
with no assets, in any friendly region that's not under the Serpenta Sigil
(not Europe, not Agnes's homelands in Russia). Built: the region rule (best
support outside Serpenta territory); the asset rule waits for HUMINT.


### 3.9 Judged events: who to send (user, 2026-11-15)

**What it is** (user, after King Arthur's events: "the player has to read
between the lines and dispatch the unit with the right qualities"). Every
off-screen job that rolls an agent's stat (cover-ups, asset calls,
disinformation) is a **judged event**: the text hints at what kind of person
it needs and how hard it is, and **nothing on screen names the stat or shows
the odds** (user: "just hints, not an in-your-face SEND HIGH FAITH GUY").

**Built (`sim/judged.ts`):**
* **The picker**: free agents in **roster order** (user), each with the whole
  stat line (CMB, TRD, INS, FTH), nothing picked by default. No "analysts'
  view" odds on the offer, and no "% to work" on the Covert actions screen.
  Strike-mission orders keep their odds.
* **Readings**: each situation has two or three **variants**, each with its
  own stat weights (some mixed, e.g. 70% Faith, 30% Insight) and a hint. The
  same situation can need different people: the witness may be devout and
  frightened (Faith), embroidering her story for the cameras (Insight), or
  have a boyfriend selling it (Combat). A few are red herrings: an asset who
  is panicking and wants a bodyguard needs calming (Insight), not muscle.
* **Tiers telegraph difficulty** (user: "the dude is careless and has no
  security" is easy; "a priest in a crisis of faith over the headlines" is a
  very hard Faith roll). Each situation has a line per tier; routine has
  none. Odds of each tier: easy 30%, routine 45%, hard 20%, very hard 5%
  (some situations allow only some tiers).
* **The roll**: `0.55 + (skill − difficulty) / 40`, 5–95%. Skill is
  `best × 0.6 + average × 0.4` of the agents sent, weighted across the
  variant's stats, with no kit bonus. Difficulty by tier: easy 30, routine
  42, hard 52, very hard 62; **Faith checks +15** (Faith is rolled 40–70 at
  recruitment, the others 25–55). At the start (six agents; "right" is the
  team's best in the stat, "wrong" a random agent, "veteran" the best +15):

  | Tier | Right agent | Wrong agent | Veteran |
  |---|---|---|---|
  | Easy | 94% | 76% | 95% |
  | Routine | 78% | 50% | 95% |
  | Hard | 53% | 27% | 89% |
  | Very hard | 28% | 12% | 65% |

  Failure stays possible on a correct match (user). The old curve (`/60`,
  difficulties 35–55) gave the right agent only ~18 points over a random
  one: reading the text barely paid.
* **Consequences follow the tier** (so the player doesn't disengage, user):
  easy and routine failures are mild (a cover-up simply fails; an asset
  stays, "shaken"). Only hard and very hard ones backfire (35%, 50% of
  failures) or burn the asset (catastrophe 30%, 45%). Rewards scale by tier:
  ×0.75, ×1, ×1.4, ×1.8 (secrecy, intel, fee cut, support, days of quiet).
* **The debrief teaches**: a failure ends with one line, in the fiction,
  saying whether it was a misread (the variant's own line, e.g. "She wanted
  someone who could pray with her. We sent someone who argued."), the right
  kind of person short of experience, or bad luck.
* Experience goes to the variant's heaviest stat. Money-only cover-ups (the
  hoax, the bishop) have no judgement: 60%, as before.
* The bots read every hint correctly (they sort by the true stat), so the
  batch simulator gives an upper bound. 500 games a difficulty: game overs
  unchanged, median secrecy at month 12 up 2–6 points.

**Hint vocabulary** (standard, so players learn it; written with variety so
it doesn't repeat):
* **Faith**: grief, guilt, fear for a soul, confession, Mass, "hasn't slept
  since", someone who saw one of them, a priest or a nun.
* **Insight**: a story that shifts, a price that moves, an offer too good,
  a motive nobody mentions, a bluff, someone to bargain with.
* **Tradecraft**: cameras, locks, records, servers, being watched,
  "unseen", following without being followed, lifting something.
* **Combat**: hard men, debt collectors, muscle, threats, a courier with a
  baton, "only deals with people who could hurt him".
* **Tiers**: easy is careless, bored, half-convinced, retiring next month;
  hard is wary, burned before, under review, another buyer; very hard is a
  professional, a federal team, the ministry, "already told everyone".

Not judged yet: recruiting a source (tradecraft 45) and turning a thrall
(tradecraft 50) still name their stat. Next: more situations, and a family
of Church requests through the cardinal where what's asked for isn't what's
needed.


## 4. Technical architecture

```
/                     Vite project root (after the C++ code is removed)
  index.html
  src/
    sim/              pure TS game rules: state, clock, AI, leads, economy.
                      No DOM, no Three.js, no React. Deterministic given a seed.
    data/             content tables: regions, sigils, facilities, aircraft,
                      research, items, difficulty (ported from src/data/*.cpp)
    save/             save slots, autosave, export/import, schema version + migrations
    render/           Three.js: globe, atmosphere, markers, coverage overlays,
                      camera, picking (screen to lat/lon)
    ui/               React: main menu, HUD, panels, dialogs, theme
    main.tsx
  public/assets/      textures (converted from art/), region geometry, fonts, audio
  .github/workflows/  build and deploy to GitHub Pages
```

* **Simulation boundary**: `sim` exposes `advance(state, seconds)` and
  commands (`dispatchTeam`, `buildStation`, …). The UI never mutates state
  directly. A small store (e.g. Zustand) publishes snapshots to React a few
  times a second; the renderer reads state each frame.
* **Randomness**: a seeded PRNG whose state is **stored in the save**, so a
  load continues the same stream. (Lesson from the C++ review: its RNG was
  not saved.)
* **Rendering** (geoscape):
  * `MeshStandardMaterial`/custom shader globe: day albedo, normal map,
    specular as ocean roughness, **night lights blended by sun direction**,
    and real sun position from the game clock (port `core/GameTime` sun maths).
  * Atmosphere rim (Fresnel shell), optional cloud layer, starfield.
  * ACES tone mapping, sRGB, bloom on city lights and markers (postprocessing).
  * Region borders as lines on the sphere; covered regions glow; base reach
    drawn as a translucent geodesic circle; animated markers for leads,
    teams in transit and sites.
  * OrbitControls-style camera with damping, zoom limits, smooth fly-to on
    selection; raycast picking returns lat/lon and region.
* **UI**: React overlay, gothic black-and-gold theme (starting point:
  `art/ui_test/`), CSS transitions, keyboard shortcuts, everything clickable.
* **Deployment**: Vite `base` set to the repo name; GitHub Action builds and
  publishes `dist/` to Pages.
* **Testing**: Vitest on `sim/` (deterministic seeds, months of simulated
  campaign, like the C++ smoke test), plus save round-trip and migration tests.

---

## 5. Saves

* **Storage**: IndexedDB (or `localStorage` while saves stay small), wrapped in
  try/catch. Several manual slots plus an autosave (monthly and on quit).
* **Format**: JSON `{ format: "vamps-save", version, savedAt, state }`.
* **Export**: download a `.vamps.json` file. **Import**: file picker, then
  validate, migrate and load into a slot.
* **Validation on load** (lessons from the C++ review): check the schema
  version, run migrations, validate enums and id references against the
  data tables, and reject or repair rather than crash.
* Saving during tactical combat is out of scope for now.

---

## 6. Iteration 1 scope: main menu + playable geoscape

In scope:

1. Project scaffold: Vite + TS + React + Three.js, lint, Vitest, Pages deploy.
2. **Main menu**: New Campaign (difficulty), Continue, Load, Import save,
   Settings (audio volume, graphics quality, UI scale), Credits. Animated 3D
   backdrop (the globe or a Vatican scene).
3. **Globe renderer** as described in section 4, with regions, picking and selection.
4. **Campaign start**: Operational Base Padua + one random European SIGINT
   station, starting team, helicopter and jet, funds by difficulty.
5. **Clock** with speeds and pause; hourly, daily and monthly ticks.
6. **Bloodline AI** running operations in regions; **leads** generated in
   covered regions; unseen effects elsewhere.
7. **Dispatch**: send a team from a base in reach; travel time; non-combat
   lead actions resolved on arrival; revealed sites; **strike missions auto-resolved**
   by a simple strength-vs-threat roll.
8. Building new **SIGINT stations** and **Operational Bases**.
9. **Economy**: Vatican stipend + regional funding, salaries, monthly report.
10. **Secrecy** meter and the forced **open-war** switch (rules toggle).
11. Research list (topics, scientists, progress) with a few topics wired up.
12. Save/load slots, autosave, export/import.

Out of scope for iteration 1: tactical battlescape, manufacturing, black
market, soldier inventories and equipment, base facility grid layout, audio
beyond placeholders.

Done when: a new campaign can be played for several in-game months in the
browser, leads and dispatches work end to end, a save can be exported on one
machine and continued on another, and `sim/` tests pass.

---

## 7. Assets on hand

* `art/earth/`: 2k source maps (day, night jpg; normal, specular tif). The game
  ships them at full 2048×1024 in `public/assets/earth/` (about 1 MB total).
  1024×512 was tried and rejected: city lights turn visibly blocky. The normal
  map is JPG q90 (107 KB vs 623 KB as PNG). The specular map is a one-channel
  grayscale PNG (159 KB), because JPG is no smaller for its hard-edged
  water mask.
* `art/ui_test/`: a gothic UI test kit (frame, button states, bottom tab) to
  use as a starting point for the theme.
* `public/assets/music/`: OpenGameArt tracks by The Cynic Project, CC0
  (credits in `README.md` and the in-game Credits). Files are named by role:
  `menu.mp3` (Crystal Cave), `geo1.mp3` (Sirens in Darkness), `geo2.mp3`
  (Another August); geoscape tracks play in turn. Encoded at 128 kbps CBR
  (`lame --mp3input -b 128 --cbr -q 0`) from the downloaded originals; a
  source already below 128 kbps is kept as is. `src/audio/music.ts` plays a
  playlist per screen with a 2.5 s crossfade, starting on the first click or
  key press (autoplay policy). Master and music volume in Settings and the
  pause menu; effective music level = master × music.
  Any new track must be added to README.md's credits.
  Tactical music: still open. Five Bensound picks (stealth1/2, combat1/2,
  boss) are on hold in `local-assets/music/` (git-ignored, with a README):
  Bensound's free licence is written for online videos, so it's unclear
  whether it covers a game. Ask Bensound or buy a licence before using them.
* `public/assets/sfx/`: interface sounds, CC0 (credits in `README.md` and
  Credits). Trimmed, loudness-matched, MP3 (click 96 kbps mono, cues 128 kbps).
  `src/audio/sfx.ts` plays them with Web Audio; volume = master × sound
  effects. Click: any enabled button, link, checkbox or select. Dispatch cues
  play as each event comes up: `lead` (SIGINT/HUMINT lead), `coverup` (cover-up
  offer), `monthly` (end-of-month report), `vampire` (vampire-initiated events,
  a new event kind; eviction and open war use it as the alarm for now),
  `complete` (construction, arrival, debrief, cover-up result, other info).
* `data/maps/`: tactical map blocks (ASCII). Not needed until the tactical layer.

---

## 8. Open questions

* **Operational Bases**: cost and construction time? Does a base also give
  SIGINT coverage of its own region?
* **Support thresholds**: the draft table in 3.2 needs confirming.
* **HUMINT**: built (3.8). Tune asset attrition after playtests.
* **Research**: are the tree, costs and effects right?
* **Kit profiles**: how they map to equipment once the tactical layer exists.
* **Aircraft**: helicopters can be lost on missions (decided); none are lost
  in transit on the geoscape. Should a lost helicopter's crew be at risk too?
* **Intel at 100**: currently capped and shown; it should reveal the
  bloodline's lair (step 5 or later).
* **Lair discovery**: intel threshold per sigil, or specific chain missions?
* **Victory**: answered by the campaign arc (2b): three of five lesser
  sigils, then Agnes at Montségur.
* **Name and tone**: the title is "Vamps"; is there a subtitle (the C++
  version was "Cathar Protocol")? How serious or pulpy should the writing be?
* **Audio**: music is in (see section 7). Sound effects are in: a click on
  buttons and one cue per kind of dispatch (`src/audio/sfx.ts`).

---

## 9. Plan of work

0. ✅ C++ code moved to `reference/cpp/` (with its DESIGN.md); delete it once
   its numbers are ported into `src/data/`.
1. ✅ Web project scaffolded; `.github/workflows/deploy.yml` builds, tests and
   publishes to Pages on push to `main` (needs the repo on GitHub with Pages
   set to "GitHub Actions").
2. ✅ Globe renderer (`src/render/GlobeView.ts`) and main menu. Placeholder
   campaign state lives in `src/ui/store.ts` until `sim/` replaces it.
3. ✅ `sim/` core: `state.ts` (GameState), `rng.ts` (seeded, saved), `clock.ts`
   (hourly/daily/month-end ticks, stops on events), `economy.ts` (stipend,
   regional funding, support-scaled running costs, eviction), `commands.ts`
   (building), `campaign.ts` (new game). Saves in `src/save/` (validated,
   versioned, slots + autosave + export/import). Tests in `src/sim/sim.test.ts`.
   Balance note: with no teams or salaries yet, cash flow is very positive
   (about +$2M/month on Inquisitor); revisit once teams cost money.
4. Bloodline AI, leads, dispatch and auto-resolve, in three parts:
   * ✅ **4a**: `sim/personnel.ts` (candidates, recruiting weights, agents,
     aircraft leases, hangar/quarters upgrades, upkeep), `sim/operations.ts`
     (bloodline operations, lead generation, ignored-lead penalty),
     `data/names.ts` (≈25 Catholic name cultures, region → culture mix and
     Catholic presence), `data/agents.ts`, `data/aircraft.ts`. UI: lead and
     installation panels, active-leads list, base screen (Agents / Recruit /
     Aircraft / Facilities), clickable markers, reach rings. Save version 2
     with a v1 migration (old campaigns get the founding team).
     Measured over 6 months with no player response (10 seeds each): about
     12 leads per campaign from the starting station; average support falls
     1.0 (Novice), 1.5 (Inquisitor), 2.0 (Grand Inquisitor).
   * ✅ **4b**: `data/kit.ts` (civilian / plainclothes / tactical: noise,
     firepower, armour, skill bonuses), `sim/combat.ts` (team skill = best×0.6
     + average×0.4 + kit; round-based auto-combat with deaths; Monte-Carlo
     odds), `sim/missions.ts` (dispatch with secrecy and fuel costs, flight
     time, arrival decision with 2–4 plays per lead kind, multi-hour plays
     such as stakeouts and waiting for local daylight, double-agent tells and
     false alarms, sites (nest / den / haven) that move after 10–16 days,
     strikes, intel per bloodline, XP, wounds, the fallen), `sim/secrecy.ts`.
     UI: dispatch screen, orders and debrief dialogs, mission and site
     panels, "In the field" list, flights as arcs on the globe, memorial on
     the base screen. Save version 3.
     Secrecy cost: kit base + per extra agent + aircraft noise (one or two
     agents in civilian clothes travel unnoticed). Fights add 0.5 + 0.25 per
     round. Secrecy recovers 0.1/day.
     Probe (`PROBE=1 npx vitest run src/sim/probe.test.ts`, a bot answering
     every lead and strike for 6 months, 10 seeds): support in the covered
     region +1.6..+2.0 (vs −1.5..−2.5 ignoring it), secrecy 80 → about 40,
     about 1 agent lost, intel ≈ 125 spread over the bloodlines.
   * ✅ **4c**: `sim/coverups.ts` (eight off-screen cover-up kinds; a steady
     trickle of offers, about 3 a month on Inquisitor, more after noise
     (`heat`) and at low secrecy, usually where the last incident was; cost
     money and 0–2 agents for 1–7 days; success by the agents' skill, else
     fail or backfire (35% of failures): secrecy and local support lost;
     `humintBonus` is the hook for HUMINT/CI to raise offers and odds),
     `sim/media.ts` (the Order's media campaigns per region: quiet /
     sustained / saturation, priced by the region's weight, paid daily,
     +0.35/+0.75/+1.25 support a month with diminishing returns near +5;
     saturation costs 0.6 secrecy a month). Economy pass: stipend 1.3M /
     0.8M / 0.55M, regional funding scale 150 → 110, agent upkeep 12k → 25k,
     recruit 50k → 80k. Building by clicking the globe with suggested,
     editable names; rename in the installation panel. Save version 4.
     Probe (bot answering every lead and taking every cover-up while secrecy
     < 75): Inquisitor funds $5M → $4.9M over 6 months ($8.4M if idle),
     secrecy 80 → 56 (about 44 without cover-ups); Grand $3M → $1.0M.
5. Research, open-war switch, polish, balance pass, in three parts:
   * ✅ **5a**: research and engineering (design in 3.7). `data/research.ts`
     (the tree and effect sizes), `sim/research.ts` (projects, captives,
     effects), facilities made generic (`FACILITIES` in
     `data/installations.ts`: hangar, quarters, lab, workshop, containment),
     staff hiring and salaries, per-base projects with assigned staff
     (`GameState.projects`), captives and remains from missions,
     `CombatMods` in `sim/combat.ts`. UI: Research screen (HUD button, key R),
     base Science tab, generic Facilities tab, research in "Under way".
     Save version 5. Probe (bot doesn't research): Grand Inquisitor ends 6
     months at $0.3M (was $1.0M) because of staff salaries; check in 5c.
   * **5b step 1 ✅: bloodlines as enemies** (`sim/bloodlines.ts`). Intel 100
     finds a lair (a site of kind "lair": 14 thralls, 6 vampires, never
     moves; the Perfecti's is Montségur, the others a great city of their
     homeland). A won assault destroys the bloodline: its operations, leads
     and sites end, its homelands gain 0.6 support, and the survivors grow
     20% bolder each (more operations and media). A failed assault leaves
     the lair standing. `lairLocked` is the hook for Act 1–2 (the Perfecti
     until three sigils fall). Lair odds at night for 8 tactical agents:
     rookies 15%, veterans 67%, rookies with plate+UV+pheromones 87%.
     Mission intel back to ×1.0 (with diminishing returns): first lair
     around month 3–5 for a player answering leads. Bloodlines screen (B),
     lair markers (purple pentagons), lair panel and full-team assaults.
   * **5b step 2 ✅: the campaign spine** (`sim/story.ts`): acts, the fall,
     hostage rules, exposure, the return and victory (see 2b, "Built").
     Batch (bots that don't yet build abroad or break sigils): every game
     survives the fall into the church cell. Then the hostage economy bites:
     Grand Inquisitor bots go broke in about 65% of games, Inquisitor
     builders in about 26%. Exposure in 5–25%. Bots find lairs but can't
     storm them from a 6-bed cell. Step 3: Act 1 nudges and the build-up to
     the fall. Step 4: bots that build abroad and break sigils; tune to one
     year.
   * **5b step 3 ✅: Act I nudges** (see 2b, "Act I beats"). Batch: Grand
     Inquisitor game overs rise to 8–11% (bots never build abroad, so
     Boston always pays); step 4's bots should build abroad.
   * **5b step 4 (first pass): a campaign bot and the Act II economy.**
     User decision: **spoils + cheaper bases**. An Operational Base now
     costs $250k a month (was $500k; halved again at support +3). A won
     strike seizes the bloodline's money: nest $70–130k, den $150–250k,
     haven $250–350k, lair $1.5–2M; a team without a helicopter carries out
     half. Mission intel ×1.5 (was 1.0). New bot policy `campaign`
     (`src/sim/bot.ts`): builds a base outside Europe at once, buys its
     helicopter, springs the fall with everyone aboard Padua's jet, puts
     stations over lesser homelands within helicopter reach, leases a jet
     only for a lair out of reach, adds a second base in Act II when it can.
     **Findings (200 games each, 12 months):** the campaign bot survives
     the fall with its people, stays mostly solvent (game over 4% Novice,
     17% Inquisitor, 14% Grand), and destroys about one lesser bloodline a
     year on Novice. **Nobody wins in a year.** The limit is reach, not
     intel or money per strike (doubling either barely moved it): one
     base works the homelands within its helicopter's range, and a second
     base ($3.5M) is rarely affordable. Also: **the idle bot never loses**
     within a year (ends rich in the cheap church cell), because nothing
     escalates yet. Levers to decide: build cost of bases, jets, the
     escalation (5b), more reach per base.
   * **5b step 4 (second pass): budget targets, pledges, the black market**
     (3.5, 3.5b).
     * **Funding:** `regionalFunding` is now Novice 1.25, Inquisitor 0.95
       and Grand 0.9 (was 1.0, 0.8 and 0.6). The hostage stipend is
       20/35/50% (was 15/30/45).
     * **Campaign bot results:** Act II month income (stipend plus
       regional) is $1.4M on Novice, $765k on Inquisitor and $540k on Grand,
       which is 2.5, 1.4 and 1.0 working bases.
     * **Pledges** add a median of $125k a month on Novice and $50k on
       Inquisitor (p90 $195k and $145k), growing through the year.
     * **The bots rarely get the research chain going**, so their market
       median is near 0. On Novice, p90 is $700k a month.
     * **What good play adds:** the well-run workshop test, plus pledges,
       tissue and artifacts, gives about 4 bases on Novice, 2.7 on
       Inquisitor and 1.9 on Grand, inside the targets.
   * **5b**: escalation and open war: violence rising as secrecy falls, raids
     and base assaults, the open-war switch, lair reveal at intel 100, lair
     strikes. **Target: a competent player wins in about 12 months of game
     time** (as in the 1994 X-COM): all six bloodlines destroyed, the first
     lair found around month 3–4, the last around month 10–12, which needs
     SIGINT coverage on every continent by the second half. Each bloodline
     destroyed stops its operations; the survivors grow bolder. Open war is
     the third act, not a fail state: a careful player stays hidden until
     about month 8, a reckless one breaks the Masquerade around month 4.
     Secrecy stays one global meter (a story in China puts the US on alert);
     the local consequence is the bloodline that was hit going on alert
     (moving sites, striking back nearby, pushing its media harder).
   * **5c**: polish and balance: graphics and UI-scale settings, a full
     campaign balance pass, open questions.

## 9b. Batch simulation

`npm run batch` plays hundreds of headless campaigns in parallel (worker
threads; about 500 twelve-month games a second on 16 cores) with bot
policies from `src/sim/bot.ts` (idle, responder, builder), and prints
p10 / median / p90 of where they end up plus a monthly timeline; full
results go to `reports/` (git-ignored) as JSON. Options: `--games`,
`--months`, `--difficulty`, `--policy`, `--seed`, `--threads`, `--out`.
The game runner is `src/sim/batch.ts` (deterministic per seed).

Fixed after the first findings (user decisions, 2026-11-14): regions settle
back toward their starting support (`SUPPORT_SETTLE_PER_DAY`, 1/200 of the
gap a day), so most of the world stays neutral and only pushed regions turn;
**half the regions hostile (24 of 48, at support −3) loses the war**, with a
warning from the Holy See at 18; **debt has consequences** (first month-end
in the red: auditors, a quarter of lay staff walk out; second: half the
rest leave and leased jets are repossessed; third: the Order is
dissolved); **intel is slower** (missions ×0.35, interrogations take longer
and give less, every gain shrinks as a bloodline's intel fills:
`addIntel`). The bots now recruit and economise.

After (150 games each, 24 months): intel 100 around month 11 for a player
answering leads (month 5–7 with three stations and a lab running
interrogations); Novice never ends; Inquisitor ends in debt only for the
most overextended bot (2%); Grand Inquisitor dissolves an idle Order around
month 18 and an active one in about a third of games. Hostile regions reach
4 (Inquisitor) to 12 (Grand) by month 24: the hostility loss needs 5b's
escalation to bite. **Open war is still near-certain** for a bot that
answers every lead on Novice and Inquisitor: to fix in 5b/5c.

First findings (200 games each, 12 months), before those fixes:
* **Intel hits 100** on some bloodline within about 3 months for any active
  player: too fast for a lair reveal at 100.
* **No campaign ends.** Game over only happens when the last base is lost,
  and none were in 12 months, even on Grand Inquisitor with 36 of 48 regions
  hostile.
* **Negative funds do nothing.** Grand Inquisitor runs out of money by
  month 6–8 whatever the player does (idle −$0.9M at month 12, active
  −$3M to −$4M).
* **Answering everything ends in open war** on Novice and Inquisitor
  (responder 36% / 63%, builder ~100% within the year): mission noise
  outruns cover-ups and the 0.1/day recovery.
* **World support only falls**: average support ends −0.8 / −1.8 / −3.1
  (Novice / Inquisitor / Grand) whatever the player does; the player only
  holds the regions it covers.

## 10. Decision log

* 2026-11-14: music added (open-licensed, from OpenGameArt); every track is
  credited in README.md and on the Credits screen.
* 2026-11-14: "No More Magic" dropped; "Crystal Cave (song18)" is now the
  menu theme and "Sirens in Darkness" plays alone on the geoscape.
* 2026-11-14: "Another August" added to the geoscape rotation; music files
  renamed by role (menu, geo1, geo2...) and re-encoded to 128 kbps; master
  volume added beside music volume.

* 2026-11-14: 4b built. Odds shown on arrival are computed only from what the
  player can see, so a double agent never shows through them; its tells
  ("a van across the street") also appear as false alarms with honest
  sources, and snatching an honest source costs support. Leads and sites being
  worked on site don't expire. Dispatching doesn't unpause the clock.
  Dismissing an arrival without choosing aborts.

* 2026-11-14: initial decisions recorded (section 1).
* 2026-11-14: C++ code needn't be preserved. SIGINT stations are support-gated
  (cost rises, then eviction). Deployment teams are configured per mission and
  their size and kit drive secrecy cost. Loss = last Operational Base lost, with
  vampire escalation tied to falling secrecy. Lead kinds are varied, including
  double-agent ambushes.
* 2026-11-14: 4a built. Background media pressure cut to about −0.05/month;
  most erosion now comes from unanswered operations (−0.05..−0.08 each,
  ×2.5 when a known lead was ignored). Showing an event on the globe pauses
  the clock.
* 2026-11-14: agents are individuals; recruits' origins follow regional
  support; arrival decisions per lead; HUMINT-driven events later; no
  backgrounds (all agents Catholic, under the three vows, trained internally).
* 2026-11-14: step 3 built. Vampire media pressure tuned to about −0.2
  support/month per region on Inquisitor (the first draft was ~3× too strong).
* 2026-11-14: support rules apply to Operational Bases too. Support scale is
  −5..+5 (+5 = no running costs). Teams limited by transport (about 6 per full
  base). Aircraft leased. Open war is one-way, with off-screen cover-up ops
  to restore secrecy before it hits 0. Fast auto-combat for strikes and
  base assaults in iteration 1.
* 2026-11-14: step 4c. Cover-up offers are a steady trickle (user's call),
  more likely after noise and at low secrecy; later HUMINT/CI improves the
  odds. Bigger cover-ups need agents (default taken). Media campaigns per
  region at three levels. Money tightened (Inquisitor starts at about +$0.6M a
  month before missions). Building is "pick the kind, click the globe, name
  it"; names are "Base X" / "Station X" after the nearest town, editable.
* 2026-11-14: geoscape left column (user request): an "Under way" panel with
  progress for everything in progress, and a collapsible message log (last 3,
  click to expand; unread count; 300 entries kept). Running cover-ups moved
  from "In the field" to "Under way"; offers stay in the field list.
* 2026-11-14: Bensound tactical tracks put on hold (licence may not cover a
  game); kept out of git in `local-assets/` (git-ignored).
* 2026-11-14: sound effects (user's picks): Zippo click for buttons; Krank
  pack cues for complete, vampire activity, cover-up offer, month-end report
  and leads. Vampire media campaigns get their own event kind, "vampire".
  Sound effects volume slider added.
* 2026-11-14: SIGINT hears neighbouring regions faintly, and stations add up
  (user request). Neighbour rate tuned from 0.06 to 0.015: at 0.06 neighbour
  leads outnumbered own-region leads 2 to 1. Probe, Inquisitor: about 15 leads
  in 6 months (was 11). Chartered jets for one agent, anywhere (user request).
  Stat growth from missions and cover-ups was already in but invisible;
  debriefs now list it.
* 2026-11-14: charter stays available everywhere, not only out of reach.
  Vitality doesn't grow with experience; research and engineering will
  raise it through kit and science.
* 2026-11-14: helicopters are bought, jets leased (user design). On the
  tactical layer the helicopter waits on the landing zone and can be destroyed
  but recovers all loot and bodies; with a jet (or charter) the team destroys
  bodies and carries loot to an extraction zone, keeping only what it can
  carry. For now: helicopter loss in auto-resolved fights (35% if the fight is
  lost, 5% if won). Probe: 0.1–0.3 helicopters lost per 6 months for a bot
  that strikes everything.
* 2026-11-14: step 5a decisions (user): hired staff, labs and workshops at
  bases, captives that need containment. Built: scientists and engineers
  ($40k to hire, $20k a month), labs/workshops (10 staff each, $500k),
  containment (3 cells, $600k); Padua starts with a lab, a workshop and 4 of
  each. One research and one engineering project at a time. Captives: capture
  leads bring the thrall back; won strikes take one alive (helicopter 30%
  vampire / 50% thrall, jet 10% / 25%); remains only by helicopter.
* 2026-11-14: research projects run at one base with assigned staff, several
  at once (user decision); one-off projects can't run at two bases at once;
  material (remains, captives, hangars) must be at the project's base.
* 2026-11-14: containment has upkeep whether or not anyone is held ($40k a
  month per facility). Captive vampires can be destroyed (remains to cold
  storage); thralls are human and can't be, only released.
* 2026-11-14: batch simulator added (`npm run batch`, `src/sim/bot.ts`,
  `src/sim/batch.ts`); findings in 9b.
* 2026-11-14: losing and drift (user): most regions stay neutral (support
  settles toward its start); half the regions hostile loses; debt leads to
  dissolution after three month-ends in the red (staff walk out, jets
  repossessed on the way); intel slowed with diminishing returns.
* 2026-11-14: campaign target: about 12 months to destroy all six
  bloodlines. Secrecy stays global (user agreed a regional meter defies
  common sense); local consequences come from the bloodline that was hit.
* 2026-11-14: campaign arc from the book (2b): play the fall of Padua to
  Agnes of Toulouse's Serpenta Sigil; nudge the player to build abroad in
  Act 1 (the second cell is whatever they built); the hostage Vatican;
  three of five lesser sigils reopen Europe; Agnes exposes the Order if
  secrecy hits 0 while the Vatican is hostage.
* 2026-11-14: 5b step 1: lairs at intel 100, lair assaults destroy a
  bloodline, survivors grow bolder; mission intel ×1.0 again for the
  one-year pace (first lair around month 3–5).
* 2026-11-14: 5b step 2: the campaign spine (`sim/story.ts`). For now the
  fall comes on day 45 with a week's warning. It destroys everything in
  Europe; agents in the field survive and agents at the base escape half
  the time. Default safety net: a church cell with a listening post. Act 2:
  stipend 15/30/45% by sigils broken, Europe contributes nothing and is
  closed, Agnes dormant; secrecy 0 means Agnes exposes the Order (stipend
  0). Three sigils: Europe +1 support, stipend 75%, Montségur can be found.
  Agnes's death wins (to confirm against "all six").
* 2026-11-14: the fall reworked (user). The Serpenta Sigil strikes Padua
  when a team leaves it (from day 45, or on day 66 regardless), as in Mass
  Effect 2. Nobody at the base survives, and teams stranded in Europe must
  get out (by air if in range, else overland and the aircraft is lost). The
  church cell is 4 rookies and nothing else: no aircraft, no SIGINT; $60k a
  month. Agnes's death wins. Lair assaults stay auto-resolved until the
  tactical layer gets its own line of effort.
* 2026-11-14: the fall's warning comes through SIGINT (user): graded by
  coverage of Italy and France (own station: a clear warning naming the
  trigger; neighbour: faint, sometimes; none: nothing). HUMINT design
  begun (3.8, draft with open questions).
* 2026-11-14: HUMINT is recruited assets (user). Leads come from SIGINT
  (higher quality, fewer doubles) or volunteers (random events). Agents
  make the meeting and recruit; they don't stay with the asset. Asset
  types: access, PR and E&E ratline (ratlines drawn on the map); several
  per region; a monthly fee in line with their value. A double always
  compromises the agent: unarmed, the agent is lost; armed, an escape
  mission (auto-resolved until the tactical layer).
* 2026-11-14: HUMINT answers (user): an access asset opens a European region
  in Act II; assets call with decisions like cover-ups (a failed tradecraft
  roll burns the asset, a catastrophic one the region's network); turned
  thralls can be released as assets on a tradecraft roll; disinformation
  operations, run like cover-ups; the church cell activates at the best
  asset, otherwise in any friendly region not under the Serpenta Sigil
  (that region rule built now).
* 2026-11-14: disinformation is offered like a cover-up (user). A Covert
  actions screen (key C) lists everything covert under way and waiting;
  anything under way can be called off for secrecy −1 and no final roll
  (user). Built now for cover-ups. A fourth asset type, the informant,
  generates leads like a SIGINT station, balanced so the two pipes share one
  saturating detection rate per region (user: balance the two pipes).
* 2026-11-14: disinformation effects (user): false trail (delay operations
  or move a site into a trap), counter-story (undo a media campaign), bait
  (intel toward the lair). Not setting bloodlines against each other.
* 2026-11-14: HUMINT core built: volunteers (about two a month worldwide),
  recruiting from source leads, access/PR/ratline/informant assets with
  fees, informants sharing SIGINT's detection rate, doubles (SIGINT 8%,
  informant 15%, volunteer 25%) that take an unarmed (civilian-clothes)
  agent or force an armed escape, access gating hostile regions and Act II
  Europe, ratlines drawn on the globe and speeding the fall's exfiltration.
  Next: asset calls, disinformation, turned thralls; then step 3.
* 2026-11-14: HUMINT finished: asset calls and disinformation offers (on
  the cover-up machinery, on the Covert actions screen, with failure
  burning the asset and catastrophe the region's network), turned thralls
  (tradecraft, base Science tab). Spotting a double rolls Insight (user:
  "perception").
* 2026-11-15: 5b step 3, Act I nudges: the Prefect's briefing at start,
  volunteers in São Paulo (day 6) and Boston (day 11), a Boston den on
  day 17 that only an armed team based outside Europe can reach (left
  alone: support −0.8 there), "The name Agnes" (day 24), and "Where would
  we go?" (day 34, only with no base abroad).
* 2026-11-15: Act II economy (user: spoils + cheaper bases): base running
  cost $250k/month; spoils from won strikes (nest ~$100k, den ~$200k, haven
  ~$300k, lair ~$1.75M; half without a helicopter); mission intel ×1.5.
  Campaign bot added. Bots don't reach a one-year win: reach per base is
  the limit; idle never loses (escalation still to come).
* 2026-11-15: Budget targets by difficulty (user): Novice 2 bases without
  trying, 3–4 with good financial play; Inquisitor 1, 2–3; Grand barely
  afloat with 1, 1 + a remote base with acumen. regionalFunding
  1.25/0.95/0.9, hostage stipend 20/35/50%.
* 2026-11-15: Pledges: regions contribute more where we get results and
  less where we let things happen (60–200%, a third to neighbours, reviewed
  at month end, listed in the monthly report).
* 2026-11-15: The black market (user, after X-COM): vampire tissue (priced
  by research), artifacts from dens, havens and lairs (sell, or return for
  support), and workshop production lines (plasma, pheromone blockers, UV
  sterilisers, ceramic inserts). Per-market demand that recovers 1% a day;
  prices by difficulty.
* 2026-11-15: People (user): Cardinal Ettore Valsecchi is the quest giver
  (portrait; a line on every lead; the reserve channel after the fall; 8
  Act II dispatches from Europe). Each bloodline has a named elder with a
  portrait, title, bio and lair line: Josiah Ashgrove, Inés Quispe Sisa,
  Agnes of Toulouse, Zahra of Taoudenni, Shen Wuyou, Cornelis Vos. Their
  names are revealed at intel 25 and their stories at intel 50.
* 2026-11-15: SIGINT leads show the radio-tower scene (user's image),
  captioned as passed on by the cardinal; a HUMINT scene is to come.
* 2026-11-15: HUMINT leads (informants, volunteers) show a stairwell
  brush-pass scene (the user's Gemini image, cropped to the hand-off). The
  street version was rejected for garbled signs and duplicate faces.
* 2026-11-15: Hired flights (user): the charter costs half as much ($25k +
  $35/nm), takes two agents and allows plainclothes, armed (the way to go
  if things may turn bad). A new commercial flight costs a tenth of a
  charter and takes one agent, unarmed in civilian clothes, with 8 h to book
  and connect.
* 2026-11-15: Judged events (user): cover-ups, asset calls and
  disinformation hint at who to send and how hard it is, and never name the
  stat or show odds. Agents in roster order. Steeper roll (`/40`), four
  tiers (Faith +15), mild failures on easy and routine jobs, bigger rewards
  on hard ones, and a debrief line telling a misread from bad luck
  (section 3.9).
* 2026-11-15: HUMINT asset fees halved (user: "otherwise that mechanic is
  gonna get limited by money, not skill"): access $20k, PR $30k, ratline
  $15k, informant $25k a month before region scaling; fees round to $1k.
* 2026-11-15: Source consistency (user: a "police detective" lead recruited
  as a long-haul trucker). Source stories that name a person fix the role,
  asset and sex (the detective and the nurse are informants); the others
  fill {role} from the profile. Clergy don't get "went to their parish
  priest" or lay hints (Mass again, a new car, a daughter); counter-stories
  only through PR, false trails through informants or access, file sales
  through access, PR or informants. "an airport security chief". The
  fishing-boat captain is now a charter pilot and the port a freight depot,
  so they fit landlocked regions.

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

Reframed lore (carried over from the C++ version):

* In 1244 the Church burned the Cathar *Perfecti* at Montsegur. Some survived,
  carrying what is now understood to be a retrovirus: enormous tissue repair at
  the cost of haemophagy and photosensitivity.
* Six **bloodlines (sigils)** descend from them and have hidden in plain sight
  for eight centuries. The OPV is, in effect, the Church cleaning up its own
  13th-century failure, which is one reason the Vatican wants it secret.
* The six sigils and their home continents (traits to be rebalanced):

| Sigil | Home | Trait (first values) |
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
| The Carcassonne Perfecti | Agnes of Toulouse | The Last Perfect (a weaver's daughter from Toulouse; walked out of the fire at Montségur, 1244) |
| The Sahel Brood | Zahra of Taoudenni | The Salt Queen (salt caravans, 1340s) |
| The Jade Court | Shen Wuyou | The Chancellor (Ming secret police, 1570s) |
| The Nullarbor Kin | Cornelis Vos | The Wreck-Lord (a Dutch East India Company under-merchant, wrecked 1641) |

* **The Bloodlines screen** (list and detail, like Research) reveals each
  line gradually, one chronicle entry every 20 intel (user, 2026-11-15:
  "every 20% something new … about their history or their
  patriarch/matriarch"; `src/data/lore.ts`), scrollable in the detail:
  * at 20, the line's history, and the elder's name and title;
  * at 40, the elder: portrait and bio;
  * at 60, how the line works today;
  * at 80, a secret or weakness;
  * at 100, where the elder sleeps (the lair; never a named city, since
    lairs other than Montségur are placed when found);
  * each new entry gets a log line; Agnes's first two are known from the
    start.
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
cropped from 1024×1536 renders (or full-height from 1312×1199 ones), quality
70. All six elders have one. Without one, a dark frame with
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

**Refuelling Station** (user, 2026-11-15: "a third type of facility … allow
the aircraft to reach more places, but pause for a couple hours to refuel")
* A quiet airstrip with fuel and a mechanic: $400k, 7 days, $50k a month;
  support-gated like the others, one per region.
* Our aircraft route through stations on their own (`sim/routes.ts`): the
  quickest route where every leg is within reach, with a **2-hour stop**
  at each station. Out and home alike. The dispatch screen says "via
  Airstrip Lyon (1 refuelling stop)"; the globe draws the flight leg by
  leg, the aircraft waiting at the station while it refuels.
* A faint amber ring shows how far a helicopter can go on from each
  station. Hired flights don't use them.
* **The helicopter is the regional aircraft** (user): reach 450 → 900 nm.
  The jet is unchanged.
* Batch (300 games): Inquisitor unchanged (4% game over). On Grand, the bot
  (which takes every lead it can reach) now reaches more, flies more
  (39 missions a game, was 31) and loses more secrecy: game over 20%,
  was about 10%. The bot's working radius is fixed at 585 nm so the
  longer reach doesn't make it spread itself thinner.

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
inside regions. **Bloodlines are territorial** (user, 2026-11-15): each region belongs to
exactly one line (its homelands, `data/bloodlines.ts`), and a line operates
only there, so a lead in Australia is always the Nullarbor Kin. An operation in a covered region throws off **pings**.

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

**Both ways** (user, 2026-11-16): the market screen has **Sell** and
**Buy** tabs.
* Sell: goods, tissue and artifacts as above, and **spare equipment** out
  of a chosen base's armoury for half its price (`sellItem`; what agents
  carry isn't for sale).
* Buy: **equipment** into a chosen base's armoury at list price, and
  **products** at the dealer's price (×1.5 of a sale at full demand, so
  never a profit; buying nudges demand up by half a sale's drop).
* **Never anything that advances the story** (user): vampire remains
  (tissue), blood, captives and the bloodlines' heirlooms are taken, not
  bought. Goods carry a `story` flag (tissue has it; elder blood and the
  like will too); `buyGoodBlocker` refuses them.

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
  $20k vetting fee for background checks, then a monthly salary: they are
  lay staff, unlike the religious agents). Each **laboratory** holds 10 scientists and each
  **workshop** 10 engineers. Base Padua starts with one lab, one workshop,
  4 scientists and 4 engineers; new bases start empty.
* **Facilities** are built like hangars: laboratory, workshop and
  **containment** (3 cells each). Losing a base loses its labs, staff,
  captives and remains.
* **Projects run at one base, with staff assigned** (user decision). The
  player starts a project at a base and assigns that base's free scientists
  (engineers); each adds 1.5 points a day (was 1; user 2026-11-15), and staff can be moved on and off
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
  **Chains** (user, 2026-11-15: "we can chain research"): field medicine →
  combat surgery (wounds heal 12 a day); signal analysis → advanced signal
  analysis (SIGINT ×1.25, own region and next door) → pattern analysis
  (leads stay open ×1.5 and come with +0.15 intel). Each project has a
  `gives` line (what it will do) and a `result` (what it found).
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

### 3.7b Base grid and the SIGINT centre (design, 2026-11-15)

**SIGINT centre** (user: "allows the base to also get the benefit of a
SIGINT station. Upgradeable after signal research"). **Built** (sim only):
a base facility (`FACILITIES.sigint`), $600k, 10 days, $100k a month per
level (scaled by support, in the base's running cost). Level 1 listens to
the base's region and next door exactly like a SIGINT station; level 2
needs **Signal analysis** and hears ×1.5 (`SIGINT_CENTRE_RATE`). It stacks
with a station in the same region, and with Advanced signal analysis and
Station retrofit. The region counts as covered. Padua starts without one.
Open: should the base and centre fall together when the base is evicted?
(Yes today, since it is part of the base.)

**Modular base: an office building** (user, 2026-11-15: "a 3x3x3
facility with the central column being a lift ... We are more relying on
blending in. So it's essentially an office building"). XCOM hid underground
from alien orbital strikes; the Order hides in plain sight.
**Built** (`sim/building.ts`, base screen "Construction"): rooms on
tiles, the entrance, unbuilt tiles as offices, synergy (lines of 3 and
pairs, best grouping solved exactly) on project speed (labs, workshops;
containment on interrogations) and healing (quarters), building on a
chosen tile or the best one, clearing rooms (blocked while in use), old
bases laid out from their counts on first use, saves keep `rooms`. Room
caps are now the building (23 rooms); hangars stay a count beside it.
A SIGINT centre is one room; its level 2 upgrades it in place, so it has
no synergy. Not built: the Three.js building view, the raid map.
* Each Operational Base is a **3 × 3 × 3** block: **one basement and two
  floors above ground** (user), each a 3 × 3 grid. The **centre column is
  the core**, on every floor, so each floor has a **ring of 8 rooms**: 24
  in all. In the tactical level the core holds **both a lift and stairs**
  (user).
* **Ground floor, front middle tile is the entrance: lobby and security
  checkpoint** (fixed, off limits to building; user). Reception for the
  cover business (an insurance office, a Catholic charity, a shipping
  agent) in front, a guarded checkpoint between it and the core. On a raid
  map it is the main way in.
  That leaves 23 rooms to build. Every room is 1 tile; no corridors, every
  ring tile is reached from the core.
* **Unbuilt rooms appear as ordinary office space** (user): desks, cubicles,
  a few cover staff. The building looks lived-in from day one.
* **Aircraft**: **hangars beside the building**, one aircraft each,
  helicopter or jet alike (user, 2026-11-16: the helipad on the roof is
  undone; the helicopter gets a generic hangar like the jet). Hangars are
  a count, not grid rooms. When a base is attacked, the hangar is a
  **detached structure** on the tactical map.
* **Synergy: lines of 3 and pairs** (user). Rooms of the same kind form a
  group when they sit in a straight line: **along one side of a floor**
  (corner, middle, corner), or **stacked in one column**.
  * A **line of 3** gives each of its rooms **+20%** (proposed).
  * An **adjacent pair** (ring neighbours on one floor, or one directly
    above the other) gives each of its rooms **+10%** (user: "not as big
    as 3 in a row").
  * A T or L shape gives nothing beyond the lines and pairs in it. A room
    counts in **one group at most**: filling a whole side of the building
    (3 × 3 = 9 labs) makes 3 lines, 9 rooms at +20%, not more (user).
  * The sim picks the grouping with the largest total bonus (lines of 3
    first, then pairs from what is left).
* Proposed effects: lab and workshop, project speed; SIGINT centre,
  listening rate; quarters, healing; containment, interrogation speed.
  Open: the exact numbers.
* **Any room may go on any floor** (user), containment included.
* The sim keeps a layout per base, `{ kind, floor, slot }` (floor −1, 0,
  1; slot 0–7 round the ring); counts derive from it. Save migration lays
  the old counts out automatically, in lines of 3 where it can.
* **Demolish** refunds nothing and is blocked while a room is in use
  (staff on projects, a captive in the cell).
* Base Padua: a preset layout on the old counts. A church cell is a single
  floor (a parish basement ring of 8).
* View: the building in Three.js with a cutaway (pick a floor, the floors
  above go transparent), rendered from the room modules in ASSET_LIST.md
  section 4.
* Open: do raids on a base become a battle map built from the same
  floors, the hangar beside them? (The core's stairs and lift are already
  planned for it.)

### 3.7c People, aircraft and cargo as objects (proposal, 2026-11-15)

User: "Scientists, engineers and operatives should all be treated as
persons and occupy quarters. I want to be able to assign personnel to
aircraft and just direct aircraft more like in Phoenix Point. Same goes for
cargo. AC should have cargo capacity ... Some things can also be
transferred using commercial shipping (obviously not vampire guts)."
**Step 1 built:** scientists and engineers are named people
(`GameState.staff`, save v6 converts the old counts), everyone at a base
takes a bed (agents away on missions keep theirs), hiring and recruiting
need a free bed, the Quarters view lists the staff with "Let go", unpaid
staff who leave are named people, staff of a lost base are lost with it.
Facility counts now follow the rooms built.
**Step 2 built** (`sim/transfers.ts`): **ferry flights** (an aircraft at
a base flies to another with people aboard, up to its capacity, on the
refuelling route; it lives there afterwards; beds and hangar space are
taken at the new base at departure) and **airline transfers** for people
($3,000 a head, a day or more by distance). In transit, agents show "In
transit to …" and staff don't count as working. UI: Hangars › aircraft ›
"Fly to another base" (picker plus the segmented load bar), Quarters ›
"Send to another base by airline".
**Step 3 built** (cargo): `Aircraft.cargo` holds vampire remains (load 2,
helicopter only) and captives (load 2, any of our aircraft; a cell is
kept for each at the destination while it flies). A mission's haul is
loaded after the survivors (a captive first, then bodies); what doesn't
fit is burned, and the debrief says a second aircraft would have carried
it. The haul unloads when the aircraft lands at home, not at the fight.
Ferry flights carry remains and captives too (not ones being
questioned). A team on a hired flight still hands a captive over
directly. **Goods and artifacts stay Order-wide for now** (sold from one
pool), so they need no transport; courier shipping waits until something
held per base can go that way (weapons and kit with per-agent equipment).
**Step 4a built** (several aircraft on one mission): the dispatch screen
lets the player choose more of the base's own aircraft (`escorts`); seats
add up, each has its own load bar (jets seat first, so helicopters keep
room for bodies), the slowest sets the arrival, fuel and noise add up.
Each helicopter on the landing zone is at risk in a fight. After the
fight the haul is shared out automatically over every aircraft's free
room (a captive on a jet if there's one, bodies on helicopters), and all
of them fly home and unload. A dev-only `window.vamps` store hook lets
browser checks open screens directly.
**Step 4b built** (aircraft on the globe): aircraft are a focus of their
own (`Focus.kind "aircraft"`): ferry flights draw on the globe and can be
clicked; a base's panel lists its aircraft as buttons. The aircraft panel
shows status, the load bar of what's aboard, and its orders: fly to
another base (the transfer panel, with cargo), open in the hangar; for a
mission, plan it from the lead or site (the aircraft can lead or escort).
**Step 4c built** ("Fly to…"): the aircraft panel's Fly to puts the
globe in an order mode (a banner, Esc cancels). Clicking a base presets
the transfer panel to it; clicking a lead or a site opens dispatch with
that aircraft chosen (from its own base). Clicking anything else says
what to choose.
**Step 4d built** (teams from several bases, Phoenix Point style; user
2026-11-15: "Team lands and waits until another team lands. You can
'start mission' at any time with whomever you have on the ground. No
mid-mission reinforcements." and waiting doesn't tip the vampires off):
* A dispatch to an objective that already has a team on the way or on
  the ground (not yet started) is a **wing** (`Mission.wings`): its own
  base, aircraft (and escorts), agents and flight. Our own aircraft only,
  in the team's kit. "Send another team" on the lead or site panel.
* A wing that lands **before** the team takes the lead (swap). One that
  lands **beside** it joins: its agents are on the ground, the orders come
  again ("N of ours on the ground"), the odds use everyone.
* The orders gain **"Wait for …"** while a wing is in the air: the team
  holds (`waiting`), the mission panel shows who's coming and when, and
  **Start mission** brings the orders back at any time.
* Starting the mission **recalls** wings still in the air (they turn
  around and fly home in the time they've flown). No reinforcements.
* Holding costs nothing, but **the target still expires** (a waiting team
  doesn't hold a lead or site open; a team at work still does). If it goes
  cold, everyone flies home.
* After the fight each joined team flies home to **its own base** on its
  own aircraft (a mission of its own, phase "returning"), with what its
  aircraft carry. A captive goes on an aircraft bound for a base with a
  free cell; bodies on helicopters, each to its own base's cold storage.
  A joined team that lost all its aircraft rides with the main team.
**Step 4e built** (the haul, SSE): after a fight with more than one of
our aircraft on the ground and something aboard, they don't leave at
once: a **Haul** window shows one load bar per aircraft (its team seated,
then captives and bodies) and lets the player move a captive or a body
to another aircraft (room, helicopter-only bodies, a free cell at that
aircraft's base), then **Take off**. Dismissed unattended, the automatic
split stands. A team loading the haul can't be joined.
**Step 4f built** (in-flight orders): a transfer flight can **change
course** to another base from where it is (Change course… on its panel,
then a base on the globe; beds, cells and hangar move with it). A team on
its way out can **turn back** (the mission panel): a joining team alone,
or the team itself, in which case the next team in the air takes the
lead, or, with none, the target is left open for another try. The Haul
window can **burn a body** or **let a captive go** (destroy a vampire) to
make room. The Under way column lists joining teams, transfer flights and
people travelling by airline.
**3.7c is complete** (courier shipping came with 3.7d). The balance bots
don't use escorts, wings or transfers.

**Today:** agents are objects with a `baseId`; scientists and engineers
are counts per base; goods are an Order-wide stock; remains and captives
are per base. Aircraft have seats but no cargo, and only move on a
mission. Nothing can be moved between bases by the player.

**Model**
* **Person**: one type with a **role**: operative, scientist, engineer.
  All have a name, origin, home base and a **location**: at base, aboard
  an aircraft, in transit (commercial), on a mission. Every person takes a
  **bed** in quarters; labs and workshops become workplaces (10 desks
  each). **A quarters room has 8 beds** (user; built): Padua's two give
  16, so 6 operatives + 8 staff leave 2 free, and hiring more staff soon
  means building quarters. Staff on a project stay at their base.
* **A person keeps their bed while away** (user): an operative belongs to
  a base and, at the same time, to an aircraft when aboard. Nobody can be
  hired into the bunk of someone on a mission.
* **Aircraft have one capacity, a number** (user: "capacity = 8 ... 8
  operators or 5 operators + 1 corpse + misc loot"). Everything aboard has
  a **load**, and the loads add up to at most the capacity. Proposed:
  helicopter 8; business jet 12, no biological cargo (it lands at
  airports with customs: matches "cannot extract bodies"); hired flight 2,
  people only.
* **Loads** (fractions allowed), each with a **commercial** flag:
  | Item | Load | Commercial shipping |
  |---|---|---|
  | Person (any role) | 1 | yes, by airline, unarmed |
  | Vampire remains (a corpse) | 2 | no, helicopter only |
  | Captive (thrall or vampire), needs a free cell at the far end | 2 | no, helicopter only |
  | Goods (market stock, now held per base) | 0.5 a lot | yes, unless contraband |
  | Loot, artifacts | 0.5 each | no |
  | Weapons, equipment crate (when per-agent kit lands) | 0.5 | no |
  So 5 operatives + 1 corpse + 2 lots of loot = 8: a full helicopter.
  Capacity grows with research or new aircraft types later.
* **Commercial transfer**: people fly on airlines, goods go by courier.
  A fee per head or per lot, 1–3 days by distance, no aircraft capacity used.
  Unarmed, so no weapons go this way.

**Aircraft orders (Phoenix Point style)**
* Aircraft are selectable markers on the globe. Selected, the panel shows
  its **manifest** (load, e.g. 6.5 / 8), fuel/reach and orders: **Fly to**
  (a base, a mission site, a refuelling stop), **Return home**,
  **Unload**. A route line shows the path through refuelling stations
  (`planRoute`), with ETA.
* People and cargo stay **aboard** until unloaded. Arriving at a base
  that isn't home offers **Transfer here** (changes the home base of
  everyone and everything aboard; needs beds, cells, hangar space).
* **Missions** become: an aircraft with a team aboard flies to the site;
  arriving starts the mission (as dispatch does today). Kit stays a
  choice at departure until per-agent equipment. After the mission the
  aircraft waits at the site for orders, with **Return home** one click
  (or a setting: return home automatically).

**Several aircraft on one mission** (user: "land two aircraft at a
mission ... full SSE on a vamp HQ"). The mission site holds every aircraft
that has landed there.
* Each aircraft flies its own route and lands on its own ETA. The site
  panel lists who and what has arrived, with a **Go in** button: the
  player chooses whether to start with the first team or wait for the
  second (waiting costs time, and a lair can notice).
* Everyone aboard the landed aircraft can deploy. An **empty** second
  aircraft is a valid choice: it brings no people, only **capacity** for
  sensitive site exploitation.
* After the fight, **SSE**: the haul (corpses, captives, loot, artifacts,
  documents as intel) is shared out over the free capacity of every
  aircraft on site, with the same manifest screen (drag between aircraft).
  What doesn't fit is left behind (or burned, for secrecy).
* Later, optional: an aircraft that lands mid-battle brings its team in as
  reinforcements at the map edge.

**Load bar** (user: "I love visual indicators"): the bar is made of
segments, one per thing aboard, each with its icon and width by its load
(a person 1, a corpse 2, loot 0.5), coloured by kind (people, biological,
goods, kit). Over capacity shows red; items that can't go on this aircraft
are greyed with the reason. The same bar appears on the globe marker's
tooltip, the hangar list and the SSE screen.

**Interface**
1. **Base › Personnel** (replaces Quarters and the staff part of
   Science): one table of every person at the base, filtered by role,
   with status (here, aboard X, on project Y, wounded, in transit) and the
   bed count (n / beds). Multi-select actions: **Board aircraft ▸**,
   **Send by airline to ▸** (base list with fee and days), **Dismiss**.
   Hiring stays per role.
2. **Base › Hangars**, per aircraft: the **manifest**. Two columns, base
   on the left and aircraft on the right, people above and cargo below;
   click or drag to move between them; one load bar (e.g. 6.5 / 8).
   Blocked items say why ("no biological cargo on a jet").
3. **Base › Stores**: everything held here (goods, remains, captives,
   artifacts) with **Load onto ▸** (aircraft at this base) and **Ship to ▸**
   (commercial-capable items only, fee and days).
4. **Globe**: aircraft markers (at base, flying, waiting at a site);
   select → manifest summary and orders; "Fly to" puts the globe into a
   pick mode (bases and sites highlight, out-of-reach ones dim).
5. **Mission panel**: **Send aircraft ▸** lists aircraft in reach with
   who is aboard; one with nobody aboard opens its manifest first.
6. **Under way** column: aircraft in flight and commercial transfers,
   with ETAs.

**Open questions**
* Do aircraft need **pilots** (a fourth role taking a seat)? Proposal: no.
* Black market: sell from any base's stores, or only where goods are
  held? Proposal: from where they are held (makes cargo matter).
* Lose an aircraft (shot down, abandoned in Europe): everything aboard is
  lost too.

### 3.7d Per-agent equipment (built, 2026-11-16)

User: "do per-agent equipment next". The first slice of the item list in
ASSET_LIST.md section 1 (P1 items).
* **Kit stays the team's choice** (noise, concealment, check bonuses) and
  now also decides **what each agent takes along**: civilian items go with
  any kit, plainclothes items (pistol, compact SMG, soft vest, trauma kit)
  with plainclothes or tactical, tactical items (carbine, shotgun, plate
  carrier, incendiaries) only with tactical. A weapon that stays behind
  leaves a knife.
* **Loadout per agent** (`Agent.gear`): a weapon, armour, two utility
  slots. Edited in Quarters › agent (from the base's armoury), "Best for
  plainclothes / tactical" fills the slots from stock; the dispatch screen
  shows each agent's gear for the chosen kit (struck through: stays
  behind) and offers "Kit up from the armoury".
* **Armoury per base** (`Installation.armoury`), a new base tab: stock,
  what agents here carry, prices, buy 1 or 4. Gear goes where the agent
  goes, dies with them, and returns to the armoury on release.
* **Standard issue**: every agent has a pistol and a soft vest (free), so
  a plainclothes team fights as before. **Padua's founding armoury**: 6
  carbines, 2 shotguns, 8 plate carriers, 8 incendiaries, 4 trauma kits
  (a full helicopter team in tactical kit). Save v7 migrates.
* **Effects**: the auto-combat uses each agent's own firepower and armour
  (research plates add to any vest); incendiaries are thrown first (double
  to vampires) and used up; after a fight, trauma kits patch the worst
  wounds (10 each) and are used up. On the battlescape each agent has
  their own weapon (the SMG is new there), armour and incendiaries;
  thrown ones are gone afterwards.
* Balance: the bots kit up from the armoury and keep a strike team's kit
  stocked; a 40-game inquisitor batch matches the numbers before
  equipment (campaign policy: median 1 bloodline destroyed, funds 1.3M).
* **Kit as cargo**: armoury items ride aboard a transfer flight as crates
  (0.25 of capacity each; "Armoury crates" in the transfer panel) and go
  into the destination's armoury on landing. **Courier**: what may cross a
  border in a parcel (trauma kits; never weapons or armour) goes by
  courier from the Armoury tab, $150 an item, as long as the airline
  (`GameState.shipments`, listed under way). This completes 3.7c's
  courier shipping.
* Not built: UV weapons and other researched items (the research effects
  stay team-wide for now).

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
  have a boyfriend selling it (Combat). **Faith is also nerve** (user,
  2026-11-15): four cover-ups test it as dread rather than belief: the door
  something knocks at in a dead son's voice, the half-taken nurse who asks
  you to open the window, the violated chapel, the body that moves on the way
  to the furnace. A few are red herrings: an asset who
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
  recruitment, the others 25–55). At the start (six agents, measured before the founding team became four; "right" is the
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


### 3.10 UI structure: places and dashboards (user, 2026-11-15)

**Two layers** (user: "one that flows following logical objects … and another
one like informational dashboards"), after the old XCOM base screen that the
C++ game copied.

* **Places** follow the objects: region › base › facility › thing. The
  **base view** (`BaseScreen.tsx`, H, or "Manage base") is a full screen:
  a column of facility tiles (Overview, Personnel, Hangars, Laboratories,
  Workshops, Containment, Armoury, Stores, Construction), each with its
  count and capacity, and the chosen facility beside it.
  **Reworked 2026-11-16 (user):**
  * **Overview** is the base's activity and metrics: region, support,
    status, reach, beds; agents available and stationed (away, wounded);
    aircraft; scientists and engineers engaged and available; captives;
    remains; the research and the engineering under way here, with
    progress; construction under way. No shortcut buttons (the tiles on
    the left already lead everywhere).
  * **Personnel** (was Quarters) manages everyone, with two tabs. *Current*:
    the agents (stats, status; click one for the detail and loadout), the
    scientists and engineers by name (engaged and available, "Let go"),
    the fallen, airline transfers. *Hiring*: the recruiting network, agent
    candidates with their stats, and **scientist and engineer candidates
    by name and origin, no stats** (only agents have characteristics).
    Staff candidates are a monthly pool like the agents
    (`GameState.staffCandidates`, 6 of each, `refreshStaffCandidates`;
    older saves get one on load); hiring takes the one chosen.
  * **Building happens in one place: Construction.** No "Expand quarters",
    "Build a hangar" or "Build a laboratory" buttons elsewhere.
    Construction shows the floors **stacked, top floor first** (the street
    at the bottom of each plan), with what to build or clear beside them,
    and the hangars "beside the building".
  * **Hangars** show one card per bay and no buy or lease buttons. An empty
    bay is a button: "Buy or lease an aircraft" opens the list of aircraft
    that could go in it (a list, so better aircraft can join it later).
    Bays being built show as such.
  * **Containment** appears only once the base has a cell.
  * Click an aircraft: specs, status, its team, sell or return.
  Stores hold the base's remains, and the Order's goods and artifacts
  (stock is Order-wide in the sim).
  A breadcrumb leads back up (the region goes back to the globe), and ◀ ▶
  steps between bases.
* **Dashboards** cut across places, by status: **Operations**
  (`OperationsScreen.tsx`, O): agents in the field, on covert work, wounded
  (with when they're back or fit) and ready (by base); aircraft flying and
  in the hangar; bases and how many of their agents are ready; and all work
  under way. Every row leads to the thing (its base, or the globe).
* **The dock** (bottom centre) holds the screens, places and dashboards
  first, each with its key; the top bar keeps only the date, time controls,
  funds and secrecy. The old shortcut line is gone (keys are on the dock).
  **Compact (user, 2026-11-16):** narrow icon buttons, the label under the
  icon, the key in the corner. *Bases* became **Installations** (I): a list
  above the dock, bases first, then SIGINT stations, then refuelling
  stations, scrolling (most players see all their bases without it). The
  wheel or ↑ ↓ steps through it, and each step selects the installation and
  flies the globe there; the panel on the right holds what can be done with
  it ("Manage base"; upgrades for stations when they exist). Building new
  installations sits at the foot of the list for now: the user wants to
  rethink how facilities are built and managed. H still opens the home base.
* **No standing boxes for Installations or This month** (user,
  2026-11-16). Beside Funds and Secrecy, **Details** (F) opens the Order's
  books (`DetailsScreen.tsx`), in three tabs:
  * *Funds*: every money line this month (so far, at today's rates)
    against last month's report, with the change; the treasury; each
    installation's running cost and the rate its region's support sets.
  * *Support*: every region's support and its change since the month
    opened, its contribution and the change against what it paid last
    month, its pledge and this month's record; average support, total
    contributions, hostile regions.
  * *Secrecy*: what moved it this month and last, cause by cause (repeats
    add up: "×3"), with lost, won back and net.
  The sim keeps the books in `GameState.ledger` (`sim/ledger.ts`):
  `changeSecrecy`, quiet days and media noise note every change; month end
  closes the month (with what each region paid) and opens the next. Older
  saves open fresh books on load.
* Status words come from one place (`ui/status.ts`) so the base view and
  the dashboard agree.

**Look** (user: the font "a little hard to read", "a tad too dark"):
panels lighter and more opaque, text and dim text brighter, a lighter
vignette. Cinzel only for titles and headings; small labels (section
titles, table headers, stat labels) in Inter semibold; prose in Crimson Pro
(was Cormorant Garamond, which is thin on screen); nothing under 11 px,
most small text 12–13 px.
**Buttons in one face** (user, 2026-11-16: "I really like how Details
looks. Easy to read"): every button (actions, tabs, the dock, time
controls, menu buttons, facility tiles, the main menu's tabs and buttons)
uses the plain UI face (Inter, 13 px, normal case) like the small
Details button. Cinzel stays only for titles and headings
(`reliquary.css`, end; `mainMenu.css`, end). The OPV shield in the top
left is gone; a small **Menu** button there opens the game menu (save,
load, settings, quit to the main menu), as Esc does.

**Icons** (user: "I like visuals"): game-icons.net (CC BY 3.0, credited in
the main menu), copied by `scripts/build-icons.mjs` into
`src/ui/icons.generated.ts` (only the ~60 used). On the dock, facility
tiles, stats, research projects and action buttons.

**Buttons say what they do** (user: "just the action on the button … the
rest in tooltips"): cost, time, consequences and why a button is blocked
go in one styled tooltip (`TooltipLayer`, also taking over every `title`).
Blocked buttons stay hoverable so the tooltip can say why. Form
validation beside a confirm button (dispatch, naming) stays visible.

**Research screen** (user): full screen, Research and Engineering tabs; a
list on the left (under way, available, production lines, done), the
chosen project on the right: what it is, what it gives, what it opens,
what it needs, where it runs, and once done, its findings. Projects whose
prerequisites aren't met, or whose material no base holds, are hidden (a
count says how many wait on material). An empty tab names the research
that opens it.

Not done: per-agent equipment (kit is still a team-wide choice at
dispatch), base layout as a spatial grid, transfers between bases.


### 3.11 Tactical combat (design draft, 2026-11-15)

User brief: XCOM-style, **purely turn-based**, on a **grid**, with **several
whole levels** (floors, a basement, a roof; no half-levels or slopes).
**Cover and distance decide the hit chance.** Maps are **crude and
procedurally generated**. Agents and vampires are **boxes, with smaller
boxes for weapons**.

Confirmed by the user (2026-11-15): **two actions** a turn; quiet teams
start **concealed**, but **a helicopter or tactical kit gives them away**
from the start; tactical maps for strikes, ambushes, armed escapes and
**rescues**, and later perhaps **infiltration or heist missions for
cover-ups**. Other proposals below are drafts until confirmed.

**Turns and time units** (changed 2026-11-16: time units replace the two
actions; see T6). Each unit has **time units (TU)** a turn; an agent's come
from **Combat**. Walking costs TU by the distance walked; weapon actions
cost a share of the unit's whole allowance (a snap shot, an aimed shot, a
blow), the rest a fixed few. The move range shows two outlines: **blue**,
as far as the unit can go and still attack; **yellow**, as far as its TU
go. The player moves all their units, then every enemy moves.

**Hit chance** = the shooter's aim, plus the weapon's modifier at this
distance, minus the target's cover, minus any target bonus, plus height,
clamped to 5–95%. The preview always shows it, with the reasons in its
tooltip.
* **Aim** comes from the agent's Combat stat: aim = 40 + Combat × 0.5,
  which gives about 55–70 for a recruit.
* **Distance:** each weapon has a best band and loses about 3 per tile
  outside it. Pistols and shotguns are short-range, rifles long-range.
* **Cover is directional, from the next tile toward the shooter:** half
  cover −20 (low wall, car, crate, pew, gravestone), full cover −40 (wall,
  pillar, door frame). A shooter whose line arrives from outside the cover
  (a flank) ignores it, and flanked targets are easier to crit. Shooting
  from higher ground gives +10.
* **Line of sight** is traced from tile to tile. Walls and floors block
  it; windows let it through.

**What the five stats do on the map:**

| Stat | On the map |
|---|---|
| Combat | aim, and melee |
| Vitality | hit points |
| Faith | resisting domination and panic. When a vampire's mind attacks, Faith is the roll, which gives Faith a combat use |
| Tradecraft | concealment (below): how close an enemy must come to spot the agent, and the first-shot ambush bonus |
| Insight | crit chance and spotting: hidden thralls, traps and civilians who are not what they seem |

**Concealment** (confirmed). Quiet kits (civilian and plainclothes) start a
mission **concealed**, unless the team came by helicopter, as in XCOM 2. Enemies only notice agents inside a
small detection radius, which Tradecraft shrinks. The squad chooses when
the first shot goes off, and that shot gets an ambush bonus. Tactical kit
starts revealed. This carries the geoscape's quiet-or-loud choice onto
the map.

**Kit becomes a loadout:**
* **civilian:** a knife, no armour;
* **plainclothes:** a pistol, a soft vest, one UV flare;
* **tactical:** a rifle or a shotgun, armour, incendiaries.

Researched weapons and gear add to these. Per-agent equipment, already
"Not done" in 3.10, comes with the tactical layer.

**Vampires are not soldiers with more HP.**
* **Torpor.** Bullets and blades drop a vampire to 0 HP and into
  **torpor**: it lies there and **rises after 2 turns at night or 3 by
  day**. An agent next to the body must **finish it** (the
  haemolytic agent, one action), or fire must reach it. A body in torpor
  can also be **taken** as a captive if a base has containment space.
* **Thralls** are armed humans who behave like XCOM's basic soldiers.
* **Vampires move fast, climb** (they change level without stairs: up a
  wall, through a window), **hit hard in melee** and see in the dark.
  Some can **dominate**: a roll of Faith against the vampire's will. A
  dominated agent loses their turn, or worse.
* **Bloodline traits** come from section 2 and are rebalanced here:
  * Huaca rises from torpor a turn sooner;
  * Sahel's thralls are tougher;
  * Carcassonne dominates harder;
  * the Nullarbor Kin take half damage from the sun;
  * the Jade Court starts hidden;
  * Ashgrove fields more thralls.
* **Night and day.** At night agents see about 8 tiles, or further where
  something is lit, and vampires see the whole map. By day, vampires
  indoors are slowed and those outdoors burn. The geoscape already
  chooses the hour of a strike; this is where that choice pays off.

**Aircraft on the map** follows the rule in 3.2.
* A **helicopter** waits on its landing zone. It can be destroyed, and at
  the end it lifts out every body and all the loot.
* A **jet or charter** waits off the map. The team carries what it can to
  the extraction zone, and burns the bodies first.

**Win and lose:**
* **Win:** every enemy is dead or finished. A body still in torpor
  doesn't count.
* **Abort:** every surviving agent reaches the landing or extraction zone.
* **Lose:** every agent is down.

The debrief feeds the existing outcome: casualties, captives, intel,
artifacts, secrecy.

**Maps: crude procedural, seeded from the mission id** (the same mission
always gets the same map).
* **Size:** about 28×28 tiles for a nest or a den, 36×36 for a haven, and
  44×44 over three levels for a lair.
* **Levels:** 0 is the ground floor, 1 an upper floor or a roof, and −1 a
  basement or crypt. Stairs and ladders join them.
* **Walls stand on the edges between tiles** (changed 2026-11-16, T6), as
  in XCOM: walls, windows and doorways are edge kinds; half and full cover
  props (crates, cars, trees, pillars) still fill tiles. Rooms take the
  space the old whole-tile walls used, so maps feel roomier at the same
  size.
* **Generators by setting:**
  * **urban:** a street grid, then lots, then buildings. A building is a
    rectangle split into rooms (BSP), with doors, windows, stairs to a
    second floor and sometimes a basement. Cars, low walls and bins go in
    the street.
  * **rural:** a farmhouse, a barn, fences, trees and hay.
  * **lair:** rooms and corridors cut into rock (BSP or a cave
    automaton), a crypt level and a hall for the elder.
  * The site's kind and region choose the setting. Montségur gets its own
    generator.
* **Placement:**
  * agents at the landing zone;
  * enemies in clusters (pods) deep in the map, with thralls on guard and
    vampires inside;
  * civilians where it fits.
* **Validation:** every walkable tile must be reachable from the landing
  zone through doors and stairs; a map that fails is regenerated.

**Look:**
* **Scene:** Three.js, an orbiting isometric-style camera, and the levels
  above the selected unit cut away.
* **Tiles and units:**
  * tiles are flat slabs;
  * walls are tall boxes;
  * half cover is a low box;
  * units are boxes in their side's colour, with a small box for the
    weapon.
* **Overlays:**
  * movement range: two glowing outlines (blue: time left to attack;
    yellow: as far as the TU go);
  * cover shields on hovered tiles;
  * the path preview;
  * a hit-chance badge over each target.
* **HUD:** the gothic HUD carries over: a unit bar at the bottom and the
  actions as icons with tooltips.

**Architecture:**
* **`src/tactical/` is plain TypeScript with no DOM**, like `sim/`. It
  holds the map generator, the battle state, the rules, A* pathfinding
  across levels, line of sight and the enemy AI. It uses its own seeded
  RNG and has tests.
* **`src/render/BattleView.ts`** draws the battle; the React overlay
  holds the HUD.
* **The batch simulator keeps the auto-combat,** recalibrated so its odds
  roughly match bot-played tactical battles. A tactical bot is a later
  option.
* **Auto-resolve** stays as a button on every tactical mission.

**What goes tactical** (confirmed):
* strikes on sites (nest, den, haven, lair);
* ambushes from double agents and traps;
* armed escapes;
* **rescues** (a victim held for feeding);
* base defence, later;
* perhaps, later, **infiltration or heist missions** for cover-ups.

Quiet leads stay as arrival decisions.

**Carried over from the C++ game, or not** (user, 2026-11-17). The last
review of `reference/cpp/` before it was deleted. None of these is built yet.
* **Science, not mysticism.** Stakes don't kill vampires in this lore. What
  works is chemistry and physics: the haemolytic agent turns their blood to
  gel, incendiary rounds cauterise the wounds, and UV lamps and flares burn.
  The finish action is the haemolytic agent alone.
* **Yes:**
  * **UV flare** (replaces the C++ Electro-Flare): a thrown flare that gives
    off steady, low-intensity UV for the rest of the mission. Vampires won't
    enter its area. It's area denial, and it doesn't hurt humans.
  * **Sparkle**: a UV flash grenade. Its damage kills a vampire for good, as
    fire does, rather than putting it into torpor, and it destroys bodies in
    torpor inside the blast. Humans are immune, so it can go off next to
    agents.
  * **Smoke**: smoke grenades. In C++, smoke cost 3 tiles of sight.
  * **Frag grenade**: area damage.
  * **Kneeling**: in C++ it cost 4 TU to kneel and 8 to stand, for ×1.15
    accuracy.
  * **Encumbrance**: in C++ each point of weight over Strength cost 1 TU.
    There's no Strength stat here; what it's measured against is still to
    decide (Vitality, or a flat allowance).
  * **Haemolytic Dart Gun**: researched; it finishes a body in torpor from
    range.
  * **Night Optics**: in C++ they gave 14 tiles of sight at night instead
    of 9.
  * **Motion Tracker**: shows movement nearby that the agent can't see.
  * **Haem Serum**: a strong heal made from vampire tissue.
  * **Research breakthroughs**: in C++ there was a daily chance (Easy 4%,
    Normal 2%, Hard 0.5%) that a random project jumped 30%.
* **Later:** destructible terrain (walls, doors, windows, trees, crates).
* **No:**
  * morale, panic and berserk;
  * fire spreading (the incendiary keeps its fixed 3 × 3 area for 2 turns);
  * the Molotov and the demolition charge;
  * the Napalm Projector and the Anti-Materiel Rifle;
  * the Exo-Frame and the Sealed Ballistic Suit (pheromone blockers do the
    suit's job);
  * vague research progress (it stays a percentage);
  * black-market mercenaries.

**Plan** (each step playable on its own):
* ✅ **T1:** the map generator (urban and rural) and BattleView with a free
  camera, level cutaway and boxes; a debug "new map" button.
  * `tactical/map.ts`: tile kinds (floor, wall, window, doorway, low and
    high cover, stairs), skins, neighbours (eight ways, no corner-cutting,
    stairs up and down), reachability.
  * `tactical/mapgen.ts`:
    * Urban: 2–3 blocks a side with 3-wide roads; big lots split by an
      alley. Lots hold buildings (BSP rooms, every storey sharing one
      layout and one stairwell, a walkable roof with a parapet), car parks
      or parks. The landing plaza is a lot on the map's edge.
    * Rural: a dirt road, a two-storey farmhouse, a barn with hay, sheds,
      fenced fields, woods and a hedgerow.
    * The hideout is the far building; its basement, if any, holds the
      vampires. Thralls are split between the hideout, other buildings
      and the street.
    * Props that wall off a pocket are cleared. Tests: 120 seeds, fully
      connected.
  * `render/BattleView.ts`: one instanced box mesh plus glass. Cars drawn
    as one two-tile box. Walls on the cut level drawn at half height.
    Right-drag rotates, WASD pans, Q and E turn the camera, R and F change
    level.
  * Main menu, then **Skirmish**: town or farm, nest, den or haven, a new
    seed.
* ✅ **T2:** rules: units, two actions, A* movement across levels, line of
  sight and vision, cover, hit chance and shooting, overwatch, a simple
  thrall AI. Playable as a skirmish from the main menu.
  * `tactical/rules.ts`:
    * **Weapons:**

      | Weapon | Damage | No penalty | Outside that | Close (≤2 tiles) | Crit | Clip |
      |---|---|---|---|---|---|---|
      | Pistol | 2–4 | to 7 tiles | −4 a tile | +5 | 5% | 6 |
      | Rifle | 3–5 | 2–13 tiles | −5 a tile under 2, −3 over 13 | | 10% | 4 |
      | Shotgun | 4–6 | to 4 tiles | −7 a tile | +15 | 20% | 3 |
      | Claws | 4–6 | adjacent only | | | | |

    * **Line of sight:** a 3-D ray. Walls, trees and floors block it;
      windows and low cover don't. Sight is 16 tiles.
    * **Cover:** directional, from the 4 tiles round the target. A side
      counts if the shooter is within about 70° of straight ahead of it.
      Half cover −20, full −40; hunkered −20 more and no crits; height +10;
      a reaction shot −15 and no crits. A flanked target (it has cover, but
      none faces the shooter) gives +40 crit. Hit chances are clamped to
      5–95%.
  * `tactical/battle.ts`:
    * **Units:**

      | Unit | HP | Aim | Moves a tile per action |
      |---|---|---|---|
      | Agent | 3 + Vitality/10 | 40 + Combat/2 | 7 |
      | Thrall | 4–5 | 55 | 6 |
      | Vampire | 10 | 75 (melee) | 9 |

      Agents have armour 1. A crit adds 50% damage, then armour is taken
      off; every hit does at least 1.
    * **Movement:** Dijkstra (orthogonal 1, diagonal 1.5, stairs 2). Units
      walk past friends, never through foes. Within mobility costs one
      action; a dash costs two.
    * **Overwatch** fires as a foe steps into sight, and a hit can stop it.
    * **Waking up:** enemies wait in pods (spawns within 6 tiles of each
      other). A pod wakes when one of its members sees an agent, is shot
      at, or hears gunfire within 12 tiles.
    * **End of a battle:** won when every enemy is dead; lost when every
      agent is; withdrawn when every survivor has evacuated from the
      landing zone.
    * **Events:** every command returns its events (moves, shots, deaths,
      statuses) for the view to replay.
  * `tactical/ai.ts`:
    * Thralls take the best spot for shot plus cover, then shoot if the
      chance is 15% or more; otherwise they overwatch, and they reload
      when empty.
    * Vampires close in and claw.
    * With nobody in sight, enemies walk the full-map path to the nearest
      tile beside an agent.
  * The **Skirmish** screen:
    * the squad bar shows health, actions and ammunition;
    * each target chip shows its hit chance, with the breakdown in its
      tooltip;
    * buttons: overwatch, hunker down, reload, evacuate, end turn;
    * the move range is drawn blue for one action and gold for a dash;
    * hovering a tile previews the path and the cover at its end;
    * playback shows tracers, damage numbers and falling bodies, with the
      camera following;
    * the view cuts to an agent's floor when the agent is indoors;
    * keys: Tab next agent, 1 shoots the best target, 2–5 the other
      actions, Enter ends the turn.
  * A test bot (shoot what it sees, otherwise advance) wins 23 of 24 nest
    skirmishes. Balance waits for T5.
* ✅ **T3:** vampires: torpor and finishing, melee, climbing, domination,
  night and day, bloodline traits; concealment.
  * **Torpor:** bullets and claws take a vampire to 0 HP, and it falls into
    torpor: 2 turns at night, 3 by day, one less for the Huaca Line. It
    rises with 40% of its health, alert. Bodies in torpor can't be shot,
    still count against victory, and block their tile.
  * **Finishing:** an agent next to a body finishes it for one action (the
    haemolytic agent, which turns the blood to gel). It's quiet, and doesn't break
    concealment.
  * **Fire:**
    * an incendiary covers 3 × 3 tiles, up to 10 tiles away, with a clear
      throw, and ends the turn;
    * it burns 2–3 (double to a vampire, ignoring armour) on impact and at
      the start of the victim's side's turn, for 2 turns;
    * any burning body in torpor is destroyed;
    * enemies keep out of fire;
    * tactical kit carries one incendiary each.
  * **The sun:**
    * by day, vampires never step outdoors (the Nullarbor Kin do);
    * one caught outside burns for 3 at the start of its turn (1 for the
      Kin);
    * a body in torpor lying in the sun is destroyed.
  * **Night:** a human sees 9 tiles, or 16 to anything lit (within 4 tiles
    of a lamp) or burning. Vampires see 20. Maps get lamps over outside
    doors and, in town, street lamps along the roads.
  * **Climbing:** vampires go up a wall face and over a parapet onto a
    roof, or in at an upper window, and down the same way. Each climb costs
    3.
  * **Domination:**
    * once a battle, a vampire with nobody to claw tries the weakest-Faith
      agent it sees within 10 tiles;
    * the roll is will (55, Carcassonne 70) + d40 against Faith + d40;
    * a dominated agent loses their next turn.
  * **Concealment:**
    * plainclothes kit arriving by jet starts concealed; a helicopter or
      tactical kit does not;
    * while concealed, an enemy spots an agent only within
      8 − Tradecraft/10 tiles (2–6), and only if it can see them;
    * shots from concealment get +15 aim;
    * shooting, throwing, or being spotted ends concealment.
  * **Insight** adds (Insight − 30)/5 to an agent's crit chance.
  * **Enemies not yet aware of the team:** they patrol a few tiles. Once
    the team has been heard, they go looking from turn 4.
  * **Traits** (`tactical/traits.ts`):

    | Line | Trait |
    |---|---|
    | Ashgrove | +2 thralls |
    | Huaca | rises a turn sooner |
    | Carcassonne | will +15 |
    | Sahel | thralls +2 HP |
    | Jade | unseen beyond 5 tiles until they strike |
    | Nullarbor | go out by day; half the sun's damage |

  * **Skirmish options:** bloodline, night or day, plainclothes or tactical,
    helicopter or jet.
  * **Results:** a bot playing tactical kit at night wins 17 of 24 and
    loses 6.
* ✅ **T4:** campaign integration: strikes and ambushes open the battle, the
  debrief feeds the outcome, the helicopter or jet rules, loot and
  captives, per-agent loadouts.
  * **Mission plays, unchanged, settle every fight through `settle()`.**
    With `tactical.on` (set by the UI; off in tests and the batch
    simulator), the play runs as a probe that stops at its first fight.
    The mission records a `PendingBattle` (the play, the random state
    before it, the threat, the auto-combat's edge, the site kind) and posts
    a **Contact** event, which pauses the clock. A play must change nothing
    in the campaign before its fight; the ratline fee now comes after it.
  * **Take command** opens the battlescape. **Leave it to the team** runs
    the auto-combat, with its odds shown. Dismissing the event does the
    same. Either way the play is replayed from the saved random state, so
    it takes the same path to the fight. Auto-resolving gives exactly what
    the auto-combat would have (tested).
  * **`tactical/campaign.ts`** builds the battle:
    * the mission's own agents, with their stats; tactical HP is
      3 + Vitality/10, scaled by their current wounds;
    * the kit they flew out with: civilian carries knives, plainclothes
      pistols, tactical rifles and a shotgun with an incendiary each;
    * armour from the kit and ceramic plate; UV rounds' damage against
      vampires; pheromone blockers lowering a vampire's aim;
    * the site's size (nest, den, haven; a lair uses the haven map until
      T5) and its numbers, the bloodline, and night by the local hour;
    * arrival: a helicopter is heard at once, while a jet or hired flight
      lets a quiet team start concealed;
    * a map seeded from the mission, so the same mission always gets the
      same map.
  * **The outcome** (`battleOutcome`) sets the agents' health and deaths,
    then feeds the play as its fight result: won, turns (secrecy scales
    with them, capped), the dead, thralls killed, vampires destroyed and
    vampires taken alive.
  * **Taking captives:** a new action takes a vampire in torpor alive (one
    action). It becomes the mission's captive if a base has a free cell;
    if not, the debrief says so.
  * Saves keep a pending battle; reloading shows the Contact event again.
  * **The helicopter** sets down beside the landing zone (14 HP, armour 1).
    Thralls shoot it when it's the easier shot by a margin. If it's
    destroyed, the aircraft is lost in the campaign; a commanded battle
    replaces the old loss roll.
  * **Loot:** crates in the hideout (nest 2, den 3, haven 4, lair 5). An
    agent picks one up by walking over it, one per agent, and drops it if
    killed.
    * With the helicopter still on its pad at the win, everything is lifted
      out.
    * Otherwise the spoils are the share carried by agents alive at the win
      or evacuated. This replaces the flat half for a commanded battle.
  * **Rescues:** the prisoner is held near the vampires. An agent next to
    them frees them (one action). From the next turn they move as one of
    ours and can be shot. They're saved if alive at the win, or evacuated.
    A lost prisoner turns "Go in now" into a partial, and decides "Wait for
    daylight" in place of its 60% roll.
  * **Not yet:** lair and Montségur maps (T5).
* ✅ **T6** (2026-11-16, user brief): thin walls, time units, any-angle
  paths, glowing overlays.
  * **Thin walls** (`tactical/map.ts`): two edge arrays (the west and the
    north side of every tile, plus the far rims), kinds wall, window and
    doorway, each with a skin. A wall edge blocks walking and sight and
    gives full cover to the tile behind it; a window blocks walking, lets
    sight through and gives half cover; a doorway is open. Diagonal steps
    can't cut past a wall's corner. Sight passing exactly through a corner
    is blocked only if both ways round it are. Vampires climb a wall face
    to a parapet, or in and out at a window edge.
  * **Generation** (`tactical/mapgen.ts`): plans are still drawn with
    walls a tile thick, then each storey is **thinned**: every wall, door
    or window tile becomes floor of a room beside it (plain walls prefer
    east, south, then a diagonal, so a junction joins a corner, not a
    notch; doors and windows go straight through), and walls go on the
    edges between rooms and round the outside. A door or window tile's
    edge is the one facing away from the room it joined. Furniture goes
    against the new walls, clear of doorways. Catacombs and the crypt are
    walled on their edges with solid rock beyond; Montségur's curtain
    wall is edges along the ring. Lamps go on the outdoor side of
    doorways. If a pocket is still shut in after two repair passes, a
    doorway is knocked through.
  * **Time units** (`tactical/battle.ts`):
    * agents: **40 + Combat / 2** (the aim formula; 52–68 for a recruit);
      thralls 50, vampires 72, the eldest 80, civilians 40, a prisoner 48;
    * walking: **4 TU a tile** of distance (stairs 8, a climb 12);
    * snap shot 35% of the unit's TU, **aimed shot** 60% (+15 aim), a
      blow (knife, claws) 35%, a throw 35%; reload 15, finish a body 15,
      stabilize 15, take alive 20, free the prisoner 10, evacuate 8;
    * **overwatch** holds the TU left (needs a snap shot's worth): a snap
      shot at an enemy moving in sight, once per mover per move, as often
      as the TU last; **hunker down** needs a snap shot's worth and ends
      the turn;
    * a unit on overwatch or hunkered has finished its turn.
  * **Any-angle movement** (`tactical/path.ts`, Theta*): legs run straight
    from a tile's parent wherever the walk is clear (the middle line and
    lines 0.3 tiles either side, past open edges and walkable tiles only),
    so the cost is the distance really walked. The AI plans long routes on
    the plain grid and walks as far along them as its TU reach.
  * **AI and bot:** thralls move to a better spot only if a shot is left
    after, then fire snap shots while the TU last, else overwatch; with
    nobody in sight they close in keeping a snap shot back. Vampires close
    and strike while the TU last. The bot moves once (keeping a shot),
    then shoots.
  * **The view** (`render/BattleView.ts`):
    * walls, windows (sill, glass, lintel) and doorway lintels are thin
      boxes on the edges;
    * the move range is outlined: **blue** round where there's time to
      attack, **yellow only where the reach goes beyond the blue** (never
      over a blue edge; its ends sit on the blue line, so it reads as the
      blue extended). Traced round the reached tiles, pulled 0.22 of a
      tile inside them (clear of walls and props), then the corners only
      slightly rounded (Chaikin, two passes, cuts capped at 0.1 of a tile);
    * the hovered path is a ribbon along the straight legs with its
      corners rounded (**Chaikin**, cuts capped at 0.45 tiles so long legs
      stay straight), with pulses running along it and a ring at its end;
      units walk the same smoothed curve;
    * outlines and path **glow in the dark**: an unlit, additive shader,
      bright along the middle line with a soft halo; a faint copy without
      depth testing shows where a line runs behind a wall;
    * the squad bar shows TU as pips, a tile each: blue while there's time
      to move and still attack, gold for the attack's reserve; target
      chips offer a snap and an aimed shot with their TU; the hover panel
      gives a move's TU and what's left.
  * **Calibration after T6** (bot vs auto-combat, recruit stats, tactical
    kit; the calibration's agents now carry per-agent gear):

    | Scenario | Bot wins | Auto-combat | Agents lost per battle |
    |---|---|---|---|
    | Nest, night | 100% | 100% | 0.2 |
    | Den, midday | 95% | 100% | 0.5 |
    | Den, night | 95% | 100% | 0.5 |
    | Haven, night, 6 agents | 93% | 100% | 0.9 |
    | Plainclothes brawl, 2 agents | 30% | 17% | 0.8 |
    | Lair, 8 agents | 20% | 57% | 3.7 |

    With TU the bot can move and still shoot every turn, so it now sits
    close to the auto-combat; the lair is the exception (the bot doesn't
    use incendiaries or overwatch).
* ✅ **T5:** lair maps, Montségur, balance (auto-combat recalibrated).
  * **Lairs** (44 × 44, three levels), `mapgen.ts`:
    * **Surface:** a walled churchyard (graves, yews) round a stone chapel.
    * **Catacombs:** about 9 rooms cut in rock, joined into a tree plus two
      loops, with sarcophagi, pillars and a brazier in each room. The first
      is under the chapel, with the stair down.
    * **Crypt:** a pillared hall (15 × 10) with side chambers, reached from
      the farthest catacomb room. The eldest stands at the altar; the rest
      of the vampires are in the crypt and the catacombs; the thralls are
      split between the surface, the catacombs and the crypt.
    * **Montségur**, for the Perfecti: a broken curtain wall with rubble on
      a rocky slope, and a bigger hall (18 × 12).
    * Below ground it's always night for human sight (braziers light the
      rooms).
  * **The eldest:** 20 HP, aim 85, armour 1, will +20. It dominates every
    turn it can't claw, not just once.
  * **Bleeding out:** an agent at 0 HP goes down, bleeding for 3 turns,
    unless the hit was a critical or overkilled by 3 or more. An adjacent
    agent can stabilize them (one action). Downed agents survive a win
    (home at 10% health); left on the field after a loss or withdrawal,
    they are lost.
  * **Tuning:** tactical vampires 8 HP, aim 65, claws 3–5 (were 10, 75,
    4–6). Auto-combat vampires 80 HP, hit 62% (were 55, 58%).
  * **Pathfinding:** Dijkstra uses a binary heap (a lair battle plays out
    in well under a second).
  * **`tactical/bot.ts`:** a beginner bot. It stabilizes, finishes, takes
    the best spot for a shot plus cover, shoots at 45% or more, and
    advances. `tactical/calibrate.test.ts` (run with `CALIBRATE=1`) sets
    its battles against the auto-combat for the same team and threat, with
    recruit-grade stats and tactical kit unless noted:

    | Scenario | Bot wins | Auto-combat | Agents lost per battle |
    |---|---|---|---|
    | Nest, night | 95% | 100% | 0.5 |
    | Den, midday | 98% | 100% | 0.6 |
    | Den, night | 55% | ~90% | 1.7 |
    | Haven, night, 6 agents | 68% | ~100% | 1.6 |
    | Plainclothes brawl, 2 agents | 23% | 17% | 0.7 |
    | Lair, 8 agents | 10% | 2% | 4 |

    Daylight strikes match. **At night against several vampires, the
    auto-combat stays more generous than the bot.** The bot doesn't use
    overwatch, incendiaries, flanking or concealment, so a good player
    should sit between the two. Revisit with human playtesting.
  * **Campaign simulator after the change:** game over 3%, a median of 1
    bloodline destroyed in 12 months (unchanged).


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
   **Reworked 2026-11-16** (user: "navigation is unintuitive … tabs up
   top"): one compact console with five tabs, Campaign (Continue plus the
   three difficulties, pick one then "Begin the war"; double-click starts),
   Archive (save slots, Import), Skirmish, Settings, Credits. Keys 1–5 jump
   to a tab, arrows move between tabs. **Look: "Reliquary"** (user
   picked it from three prototypes, 2026-11-16: "Reliquary is
   perfection"; the others were X-COM-style bevelled "Terminal" and a
   manila "Dossier"): the gothic black-and-gold made physical and dense,
   in the spirit of the 1994 X-COM (user: "menus feel tactile like
   physical objects"). Iron plate in a riveted brass frame, engraved
   brass plaque tabs, embossed brass buttons that press down, a red wax
   seal on the chosen option. Markup in `ui/screens/MainMenu.tsx`, look
   in `ui/screens/mainMenu.css`. **The whole UI uses it** (user,
   2026-11-16): `ui/reliquary.css`, loaded after `theme.css`, restyles
   the shared surfaces only (layout stays in theme.css). Materials:
   *plate* (panels and HUD blocks: brushed iron in a brass frame, rivets
   at the corners; leads and bad news get a blood-red frame), *plaque*
   (buttons, tabs, facility tiles: raised bronze-iron with engraved
   lettering, pressing down when clicked), *brass* (the primary action,
   the chosen tab or mode; pause is red enamel), *pressed* (the chosen
   item in a list), *card* (choices, slots, bays, sigils) and *well*
   (gauges, inputs, quoted boxes). The full-screen views (bases,
   operations, research, bloodlines) are one big framed plate.
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
  Tactical music: `stealth1.mp3` ("Background space track", the piece "My
  Very Own Dead Ship", by yd, CC0) and `stealth2.mp3` ("Creepy Forest (F)" by
  Augmentality, CC0 / OGA-BY 3.0) play in turn on the Skirmish and battle
  screens (scene `tactical`), decoded from Ogg with `afconvert` and encoded
  like the rest. Combat and boss tracks: still open. Bensound is out: they
  said their music can't be used in a game at all (user, 2026-11-15), and the
  five on-hold picks were deleted.
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

0. ✅ C++ code moved to `reference/cpp/`, reviewed against the port, and
   deleted (2026-11-17). What was kept from it is listed in 3.11, "Carried
   over from the C++ game, or not"; the code is in git history before that
   commit.
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
* 2026-11-15: Faster research, construction and healing (user: "a little
  too long"; wounds "taking forever"). Staff work 1.5 points a day (field
  medicine 15 days → 10 with four scientists, a helicopter 50 → 34 with four
  engineers). Construction about a third shorter: Operational Base 45 → 30
  days, SIGINT station 14 → 10, labs and workshops 15 → 10, containment
  20 → 14, hangars and quarters 10 → 7. Wounds heal 6 HP a day (was 2), 9
  with field medicine (was 3): a bad wound is about six days, not eighteen.
* 2026-11-15: UI pass (user): two layers, places (a full-screen base view:
  facilities › agents, aircraft, cells) and dashboards (Operations: agents,
  aircraft and work by status, with times). Screens moved to a bottom dock
  with their keys. Lighter, brighter panels; Crimson Pro for prose, Inter
  for small labels, Cinzel for titles only (section 3.10).
* 2026-11-15: Icons from game-icons.net (CC BY 3.0); buttons show only the
  action, details in tooltips; research and engineering in tabs with a
  list and a detail (findings once done); hidden until available; new
  chains: combat surgery, advanced signal analysis, pattern analysis.
* 2026-11-15: Helicopter reach doubled to 900 nm (the regional aircraft);
  new installation, the Refuelling Station: flights route through
  stations, 2 hours a stop (section 3.2).
* 2026-11-15: Bloodline chronicles: an entry every 20 intel (history, the
  elder, their methods, a secret, the lair), in a list-and-detail
  Bloodlines screen; elder name at 20 (was 25), bio at 40 (was 50).
* 2026-11-15: Bloodlines are territorial (user): every region is exactly one
  line's homeland, and operations happen only there (they used to stray
  outside 15% of the time). Intel now concentrates on the lines near our
  bases: 97% of bot games reach intel 100, up from 77%.
* 2026-11-15: Tactical combat design drafted (3.11): XCOM-style turns,
  whole-level grids, directional cover, procedural maps, box graphics.
  Open: two actions or time units, concealment, which missions go
  tactical. The user kept the intel-driven victory path rather than a
  fixed nest-to-lair ladder.
* 2026-11-15: Tactical decisions (user): two actions a turn; quiet teams
  start concealed unless they arrive by helicopter or in tactical kit;
  rescues are tactical too; infiltration and heist cover-ups may follow.
  T1 built: map generator, BattleView and a Skirmish screen for browsing
  maps.
* 2026-11-15: Tactical T2 built: XCOM 2012-style rules (two actions,
  directional half and full cover, range bands by weapon, overwatch,
  hunker, reload, evacuate from the landing zone), pods that wake, a
  cover-seeking thrall AI and melee vampires, all playable in Skirmish.
  Numbers are provisional until T5.
* 2026-11-15: Tactical T3 built: torpor (bullets only drop a vampire; the
  haemolytic agent, fire or the sun finish it), climbing, domination (will + d40 vs
  Faith + d40), night sight and lamps, the sun by day, incendiaries,
  concealment (plainclothes by jet; spotted within 2–6 tiles by
  Tradecraft; +15 on the first shot), and bloodline traits. Enemies
  patrol, and hunt for a team they've heard from turn 4.
* 2026-11-15: Tactical T4 built: a mission's fight stops for the player
  (a Contact event: take command, or leave it to the team). The battle
  uses the mission's agents, kit, research, site, bloodline, local hour and
  arrival; the result goes back through the same play (replayed from the
  saved random state), so the debrief, intel, captives, deaths and wounds
  follow as before. Vampires in torpor can be taken alive.
* 2026-11-15: T4 finished: the helicopter is on the map and can be shot
  down (the aircraft is then lost); loot crates are carried out by hand
  unless the helicopter lifts them; rescues put a prisoner on the map to
  free and get out.
* 2026-11-15: Tactical T5 built: lair maps (churchyard, catacombs, crypt)
  and Montségur; the eldest; bleeding out and stabilizing; vampires
  retuned on both sides; a beginner bot and a calibration test. At night,
  against several vampires, the auto-combat is still kinder than the bot:
  to revisit after human playtesting.
* 2026-11-15: portraits for the other five elders (Ashgrove, Inés, Zahra,
  Shen, Vos), cropped full-height 4:5 from 1312×1199 renders to 480×600,
  37–60 KB.
* 2026-11-15: a team all killed or taken has no flight home if it flew
  charter or commercial (or its helicopter was shot down): the mission just
  ends. Our own helicopter or jet still flies home empty (user).
* 2026-11-15: lore pass (user): Agnes's bio no longer retells the fire
  (the 20 entry does); the bios no longer repeat their later entries (Ashgrove's
  Foundation, Inés's burials, Zahra's endurance, Vos's daylight). Salem 1692
  joins Ashgrove's history: the house gave Salem Village witches, nineteen
  hanged who had all seen something; a page of the examinations is now one of
  its artifacts. A team lost on a hired flight is a sunk cost: no refund.
* 2026-11-15: four nerve cover-ups (the door, the half-taken, the chapel,
  the furnace), each Faith-led with Combat, Insight or Tradecraft readings
  too (user: "creepy af, I love it"). Offers a year in the batch: Faith
  7 → 8.5, Tradecraft 13.5, Insight 7.3, Combat 4.3.
* 2026-11-15: two Combat cover-ups (user): the lock-up (a thrall's van crew
  before a police raid) and the hunters (vigilantes who'll storm a nest live).
  Offers a year in the batch now: Combat 7.7, Faith 7.7, Insight 6.2,
  Tradecraft 10.4.
* 2026-11-15: battle music: stealth1 (yd, "My Very Own Dead Ship") and
  stealth2 (Augmentality, "Creepy Forest (F)"), both CC0 from OpenGameArt.
  Bensound refused game use; its tracks are deleted.
* 2026-11-15: Blender asset list started in [ASSET_LIST.md](ASSET_LIST.md):
  80 inventory items in three tiers (P1 set of 18 for the tactical layer)
  and level props by location.
* 2026-11-15: SIGINT centre, a base facility that listens like a SIGINT
  station; level 2 after Signal analysis (×1.5). Modular base grid
  (6 × 6, footprints, connected to the lift) proposed in 3.7b; room meshes
  listed in ASSET_LIST.md section 4.
* 2026-11-15: base becomes an office building, 3 × 3 × 3 with a lift core
  (user); same-kind rooms touching around the ring or stacked vertically
  give synergy, +10% for 2, +20% for 3 (cap). Replaces the 6 × 6 grid idea.
* 2026-11-15: base building: basement + two floors, core with lift and
  stairs, lobby fixed, unbuilt rooms are office space, roof helipad plus a
  hangar beside the building (detached on a raid map). Synergy only from
  straight lines of 3 (a floor side or a vertical column), each room in one
  line at most: replaces the 2-for-10% rule.
* 2026-11-15: synergy also from an adjacent pair (+10%, against +20% for a
  line of 3); any room on any floor, containment included.
* 2026-11-15: the fixed ground-floor front tile is the entrance, lobby and
  security checkpoint; nothing can be built there.
* 2026-11-15: base building built in the sim and as a clickable floor plan
  (2D for now; the Three.js cutaway waits for the room meshes).
* 2026-11-15: proposal 3.7c: every person (operative, scientist, engineer)
  is an object that takes a bed; aircraft carry people and cargo and take
  orders on the globe (Phoenix Point style); cargo has sizes and a
  commercial-shipping flag; airline and courier transfers for what may go
  that way.
* 2026-11-15: quarters room = 8 beds (Padua 16 at start); a person keeps
  their base bed while aboard an aircraft or on a mission (user).
* 2026-11-15: aircraft capacity is one number (helicopter 8); people,
  corpses, captives and loot each have a load against it (user).
* 2026-11-15: several aircraft can land at one mission; after the fight
  the haul is loaded over every aircraft's free capacity (SSE); the load
  bar shows one icon segment per thing aboard (user).
* 2026-11-15: step 1 of 3.7c built: staff are people who take beds.
* 2026-11-15: step 2 of 3.7c built: ferry flights and airline transfers
  between bases, with the segmented load bar.
* 2026-11-15: step 3 of 3.7c built: remains and captives are cargo against
  aircraft capacity; mission hauls ride home aboard and unload on landing;
  goods and artifacts stay Order-wide for now.
* 2026-11-15: step 4a of 3.7c built: several of a base's aircraft fly one
  mission together; the haul is shared over their free room.
* 2026-11-15: step 4b of 3.7c built: aircraft are selectable on the globe
  and in base panels, with their own panel (load, orders, transfers).
* 2026-11-15: step 4c of 3.7c built: "Fly to…" order mode on the globe.
  Interactive SSE, waiting at a site and in-flight redirects wait for
  escorts from different bases.
* 2026-11-15: step 4d of 3.7c built: teams from several bases join one
  objective; the first down may wait ("Wait for …", "Start mission");
  starting recalls teams still flying; each team flies home to its own
  base. Waiting doesn't hold the target open (user: it can wait while the
  objective is active).
* 2026-11-15: step 4e of 3.7c built: the Haul window after a fight with
  several aircraft (move captives and bodies between them, then take off).
* 2026-11-15: step 4f of 3.7c built: change course in the air, turn a team
  back, burn or release part of the haul; transfers in Under way. 3.7c done
  but for courier shipping.
* 2026-11-16: per-agent equipment (3.7d): loadouts, an armoury per base,
  kit decides what goes along, standard issue, founding armoury; save v7.
* 2026-11-16: kit as cargo (crates aboard transfer flights) and courier
  shipping for trauma kits.
* 2026-11-16: tactical T6 (3.11): walls on the edges between tiles (rooms
  take the old wall tiles); time units from Combat (40 + Combat / 2, 4 a
  tile, snap and aimed shots by share) replace two actions; any-angle
  movement (Theta*); move range as blue and yellow glowing outlines, the
  path as a glowing ribbon smoothed with Chaikin.
* 2026-11-16: move-range outlines: inset first, then only the corners
  rounded (capped Chaikin); the yellow line drawn only where the reach
  goes beyond the blue, as its extension.
* 2026-11-16: main menu reworked into a tabbed console (Campaign, Archive,
  Skirmish, Settings, Credits) with three switchable style prototypes:
  Reliquary, Terminal (X-COM 1994) and Dossier. Pick one later.
* 2026-11-16: Reliquary chosen for the main menu; Terminal, Dossier, the
  style switcher and their fonts removed.
* 2026-11-16: the Reliquary look applied to the whole UI (`ui/reliquary.css`):
  plate, plaque, brass, pressed, card and well materials over theme.css.
* 2026-11-16: base screen reworked (user): Overview shows activity and
  metrics (staff engaged/available, research and engineering under way);
  Quarters becomes Personnel with Current and Hiring tabs; named scientist
  and engineer candidates (no stats) in a monthly pool; building only in
  Construction, whose floors are stacked; empty hangar bays open a list of
  aircraft to buy or lease; Containment only once a cell exists; the
  helipad on the roof undone (generic hangars for every aircraft).
* 2026-11-16: the black market works both ways: sell spare equipment, buy
  equipment and products; never anything that advances the story.
* 2026-11-16: main screen cleanup (user): the Installations and This month
  boxes are gone; Details beside Funds/Secrecy opens the Order's books
  (funds, support, secrecy, against last month; `GameState.ledger`); the
  dock is compact icon buttons with labels under them; Bases became
  Installations, a list above the dock that steps the globe through them.
* 2026-11-16: every button in the plain UI face, like Details (user);
  Cinzel only for titles and headings. The OPV shield replaced by a small
  Menu button (the game menu: save, load, quit to the main menu).
* 2026-11-16 (experiment, user: "it immediately gives off that 1994
  vibe"): the UI face and the prose face are both the system monospace
  (SF Mono on a Mac); Cinzel stays for titles and headings. A four-step
  type scale for mono (`theme.css`, end: `--fs-read` 14, `--fs-body` 13,
  `--fs-small` 12, `--fs-micro` 11; reading text at line-height 1.6), and
  less tracking on small capitals. Inter and Crimson Pro are still loaded
  and named in comments, to go back if the experiment ends.
* 2026-11-17: last review of the C++ game, feature by feature (user; see
  3.11, "Carried over from the C++ game, or not"). Yes: UV flare (area
  denial, humans immune), Sparkle (a UV flash grenade that kills for good),
  smoke, frag grenade, kneeling, encumbrance, Haemolytic Dart Gun, Night
  Optics, Motion Tracker, Haem Serum, research breakthroughs. Later:
  destructible terrain. No: morale and panic, fire spreading, Molotov,
  demolition charge, Napalm Projector, Anti-Materiel Rifle, Exo-Frame,
  sealed suit, vague research progress, mercenaries. Stakes don't kill
  vampires: the finish action is the haemolytic agent. `reference/cpp/`
  deleted.
* 2026-11-17 (user): the founding team at Padua is **4 agents** (was 6), so
  the player fills the team to their own style from the month's 6
  candidates (Padua's 16 beds leave room for 4). The point is choice: the
  player shouldn't be stuck with a squad the dice built, such as all
  tradecraft and no combat. Balance isn't the concern here. **No duds or prodigies:** a
  recruit with 4 or more of 5 stats in the bottom quarter of their ranges,
  or 4 or more in the top quarter, is rolled again
  (`RECRUIT_EXTREME_BAND`, `RECRUIT_EXTREME_LIMIT` in `data/agents.ts`).
  Scientists and engineers cost a **$20k vetting fee** (background checks)
  to hire, was $40k.

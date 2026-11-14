# Vamps: web port plan (Three.js)

The working design and plan for rebuilding Vamps as a browser game. Update it
whenever a decision is made or changed; future sessions start here.

Status: **iteration 1 in progress**. Steps 0–3, 4a and 4b done. 4b added the
team builder (agents, kit, aircraft, with secrecy and money costs), flights on
the globe, arrival decisions, resolution by lead kind (double agents included),
revealed vampire sites, strikes with auto-combat, wounds, deaths and growth.
Next is 4c: counter-media, cover-up operations, economy pass (last updated 2026-11-14)

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
* Aircraft are **leased** (monthly rent). Draft types: **helicopter** (short
  range, slow, can land anywhere, discreet) and **jet** (long range, fast,
  needs an airfield, more visible, so it adds to a team's secrecy cost).
* **Teams per base: as many as its transport allows.** Each team needs an
  aircraft and its seats; hangars and troop facilities cap how many a base
  has. A base fully built out for it fields about **6 teams** at once.
* More Operational Bases can be built later; they are expensive.

**SIGINT Station** (the player starts with **one in a random European region**, never Italy)

* Intercepts communications, finance, CCTV and hospital records.
* **Covers exactly one region.** Leads are only generated inside covered
  regions; vampire activity elsewhere happens unseen and does its damage
  anyway (support loss, infiltration).
* No troops. Cheaper than an Operational Base. Upgrades could raise
  detection strength (more leads, sooner, better quality).

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

### 3.6 Time

Real-time clock with pause and about 5 speeds (from 5 sec to 1 day per real
second). Events (new lead, team arrived, research done, monthly report) pause
the clock and pop a dialog. Hourly, daily and monthly ticks as in
`strategy/Simulation.cpp`.

---

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
* `data/maps/`: tactical map blocks (ASCII). Not needed until the tactical layer.

---

## 8. Open questions

* **Operational Bases**: cost and construction time? Does a base also give
  SIGINT coverage of its own region?
* **Support thresholds**: the draft table in 3.2 needs confirming.
* **HUMINT**: design deferred by the user.
* **Kit profiles**: how they map to equipment once the tactical layer exists.
* **Aircraft**: can they be lost on the geoscape?
* **Intel at 100**: currently capped and shown; it should reveal the
  bloodline's lair (step 5 or later).
* **Lair discovery**: intel threshold per sigil, or specific chain missions?
* **Victory**: keep "six sigils, then Montsegur"?
* **Name and tone**: the title is "Vamps"; is there a subtitle (the C++
  version was "Cathar Protocol")? How serious or pulpy should the writing be?
* **Audio**: music is in (see section 7); sound effects still open.

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
   * **4c**: counter-media campaigns, cover-up operations, economy pass
     (money is still far too plentiful).
5. Research, open-war switch, polish, balance pass.

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

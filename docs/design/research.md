# Research: the full tree

**Status: design, not built.** It replaces the 20-project tree in
`data/research.ts`. [base.md](base.md) still covers how projects run (staff,
bases, synergy). Content and numbers live here. Its "+N intel" rewards predate the networks
([intelligence.md](intelligence.md)): as each is built it becomes den clues,
chronicle pages or revealed sites (roughly 4–5 intel to a clue).

## Aims

* **Depth like X-COM**: about 93 research topics (X-COM has around 90 once
  you count each alien's autopsy and interrogation), about 30 things to
  manufacture, and 9 new rooms.
* **Hard science.** Vampirism is a retrovirus (see [story.md](story.md)).
  Every topic is real work: virology, forensic science, INTERPOL police
  cooperation, JSOC-style targeting, archives, theology, and old money.
  Nothing works on faith alone. Faith training works because of the
  psychology behind it.
* **It feeds the battle.** Research gives real items in the inventory grid,
  rooms in the building, and weaknesses of particular houses. Team-wide
  bonuses survive only where no item would make sense.
* **Loot feeds research.** Remains, captives, evidence and artifacts from a
  given house open that house's topics, as alien corpses do in X-COM.
* **No cheating.** Each house's weaknesses are rolled at campaign start.

## Disciplines and lasting advances

**Science is four disciplines**, the scientists' aptitudes: Biology,
Psychology, Physics and Humanities ([base.md](base.md)). Each topic asks
for weights over them. **Investigative disciplines move to Intelligence**
([intelligence.md](intelligence.md)): the branches below on forensics and
INTERPOL, JSOC-style targeting, old money, and the interrogations, are to
be re-cut as Intelligence work. Science keeps autopsies and biopsies (the
body), the physics of light and materials, and the archives and theology.

**Research also gives lasting, force-wide advances**, not only items,
rooms and further topics: a topic can make a whole class of work cheaper
or faster for good, e.g. "Pulsed xenon: every UV-based weapon costs 5% less
and is built 5% faster". Advances come from topics beyond the one that
opens a class (an item's own prerequisite gives none), and are listed on
the topic. Numbers per topic to be set with the tree.

## Time and staff

Points are scientist-days of work at 1.5 points a day, the rule today. A
mid-tree topic is 200 points: about 13 days with a full lab of 10. That is
close to X-COM, where laser weapons take about 300 scientist-days, or 10
days with 30 scientists.

The whole tree is about **18,300 points**, roughly 12,200 scientist-days.
Two things decide how much of it a player gets through:

* **Headcount**: about 33 scientists working all year would finish
  everything. A good player (starting with 4, losing Padua's staff at the
  fall, and growing to 30–40 by month 8) gets through about 65–75%, as in
  an ordinary X-COM run.
* **Contact with the houses**: per-house topics (5,100 points) open only
  for houses the player has fought.

Calibration is in Open questions: salaries are the problem.

## Materials

| Material | Where it comes from | Used by |
|---|---|---|
| **Remains** of a house | Won strikes (helicopter), executed captives | Sequencing that house's strain; haem serum; sold as tissue |
| **Captive** thrall or vampire | Capture leads, won strikes | Provirus maps, interrogation, ledgers |
| **Evidence** of a house (new) | Won strikes after Site exploitation: phones, ledgers, drives (1–3, crate load 0.25) | Exploiting evidence (repeatable) |
| **Artifact** | Dens, havens, lairs (exists) | Provenance study (+intel, the artifact is kept) |

Remains are now counted **by house** (today they are one count per base).
Using remains for serum or the top weapons competes with selling them as
tissue. This is the same choice X-COM makes you take over Elerium.

## The houses' weaknesses

Each house carries its own strain of the virus. At campaign start, the
campaign seed rolls a strain for each house and stores it as
`GameState.strains`:

* **Absorption band**: one of UVB 308 nm, UVA 365 nm, or violet 405 nm.
  This is the peak at which the house's skin porphyrins absorb light, and
  so where UV burns it hardest. UV gear tuned to that band does ×1.6
  damage. Off-band does ×1. Broadband sources (the sun, flares, the
  Sparkle) always do ×1.
* **Two weaknesses** drawn from the pool below. There are no repeats
  within a house, and no two houses share both weaknesses.
* **The silver house**: exactly one house is hurt by silver (below). The
  roll favours Huaca (50%; the rest split evenly), so the Huaca chronicle's
  silver-lined coffins are a good bet, not a certainty.

| Weakness | What it does in battle | Garbled rumour |
|---|---|---|
| Photic seizure | A strobe stuns them for 1 turn | "Cannot abide the dancing lamp" |
| Cold torpor | Torpor lasts 2 turns longer | "Sleeps through the winter" |
| Circadian lock | A daytime raid finds them asleep: they don't wake from gunfire for 2 turns | "The dead sleep at noon" |
| Acoustic | A flashbang stuns them for 2 turns | Church bells |
| One compound | With blockers researched, their domination fails | Incense |
| Thin skin | Fire does ×1.5 and they burn a turn longer | "The fire takes them like straw" |
| Slow clotting | A haemolytic hit costs them 30% TU, not 20% | "They bleed like the living" |

Folklore is the houses' weaknesses garbled by eight centuries of retelling:
each rumour points at a real effect in the wrong words. There is no garlic,
no sedative and no stake in the pool.

**The physics is always real.** Silver hurts the silver house whether
the player knows it or not. Knowledge only tells the player what to make
and what to carry. There are three ways to learn:

1. **Rumours** (history): a house's history topic and its 80-intel
   chronicle each name three rumours. One of them is true.
2. **Observation** (battle): the log notes an unusual result ("the silver
   burns it"). The Bloodlines screen marks that weakness as *suspected*.
3. **Science** (body): Strain sequencing confirms the band and one
   weakness. The Provirus map confirms the other and whether it is the
   silver house.

Each house's fixed trait in [tactical.md](tactical.md) also has a counter
in the tree. Jade: thermal sights. Huaca: haemolytic rounds. Carcassonne:
discernment and blockers. Nullarbor: UV gear. Ashgrove and Sahel: thrall
work (Red notices, Thrall dependence).

## Silver

Silver is **alternative ammunition, not research**. Silver magazines (pistol
$300, SMG $400, carbine $500, five times a standard one) are on the market
from day one and fit any gun that takes the ordinary magazine. Against the
silver house they do ×1.5 damage; against everyone else they are just very
expensive rounds. The question is when to pay for them, not how to unlock
them.

## Feeding: feral and refined

How well a house eats decides what it fields. Each house has a **feeding**
level (0–100, starting at 70) that its supply and feeding operations raise
and that foiled operations, Ledgers and Asset freezes lower.

* **Refined** vampires (the default): use guns, dominate, retreat when
  hurt, keep the house's secrecy.
* **Feral** vampires: melee only, +4 TU, never retreat, no domination, and
  sloppy: each battle they fight in gives +5 intel on their house. Below 40
  feeding, half a house's vampires come feral; below 20, all but the elder.

Starving a house trades a harder fight up close for easier targets and more
intel. It replaces the old Haem hunger weakness: it is now a lever every
house has.

## Rooms (new)

The building has 23 rooms, so every new kind competes for space. One
upkeep figure is given per room per month. Topics marked [BSL-4],
[Forensic], [Archive] or [FIU] need their material at a base with that
room and at least one scientist (research is one Order-wide queue:
[base.md](base.md)).

| Room | Researched by | What it does | Cost, days, upkeep |
|---|---|---|---|
| **BSL-4 suite** | Biocontainment | Needed for virology on remains and captives. Remains stored here don't decay (stored elsewhere, they're lost after 60 days) | $700k, 14, $60k |
| **Forensic laboratory** | Forensic pathology | Needed for forensics. Each set of remains that arrives gives +3 intel on its house (after Stable isotopes) | $450k, 10, $30k |
| **Archive** | Holy Office archives | Needed for history topics. Chronicle entries open 5 intel sooner | $300k, 7, $15k |
| **Liaison desk** | INTERPOL liaison | Hears operations everywhere at rate 0.03; volunteers +50% | $400k, 10, $40k; one per base |
| **Fusion cell** | F3EAD | Leads last 25% longer. After a won strike, that house's next site lead comes within 5 days | $600k, 10, $60k; one per base |
| **FIU** (financial intelligence unit) | Financial intelligence | +1 intel a week on every house it has a ledger for; runs Asset freezes | $500k, 10, $40k; one per base |
| **Chapel** | Pastoral theology | Agents quartered here get +1 Faith a month (up to 95) and are back to full after domination | $200k, 7, $10k |
| **Range** (killing house) | CQB doctrine | Agents at this base get +1 Combat a month (up to 70) | $350k, 7, $20k |
| **Lumen gallery** | LED arrays | A UV-lit core: vampires burn inside it in base raids | $500k, 10, $30k; waits for base raids |

## Research topics

Prerequisites go in **Needs**. A dagger (†) marks a topic that already
exists. Effects are given as a change to today's rules.

### The body: virology and physiology

| Topic | Needs | Pts | Gives |
|---|---|---|---|
| Vampire physiology † | remains or captive | 120 | Opens the branch. Tissue sells for $160k |
| Biocontainment | Physiology | 100 | **BSL-4 suite** |
| Porphyrin photochemistry | Physiology | 200 | Why light burns them (protoporphyrin and the Soret band). Opens UV weaponry |
| Ultraviolet weaponry † | Porphyrin | 150 | UV flare; opens LED arrays and pulsed xenon |
| Haematology † | Physiology | 180 | +5 Vitality for all agents; tissue sells for $280k |
| Coagulation cascade | Haematology | 180 | Opens haemolytic chemistry |
| Haemolytic chemistry | Coagulation | 200 | **Haemolytic rounds**, the dart gun |
| Tissue regeneration | Haematology | 220 | **Haem serum** |
| Thermoregulation | Physiology | 120 | They run cold: **thermal sight** |
| Sensory physiology | Physiology | 150 | Their retina and hearing: **strobe** and **flashbang** |
| Torpor metabolism | Physiology | 150 | Torpor countdown shown over bodies; finishing costs 2 TU less |
| Pheromone resistance † | Physiology | 150 | Vampires land fewer blows (melee aim −8) |
| Domination neurology | Pheromones, a vampire captive | 250 | Domination will −10 |
| Thrall dependence | one thrall interrogated | 120 | Thralls are hooked on haem-bound peptides: turning a thrall is Tradecraft vs 35 (was 50) |
| Feeding ecology | Thrall dependence, Haematology | 150 | Each house's feeding level shown on the Bloodlines screen |
| The provirus | Biocontainment, Haematology [BSL-4] | 250 | The integrated viral genome: opens Strain sequencing for every house |
| Antisense silencing | Provirus, Coagulation [BSL-4] | 450 | Shuts off the repair genes: **silencer darts**, one kind per mapped house |
| Viral phylogenetics | Provirus, two strains sequenced, the Fournier register | 300 | A molecular clock puts the family tree's root at 1244. +10 intel on every house; opens the root strain |
| The root strain | Phylogenetics, Perfecti remains or captive [BSL-4] | 600 | Agnes's own sequence: the **Montségur silencer** (see Open questions) |

### The houses (six of each)

Strain sequencing and the Provirus map are done once per house. History
and Ledgers carry each house's own name.

| Topic | Needs | Pts | Gives |
|---|---|---|---|
| Strain: *house* | Provirus, that house's remains [BSL-4] | 200 | Confirms the band and one weakness |
| Provirus map: *house* | Its strain, a vampire captive of that house [BSL-4] | 300 | Confirms the other weakness; with Antisense, that house's silencer dart |
| History: *house* | Palaeography [Archive] | 150 | Three rumours, one true; +10 intel |
| Ledgers: *house* | Forensic accounting, and either a vampire of that house interrogated or 3 of its evidence | 200 | Its money mapped: its operations −25%, its lair pays ×1.5, +15 intel |

History and ledgers by house:

| House | History | Ledgers |
|---|---|---|
| Ashgrove | *The Salem examinations*: the 1692 Court of Oyer and Terminer files | *The Ashgrove Foundation*: South Dakota dynasty trusts, no rule against perpetuities |
| Huaca | *The Huarochirí manuscript* (1598), the Quechua book of the huacas | *Pieces of eight*: Potosí silver laundered through the Casa de la Moneda |
| Perfecti | *The Doat collection*: inquisitors' records of Languedoc, with the Montségur depositions (+15 intel, not +10) | *The Cahorsin letters*: Languedoc moneylenders' letters of credit, still being honoured |
| Sahel | *The Timbuktu manuscripts* (the Ahmed Baba Institute) | *Salt and gold*: the Taoudenni caravans, today's hawala |
| Jade | *The Jinyiwei archive*: the Ming Embroidered Uniform Guard | *Flying money*: feiqian drafts, Ming silver, today's underground banks |
| Nullarbor | *The VOC archive* (Nationaal Archief, The Hague) | *The Wreck-Lord's company*: VOC shares into Pacific trust shells |

### Forensics and INTERPOL

The Vatican City State has been a member of INTERPOL since 2008. Our
access comes through it.

| Topic | Needs | Pts | Gives |
|---|---|---|---|
| Forensic pathology | — | 80 | **Forensic laboratory**; their bite wounds can be read |
| Trace evidence | Forensic pathology | 120 | Cover-ups +10% (we know what a scene gives away) |
| Stable isotopes | Forensic pathology [Forensic] | 150 | Strontium and oxygen isotopes in enamel show where they grew up: +3 intel for each set of remains |
| Bomb-pulse dating | Forensic pathology | 120 | Enamel carbon-14 from before 1955 marks the old ones: site leads show how many vampires there are and whether an elder is present |
| Forensic genetic genealogy | Bomb-pulse, Provirus [Forensic] | 250 | Thralls are often family: interrogations give ×1.5 intel; relatives become volunteer sources |
| INTERPOL liaison | — | 150 | **Liaison desk** |
| Black notices | Liaison, Forensic pathology | 150 | Unidentified bodies worldwide: feeding operations heard at +0.1 in every region |
| Purple notices | Liaison, Network analysis | 200 | Matching how they work: 30% of operations that finish unheard come back as a cold-case lead |
| Red notices | Purple notices | 250 | Thralls can be handed to the police: frees the cell, support +0.3, +4 intel |

### Intelligence: JSOC-style targeting

| Topic | Needs | Pts | Gives |
|---|---|---|---|
| Signal analysis † | — | 90 | Station retrofit; SIGINT centre level 2 |
| Advanced signal analysis † | Signal analysis | 140 | SIGINT ×1.25 |
| Pattern of life † (was Pattern analysis) | Advanced signals | 180 | Leads last ×1.5 and carry more intel |
| Network analysis | Signal analysis | 160 | Link charts: intel from every source +20% |
| Site exploitation | — | 120 | Won strikes bring back **evidence** |
| Document and media exploitation (DOMEX) | Site exploitation, Signal analysis | 180 | Opens Exploit evidence |
| Exploit evidence (repeatable) | DOMEX, 1 evidence | 60 | +6 intel; 25% chance of a site lead |
| Counter-intelligence | Network analysis | 200 | Doubles half as common; spotting a double +15 Insight |
| Lawful intercept | Advanced signals, INTERPOL liaison | 220 | Stations ×1.2; SIGINT centre level 3 |
| F3EAD | Network analysis, Pattern of life | 300 | Find, fix, finish, exploit, analyse, disseminate: **Fusion cell** |
| Tagging, tracking, locating | F3EAD | 250 | A released thrall leads us to a site (60%) |
| Persistent ISR | Tagging, Thermoregulation | 300 | **ISR drone** |
| Signature reduction | Counter-intelligence | 150 | Noise of deploying −20% |
| CQB doctrine | — | 120 | **Range**; opening a door costs 2 TU (was 4) |
| Image intensification | — | 100 | **Night optics** |
| Doppler sensing | Signal analysis | 150 | **Motion tracker** |

### History and theology

| Topic | Needs | Pts | Gives |
|---|---|---|---|
| The Holy Office archives | — | 100 | **Archive**; +5 intel on every house (the archive of the former Holy Office opened in 1998) |
| Palaeography | Holy Office archives | 120 | Reading medieval hands: opens the house histories |
| The Fournier register | History: Perfecti | 220 | Jacques Fournier's interrogations of 1318–25 follow the survivors of Montségur as they scatter: +5 intel on every house |
| Folklore audit | Holy Office archives, Physiology | 150 | Rumours sorted against biology: each house's chronicle lists its three rumours |
| The Spiritual Exercises | — | 100 | Ignatian attention training: +5 Faith for every agent and recruit |
| Rituale Romanum | Spiritual Exercises | 120 | The old rite as a record of domination victims: Faith checks in nerve jobs +10 |
| Discernment of spirits | Spiritual Exercises, Domination neurology | 200 | A dominated agent loses half a turn, not a whole one |
| Pastoral theology | Holy Office archives, Thrall dependence | 150 | **Chapel**; a released thrall gives support +0.2 at home |
| The Lateran Pacts | Holy Office archives | 200 | The diplomatic bag: the courier carries weapons and armour |

### Old money

| Topic | Needs | Pts | Gives |
|---|---|---|---|
| Forensic accounting | — | 120 | Money seized in strikes +25% |
| Perpetual trusts | Forensic accounting | 200 | Foundations, Anstalten, dynasty trusts: opens the **Asset freeze** (FIU: the house's operations −40% for 30 days, costs $150k, secrecy −0.5) |
| Informal value transfer | Forensic accounting | 180 | Hawala and flying money: supply operations heard at +0.1 |
| Provenance research | Forensic accounting, Holy Office archives | 150 | Studying an artifact: +8 intel on its house; returning one gives +0.25 more support |
| Bullion and specie | Provenance | 150 | A lair's hoard read correctly: lair money +50% |
| Financial intelligence | Perpetual trusts, Network analysis | 250 | **FIU** |

### Equipment and medicine

| Topic | Needs | Pts | Gives |
|---|---|---|---|
| Composite armour † | — | 100 | Ceramic inserts (a market line) |
| Bite-resistant weave | — | 120 | **UHMWPE vest** |
| Shear-thickening fluid | Composite armour | 250 | **STF vest** |
| Boron carbide | Shear-thickening | 300 | **Heavy plate** |
| Pyrotechnics | — | 120 | **Magnesium shells** |
| LED arrays | UV weaponry | 250 | **Lumen lamps**; Lumen gallery |
| Pulsed xenon | UV weaponry | 200 | **Sparkle** |
| Excimer lasers | LED arrays, Porphyrin | 450 | **Excimer lance** |
| Lantern suit | LED arrays, Shear-thickening | 400 | **Lantern suit** |
| Field medicine † | — | 60 | Healing 9 a day |
| Combat surgery † | Field medicine | 120 | Healing 12 a day |
| Interrogate a thrall † (repeatable) | thrall captive | 60 | +4 intel |
| Interrogate a vampire † (repeatable) | vampire captive | 150 | +10 intel; counts toward Ledgers |

## Manufacture

Researched items are **made, not bought**, with two exceptions on the dark
web ([economy.md](economy.md)): items from public science (Composite armour,
CQB, Image intensification…) are sold from the start, and items from our own
research are sold once we have sold that research and it has got out (30–60
days). Each topic is marked public, ours (sellable) or not traded.
Engineering turns into an X-COM production queue at each base: an item, a
quantity, engineer-points and materials for each unit, delivered to that
base's armoury.

The one-off team-wide projects **Ceramic plate** and **UV munitions** go.
Their jobs pass to the items. Auto-combat reads item firepower and armour,
with the multipliers against each house. Station retrofit, Build a
helicopter and the four market lines stay as they are.

Battle numbers are relative to today's: rifle 18–30, vampire 48 HP.

| Item | Size, kit | Pts, $ each | In battle |
|---|---|---|---|
| Haemolytic magazine (pistol, SMG or carbine) | as the magazine | 2, $400 | Damage −10% (frangible). A vampire they drop dies when its torpor ends instead of rising. Against Huaca, the counter |
| Magnesium shells | 1 × 1, tactical | 2, $200 | Shotgun, 6 tiles. The tile hit burns for a turn (fire rules) |
| Dart gun | 1 × 3, plainclothes | 20, $8k | Silent, 10 tiles, 5 rounds |
| Haemolytic dart | 1 × 1 | 3, $500 | Finishes a body in torpor from range; a live vampire hit loses 20% TU next turn |
| Silencer dart (one per mapped house) | 1 × 1 | 8, $4k + ¼ remains | That house's vampire never rises from torpor and loses its armour |
| Montségur silencer | 1 × 1 | 40, $50k + 1 remains | As the silencer, for Agnes |
| UV flare | 1 × 1, plainclothes | 3, $600 | As planned in tactical.md: vampires won't enter its area |
| Sparkle | 1 × 1, tactical | 6, $2k | As planned: kills vampires for good in the blast, burns bodies in torpor |
| Strobe | 1 × 1, plainclothes | 3, $500 | Vampires within 5 tiles in sight lose half their TU next turn; a photic-weak house is stunned for 1 turn |
| Flashbang | 1 × 1, tactical | 2, $300 | Thralls stunned for 1 turn; an acoustic-weak house for 2 |
| Lumen lamp (365 or 405 nm) | 1 × 3, tactical | 20, $15k | A 4-tile cone, 20–30 to vampires, no armour, ×1.6 on band; burns bodies in torpor; harmless to humans. Battery 4 shots (battery 1 × 2, 2 pts, $500) |
| Excimer lance (308 nm) | 2 × 5, tactical | 60, $60k + ½ remains | A beam (ballistic, σ 0.6°), 20 tiles, 30–45 to vampires (×1.6 on a UVB house), 8 to humans, no armour, silent; burns bodies. Capacitor 4 shots (1 × 2, 4 pts, $2k) |
| UHMWPE vest | 2 × 3, plainclothes | 8, $3k | Armour 0.2; claws −30% |
| STF vest | 2 × 3, plainclothes | 15, $9k | Armour 0.35, concealable |
| Heavy plate | 2 × 3, tactical | 20, $14k | Armour 0.55 |
| Lantern suit | 2 × 3, tactical | 40, $40k | Armour 0.4; a vampire that strikes the wearer takes 10 burn; the AI picks other targets |
| Night optics | helmet, plainclothes | 10, $6k | Sight 14 tiles at night (was 9); no helmet armour |
| Thermal sight | helmet, tactical | 15, $10k | Sees vampires (cold) at 14 tiles day or night, Jade included |
| Motion tracker | 1 × 2, tactical | 10, $5k | Use: shows movement within 12 tiles this turn |
| ISR drone | 2 × 2, tactical | 30, $25k | Use: the outdoors within 15 tiles is seen for 3 turns |
| Haem serum | 1 × 1, plainclothes | 5, $1k + ⅙ remains | Heals 25, then 5 a turn for 3 turns |

The helmet slot now trades protection (ballistic helmet) against sight
(optics, thermal). That's on purpose.

## How it plays

* **Months 1–2 (Padua)**: no material needed. Forensic pathology,
  Signal analysis, Spiritual Exercises, Holy Office archives, CQB, Image
  intensification, Forensic accounting. Then Vampire physiology from the
  first remains.
* **After the fall**: rebuild the lab abroad. The BSL-4 suite and
  Provirus give the first tier: haemolytic rounds and lamps. Rumours and
  the first strain point to that region's house's weaknesses.
* **Act II**: the per-house topics drive the hunt. Ledgers starve a
  house, F3EAD speeds the strikes on it, silencers end its vampires.
  Excimer and heavy plate are the late tier.
* **Act III**: the root strain readies the attack on Montségur.

## Open questions

* **Salaries.** 30 scientists at $20k is $600k a month, more than a whole
  working base ([economy.md](economy.md)). X-COM spent about a quarter of
  its income on research. Recommendation: scientists and engineers at
  $12k. Re-check the budget targets with `npm run batch`.
* **Montségur.** Recommendation: no research gate on the lair (the story
  opens it). Without the Montségur silencer, Agnes regenerates 15 a turn
  and rises after 1 turn of torpor. The root strain makes the fight
  winnable, not possible. Her guard is the Duval brothers (from the
  book): two refined elders with cavalry sabres, melee only, who never
  go feral however Europe is starved.
* **Pheromone resistance** lowers melee aim (melee isn't ballistic), so it
  still works under the new shooting. The old ×1.4 for UV munitions goes
  with the item change.
* **Bots** (`sim/bot.ts`, `tactical/bot.ts`) need a research order and
  item use, or the batch numbers drift.
* **Build order**: (1) the item and production queue, remains by house,
  and evidence; (2) the strains and the Bloodlines screen's weaknesses;
  (3) the new rooms; (4) the content, branch by branch; (5) balance.

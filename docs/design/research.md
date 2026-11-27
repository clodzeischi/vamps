# Research: the full tree

**Status: design, not built.** It replaces the 20-project tree in
`data/research.ts`. [base.md](base.md) still covers how projects run (staff,
bases, synergy). Content and numbers live here. Its "+N intel" rewards predate the networks
([intelligence.md](intelligence.md)): as each is built it becomes den clues,
chronicle pages or revealed sites (roughly 4–5 intel to a clue).

## Aims

* **Depth like X-COM**: about 76 research topics, about 23 things to
  manufacture, and 5 new rooms.
* **Science only.** Every topic is a study worked by the scientists' four
  aptitudes, Biology, Psychology, Physics and Humanities ([base.md](base.md)),
  with its weights given in the tables. Vampirism is a retrovirus (see
  [story.md](story.md)): virology and physiology, forensic science, the
  physics of light and materials, palaeography and theology. Faith training
  works because of the psychology behind it. Tradecraft, liaison and money
  are not research; what science does for the intelligence section is
  wrapped as science (below).
* **It feeds the game.** Research gives items in the inventory grid, rooms
  in the building, weaknesses of particular houses, and lasting
  campaign-wide bonuses.
* **The game feeds it.** Tissue sampled in battle opens the tree: each
  house's vampires reveal its weaknesses, ferals open a branch of their
  own, elders give the houses' story. What the player fights decides what
  they can learn.
* **No cheating.** Each house's weaknesses are rolled at campaign start.

**Lasting advances**: besides items, rooms and further topics, a topic can
make a whole class of work cheaper or faster for good, e.g. "Pulsed xenon:
every UV-based weapon costs 5% less and is built 5% faster". Advances come
from topics beyond the one that opens a class (an item's own prerequisite
gives none), and are listed on the topic. Numbers per topic to be set with
the tree.

## Time and staff

Points are scientist-days of work at 1.5 points a day, the rule today. A
mid-tree topic is 200 points: about 13 days with a full lab of 10. That is
close to X-COM, where laser weapons take about 300 scientist-days, or 10
days with 30 scientists.

The whole tree is about **14,800 points**, roughly 9,800 scientist-days.
Two things decide how much of it a player gets through:

* **Headcount**: about 27 scientists working all year would finish
  everything. A good player (starting with 2, losing Padua's staff at the
  fall, and growing to 18–28 by month 8) gets through about 65–75%, as in
  an ordinary X-COM run.
* **Contact with the houses**: per-house topics (3,900 points) and the
  feral branch open only with samples of what the player has fought.

Calibration is in Open questions: salaries are the problem.

## Tissue samples

**The Biopsy kit** (from Field biopsy, the first topic, no material needed)
is a carried item. In battle, an operative next to a vampire's body (in
torpor or destroyed, not burnt) uses it to take a **Tissue sample**: a 1 × 1
item into their pack, carried home like any loot. A kit holds 4 samples'
worth of needles and vials. A body burnt by UV or fire gives nothing, so
burning a vampire for good and sampling it pull against each other.

A sample is labelled by its **house** and its **kind**, after the three
enemy types:

| Kind | Taken from | Opens |
|---|---|---|
| **Vampire** | Any refined vampire | Vampire physiology (the first one); that house's Strain, which reveals its weaknesses |
| **Feral** | A feral vampire (a starving house: below 40 feeding) | The feral branch: Feral neuropathology and what follows |
| **Elder** | An elder | That house's Lineage: its place in the family tree and its story |

Samples are research material like a captive: they must be at a base with
a laboratory and a scientist, and [BSL-4] topics need them in a BSL-4
suite. Samples kept in a BSL-4 suite don't decay; anywhere else they're
lost after 60 days. Some items use samples up (Manufacture).

**Other material**:

| Material | Where it comes from | Used by |
|---|---|---|
| **Remains** of a house | Won strikes (helicopter), executed captives (exists) | Sold as tissue; a lab can take one vampire sample from a set |
| **Captive** thrall or vampire | Capture leads, won strikes | Thrall dependence, Domination neurology; a captive vampire can be sampled |
| **Phone**, **Laptop** (new) | Recovered in battle | Intelligence: their use is set in the intelligence pass. Digital forensics makes them worth more |
| **Artifact** | Dens, havens, lairs (exists) | Provenance research (+intel, the artifact is kept) |

Interrogation is paused: it is neither research nor an investigation
until it is designed as a mechanic of its own.

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
3. **Science** (a vampire sample): the house's Strain confirms its band,
   both weaknesses and whether it is the silver house.

Each house's fixed trait in [tactical.md](tactical.md) also has a counter.
Jade: thermal sights. Huaca: haemolytic rounds. Carcassonne: discernment
and blockers. Nullarbor: UV gear. Ashgrove and Sahel: thrall work (Thrall
dependence, Tracking tags).

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
and that foiled operations lower.

* **Refined** vampires (the default): use guns, dominate, retreat when
  hurt, keep the house's secrecy.
* **Feral** vampires: melee only, +4 TU, never retreat, no domination, and
  sloppy: each battle they fight in gives +5 intel on their house. Below 40
  feeding, half a house's vampires come feral; below 20, all but the elder.

Starving a house trades a harder fight up close for easier targets, more
intel and feral samples. It replaces the old Haem hunger weakness: it is
now a lever every house has.

## Rooms (new)

The building has 23 rooms, so every new kind competes for space. One
upkeep figure is given per room per month. Topics marked [BSL-4],
[Forensic] or [Archive] need their material at a base with that room and
at least one scientist (research is one Order-wide queue:
[base.md](base.md)). The Range needs no research ([base.md](base.md)).

| Room | Researched by | What it does | Cost, days, upkeep |
|---|---|---|---|
| **BSL-4 suite** | Biocontainment | Needed for virology on samples and captives. Samples stored here don't decay (elsewhere they're lost after 60 days) | $700k, 14, $60k |
| **Forensic laboratory** | Forensic pathology | Needed for forensics. Each sample that arrives gives +3 intel on its house (after Stable isotopes) | $450k, 10, $30k |
| **Archive** | Holy Office archives | Needed for history topics. Chronicle entries open 5 intel sooner | $300k, 7, $15k |
| **Chapel** | Pastoral theology | Operatives quartered here get +1 Faith a month (up to 100) and are back to full after domination | $200k, 7, $10k |
| **Lumen gallery** | LED arrays | A UV-lit core: vampires burn inside it in base raids | $500k, 10, $30k; waits for base raids |

## Research topics

Prerequisites go in **Needs**. A dagger (†) marks a topic that already
exists. Effects are given as a change to today's rules. **Skill** is the
weights over the aptitudes: Bio, Psy, Phys, Hum (one name alone is 1).

Each topic, once built, needs a proposal (hints only), findings, a
plain outcome and a classification ([base.md](base.md), "The research
screen").

### The body: virology and physiology

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Field biopsy | — | Bio .7, Phys .3 | 60 | **Biopsy kit**: the way into the tree |
| Vampire physiology † | a vampire sample, or remains or a captive | Bio | 120 | Opens the branch. Tissue sells for $160k |
| Biocontainment | Physiology | Bio | 100 | **BSL-4 suite** |
| Porphyrin photochemistry | Physiology | Phys .6, Bio .4 | 200 | Why light burns them (protoporphyrin and the Soret band). Opens UV weaponry |
| Ultraviolet weaponry † | Porphyrin | Phys .7, Bio .3 | 150 | UV flare; opens LED arrays and pulsed xenon |
| Haematology † | Physiology | Bio | 180 | +5 Vitality for all operatives; tissue sells for $280k |
| Coagulation cascade | Haematology | Bio | 180 | Opens haemolytic chemistry |
| Haemolytic chemistry | Coagulation | Bio | 200 | **Haemolytic rounds**, the dart gun |
| Tissue regeneration | Haematology | Bio | 220 | **Haem serum** |
| Thermoregulation | Physiology | Bio .6, Phys .4 | 120 | They run cold: **thermal sight** |
| Sensory physiology | Physiology | Bio .6, Psy .4 | 150 | Their retina and hearing: **strobe** and **flashbang** |
| Torpor metabolism | Physiology | Bio | 150 | Torpor countdown shown over bodies; finishing costs 2 TU less |
| Pheromone resistance † | Physiology | Bio .6, Psy .4 | 150 | Vampires land fewer blows (melee aim −8) |
| Domination neurology | Pheromones, a vampire captive | Psy .6, Bio .4 | 250 | Domination will −10 |
| Thrall dependence | a thrall captive | Psy .5, Bio .5 | 120 | Withdrawal studied: thralls are hooked on haem-bound peptides; turning a thrall is Tradecraft vs 35 (was 50) |
| The provirus | Biocontainment, Haematology [BSL-4] | Bio | 250 | The integrated viral genome: opens every house's Strain and Lineage |
| Antisense silencing | Provirus, Coagulation [BSL-4] | Bio | 450 | Shuts off the repair genes: **silencer darts**, one kind for each house whose Strain is done |
| Viral phylogenetics | Provirus, two Lineages, the Fournier register | Bio .7, Hum .3 | 300 | The family tree drawn whole: a molecular clock puts its root at 1244. +10 intel on every house; opens the root strain |
| The root strain | Phylogenetics, a Perfecti elder sample [BSL-4] | Bio | 600 | Agnes's own sequence: the **Montségur silencer** (see Open questions) |

### The houses (three of each)

Done once per house, each from that house's own material.

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Strain: *house* | Biocontainment, a vampire sample of that house [BSL-4] | Bio | 250 | Its band, both weaknesses and whether it is the silver house; with Antisense, its silencer dart |
| Lineage: *house* | Provirus, an elder sample of that house [BSL-4] | Bio .6, Hum .4 | 250 | Where the house split from the root, and when: a chronicle page of its story |
| History: *house* | Palaeography [Archive] | Hum | 150 | Three rumours, one true; +10 intel |

| House | History | Lineage: what the elder's sequence shows |
|---|---|---|
| Ashgrove | *The Salem examinations*: the 1692 Court of Oyer and Terminer files | Sister to the Nullarbor Kin: both come off a **Dutch branch** that split from the Perfecti around 1600. Ashgrove's founder took it from the English Separatists' years in Leiden (1609–20) and brought it to Bristol and then New England |
| Huaca | *The Huarochirí manuscript* (1598), the Quechua book of the huacas | Split from the Perfecti about 1570, through the **Genoese banks** that lent against Potosí's silver: the Perfecti owned banks then as now |
| Perfecti | *The Doat collection*: inquisitors' records of Languedoc, with the Montségur depositions (+15 intel, not +10) | Closest to the root of all: every house descends from one infection, and the Perfecti's is the oldest branch still alive. Her elders' mutations count back to the fire |
| Sahel | *The Timbuktu manuscripts* (the Ahmed Baba Institute) | Split around 1330 through **Majorca**, whose Jewish map-makers and Catalan traders dealt with Mali in Mansa Musa's day |
| Jade | *The Jinyiwei archive*: the Ming Embroidered Uniform Guard | The deepest split outside Europe: about 1255, the **Perfectus of the Silk Road**, within a dozen years of Montségur |
| Nullarbor | *The VOC archive* (Nationaal Archief, The Hague) | Sister to Ashgrove, off the same Dutch branch: Cornelis Vos took it at Amsterdam before the VOC sent him east. The two lines have never met |

### The feral branch

Opened only by a feral sample, so only by starving a house.

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Feral neuropathology | Physiology, a feral sample | Bio .6, Psy .4 | 200 | Starved, the repair strips the forebrain for haem. Each house's feeding level shown on the Bloodlines screen; in battle, a feral's next target is marked |
| Haem chelation | Feral neuropathology, Haematology | Bio | 250 | Starving a vampire for a moment: **Chelation dart** |
| Forensic epidemiology | Feral neuropathology, Forensic pathology | Bio .6, Hum .4 | 150 | A starving house leaves bodies in the public record: OSINT finds feeding operations ×1.5 |

### Science for the intelligence section

Lasting boosts to the section ([intelligence.md](intelligence.md)), each
from a study, not from tradecraft. The SIGINT centre has two levels: the
one a base builds, and level 2.

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Signal processing † (was Signal analysis) | — | Phys | 90 | Station retrofit; SIGINT centre level 2 |
| Network science (was Advanced signal analysis †) | Signal processing | Phys .6, Psy .4 | 140 | Link analysis: follow-up leads come 30% of the time (was 20%) |
| Chronobiology (was Pattern analysis †) | Physiology, Signal processing | Bio .6, Psy .4 | 180 | Their nocturnal rhythm shows in the traffic: SIGINT and OSINT leads are real 10 points more often |
| Cryptanalysis | Network science | Phys .7, Hum .3 | 220 | SIGINT evidence counts for more (d +0.05) |
| Psychophysiology of deception | — | Bio .5, Psy .5 | 200 | More accurate detection of deception and duress: the section's CI +10; doubles easier to spot |
| Digital forensics | Signal processing | Phys .7, Hum .3 | 180 | Recovered phones and laptops give more (set in the intelligence pass) |
| Forensic genetic genealogy | Bomb-pulse dating, Provirus [Forensic] | Bio .7, Hum .3 | 250 | Thralls are often family: each sample brought home gives a HUMINT lead on its house 25% of the time (a relative) |
| Tracking tags | Doppler sensing | Phys | 200 | A thrall can be released with a tag: 60% chance of a strong lead on the site it goes to |

### Forensic science

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Forensic pathology | — | Bio | 80 | **Forensic laboratory**; their bite wounds can be read |
| Trace evidence | Forensic pathology | Phys .6, Bio .4 | 120 | Cover-ups +10% (we know what a scene gives away) |
| Stable isotopes | Forensic pathology [Forensic] | Phys | 150 | Strontium and oxygen isotopes in enamel show where they grew up: +3 intel for each sample |
| Bomb-pulse dating | Forensic pathology | Phys | 120 | Enamel carbon-14 from before 1955 marks the old ones: site leads show how many vampires there are and whether an elder is present |

### Optics and sensors

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Image intensification | — | Phys | 100 | **Night optics** |
| Doppler sensing | — | Phys | 150 | **Motion tracker** |
| Persistent ISR | Doppler sensing, Thermoregulation | Phys | 300 | **ISR drone** |

### History, theology and artifacts

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| The Holy Office archives | — | Hum | 100 | **Archive**; +5 intel on every house (the archive of the former Holy Office opened in 1998) |
| Palaeography | Holy Office archives | Hum | 120 | Reading medieval hands: opens the house histories |
| The Fournier register | History: Perfecti | Hum | 220 | Jacques Fournier's interrogations of 1318–25 follow the survivors of Montségur as they scatter: +5 intel on every house |
| Folklore audit | Holy Office archives, Physiology | Hum .5, Bio .5 | 150 | Rumours sorted against biology: each house's chronicle lists its three rumours |
| The Spiritual Exercises | — | Psy | 100 | Ignatian attention training: +5 Faith for every operative and recruit |
| Rituale Romanum | Spiritual Exercises | Psy .5, Hum .5 | 120 | The old rite as a record of domination victims: Faith checks in nerve jobs +10 |
| Discernment of spirits | Spiritual Exercises, Domination neurology | Psy | 200 | A dominated operative loses half a turn, not a whole one |
| Pastoral theology | Holy Office archives, Thrall dependence | Psy .5, Hum .5 | 150 | **Chapel**; a released thrall gives support +0.2 at home |
| Provenance research | Holy Office archives | Hum | 150 | Studying an artifact: +8 intel on its house; returning one gives +0.25 more support |
| Bullion and specie | Provenance | Phys .5, Hum .5 | 150 | Assaying a lair's hoard and reading its coins: lair money +50% |

### Equipment and medicine

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Composite armour † | — | Phys | 100 | Ceramic inserts (a market line) |
| Bite-resistant weave | — | Phys | 120 | **UHMWPE vest** |
| Shear-thickening fluid | Composite armour | Phys | 250 | **STF vest** |
| Boron carbide | Shear-thickening | Phys | 300 | **Heavy plate** |
| Pyrotechnics | — | Phys | 120 | **Magnesium shells** |
| LED arrays | UV weaponry | Phys | 250 | **Lumen lamps**; Lumen gallery |
| Pulsed xenon | UV weaponry | Phys | 200 | **Sparkle** |
| Excimer lasers | LED arrays, Porphyrin | Phys | 450 | **Excimer lance** |
| Lantern suit | LED arrays, Shear-thickening | Phys | 400 | **Lantern suit** |
| Field medicine † | — | Bio | 60 | Healing 9 a day |
| Combat surgery † | Field medicine | Bio | 120 | Healing 12 a day |

## Manufacture

Researched items are **made, not bought**, with two exceptions on the dark
web ([economy.md](economy.md)): items from public science (Composite armour,
Image intensification…) are sold from the start, and items from our own
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
| Silencer dart (one per mapped house) | 1 × 1 | 8, $4k + ¼ sample of that house | That house's vampire never rises from torpor and loses its armour |
| Montségur silencer | 1 × 1 | 40, $50k + 1 Perfecti elder sample | As the silencer, for Agnes |
| UV flare | 1 × 1, plainclothes | 3, $600 | As planned in tactical.md: vampires won't enter its area |
| Sparkle | 1 × 1, tactical | 6, $2k | As planned: kills vampires for good in the blast, burns bodies in torpor |
| Strobe | 1 × 1, plainclothes | 3, $500 | Vampires within 5 tiles in sight lose half their TU next turn; a photic-weak house is stunned for 1 turn |
| Flashbang | 1 × 1, tactical | 2, $300 | Thralls stunned for 1 turn; an acoustic-weak house for 2 |
| Lumen lamp (365 or 405 nm) | 1 × 3, tactical | 20, $15k | A 4-tile cone, 20–30 to vampires, no armour, ×1.6 on band; burns bodies in torpor; harmless to humans. Battery 4 shots (battery 1 × 2, 2 pts, $500) |
| Excimer lance (308 nm) | 2 × 5, tactical | 60, $60k + ½ sample | A beam (ballistic, σ 0.6°), 20 tiles, 30–45 to vampires (×1.6 on a UVB house), 8 to humans, no armour, silent; burns bodies. Capacitor 4 shots (1 × 2, 4 pts, $2k) |
| UHMWPE vest | 2 × 3, plainclothes | 8, $3k | Armour 0.2; claws −30% |
| STF vest | 2 × 3, plainclothes | 15, $9k | Armour 0.35, concealable |
| Heavy plate | 2 × 3, tactical | 20, $14k | Armour 0.55 |
| Lantern suit | 2 × 3, tactical | 40, $40k | Armour 0.4; a vampire that strikes the wearer takes 10 burn; the AI picks other targets |
| Night optics | helmet, plainclothes | 10, $6k | Sight 14 tiles at night (was 9); no helmet armour |
| Thermal sight | helmet, tactical | 15, $10k | Sees vampires (cold) at 14 tiles day or night, Jade included |
| Motion tracker | 1 × 2, tactical | 10, $5k | Use: shows movement within 12 tiles this turn |
| ISR drone | 2 × 2, tactical | 30, $25k | Use: the outdoors within 15 tiles is seen for 3 turns |
| Haem serum | 1 × 1, plainclothes | 5, $1k + ⅙ sample | Heals 25, then 5 a turn for 3 turns |
| Biopsy kit | 2 × 1, plainclothes | 4, $300 | Use on a vampire's body next to the operative (4 TU): a Tissue sample of its house and kind into the pack. 4 samples, then empty |
| Chelation dart | 1 × 1 | 4, $800 | A refined vampire hit goes feral for 3 turns: drops its gun, no domination, +4 TU, charges the nearest |

**Loot, not made**: the **Tissue sample** (1 × 1), the **Phone** (1 × 1)
and the **Laptop** (2 × 2), picked up in battle and carried home in the
pack. Models and icons: [item-art.md](item-art.md).

The helmet slot now trades protection (ballistic helmet) against sight
(optics, thermal). That's on purpose.

## How it plays

* **Months 1–2 (Padua)**: no material needed. Field biopsy first, then
  Forensic pathology, Spiritual Exercises, Holy Office archives, Image
  intensification, Composite armour, Field medicine, Signal processing.
  The first raid with a Biopsy kit brings back a vampire sample: Vampire
  physiology.
* **After the fall**: rebuild the lab abroad. The BSL-4 suite and
  Provirus give the first tier: haemolytic rounds and lamps. Each new
  house fought gives a sample, and its Strain names its weaknesses.
* **Act II**: the per-house topics drive the hunt. Starving a house brings
  ferals, and feral samples open chelation. Silencers end a house's
  vampires; each elder killed and sampled tells its house's story.
  Excimer and heavy plate are the late tier.
* **Act III**: two Lineages and the Fournier register draw the family
  tree; a Perfecti elder's sample gives the root strain for Montségur.

## Open questions

* **Salaries.** 27 scientists at $20k is $540k a month, more than a whole
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
* **Elders in battle**: where elders are met besides their lair (Bomb-pulse
  says when one is present), so Lineages come before a house is destroyed.
* **Bots** (`sim/bots/bot.ts`, `tactical/bot.ts`) need a research order and
  item use (the Biopsy kit included), or the batch numbers drift.
* **Build order**: (1) the item and production queue, the Biopsy kit and
  samples by house and kind; (2) the strains and the Bloodlines screen's
  weaknesses; (3) the new rooms; (4) the content, branch by branch; (5)
  balance.

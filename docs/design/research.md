# Research: the full tree

**Status: steps 1–4 and part of 5 built** (spine beats 1–6, the Biopsy kit and
tissue samples, silver rounds, fuel tanks; the first researched items; the
houses' strains and the Bloodlines screen's weaknesses; the new rooms; see
"As built"); the rest is design. It
replaces the old project tree in `data/research.ts`. [base.md](base.md) still covers how projects run (staff,
bases, synergy). Content and numbers live here. Research never gives intel
points (the intel meter is gone, [intelligence.md](intelligence.md)): where it
helps the hunt, it makes one of the section's disciplines more productive or
turns up leads.

## Shape: a spine, and branches off it

As in X-COM, a **story spine** of research is what defeats Agnes. Each beat
opens items, rooms and further research, and the **branches** (combat,
intelligence, the houses' lore) grow off those beats.

* **Three to start**, one of each kind: Vatican Digital Archives I (story),
  Field medicine (combat), Signal processing (intelligence).
* **A topic shows only once what it needs is researched.** One that also
  needs material (a sample, a captive) shows greyed until the material is
  at a base with a laboratory, its blocker saying what it waits for.
* **Science only.** Every topic is a study worked by the scientists' four
  aptitudes, Biology, Psychology, Physics and Humanities ([base.md](base.md));
  **Skill** gives its weights over them (Bio, Psy, Phys, Hum; one name alone
  is 1). Vampirism is a retrovirus ([story.md](story.md)).
* **The game feeds it.** Tissue sampled in battle opens the tree: a house's
  vampires reveal its weaknesses, ferals open a branch of their own, elders
  carry the spine. What the player fights decides what they can learn.
* **No cheating.** Each house's weaknesses are rolled at campaign start.
* **Lasting advances**: a topic beyond the one that opens a class of items
  can make that class cheaper or faster for good ("Pulsed xenon: every
  UV-based weapon costs 5% less and is built 5% faster"). Numbers per topic
  to be set with the tree.

A dagger (†) marks a topic in the game today. Effects are given as a change
to today's rules. Each topic, once built, needs a proposal (hints only),
findings, a plain outcome and a classification ([base.md](base.md), "The
research screen").

## The spine: what we research to defeat Agnes

| # | Topic | Needs | Skill | Pts | Gives | Opens |
|---|---|---|---|---|---|---|
| 1 | **Vatican Digital Archives I** | — | Hum | 80 | The Albigensian Crusade, Montségur 1244 and the Perfecti. The **Biopsy kit** (workshops) | Physiology I, Archives II, the Spiritual Exercises |
| 2 | **Vatican Digital Archives II** | Archives I | Hum | 120 | How the houses split from the Perfecti and spread worldwide: we need reach. **Fuel tanks** for the helicopter and the jet (workshops, on an aircraft at the base); the **Archive** | Palaeography |
| 3 | **Vampire Physiology I** † (was Vampire physiology) | Archives I, a vampire sample (or remains, or a vampire captive) | Bio | 120 | **Silver frangible rounds** (workshops). Tissue sells for $160k | Physiology II, Haematology, Pheromone resistance, Forensic pathology, Composite armour, Chronobiology |
| 4 | **Vampire Physiology II** | Physiology I | Bio .7, Phys .3 | 180 | Why light and fire burn them, and what the sleep is | Biocontainment, Porphyrin photochemistry, Pyrotechnics, Sensory physiology, Thermoregulation, Torpor metabolism, Feral neuropathology |
| 5 | **Biocontainment** | Physiology II | Bio | 150 | The **BSL-4 suite** | The Provirus |
| 6 | **The Provirus** | Biocontainment [BSL-4] | Bio | 250 | The integrated viral genome | Strain and Lineage of every house, Antisense silencing, Metalloporphyrins |
| 7 | **Lineage: *house*** (×6) | Provirus, an elder sample of that house [BSL-4] | Bio .6, Hum .4 | 250 | Where and when the house split from the root: a chronicle page of its story | The Family Tree, once two are done |
| 8 | **The Family Tree** (was Viral phylogenetics) | Two Lineages | Bio .7, Hum .3 | 300 | Every house descends from one infection in 1244, and Agnes is its root. Every discipline +5% | The Root Strain |
| 9 | **The Root Strain** | The Family Tree, a Perfecti elder sample [BSL-4] | Bio | 600 | Agnes's own sequence: the **Montségur silencer** | — |

How it runs through the acts ([story.md](story.md)):

* **Act I (Padua)**: Archives I and II, Physiology I and II. The first raid
  with a Biopsy kit brings home the sample Physiology I needs. The fall
  comes whatever has been researched.
* **Act II (the hostage years)**: Biocontainment and the Provirus abroad.
  Elders sleep in lairs, so each lesser house destroyed brings home the
  elder sample its Lineage needs: the story's own progress feeds the spine,
  as interrogating a navigator opens Alien Origins in X-COM. Two Lineages
  draw the Family Tree.
* **Act III (the return)**: Agnes's network reopens, and a Perfecti elder
  sample from her dens gives the Root Strain. Without the Montségur silencer
  Agnes regenerates 15 a turn and rises after 1 turn of torpor; with it the
  fight can be won. The lair itself is opened by the story, not research.

## Tissue samples

The **Biopsy kit** (from Archives I) is a carried item. In battle, an
operative next to a vampire's body (in torpor or destroyed, not burnt) uses
it to take a **Tissue sample**: a 1 × 1 item into their pack, carried home
like any loot. A kit holds 4 samples. A body burnt by UV or fire gives
nothing, so burning a vampire for good and sampling it pull against each
other.

A sample is labelled by its **house** and its **kind**:

| Kind | Taken from | Opens |
|---|---|---|
| **Vampire** | Any refined vampire | Physiology I (the first one); that house's Strain, which reveals its weaknesses |
| **Feral** | A feral vampire (a starving house: below 40 feeding) | The feral branch |
| **Elder** | An elder | That house's Lineage, on the spine |

Samples are research material like a captive: they must be at a base with
a laboratory and a scientist, and [BSL-4] topics need them in a BSL-4
suite, where they don't decay (elsewhere they're lost after 60 days). Some
items use samples up (Manufacture).

| Other material | Where it comes from | Used by |
|---|---|---|
| **Remains** of a house | Won strikes (helicopter), executed captives (exists) | Sold as tissue; a lab can take one vampire sample from a set |
| **Captive** thrall or vampire | Capture leads, won strikes | Thrall dependence, Domination neurology; a captive vampire can be sampled |
| **Phone**, **Laptop** | Recovered in battle | Intelligence (set in the intelligence pass); Digital forensics makes them worth more |
| **Artifact** | Dens, havens, lairs (exists) | Returned for support; sold on the dark web |

Interrogation is paused until it is designed as a mechanic of its own.

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
* **Silver**: a multiplier on silver rounds, rolled between ×0.8 and ×1.5.
  Huaca's is rolled from the top half, so the Huaca chronicle's
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

**The physics is always real.** Silver hurts a house as much as its roll
says whether the player knows it or not. Knowledge only tells the player
what to make and what to carry. There are three ways to learn:

1. **Rumours**: a house's History topic and its chronicle each name three
   rumours. One of them is true.
2. **Observation** (battle): the log notes an unusual result ("the silver
   burns it"). The Bloodlines screen marks that weakness as *suspected*.
3. **Science** (a vampire sample): the house's Strain confirms its band,
   both weaknesses and its silver multiplier.

Each house's fixed trait in [tactical.md](tactical.md) also has a counter.
Jade: thermal sights. Huaca: haemolytic rounds. Carcassonne: discernment
and blockers. Nullarbor: UV gear. Ashgrove and Sahel: thrall work (Thrall
dependence, Tracking tags).

## Silver

**Silver frangible rounds** are an ammunition type, from Vampire Physiology
I: silver powder pressed into a frangible core, made in the workshops for
any gun that takes the ordinary magazine (pistol, SMG, carbine). They do
×0.7 damage to humans and ×1.25 to vampires, times that house's silver
multiplier (×0.8 to ×1.5). Against a house that shrugs silver off, they're
expensive rounds that are worse against its thralls.

## Feeding: feral and refined

How well a house eats decides what it fields. Each house has a **feeding**
level (0–100, starting at 70) that drifts back toward 70 (3% of the gap a
day). A feeding operation that runs its course raises it 3; an operation we
foil lowers it 10 (a feeding one) or 4 (any other). Starving a house takes
steady pressure.

* **Refined** vampires (the default): use guns, dominate, retreat when
  hurt, keep the house's secrecy.
* **Feral** vampires: melee only, +4 TU, never retreat, no domination, and
  sloppy: leads on a house that fields ferals are real 10 points more
  often. Below 40 feeding, half a house's vampires come feral; below 20,
  all but the elder.

Starving a house trades a harder fight up close for easier targets, surer
leads and feral samples. It is a lever every house has.

## Rooms (new)

The building has 23 rooms, so every new kind competes for space. One
upkeep figure is given per room per month. Topics marked [BSL-4],
[Forensic] or [Archive] need their material at a base with that room and
at least one scientist (research is one Order-wide queue:
[base.md](base.md)). The Range needs no research ([base.md](base.md)).

| Room | Researched by | What it does | Cost, days, upkeep |
|---|---|---|---|
| **BSL-4 suite** | Biocontainment (spine) | Needed for virology on samples and captives. Samples stored here don't decay | $700k, 14, $60k |
| **Archive** | Archives II (spine) | Needed for the house histories | $300k, 7, $15k |
| **Forensic laboratory** | Forensic pathology | Needed for forensics topics | $450k, 10, $30k |
| **Chapel** | Pastoral theology | Operatives quartered here get +1 Faith a month (up to 100) and are back to full after domination | $200k, 7, $10k |
| **Lumen gallery** | LED arrays | A UV-lit core: vampires burn inside it in base raids | $500k, 10, $30k; waits for base raids |

## Combat branches

### Medicine (from Field medicine, a starting topic)

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Field medicine † | — | Bio | 60 | Healing 9 a day (was 6) |
| Combat surgery † | Field medicine | Bio | 120 | Healing 12 a day; the **Advanced trauma kit** (heals 20, two uses) |
| Haematology † | Field medicine, Physiology I | Bio | 180 | Their blood studied: +5 Vitality for every operative and recruit; synthetic plasma (goods); tissue sells for $280k |
| Tissue regeneration | Haematology, Physiology II | Bio | 220 | Their repair borrowed: **Haem serum** |

### Weapons and ammunition

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Haemolytic chemistry | Haematology | Bio | 200 | Their blood gelled: **haemolytic magazines** and the **crossbow** with **haemolytic bolts** |
| Metalloporphyrins | Haematology, the Provirus | Bio .6, Phys .4 | 300 | The compound: a tin porphyrin that stalls their repair. The **coated knife** and **coated bolts**, both silent: a stealth kill |
| Antisense silencing | The Provirus | Bio | 450 | Shuts off the repair genes: **silencer bolts**, one kind for each house whose Strain is done |
| Porphyrin photochemistry (takes in Ultraviolet weaponry †) | Physiology II | Phys .6, Bio .4 | 200 | Why light burns them (protoporphyrin and the Soret band): the **UV flare** |
| LED arrays | Porphyrin | Phys | 250 | **Lumen lamps**; the Lumen gallery |
| Pulsed xenon | Porphyrin | Phys | 200 | The **Sparkle** |
| Excimer lasers | LED arrays | Phys | 450 | The **Excimer lance** |
| Pyrotechnics | Physiology II | Phys | 120 | **Magnesium shells** |

### Armour

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Composite armour † | Physiology I | Phys | 100 | A claw strike measured: ceramic inserts (goods) |
| Bite-resistant weave | Composite armour | Phys | 120 | **UHMWPE vest** |
| Shear-thickening fluid | Composite armour | Phys | 250 | **STF vest** |
| Boron carbide | Shear-thickening | Phys | 300 | **Heavy plate** |
| Lantern suit | LED arrays, Shear-thickening | Phys | 400 | **Lantern suit** |

### Their senses and sleep

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Sensory physiology | Physiology II | Bio .6, Psy .4 | 150 | Their retina and hearing: **strobe** and **flashbang** |
| Thermoregulation | Physiology II | Bio .6, Phys .4 | 120 | They run cold: **thermal sight** |
| Torpor metabolism | Physiology II | Bio | 150 | Torpor countdown shown over bodies; finishing costs 2 TU less |
| Pheromone resistance † | Physiology I | Bio .6, Psy .4 | 150 | Vampires land fewer blows (melee aim −8); pheromone blockers (goods) |

### Faith and the mind

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| The Spiritual Exercises | Archives I | Psy | 100 | Ignatian attention training: +5 Faith for every operative and recruit |
| Domination neurology | Pheromone resistance, a vampire captive | Psy .6, Bio .4 | 250 | Domination will −10 |
| Discernment of spirits | Spiritual Exercises, Domination neurology | Psy | 200 | A dominated operative loses half a turn, not a whole one |
| Thrall dependence | Physiology I, a thrall captive | Psy .5, Bio .5 | 120 | Withdrawal studied: turning a thrall is Tradecraft vs 35 (was 50) |
| Pastoral theology | Spiritual Exercises, Thrall dependence | Psy .5, Hum .5 | 150 | The **Chapel**; a released thrall gives support +0.2 at home |

### The feral branch (opened only by a feral sample)

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Feral neuropathology | Physiology II, a feral sample | Bio .6, Psy .4 | 200 | Starved, the repair strips the forebrain for haem. Each house's feeding level shown; in battle, a feral's next target is marked |
| Haem chelation | Feral neuropathology, Haematology | Bio | 250 | **Chelation bolts**: a vampire hit goes feral for 3 turns (drops its gun, no domination, charges) |
| Forensic epidemiology | Feral neuropathology, Forensic pathology | Bio .6, Hum .4 | 150 | A starving house leaves bodies in the public record: OSINT finds feeding operations ×1.5 |

## Intelligence branch (from Signal processing, a starting topic)

Lasting boosts to the section ([intelligence.md](intelligence.md)), each
from a study, not from tradecraft. A discipline's productivity "+N%" means
the section's aptitude in it counts N% higher, in Find and Fix alike. The
SIGINT centre has two levels: the one a base builds, and level 2.

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Signal processing † (was Signal analysis) | — | Phys | 90 | Station retrofit; SIGINT centre level 2 |
| Network science (was Advanced signal analysis †) | Signal processing | Phys .6, Psy .4 | 140 | Follow-up leads come 30% of the time (was 20%) |
| Cryptanalysis | Network science | Phys .7, Hum .3 | 220 | SIGINT evidence counts for more (d +0.05) |
| Psychophysiology of deception | Network science | Bio .5, Psy .5 | 200 | Deception and duress read more accurately: CI +10; doubles easier to spot |
| Digital forensics | Signal processing | Phys .7, Hum .3 | 180 | Recovered phones and laptops give more (set in the intelligence pass) |
| Chronobiology (was Pattern analysis †) | Signal processing, Physiology I | Bio .6, Psy .4 | 180 | Their nocturnal rhythm shows in the traffic: SIGINT and OSINT leads are real 10 points more often |
| Image intensification | Signal processing | Phys | 100 | **Night optics** |
| Doppler sensing | Signal processing | Phys | 150 | **Motion tracker** |
| Persistent ISR | Doppler sensing, Thermoregulation | Phys | 300 | **ISR drone** |
| Tracking tags | Doppler sensing | Phys | 200 | A thrall can be released with a tag: 60% chance of a strong lead on the site it goes to |

### Forensic science (from Physiology I)

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Forensic pathology | Physiology I | Bio | 80 | The **Forensic laboratory**; their bite wounds can be read |
| Trace evidence | Forensic pathology | Phys .6, Bio .4 | 120 | Cover-ups +10% (we know what a scene gives away) |
| Stable isotopes | Forensic pathology [Forensic] | Phys | 150 | Where they grew up, from their teeth, narrows the records to search: OSINT +10% |
| Bomb-pulse dating | Forensic pathology | Phys | 120 | Enamel carbon-14 from before 1955 marks the old ones: site leads show how many vampires there are and whether an elder is present |
| Forensic genetic genealogy | Bomb-pulse dating, the Provirus [Forensic] | Bio .7, Hum .3 | 250 | Thralls are often family: each sample brought home gives a HUMINT lead on its house 25% of the time |

## The houses' lore (off the spine)

| Topic | Needs | Skill | Pts | Gives |
|---|---|---|---|---|
| Strain: *house* (×6) | The Provirus, a vampire sample of that house [BSL-4] | Bio | 250 | Its band, both weaknesses and its silver multiplier; with Antisense, its silencer bolt |
| Palaeography | Archives II | Hum | 120 | Reading medieval hands: opens the house histories |
| History: *house* (×6) | Palaeography [Archive] | Hum | 150 | Three rumours about its weaknesses, one true: a chronicle page |
| The Fournier register | History: Perfecti | Hum | 220 | Jacques Fournier's interrogations of 1318–25 follow the survivors of Montségur and their families: HUMINT +10% |

| House | History | Lineage: what the elder's sequence shows |
|---|---|---|
| Ashgrove | *The Salem examinations*: the 1692 Court of Oyer and Terminer files | Sister to the Nullarbor Kin: both come off a **Dutch branch** that split from the Perfecti around 1600. Ashgrove's founder took it from the English Separatists' years in Leiden (1609–20) and brought it to Bristol and then New England |
| Huaca | *The Huarochirí manuscript* (1598), the Quechua book of the huacas | Split from the Perfecti about 1570, through the **Genoese banks** that lent against Potosí's silver: the Perfecti owned banks then as now |
| Perfecti | *The Doat collection*: inquisitors' records of Languedoc, with the Montségur depositions | Closest to the root of all: every house descends from one infection, and the Perfecti's is the oldest branch still alive. Her elders' mutations count back to the fire |
| Sahel | *The Timbuktu manuscripts* (the Ahmed Baba Institute) | Split around 1330 through **Majorca**, whose Jewish map-makers and Catalan traders dealt with Mali in Mansa Musa's day |
| Jade | *The Jinyiwei archive*: the Ming Embroidered Uniform Guard | The deepest split outside Europe: about 1255, the **Perfectus of the Silk Road**, within a dozen years of Montségur |
| Nullarbor | *The VOC archive* (Nationaal Archief, The Hague) | Sister to Ashgrove, off the same Dutch branch: Cornelis Vos took it at Amsterdam before the VOC sent him east. The two lines have never met |

## Manufacture

Researched items are **made, not bought**, with two exceptions on the dark
web ([economy.md](economy.md)): items from public science (Composite armour,
Image intensification…) are sold from the start, and items from our own
research are sold once we have sold that research and it has got out (30–60
days). Engineering turns into an X-COM production queue at each base: an
item, a quantity, engineer-points and materials for each unit, delivered to
that base's armoury.

The one-off team-wide projects **Ceramic plate** and **UV munitions** go.
Their jobs pass to the items. Auto-combat reads item firepower and armour,
with the multipliers against each house. Station retrofit, Build a
helicopter and the four market lines stay as they are.

Battle numbers are relative to today's: rifle 18–30, vampire 48 HP.

| Item | Size, kit | Pts, $ each | In battle |
|---|---|---|---|
| Silver magazine (pistol, SMG or carbine) | as the magazine | 2; $300, $400, $500 | ×0.7 to humans, ×1.25 to vampires times the house's silver multiplier |
| Crossbow | 1 × 4, plainclothes | 20, $8k | Silent, 12 tiles, one bolt at a time (reloading costs TU); fires every bolt below |
| Coated bolt | 1 × 1 | 3, $400 | ×2 to vampires; the one hit can't regenerate for 3 turns, and if it drops it doesn't rise |
| Coated knife | 1 × 2, plainclothes | 6, $1.5k | Melee, silent; ×2 to vampires and their repair stalls as with the bolt |
| Haemolytic bolt | 1 × 1 | 3, $500 | Finishes a body in torpor from range; a live vampire hit loses 20% TU next turn |
| Silencer bolt (one per sequenced house) | 1 × 1 | 8, $4k + ¼ sample of that house | That house's vampire never rises from torpor and loses its armour |
| Chelation bolt | 1 × 1 | 4, $800 | A refined vampire hit goes feral for 3 turns |
| Montségur silencer | 1 × 1 | 40, $50k + 1 Perfecti elder sample | A silencer bolt for Agnes |
| Advanced trauma kit | 2 × 1, plainclothes | 4, $1.2k | As the trauma kit, healing 20, two uses |
| Helicopter fuel tanks | a job on a helicopter | 40, $120k | Reach 900 nm to 1,300 nm |
| Jet fuel tanks | a job on a jet | 60, $250k | Reach 2,600 nm to 3,600 nm |
| Haemolytic magazine (pistol, SMG or carbine) | as the magazine | 2, $400 | Damage −10% (frangible). A vampire they drop dies when its torpor ends instead of rising. Against Huaca, the counter |
| Magnesium shells | 1 × 1, tactical | 2, $200 | Shotgun, 6 tiles. The tile hit burns for a turn (fire rules) |
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

**Loot, not made**: the **Tissue sample** (1 × 1), the **Phone** (1 × 1)
and the **Laptop** (2 × 2), picked up in battle and carried home in the
pack. Models and icons: [item-art.md](item-art.md).

The helmet slot trades protection (ballistic helmet) against sight
(optics, thermal). That's on purpose. The crossbow and the coated knife
are the quiet way to kill a vampire: they reward stealth play.

## Time and staff

Points are scientist-days of work at 1.5 points a day, the rule today. A
mid-tree topic is 200 points: about 13 days with a full lab of 10. That is
close to X-COM, where laser weapons take about 300 scientist-days, or 10
days with 30 scientists.

The whole tree is about **72 topics and 14,400 points**, roughly 9,600
scientist-days. The spine alone is about 2,300 (two Lineages counted).
Two things decide how much of the rest a player gets through:

* **Headcount**: about 26 scientists working all year would finish
  everything. A good player (starting with 2, losing Padua's staff at the
  fall, and growing to 18–28 by month 8) gets through about 65–75%, as in
  an ordinary X-COM run.
* **Contact with the houses**: per-house topics and the feral branch open
  only with samples of what the player has fought.

## As built (step 1)

* **Research** (`data/research.ts`): Vatican Digital Archives I and II,
  Vampire Physiology I (the old Vampire physiology) and II. Three topics are
  open at the start (Archives I, Field medicine, Signal analysis); a topic
  shows once its prerequisites are done. The old topics hang off the spine
  for now: Composite armour and Pheromone resistance after Physiology I,
  Haematology after Field medicine and Physiology I, Ultraviolet weaponry
  after Physiology II. Interrogation is gone from research.
* **Workshops** deliver items to the base's armoury (`ProjectDef.item`):
  the Biopsy kit (6 pts, $3k) after Archives I; silver magazines for the
  Glock, the MPX and the 416 (2 pts each) after Physiology I. Fuel tanks
  after Archives II are a job on one aircraft at the base (helicopter 40
  pts, $120k, reach 1,300 nm; jet 60 pts, $250k, 3,600 nm), saved as
  `Aircraft.tanks`; routes and reach go by the aircraft (`reachOf`).
* **Biopsy** (`tactical/commands.ts`): 12 TU next to a vampire in torpor, or
  a destroyed one not burnt (`Unit.burnt`), once a body (`Unit.sampled`).
  The sample (`sample-<kind>-<house>`, 18 item ids sharing one model and
  icon) goes into a pocket or the pack, else at the agent's feet. A kit's
  samples left are its stowed `ammo` (4, refilled at home). An elder gives an
  elder sample; ferals don't exist yet.
* **Samples home**: after a fought battle they go from the agents' gear to
  the home base's armoury; dropped ones come back with the recovered kit. A
  won auto-resolved strike samples up to four bodies per kit carried (a
  lair's eldest as an elder sample). A sample, remains or a captive vampire
  at a base with a lab and a scientist is the material for Physiology I.
  Samples don't decay yet (that waits for the BSL-4 suite).
* **Silver**: a magazine with `fits` loads whatever its ordinary one does
  (pockets first); the gun then fires silver (`Unit.silver`, lost when
  another gun comes into the hand): ×1.25 to vampires, ×0.7 to everyone
  else. No per-house multiplier until the strains are built. The silver
  magazines share the ordinary magazines' icons for now.

## As built (step 2)

* **Ceramic plate and UV munitions are gone**, and so is research armour in
  a vest: auto-combat and the battlescape read each agent's own items.
  Research's only fight modifier left is Pheromone resistance.
* **Armour** (after Composite armour): Bite-resistant weave (120) gives the
  UHMWPE vest (plainclothes, armour 0.2, claws do 70%: `ItemDef.claws`);
  Shear-thickening fluid (250) the STF vest (plainclothes, 0.35); Boron
  carbide (300, after STF) Heavy plate (tactical, 0.55). Made at 8, 15 and
  20 points ($3k, $9k, $14k).
* **Advanced trauma kit** (after Combat surgery; 4 pts, $1.2k): heals 20,
  twice (its uses left are the stowed `ammo`, refilled at home); after a
  fight each kit patches the worst wound left twice. Any item with
  `use: "heal"` is a trauma kit to the battle and its controls.
* **UV flare** (after Ultraviolet weaponry, which no longer gives munitions;
  3 pts, $600): thrown like an incendiary (`commandThrow`, the item given);
  it lights the open tiles within 2 that see where it lands for the rest of
  the fight (`Battle.uv`), drawn violet. Vampires can't path into a lit
  tile; people don't notice it. Not in auto-combat.
* **Art**: the STF vest is the soft vest's black colourway and the advanced
  kit the IFAK in red; the UHMWPE vest and Heavy plate use the coyote soft
  vest and the grey plate carrier.

## As built (step 3)

* **Strains** (`data/strains.ts`): rolled from the campaign seed at the
  start into `BloodlineState.strain`: a band, two weaknesses (no pair
  shared), silver ×0.8–1.5 (Huaca ×1.15–1.5) and three rumours, one true.
* **Research**: Biocontainment (after Physiology II), the Provirus,
  Palaeography (after Archives II), and for each house a Strain (after the
  Provirus, needing a refined or elder sample of that house: need
  `sample:<house>`) and a History (after Palaeography). The BSL-4 and Archive
  gates wait for the rooms (step 4). Lineages, the Family Tree and the Root
  Strain aren't built yet.
* **In battle** (`Battle.strain`, from the campaign; a skirmish has none):
  silver does ×1.25 times the house's roll to its vampires; **thin skin**
  fire ×1.5; **cold torpor** +2 turns; **circadian lock** by day, its
  vampires sleep through gunfire and don't act for the first two turns
  (a hit wakes one). Photic, acoustic, one compound and slow clotting wait
  for their gear (strobe, flashbang, blockers, haemolytic rounds), and the
  band for tuned UV gear. Thin skin's longer burn isn't built.
* **Observation**: the first time a fight shows one of these at work in
  sight of the team (silver only when its roll is ×1.3 or more, or ×0.9 or
  less), the log says so and the weakness is saved as suspected
  (`BloodlineState.suspected`, `sim/campaign/strains.ts`).
* **Auto-combat** reads the house's silver (for an agent carrying silver
  magazines for their gun) and thin skin (incendiaries).
* **Bloodlines screen**: a Weaknesses section per house: light, silver and
  two weaknesses, each Unknown, Suspected or Confirmed; the History's three
  rumours once read. Silver shows its full multiplier (×1.25 times the roll).

## As built (step 4)

* **Rooms** (`data/installations.ts`), one a base, hidden from the build
  list until researched, upkeep flat ("Room upkeep" in the month's report,
  with containment's): BSL-4 suite (Biocontainment; $700k, 14 days,
  $60k), Archive (Archives II; $300k, 7, $15k), Forensic laboratory
  (Forensic pathology; $450k, 10, $30k), Chapel (Pastoral theology; $200k,
  7, $10k). The Lumen gallery waits for base raids.
* **Room topics** (`ProjectDef.room`): the Provirus and every Strain need
  a BSL-4 suite, the Histories an Archive, at a base with a scientist; a
  Strain's sample must be at that same base (and a laboratory there).
* **New topics** so the rooms can be had: Forensic pathology (after
  Physiology I; public science), the Spiritual Exercises (after Archives I:
  +5 Faith to every operative now and every recruit after), Thrall
  dependence (after Physiology I, a thrall captive: turning a thrall is
  Tradecraft against 35, not 50), Pastoral theology (after both: a released
  thrall raises support in its region by 0.2).
* **Chapel**: at each month's end, operatives based with one gain 1 Faith
  (up to 100). "Back to full after domination" waits: domination leaves
  nothing behind after a battle yet.
* **Not yet**: samples don't decay, so the BSL-4 suite's storage does
  nothing more; no forensics topic needs the Forensic laboratory until the
  branches (step 5).

## As built (step 5a: weapons, senses and the mind)

* **Topics**: Sensory physiology (after Physiology II: strobe, flashbang),
  Haemolytic chemistry (after Haematology: haemolytic magazines, the
  crossbow, haemolytic bolts), Metalloporphyrins (after Haematology and the
  Provirus: coated knife, coated bolts), Torpor metabolism (finishing 2 TU
  less; the finish chip already shows when a body rises), Domination
  neurology (after Pheromone resistance, a vampire captive: will −10),
  Discernment of spirits (after it and the Exercises: a dominated operative
  loses half a turn). Ultraviolet weaponry is renamed Porphyrin
  photochemistry. Each item is a workshop job at the doc's points and cost.
* **Rounds** (`ItemDef.round`, `Unit.round`, replacing `silver`): silver
  as before; **haemolytic** ×0.9, a vampire hit loses 20% of its next turn
  (30% slow clotting), one dropped never rises (`Unit.doomed`: it dies when
  its torpor ends); **coated** ×2 to vampires and dropped ones never rise.
  The coated knife is a coated blade (`WeaponDef.coated`). The crossbow is
  silent, one bolt (`mag` the haemolytic bolt; coated bolts `fits` it) and
  comes in loaded with a haemolytic bolt. A haemolytic bolt doesn't finish
  a body in torpor from range: bodies can't be targeted yet.
* **Stun and dazzle** (`Unit.stunned`, `Unit.slowed`, `daze()` at the
  start of its side's turn): a flashbang stuns thralls within 2 tiles for a
  turn, an acoustic house's vampires for 2 (loud); a strobe takes half the
  next turn from vampires within 5 tiles that see it, and stuns a photic
  house's for one (silent).
* **One compound**: with Pheromone resistance researched, a one-compound
  house's domination fails outright.
* All four of the remaining weaknesses now play in battle and are noticed
  like the others. None of this is in auto-combat yet.
* **Art**: crossbow, two bolts (colourways), the coated knife (the knife's
  colourway), flashbang and strobe; the haemolytic magazines share the
  ordinary magazines' icons.

## As built (step 5b: the spine's end and the silencers)

* **Spine**: Lineage: *house* (after the Provirus, an elder sample of that
  house, BSL-4; need `elder:<house>`) shows its Lineage on the Bloodlines
  screen. The Family Tree needs any two Lineages (`ProjectDef.requiresAny`)
  and gives every discipline of the section +5% (`DISCIPLINE_BOOSTS`, read
  by `sectionPace`). The Root Strain needs a Perfecti elder sample (BSL-4).
* **Antisense silencing** (after the Provirus, BSL-4) opens a silencer-bolt
  job for each house whose Strain is done: 8 pts, $4k and a quarter of one
  of its samples (`ProjectDef.consumes`; the opened sample's remainder is
  `Installation.sampleUse`). The Root Strain opens the Montségur silencer
  (40 pts, $50k and a whole Perfecti elder sample). Jobs that use samples
  need them at the base, not a laboratory; without one, the unit waits.
* **In battle**: a silencer bolt (`round: "silencer"`, `ItemDef.silences`)
  on a vampire of its house strips its armour, and once down it never
  rises. **Agnes** (the eldest at Montségur, `Unit.agnes`) heals 15 a turn,
  rises after one turn of torpor, can't be finished or burned in torpor,
  and shrugs off haemolytic and coated hits, until a Montségur silencer
  hits her; the Perfecti's own silencer doesn't touch her. An
  auto-resolved strike on her lair fails unless someone carries a
  Montségur silencer.
* **Art**: one blue-headed bolt for every house's silencer, a gold-headed
  one for the Montségur silencer.

## As built (step 5c: science for the section)

* **Renamed, with the doc's effects** (ids kept): Signal analysis is
  Signal processing (station retrofit; SIGINT centre level 2); Advanced
  signal analysis is Network science (follow-up leads 30%, was 20%; the
  old SIGINT ×1.25 is gone); Pattern analysis is Chronobiology (after
  Signal processing and Physiology I: SIGINT and OSINT leads real 10 points
  more often, `priorOf`; the old longer-lived, more detailed leads are gone).
* **New**: Cryptanalysis (SIGINT evidence +0.05), Psychophysiology of
  deception (CI +10), Trace evidence (after Forensic pathology: cover-ups
  +10 points), Stable isotopes (Forensic laboratory: OSINT +10%), the
  Fournier register (after History: Perfecti, Archive: HUMINT +10%),
  Forensic genetic genealogy (after Forensic pathology and the Provirus,
  Forensic laboratory: each sample brought home, fought or auto-resolved,
  has a 25% chance of a real HUMINT lead on an unfound operation of its
  house). Discipline boosts are `DISCIPLINE_BOOSTS`.
* **Not built**: Bomb-pulse dating (a site already shows its vampires and,
  at a lair, its eldest; on a lead it would give the truth away), so
  Genealogy goes straight from Forensic pathology; Digital forensics waits
  for the intelligence pass (phones and laptops); Image intensification,
  Doppler sensing, Persistent ISR and Tracking tags come with their gear.

## As built (step 5d: light, fire and serum)

* **Topics**: Tissue regeneration (after Haematology and Physiology II:
  haem serum, 5 pts, $1k and a sixth of any tissue sample), Pyrotechnics
  (magnesium shells), Pulsed xenon (the Sparkle), LED arrays (lumen lamps
  at 365 and 405 nm, lamp batteries), Excimer lasers (the excimer lance,
  its capacitors), the Lantern suit (after LED arrays and STF).
* **UV weapons** (`WeaponDef.uv`, `range`): no armour, ×1.6 on the house's
  band (`BattleStrain.band`), and what they drop is ash (`uvBurn`); people
  take `human` (lamps 0, lance 8). Lamps reach 4 tiles, the lance 20, the
  crossbow 12. A lamp's battery and the lance's capacitor are its
  magazine (4 shots).
* **Sparkle**: thrown, silent; vampires within 2 tiles take 20–30 UV (no
  band bonus), bodies in torpor there turn to ash; people feel nothing.
* **Magnesium shells**: a hit sets the target's tile alight for a turn.
* **Lantern suit**: armour 0.4; a vampire that claws the wearer takes 10
  UV; vampires go for anyone else first.
* **Haem serum**: heals 25, then 5 at the start of each of the next three
  turns (`Unit.regen`).
* **Not yet**: the lumen gallery (base raids), bodies as targets (a lamp
  burning a body in torpor), any of this in auto-combat.

## As built (step 5e: senses and gear)

* **Topics**: Thermoregulation (after Physiology II: the thermal sight),
  Image intensification (after Signal processing: night optics), Doppler
  sensing (the motion tracker), Persistent ISR (after Doppler and
  Thermoregulation: the ISR drone), Tracking tags (after Doppler: a thrall
  released from containment leads to one of its house's operations 60% of
  the time, a real SIGINT lead).
* **Optics** (`ItemDef.optics`, the helmet slot, no armour): night optics
  see 14 tiles in the dark (was the moon's 6–9, or 9 below ground); a
  thermal sight finds vampires at 14 day or night, hiding (Jade) or not.
* **Devices** (`use: "device"`, used at once from the backpack strip,
  `commandDevice`): the motion tracker (10 TU, kept) shows every enemy
  within 12 tiles until the next turn (`Battle.tracked`): seen, not a clear
  shot. The ISR drone (15 TU) goes up over the agent and shows anyone in
  the open within 15 tiles for 3 turns (`Battle.drones`); it comes home
  with a win.
* **Art**: a skeleton head mount with a binocular intensifier (night
  optics) or an olive thermal monocular; a handheld radar; a quadcopter.

## As built (step 5f: ferals)

* **Feeding** (`sim/campaign/feeding.ts`, `BloodlineState.feeding`) as
  above. Below 40, every other vampire of the house comes feral; below 20,
  all but the elder (`SkirmishOptions.feral`, `Unit.feral`).
* **Ferals** in battle: named Feral, +4 TU, no will (no domination); they
  fight with claws like every vampire today. A feral's tissue is a feral
  sample (biopsy and auto-resolved strikes alike). Leads on a house that
  fields ferals are real 10 points more often (`priorOf`, `FERAL_LEADS`).
* **The feral branch** (need `feral-sample`, any house): Feral
  neuropathology (after Physiology II) shows each house's feeding on the
  Bloodlines screen; Haem chelation (after it and Haematology) makes
  chelation bolts (4 pts, $800): a vampire hit goes feral for 3 turns
  (`Unit.feralTurns`); Forensic epidemiology (after it and Forensic
  pathology) makes Find pick feeding operations ×1.5.
* **Not yet**: a feral's next target marked in battle; ferals that never
  retreat (no vampire retreats today); ferals in auto-combat.

## Open questions

* **Salaries.** 25 scientists at $20k is $500k a month, more than a whole
  working base ([economy.md](economy.md)). X-COM spent about a quarter of
  its income on research. Recommendation: scientists and engineers at
  $12k. Re-check the budget targets with `npm run batch`.
* **Montségur.** Her guard is the Duval brothers (from the book): two
  refined elders with cavalry sabres, melee only, who never go feral
  however Europe is starved.
* **Elders in battle**: the spine assumes every lair holds an elder to
  sample. Elders met elsewhere (Bomb-pulse says when one is present) would
  give Lineages earlier.
* **Bots** (`sim/bots/bot.ts`, `tactical/bot.ts`) need a research order and
  item use (the Biopsy kit included), or the batch numbers drift.
* **Bots** research almost nothing in a batch (one or two topics a year,
  before this step too): the builder's order needs a look.
* **Build order**: (1) the spine's first four beats with the Biopsy kit,
  samples by house and kind, silver rounds and fuel tanks (built); (2) the item
  and production queue (built); (3) the strains and the Bloodlines screen's
  weaknesses (built); (4) the new rooms (built); (5a) weapons, senses and
  the mind (built); (5b) the spine's end and the silencers (built); (5c)
  science for the section (built); (5d) light, fire and serum (built); (5e) senses and gear (built); (5f) ferals (built); (5) the branches; (6) balance.

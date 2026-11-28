# Research: the tree

Built, except where "Not built" says otherwise. Topics, points, skill
weights and prices live in `data/research.ts` and `data/equipment.ts`; this
doc is the shape and the intent. How projects run (staff, queues, the
research screen): [base.md](base.md). Research never gives intel points:
where it helps the hunt, it makes a discipline of the section more
productive or turns up leads ([intelligence.md](intelligence.md)).

## Shape

* A **story spine** defeats Agnes (as in X-COM); combat, intelligence and
  lore **branches** grow off its beats.
* **Three to start**: Vatican Digital Archives I, Field medicine, Signal
  processing. A topic shows once what it needs is done; one that needs
  material (a sample, a captive) shows greyed, saying what it waits for,
  until the material is at a base with a laboratory.
* **Science only**: every topic is worked by the scientists' Biology,
  Psychology, Physics and Humanities. Vampirism is a retrovirus.
* **The game feeds it**: tissue sampled in battle opens the tree. What the
  player fights decides what they can learn.
* **No cheating**: each house's weaknesses are rolled at campaign start.
* Each topic has a proposal (hints only), findings, a plain outcome and a
  classification (base.md, "The research screen").

## The spine

| Topic | Needs | Gives |
|---|---|---|
| Vatican Digital Archives I | — | Montségur 1244 and the Perfecti; the **Biopsy kit** |
| Vatican Digital Archives II | Archives I | The houses spread worldwide: **fuel tanks** (a job on an aircraft: more reach) |
| Vampire Physiology I | Archives I, a vampire sample (or remains, or a captive) | **Silver rounds**; tissue sells higher |
| Vampire Physiology II | Physiology I | Why light and fire burn them; what the sleep is |
| Biocontainment | Physiology II | The **BSL-4 suite** |
| The Provirus | Biocontainment [BSL-4] | The viral genome: opens Strains, Lineages, Antisense, Metalloporphyrins |
| Lineage: *house* (×6) | Provirus, that house's elder sample [BSL-4] | Where the house split from the root (a chronicle page) |
| The Family Tree | Any two Lineages | One infection in 1244, Agnes its root; every discipline +5% |
| The Root Strain | Family Tree, a Perfecti elder sample [BSL-4] | The **Montségur silencer** |

Through the acts ([story.md](story.md)): Act I (Padua) Archives and
Physiology, the first biopsy feeding Physiology I. Act II: Biocontainment
and the Provirus; each lesser house's lair destroyed brings home the elder
sample its Lineage needs. Act III: a Perfecti elder sample gives the Root
Strain. Without the Montségur silencer, Agnes heals 15 a turn, rises after
one turn of torpor and can't be finished; an auto-resolved strike on her
lair fails without one.

## Tissue samples

The **Biopsy kit** (4 samples, refilled at home): next to a vampire in
torpor, or destroyed and not burnt, take a **sample** of its house and
kind. Burning a vampire for good and sampling it pull against each other.
A won auto-resolved strike samples up to four bodies per kit carried.

| Kind | From | Opens |
|---|---|---|
| Vampire | any refined vampire | Physiology I; that house's Strain |
| Feral | a feral (a starving house) | the feral branch |
| Elder | an elder | that house's Lineage |

Samples are material like a captive: at a base with a laboratory and a
scientist; [BSL-4] topics need them in a BSL-4 suite. Silencer bolts, the
Montségur silencer and haem serum use samples up. Also material: **remains**
(won strikes, executed captives; sold as tissue), **captives** (thrall or
vampire), **artifacts** (support or sale). Interrogation is paused until it
is designed as a mechanic.

## The houses' weaknesses

Each house's strain is rolled from the campaign seed (`data/strains.ts`):

* **Band**: UVB 308, UVA 365 or violet 405 nm. UV gear on band ×1.6;
  broadband (sun, flares, the Sparkle) ×1.
* **Two weaknesses** from the pool; no two houses share both.
* **Silver**: ×0.8–1.5 (Huaca from the top half).

| Weakness | In battle | Rumour |
|---|---|---|
| Photic seizure | a strobe stuns them a turn | "Cannot abide the dancing lamp" |
| Cold torpor | torpor 2 turns longer | "Sleeps through the winter" |
| Circadian lock | by day they sleep through gunfire for 2 turns | "The dead sleep at noon" |
| Acoustic | a flashbang stuns them 2 turns | church bells |
| One compound | with Pheromone resistance, their domination fails | incense |
| Thin skin | fire ×1.5 | "The fire takes them like straw" |
| Slow clotting | a haemolytic hit costs 30% TU, not 20% | "They bleed like the living" |

Folklore is the truth garbled: no garlic, no stakes. **The physics is
always real**; knowledge only tells the player what to carry. Three ways
to learn: **rumours** (a house's History names three, one true),
**observation** (the log notes an unusual result in sight of the team; the
Bloodlines screen marks it *suspected*), **science** (the house's Strain
confirms all). Each house's fixed trait ([tactical.md](tactical.md)) has a
counter: Jade thermal sights, Huaca haemolytic rounds, Carcassonne
discernment and blockers, Nullarbor UV gear, Ashgrove and Sahel thrall
work.

## Feeding: feral and refined

Each house's **feeding** (0–100, drifting back to 70) rises 3 when a
feeding operation runs its course, falls 10 when we foil one (4 for any
other operation). Below 40 every other vampire comes **feral**; below 20
all but the elder. Ferals: +4 TU, no domination, sloppy (leads on the
house are real 10 points more often). Starving a house trades a harder
fight up close for surer leads and feral samples.

## Rooms

| Room | From | Does |
|---|---|---|
| BSL-4 suite | Biocontainment | virology on samples and captives |
| Chapel | Pastoral theology | +1 Faith per whole week at home (to 70) |
| Lumen gallery | LED arrays | vampires burn inside it in base raids (**not built**: waits for base raids) |

One of each a base, hidden until researched, flat upkeep.

## Branches

**Medicine**: Field medicine (faster healing) → Combat surgery (advanced
trauma kit) → Haematology (+5 Vitality to all; tissue sells higher) →
Tissue regeneration (haem serum).

**Weapons**: Haemolytic chemistry (haemolytic magazines, crossbow and
bolts) · Metalloporphyrins (coated knife and bolts: the silent kill) ·
Antisense silencing (a silencer bolt per house whose Strain is done) ·
Porphyrin photochemistry (UV flare) → LED arrays (lumen lamps) → Excimer
lasers (excimer lance) · Pulsed xenon (Sparkle) · Pyrotechnics (magnesium
shells).

**Armour**: Composite armour → Bite-resistant weave (UHMWPE vest) →
Shear-thickening fluid (STF vest) → Boron carbide (heavy plate); Lantern
suit (LED arrays + STF).

**Senses and sleep**: Sensory physiology (strobe, flashbang) ·
Thermoregulation (thermal sight) · Torpor metabolism (finishing costs
less) · Pheromone resistance (vampires land fewer blows).

**Faith and the mind**: Spiritual Exercises (+5 Faith to all) · Domination
neurology (needs a vampire captive: domination will −10) → Discernment of
spirits (a dominated operative loses half a turn) · Thrall dependence
(needs a thrall captive: turning thralls easier) → Pastoral theology (the
Chapel; a released thrall raises support).

**Feral** (needs a feral sample): Feral neuropathology (each house's
feeding shown) → Haem chelation (chelation bolts: the vampire hit goes
feral 3 turns) · Forensic epidemiology (Find picks feeding operations
×1.5).

**Intelligence** (each a lasting boost to a discipline): Signal
processing (station retrofit, SIGINT centre level 2) → Network science
(more follow-up leads) → Cryptanalysis (SIGINT evidence stronger) ·
Psychophysiology of deception (CI +10) · Chronobiology (SIGINT and OSINT
leads more often real) · Image intensification (night optics) · Doppler
sensing (motion tracker) → Persistent ISR (ISR drone) · Tracking tags (a
released thrall leads to its house's operation).

**Forensics**: Forensic pathology → Trace evidence (cover-ups +10) ·
Stable isotopes (OSINT +10%) · Forensic genetic genealogy (a sample
brought home may give a HUMINT lead on its house).

**Lore**: Strain: *house* (its band, weaknesses and silver; with
Antisense, its silencer) · Palaeography → History: *house* (three
rumours, one true) · the Fournier register (HUMINT +10%).

| House | History | Lineage shows |
|---|---|---|
| Ashgrove | the Salem examinations (1692) | a Dutch branch split ~1600, via the Separatists in Leiden to New England; sister to Nullarbor |
| Huaca | the Huarochirí manuscript (1598) | split ~1570 through the Genoese banks that lent against Potosí's silver |
| Perfecti | the Doat collection (Montségur depositions) | closest to the root; the oldest branch alive |
| Sahel | the Timbuktu manuscripts | split ~1330 through Majorca's map-makers trading with Mali |
| Jade | the Jinyiwei archive | split ~1255 with the Perfectus of the Silk Road |
| Nullarbor | the VOC archive | sister to Ashgrove: Cornelis Vos took it at Amsterdam before the VOC sent him east |

## Items

Researched items are **made, not bought** (a production queue per base,
delivered to its armoury). The dark web sells items of public science
from the start, and ours once we've sold the research and it's got out
([economy.md](economy.md)). What each does in battle:

| Item | In battle |
|---|---|
| Silver magazine | ×0.7 to people, ×1.25 to vampires times the house's silver |
| Haemolytic magazine | ×0.9; a vampire hit loses 20% of its next turn; one dropped dies when its torpor ends |
| Crossbow | silent, 12 tiles, one bolt; haemolytic, coated, silencer and chelation bolts |
| Coated bolt / knife | ×2 to vampires; one dropped never rises |
| Silencer bolt | its house's vampire loses its armour and never rises |
| Montségur silencer | the same, for Agnes |
| Chelation bolt | the vampire hit goes feral for 3 turns |
| Magnesium shells | shotgun; the tile hit burns a turn |
| UV flare | vampires can't enter the lit tiles |
| Sparkle | UV to vampires within 2 tiles; bodies in torpor there turn to ash |
| Strobe / flashbang | dazzle or stun (see the weaknesses) |
| Lumen lamp, excimer lance | UV: no armour, ×1.6 on band, what they drop is ash; lamp 4 tiles, lance 20 |
| UHMWPE vest, STF vest, heavy plate | armour 0.2 (claws −30%), 0.35 concealable, 0.55 |
| Lantern suit | armour 0.4; a vampire clawing the wearer is burned; vampires go for others first |
| Night optics, thermal sight | helmet slot, no armour: sight in the dark; vampires seen day or night |
| Motion tracker, ISR drone | show enemies near for a turn; the open ground round for 3 turns |
| Haem serum | heals 25, then 5 a turn for 3 |
| Advanced trauma kit | heals 20, two uses |

The helmet slot trades protection against sight on purpose; the crossbow
and the coated knife reward stealth.

## Pace

Points are scientist-days at 1.5 a day; a mid-tree topic is about 13 days
with a lab of 10. The whole tree is about 14,400 points: a good player gets
through 65–75% of it, as in an X-COM run, and per-house and feral topics
open only with samples of what they've fought.

## Not built

* Bomb-pulse dating (it would give a lead's truth away), Digital forensics
  (waits for phones and laptops as loot).
* Samples decaying outside a BSL-4 suite; the lumen gallery.
* Bodies as targets (a haemolytic bolt finishing one from range, a lamp
  burning one); thin skin's longer burn; a feral's next target marked;
  ferals that never retreat; the Chapel restoring after domination.
* Most of the new gear in auto-combat (it reads silver and thin skin only).

## Open questions

* **Salaries**: 25 scientists at $20k is more than a working base earns;
  X-COM spent about a quarter of income on research. Proposal: $12k for
  scientists and engineers; re-check with `npm run batch`.
* **Montségur's guard**: the Duval brothers, two refined elders with
  sabres, melee only, never feral.
* **Elders met outside lairs** would give Lineages earlier.
* **Bots** research almost nothing in a batch and don't use the new items:
  they need a research order and item use, or the batch numbers drift.

// The research and engineering tree. Research costs scientist-days; engineering
// costs engineer-days plus materials, drawn as the work is done. Effects are
// applied in sim/base/research.ts (look for the project id).
//
// A research topic reads as a report (docs/design/base.md, "The research
// screen"): the proposal before the work, which only hints at what it might
// give; the findings and the plain outcome once it's done.

import type { Requirement } from "./aptitudes";
import type { GoodId } from "../sim/core/state";
import type { ItemId } from "./equipment";
import { BLOODLINES } from "./bloodlines";

export type ProjectKind = "research" | "engineering";
/** Rooms some topics need (docs/design/research.md, "Rooms (new)"). */
export type StudyRoom = "bsl4" | "archive" | "forensic";
export const STUDY_ROOM_WORDS: Record<StudyRoom, string> = {
  bsl4: "a BSL-4 suite",
  archive: "an archive",
  forensic: "a forensic laboratory",
};
/** Material a project needs on hand before it can start. */
export type Need =
  | "vampire-material"
  | "thrall-captive"
  | "vampire-captive"
  | "free-hangar"
  | "helicopter-tanks"
  | "jet-tanks"
  /** A feral vampire's tissue sample, of any house. */
  | "feral-sample"
  /** A refined vampire's or an elder's tissue sample of this house. */
  | `sample:${string}`
  /** An elder's tissue sample of this house. */
  | `elder:${string}`;
/** A research report's marking. `sensitive`: could be sold, one day, on the dark web. `cdf`: for the
 *  Congregation's eyes only. `opv`: of no use outside the Order (targeting). Unset: unclassified. */
export type Classification = "sensitive" | "cdf" | "opv";

export const CLASSIFICATION_WORDS: Record<Classification, string> = {
  sensitive: "CLASSIFIED: SENSITIVE",
  cdf: "CLASSIFIED: CDF ONLY",
  opv: "CLASSIFIED: OPV ONLY",
};

export interface ProjectDef {
  id: string;
  kind: ProjectKind;
  name: string;
  /** Research: the proposal, shown before and after; it hints at the benefit, never names it.
   *  Engineering: the work order. */
  proposal: string;
  /** What it gives, plainly ("Wounded operatives heal half as fast again."). Research: shown only once
   *  done. Engineering: shown on the work order. */
  outcome: string;
  /** Research: what the scientists found, shown once done. Engineering: the line when it's made. */
  findings: string;
  classification?: Classification;
  /** Staff-days of work. */
  points: number;
  /** Materials (engineering): drawn as the work is done, times the team's waste (sim/base/engineering.ts). */
  cost: number;
  /** Engineering: what the job asks of the engineers (weights over their aptitudes, adding to 1). */
  skills?: Requirement;
  /** Research that must be done first. */
  requires: string[];
  /** Also needs this many of these done (the Family Tree: any two Lineages). */
  requiresAny?: { of: string[]; n: number };
  /** Engineering: the share of a sample (the one `needs` names) each unit uses up. */
  consumes?: number;
  needs?: Need;
  /** A room the work needs: at a base with it and a scientist (and the material there, if any). */
  room?: StudyRoom;
  /** Can be done again (interrogations); engineering ones are ordered in quantity. */
  repeatable?: boolean;
  /** Goods: each unit made goes into the Order's stores (the dark web's Sell tab; sim/economy/market.ts). */
  product?: GoodId;
  /** Equipment: each unit made goes into the base's armoury. */
  item?: ItemId;
  /** On the dark web (sim/economy/market.ts). `public`: science the world already has, bought there as
   *  information. Otherwise ours alone: sold once to `buyer`, at a cost in secrecy, and public some
   *  weeks later. Unset: never traded. */
  trade?: { public: true } | { buyer: string; secrecy: number };
}

/** The archive each house's History reads (docs/design/research.md, "The houses' lore"). */
const HISTORIES: Record<string, string> = {
  ashgrove: "the Salem examinations, the 1692 files of the Court of Oyer and Terminer,",
  huaca: "the Huarochirí manuscript of 1598, the Quechua book of the huacas,",
  carcassonne: "the Doat collection, the inquisitors' records of Languedoc,",
  sahel: "the Timbuktu manuscripts of the Ahmed Baba Institute",
  jade: "the archive of the Jinyiwei, the Ming Embroidered Uniform Guard,",
  nullarbor: "the archive of the VOC in The Hague",
};

/** What each elder's sequence shows: where and when the house split from the root (its Lineage). */
export const LINEAGES: Record<string, string> = {
  ashgrove:
    "Sister to the Nullarbor Kin: both come off a Dutch branch that split from the Perfecti around 1600. Ashgrove's founder took it from the English Separatists in their Leiden years (1609–20) and brought it to Bristol, and then to New England.",
  huaca:
    "Split from the Perfecti about 1570, through the Genoese banks that lent against Potosí's silver: the Perfecti owned banks then, as they do now.",
  carcassonne:
    "Closest to the root of all: every house descends from one infection, and the Perfecti's is the oldest branch still alive. Her elders' mutations count back to the fire.",
  sahel:
    "Split around 1330 through Majorca, whose Jewish map-makers and Catalan traders dealt with Mali in Mansa Musa's day.",
  jade: "The deepest split outside Europe: about 1255, through a Perfectus of the Silk Road, within a dozen years of Montségur.",
  nullarbor:
    "Sister to Ashgrove, off the same Dutch branch: Cornelis Vos took it at Amsterdam before the VOC sent him east. The two lines have never met.",
};

/** Lasting boosts to the section's disciplines from research: its aptitude in each counts this much
 *  higher (docs/design/intelligence.md, section 7). */
export const DISCIPLINE_BOOSTS: Record<
  string,
  Partial<Record<"osint" | "humint" | "sigint" | "ci", number>>
> = {
  "family-tree": { osint: 0.05, humint: 0.05, sigint: 0.05, ci: 0.05 },
  "stable-isotopes": { osint: 0.1 },
  "fournier-register": { humint: 0.1 },
};

const cap = (x: string) => x[0]!.toUpperCase() + x.slice(1);

export const PROJECTS: ProjectDef[] = [
  // ----- Research -----
  // ----- The spine (docs/design/research.md, "The spine") -----
  {
    id: "archives-1",
    kind: "research",
    name: "Vatican Digital Archives I",
    skills: { humanities: 1 },
    points: 80,
    cost: 0,
    requires: [],
    classification: "cdf",
    proposal:
      "The Order's memory is in the Apostolic Archive: eight centuries of inquisitors' registers, letters and depositions, most of them read once and never again. The digitisation begun in 2012 has reached the Languedoc fonds of the thirteenth century. We propose to read what the Church wrote down at the start of this war, at Montségur, with modern eyes, and see what our predecessors could not.",
    findings:
      "In March 1244 the crusaders burned more than two hundred of the Cathar Perfect at the foot of Montségur. The depositions taken that summer describe what the inquisitors did not understand: prisoners who lived through wounds that should have killed them, who would not eat, and who sickened in daylight; and a fever that passed from the condemned to two of their guards. The register of Bernard de Caux records that the guards were burned too. Not all of the Perfect were. Whatever they carried left the mountain with them and has passed from body to body ever since. To learn what it is we need it under a microscope: tissue, taken cold, from one of them.",
    outcome:
      "The workshops can make biopsy kits: an operative next to a vampire's body takes a tissue sample for the laboratories.",
  },
  {
    id: "archives-2",
    kind: "research",
    name: "Vatican Digital Archives II",
    skills: { humanities: 1 },
    points: 120,
    cost: 0,
    requires: ["archives-1"],
    classification: "cdf",
    proposal:
      "The Languedoc registers stop at the Pyrenees. The survivors of Montségur did not. Letters in the Archive's later fonds, from nuncios, missionaries and merchants' confessors, describe the same signs in places the Perfect never preached. We propose to follow them.",
    findings:
      "They went everywhere. A Perfectus took the Silk Road east within a generation of the fire; others went south with the salt caravans, west with the Genoese silver, and over the sea with the Dutch. Each line settled, hid, and grew into a house of its own, and every one of them is a long way from Padua. Our helicopter reaches nine hundred nautical miles and our jet two thousand six hundred. Auxiliary tanks of the kind fitted to search-and-rescue aircraft would take both a good deal further.",
    outcome:
      "The workshops can fit auxiliary fuel tanks to a helicopter (reach 1,300 nm) and extended tanks to a jet (3,600 nm).",
  },
  {
    id: "vampire-physiology-2",
    kind: "research",
    name: "Vampire Physiology II",
    skills: { biology: 0.7, physics: 0.3 },
    points: 180,
    cost: 0,
    requires: ["vampire-physiology"],
    classification: "sensitive",
    proposal:
      "We know what they are. We do not yet know why fire and daylight destroy them when bullets do not, or what the sleep is that takes them when they are badly hurt. We propose a second, longer study: their skin under light, and their bodies in torpor.",
    findings:
      "Their skin is loaded with free porphyrins, the molecules behind the porphyrias in people. Light at the right wavelength excites them, and an excited porphyrin turns the oxygen around it into a poison that burns the cell from inside: daylight is a slow fire to them, and fire a fast one, because the repair cannot rebuild what has been cooked. The torpor is the repair taking everything: the heart slows to a few beats a minute while the body spends its stores on mending. Woken before it is done, a vampire rises weak; left alone, it rises whole.",
    outcome:
      "We understand why light and fire destroy them, and what the sleep is. Their light, their senses and their sleep can now be studied.",
  },
  {
    id: "biocontainment",
    kind: "research",
    name: "Biocontainment",
    skills: { biology: 1 },
    points: 150,
    cost: 0,
    requires: ["vampire-physiology-2"],
    classification: "sensitive",
    proposal:
      "The infection passed from the condemned to their guards in 1244. Before we culture it, we need to be able to hold it: the protocols, the suits and the airlocks of a maximum-containment laboratory.",
    findings:
      "The virus survives outside a body for hours, not days, and passes in blood and in saliva through a wound; not on the air. That is enough to make every bench a risk. We have written the protocols a containment suite needs, and trained the staff to them.",
    outcome: "We can handle live virus safely. The Provirus can now be studied.",
  },
  {
    id: "provirus",
    kind: "research",
    name: "The Provirus",
    skills: { biology: 1 },
    points: 250,
    cost: 0,
    requires: ["biocontainment"],
    room: "bsl4",
    classification: "cdf",
    proposal:
      "Whatever they carry writes itself into their cells. If we can find it in the genome and read it end to end, we can compare one house's copy with another's.",
    findings:
      "It is a retrovirus: its genome sits in every cell of theirs, stitched into their own DNA, and turns the body's repair against it. Each house's copy differs in a handful of genes. Those differences are where each house is weak.",
    outcome:
      "We can read the virus. Each house's Strain can be sequenced from a sample of its vampires.",
  },
  {
    id: "palaeography",
    kind: "research",
    name: "Palaeography",
    skills: { humanities: 1 },
    points: 120,
    cost: 0,
    requires: ["archives-2"],
    classification: "cdf",
    proposal:
      "The houses left their traces in court records, chronicles and ledgers written in hands nobody reads any more. We propose to train our historians to read them.",
    findings:
      "Secretary hand, court hand, Gothic book hands, Ming clerical script, Ajami: our people can read the records each house left behind, and know which archives hold them.",
    outcome: "The houses' histories can now be studied.",
  },
  ...BLOODLINES.flatMap((b): ProjectDef[] => [
    {
      id: `strain-${b.id}`,
      kind: "research",
      name: `Strain: ${b.short}`,
      skills: { biology: 1 },
      points: 250,
      cost: 0,
      requires: ["provirus"],
      needs: `sample:${b.id}`,
      room: "bsl4",
      classification: "opv",
      proposal: `Sequence the virus from a sample of ${b.name}'s vampires and compare it with the others: what light burns them hardest, what else they cannot bear, and how silver takes them.`,
      findings: `${b.name}'s copy of the virus is sequenced. Its band, its two weaknesses and what silver does to it are on the Bloodlines screen.`,
      outcome: `${b.name}'s weaknesses are confirmed.`,
    },
    {
      id: `lineage-${b.id}`,
      kind: "research",
      name: `Lineage: ${b.short}`,
      skills: { biology: 0.6, humanities: 0.4 },
      points: 250,
      cost: 0,
      requires: ["provirus"],
      needs: `elder:${b.id}`,
      room: "bsl4",
      classification: "cdf",
      proposal: `Sequence an elder of ${b.name}: the oldest copy of their virus the house has. Its mutations, counted back, say when and where the house split from the root.`,
      findings: LINEAGES[b.id]!,
      outcome: `Where and when ${b.name} split from the root.`,
    },
    {
      id: `history-${b.id}`,
      kind: "research",
      name: `History: ${b.short}`,
      skills: { humanities: 1 },
      points: 150,
      cost: 0,
      requires: ["palaeography"],
      room: "archive",
      classification: "cdf",
      proposal: `Read ${HISTORIES[b.id] ?? "the records"} for what folklore says about ${b.name}: what drove them off, what burned them.`,
      findings: `${cap(HISTORIES[b.id] ?? "the records")} name three things that hurt ${b.name}. Folklore garbles everything; one of the three is true. They are on the Bloodlines screen.`,
      outcome: `Three rumours about ${b.name}'s weaknesses, one of them true.`,
    },
  ]),
  {
    id: "family-tree",
    kind: "research",
    name: "The Family Tree",
    skills: { biology: 0.7, humanities: 0.3 },
    points: 300,
    cost: 0,
    requires: ["provirus"],
    requiresAny: { of: BLOODLINES.map((b) => `lineage-${b.id}`), n: 2 },
    classification: "cdf",
    proposal:
      "Two Lineages give us two branches. With them we can root the tree: count every house's mutations back to the copy they all share, and find out whose it was.",
    findings:
      "Every house descends from one infection, in the spring of 1244, and the root of the tree is one woman. Agnes of Toulouse did not take the virus from anyone: it began in her. Everything since, every house on every continent, is her blood, passed on. Knowing the shape of the tree, our analysts know where to look for each branch.",
    outcome:
      "Agnes is the root. The section's every discipline is 5% more productive. Her own sequence is next.",
  },
  {
    id: "root-strain",
    kind: "research",
    name: "The Root Strain",
    skills: { biology: 1 },
    points: 600,
    cost: 0,
    requires: ["family-tree"],
    needs: "elder:carcassonne",
    room: "bsl4",
    classification: "cdf",
    proposal:
      "To stop her we need her own virus: the first copy, from which every other descends. A sample from one of her elders, the closest to her of anyone, will be nearly that.",
    findings:
      "Her copy carries the repair genes in full, with nothing yet lost to eight centuries of copying: that is why she heals as she does. It also carries the switch that every later copy lost. A sequence built against it, delivered into her blood, turns her repair off. We call it the Montségur silencer.",
    outcome: "The workshops can make the Montségur silencer: a bolt that stops Agnes's repair.",
  },
  {
    id: "antisense",
    kind: "research",
    name: "Antisense silencing",
    skills: { biology: 1 },
    points: 450,
    cost: 0,
    requires: ["provirus"],
    room: "bsl4",
    classification: "cdf",
    proposal:
      "Each house's copy of the virus differs a little. A strand built against one copy's repair genes would shut them off in that house's vampires and no other's.",
    findings:
      "Antisense strands, packed into a bolt's head, reach the repair genes within seconds. A vampire hit by one of its own house goes down and does not get up, and its hardened skin goes soft. Each house needs its own: we can build one for every house whose Strain we have sequenced.",
    outcome:
      "The workshops can make silencer bolts, one kind for each house whose Strain is done. Each takes a quarter of one of that house's samples.",
  },
  {
    id: "forensic-pathology",
    kind: "research",
    name: "Forensic pathology",
    skills: { biology: 1 },
    points: 80,
    cost: 0,
    requires: ["vampire-physiology"],
    trade: { public: true },
    proposal:
      "Their victims pass through morgues like anyone else's, recorded as animal attacks, overdoses and accidents. We propose to learn to read what they leave on a body, and to fit out a laboratory to do it.",
    findings:
      "A feeding bite is unlike a dog's or a person's: two punctures, shallow, with the tissue round them oddly clean, because their saliva stops clotting and kills bacteria. Once you know what to look for, a coroner's photographs are enough. We have specified a forensic laboratory for the work ahead.",
    outcome: "Their bite wounds can be read. A forensic laboratory can be built.",
  },
  {
    id: "spiritual-exercises",
    kind: "research",
    name: "The Spiritual Exercises",
    skills: { psychology: 1 },
    points: 100,
    cost: 0,
    requires: ["archives-1"],
    proposal:
      "Ignatius's Exercises trained Jesuits to notice what moves in their own minds. The depositions of 1244 describe guards whose will was taken from them. We propose to adapt the Exercises as training in attention, for operatives who will face that.",
    findings:
      "Four weeks of examen and composition of place, cut to ten days and taught as drill. Operatives who have done them notice the moment an outside will presses on theirs, and can hold against it a little longer.",
    outcome: "Every operative and every recruit from now on: +5 Faith.",
  },
  {
    id: "thrall-dependence",
    kind: "research",
    name: "Thrall dependence",
    skills: { psychology: 0.5, biology: 0.5 },
    points: 120,
    cost: 0,
    requires: ["vampire-physiology"],
    needs: "thrall-captive",
    proposal:
      "A thrall without its master's blood goes into something like withdrawal. Study one held in containment: what it craves, how long it lasts, and what it would do to be free of it.",
    findings:
      "The blood carries the same opioid-like peptides that their bite does. A thrall cut off from it suffers as an addict does, and like an addict, can be reached through the craving and the shame. Knowing the timetable of withdrawal, an operator knows when to make the offer.",
    outcome: "Turning a thrall is easier: Tradecraft against 35, not 50.",
  },
  {
    id: "pastoral-theology",
    kind: "research",
    name: "Pastoral theology",
    skills: { psychology: 0.5, humanities: 0.5 },
    points: 150,
    cost: 0,
    requires: ["spiritual-exercises", "thrall-dependence"],
    proposal:
      "Our operatives come back from the field changed, and the thralls we free go back to families that do not know what happened to them. We propose a pastoral programme for both, and a chapel to house it.",
    findings:
      "Confession, direction and a rule of life steady our operatives between missions. A freed thrall met by a priest who understands what was done to them goes home and speaks well of the Church to the people around them.",
    outcome:
      "A chapel can be built: operatives based with one gain 1 Faith a month. A thrall released goes home and raises support in its region.",
  },
  {
    id: "sensory-physiology",
    kind: "research",
    name: "Sensory physiology",
    skills: { biology: 0.6, psychology: 0.4 },
    points: 150,
    cost: 0,
    requires: ["vampire-physiology-2"],
    classification: "sensitive",
    proposal:
      "They hunt at night, so their eyes and ears must be extraordinary. What is extraordinary is also easily overloaded. We propose to measure both.",
    findings:
      "Their retinas are almost all rods, with a reflecting layer behind them like a cat's: a flicker at the right rate floods them, and they lose seconds finding their feet. Their hearing reaches far into the high frequencies. A flashbang staggers people; built for them, a strobe staggers vampires. Some houses suffer either far worse than the rest.",
    outcome:
      "The workshops can make strobes, which dazzle vampires, and flashbangs, which stun thralls.",
  },
  {
    id: "haemolytic-chemistry",
    kind: "research",
    name: "Haemolytic chemistry",
    skills: { biology: 1 },
    points: 200,
    cost: 0,
    requires: ["haematology"],
    classification: "sensitive",
    proposal:
      "The injection we use to finish them in torpor gels their blood. If it could be delivered from a distance, by a round or a bolt, we could finish them in the fight.",
    findings:
      "A frangible round with a gelling core spends some of its force breaking up, but leaves the agent in the wound: the vampire slows as its blood thickens, and one that falls into torpor with it never wakes. A crossbow bolt carries a larger dose, and silently.",
    outcome:
      "The workshops can make haemolytic magazines, the crossbow and haemolytic bolts. A vampire hit by them loses time, and one they drop never rises.",
  },
  {
    id: "metalloporphyrins",
    kind: "research",
    name: "Metalloporphyrins",
    skills: { biology: 0.6, physics: 0.4 },
    points: 300,
    cost: 0,
    requires: ["haematology", "provirus"],
    classification: "cdf",
    proposal:
      "Their repair runs on haem, and the virus has rewired the enzymes that make and break it. A porphyrin with the wrong metal at its heart might jam those enzymes. We propose to find one.",
    findings:
      "Tin protoporphyrin binds the repair enzyme and will not let go. On a blade or a bolt it does twice the harm a clean wound would, and a vampire that goes down with it in its blood stays down. It is the first thing we have that kills them quietly.",
    outcome:
      "The workshops can make the coated knife and coated bolts: silent, double harm to vampires, and the ones they drop never rise.",
  },
  {
    id: "torpor-metabolism",
    kind: "research",
    name: "Torpor metabolism",
    skills: { biology: 1 },
    points: 150,
    cost: 0,
    requires: ["vampire-physiology-2"],
    proposal:
      "In torpor the heart slows to a few beats a minute. Where the blood goes, and how fast, tells us where an injection works fastest.",
    findings:
      "In torpor the blood pools in the great veins of the trunk. An injection there, not in a limb, reaches the heart in seconds.",
    outcome: "Finishing a vampire in torpor takes 2 TU less.",
  },
  {
    id: "domination-neurology",
    kind: "research",
    name: "Domination neurology",
    skills: { psychology: 0.6, biology: 0.4 },
    points: 250,
    cost: 0,
    requires: ["pheromones"],
    needs: "vampire-captive",
    classification: "sensitive",
    proposal:
      "When a vampire takes a mind, something passes between them: a scent, a sound below hearing, a look held too long. With one in containment we can watch it try, and measure what it does.",
    findings:
      "It is mostly scent, carried on the breath, and partly the voice: a cadence that brings on the half-trance of a hypnotic induction. Knowing the cues, operatives can be trained to break them: breathe through the mouth, look at the hands, count.",
    outcome: "Vampires' domination is weaker: will −10.",
  },
  {
    id: "discernment",
    kind: "research",
    name: "Discernment of spirits",
    skills: { psychology: 1 },
    points: 200,
    cost: 0,
    requires: ["spiritual-exercises", "domination-neurology"],
    proposal:
      "Ignatius's rules for the discernment of spirits teach a person to tell a movement of their own mind from one pressed on them. Joined to what we now know of domination, they could teach an operative to come back from it sooner.",
    findings:
      "An operative who has learned to name the moment their will was taken can take it back: not at once, but in moments rather than minutes.",
    outcome: "A dominated operative loses half a turn, not a whole one.",
  },
  {
    id: "tissue-regeneration",
    kind: "research",
    name: "Tissue regeneration",
    skills: { biology: 1 },
    points: 220,
    cost: 0,
    requires: ["haematology", "vampire-physiology-2"],
    classification: "sensitive",
    proposal:
      "Their repair rebuilds a shattered bone in a night. If we can isolate the factors that drive it, a dose of them might do for our operatives in minutes what a hospital does in weeks.",
    findings:
      "The repair runs on a handful of growth factors their virus switched on and never off. Extracted from their tissue and stabilised, a small dose closes a wound in a person within the hour, and nothing in the dose can infect. It still has to come from them.",
    outcome:
      "The workshops can make haem serum: a strong heal, and more over the next turns. Each dose takes a sixth of a tissue sample.",
  },
  {
    id: "pyrotechnics",
    kind: "research",
    name: "Pyrotechnics",
    skills: { physics: 1 },
    points: 120,
    cost: 0,
    requires: ["vampire-physiology-2"],
    classification: "sensitive",
    proposal: "Fire is the one thing that reliably finishes them. A shotgun shell can carry fire.",
    findings:
      "Magnesium burns hotter than anything they can heal through, and a shell can carry enough of it to set a man alight for a few seconds. On them, a few seconds is enough.",
    outcome: "The workshops can make magnesium shells: whoever they hit stands in fire for a turn.",
  },
  {
    id: "pulsed-xenon",
    kind: "research",
    name: "Pulsed xenon",
    skills: { physics: 1 },
    points: 200,
    cost: 0,
    requires: ["uv-weaponry"],
    classification: "sensitive",
    proposal:
      "A camera flash is a xenon lamp emptying a capacitor in a millisecond. Built big, with the glass that stops ultraviolet taken out, the same lamp would be a flash of the light that burns them.",
    findings:
      "A grenade-sized xenon lamp, fired once at full charge, puts out more ultraviolet in a millisecond than an hour of noon sun. It burns everything of theirs it reaches, and what it burns does not heal. Our people feel nothing but the glare.",
    outcome:
      "The workshops can make the Sparkle: an ultraviolet flash grenade that kills vampires for good.",
  },
  {
    id: "led-arrays",
    kind: "research",
    name: "LED arrays",
    skills: { physics: 1 },
    points: 250,
    cost: 0,
    requires: ["uv-weaponry"],
    classification: "sensitive",
    proposal:
      "Ultraviolet LEDs are made by the million for curing nail varnish and sterilising water. Packed tightly behind a lens and driven far past their rating, they could make a beam.",
    findings:
      "Four hundred diodes behind a fused-silica lens make a beam that burns them at four metres. Tuned to 365 or 405 nanometres, it hits hardest the houses whose skin absorbs there. A battery drives four bursts before the diodes need to cool.",
    outcome: "The workshops can make lumen lamps (365 and 405 nm) and their batteries.",
  },
  {
    id: "excimer",
    kind: "research",
    name: "Excimer lasers",
    skills: { physics: 1 },
    points: 450,
    cost: 0,
    requires: ["led-arrays"],
    classification: "sensitive",
    proposal:
      "LEDs cannot reach the deepest ultraviolet. An excimer laser, of the kind that reshapes corneas, reaches 308 nanometres and carries it as far as the eye can see.",
    findings:
      "A xenon-chloride tube, a capacitor bank and a cooling jacket fit into something a strong operative can carry. Its beam crosses a street and burns them at the far side, silently, and barely marks a person it passes through.",
    outcome: "The workshops can make the excimer lance and its capacitors.",
  },
  {
    id: "lantern-suit",
    kind: "research",
    name: "Lantern suit",
    skills: { physics: 1 },
    points: 400,
    cost: 0,
    requires: ["led-arrays", "stf"],
    classification: "sensitive",
    proposal:
      "They claw at whoever is closest. Armour that lit up when struck would teach them not to.",
    findings:
      "Panels of UV diodes behind the plates, wired to pressure sensors: a blow lights them for a second, full in the face of whatever struck. They learn fast.",
    outcome:
      "The workshops can make the Lantern suit: armour that burns the vampire that claws it.",
  },
  {
    id: "thermoregulation",
    kind: "research",
    name: "Thermoregulation",
    skills: { biology: 0.6, physics: 0.4 },
    points: 120,
    cost: 0,
    requires: ["vampire-physiology-2"],
    proposal:
      "A body that barely needs oxygen barely needs heat. If they run cold, a thermal camera should show it.",
    findings:
      "They sit a few degrees above the air around them, colder than any living person and warmer than a corpse. On a thermal imager they are dark shapes among bright ones, and no trick of the Jade Court hides that.",
    outcome:
      "The workshops can make the thermal sight: it finds vampires at 14 tiles, day or night.",
  },
  {
    id: "image-intensification",
    kind: "research",
    name: "Image intensification",
    skills: { physics: 1 },
    points: 100,
    cost: 0,
    requires: ["signal-analysis"],
    proposal:
      "We fight at night against things that see in the dark. Military night-vision tubes are bought and sold; fitting them to our people is engineering.",
    findings:
      "Third-generation tubes on a head mount, with the gain set for street lighting, double what an operative sees on a dark night.",
    outcome: "The workshops can make night optics: 14 tiles at night instead of 9.",
  },
  {
    id: "doppler",
    kind: "research",
    name: "Doppler sensing",
    skills: { physics: 1 },
    points: 150,
    cost: 0,
    requires: ["signal-analysis"],
    proposal:
      "Radar that sees through walls finds people breathing in collapsed buildings. It would find thralls waiting behind a door.",
    findings:
      "A handheld radar at 3 GHz sees movement through a brick wall at a dozen metres. Vampires move, too: whatever moves, it shows.",
    outcome:
      "The workshops can make the motion tracker: everything moving within 12 tiles shows, through walls.",
  },
  {
    id: "persistent-isr",
    kind: "research",
    name: "Persistent ISR",
    skills: { physics: 1 },
    points: 300,
    cost: 0,
    requires: ["doppler", "thermoregulation"],
    proposal:
      "A small drone with a thermal camera, hovering over a site, would watch the open ground for the whole team.",
    findings:
      "A quadcopter carrying the thermal core stays up for half an hour and shows everyone outdoors for a street around. It is quiet enough at height not to give us away.",
    outcome:
      "The workshops can make the ISR drone: anyone in the open within 15 tiles is seen for 3 turns.",
  },
  {
    id: "tracking-tags",
    kind: "research",
    name: "Tracking tags",
    skills: { physics: 1 },
    points: 200,
    cost: 0,
    requires: ["doppler"],
    proposal:
      "A thrall we release goes home. If it carried a tag it didn't know about, it would take us with it.",
    findings:
      "A tag the size of a grain of rice, under the skin of the shoulder while it sleeps, reports by the phone network once a day. Most go home within a week.",
    outcome:
      "A thrall released from containment carries a tag: 60% of the time it leads to one of its house's operations.",
  },
  {
    id: "feral-neuropathology",
    kind: "research",
    name: "Feral neuropathology",
    skills: { biology: 0.6, psychology: 0.4 },
    points: 200,
    cost: 0,
    requires: ["vampire-physiology-2"],
    needs: "feral-sample",
    classification: "sensitive",
    proposal:
      "Some of them come at us like animals: no guns, no words, no will to bend anyone. The sample we took from one is unlike the others. We propose to find out what hunger does to them.",
    findings:
      "Starved of blood, the repair does not stop: it takes haem from wherever it can, and the first place it takes it from is the forebrain. What is left is fast, strong and stupid. A house that cannot feed its vampires turns them into this, and a house in that state cannot hide what it is doing. We can now read, from the record of its operations, how well each house is eating.",
    outcome: "Each house's feeding level is shown on the Bloodlines screen.",
  },
  {
    id: "haem-chelation",
    kind: "research",
    name: "Haem chelation",
    skills: { biology: 1 },
    points: 250,
    cost: 0,
    requires: ["feral-neuropathology", "haematology"],
    classification: "sensitive",
    proposal:
      "If hunger makes them feral, then taking the haem out of their blood should do the same, at once, to a vampire that has eaten well.",
    findings:
      "A chelating agent in a bolt's head binds the free haem in their blood within seconds. The vampire hit forgets its plans and its will and goes for the nearest throat. It lasts minutes, until the repair finds more haem.",
    outcome: "The workshops can make chelation bolts: a vampire hit goes feral for 3 turns.",
  },
  {
    id: "forensic-epidemiology",
    kind: "research",
    name: "Forensic epidemiology",
    skills: { biology: 0.6, humanities: 0.4 },
    points: 150,
    cost: 0,
    requires: ["feral-neuropathology", "forensic-pathology"],
    proposal:
      "A feeding leaves a body, sooner or later, and bodies go into the public record: coroners' reports, death notices, the statistics. A hungry house leaves more of them.",
    findings:
      "Cluster the excess deaths by cause, place and week and the houses' feedings stand out like an outbreak. Our open-source searches now start from the clusters.",
    outcome: "The section finds feeding operations half as often again.",
  },
  {
    id: "field-medicine",
    kind: "research",
    name: "Field medicine",
    skills: { biology: 1 },
    points: 60,
    cost: 0,
    requires: [],
    trade: { public: true },
    proposal:
      "Our operatives come home with wounds no casualty ward is trained for: bites to the neck and forearm, blood loss out of all proportion to the injury, and a fever on the third day that the antibiotics do not touch. Recovery is slow and we do not know why. We propose a review of every case file since 1990 with the trauma surgeons at Padua and Verona, to see what we are treating wrongly.",
    findings:
      "The fever is not an infection. Their saliva carries a peptide anticoagulant, close kin to the hirudins of the medicinal leech, that keeps a bite bleeding for hours and sets off a systemic inflammatory response two days later. Our medics have been fighting it with antibiotics and transfusion. Early tranexamic acid, a corticosteroid on the second day and a pressure dressing soaked in thrombin close the wound and break the fever before it starts.",
    outcome: "Wounded operatives heal half as fast again.",
  },
  {
    id: "composite-armour",
    kind: "research",
    name: "Composite armour",
    skills: { physics: 1 },
    points: 100,
    cost: 0,
    requires: ["vampire-physiology"],
    trade: { public: true },
    proposal:
      "A vampire's strike is not a bullet. It lands slow, heavy and on a point, and police vests rated against a 9 mm round fold under it. Our operatives wear plain clothes and cannot carry military plate through an airport. We propose a study of laminates light enough to wear under a coat, tested on the gel blocks at the Politecnico against strikes measured from our own casualties.",
    findings:
      "A claw strike delivers around 60 joules on a contact patch the size of a fingertip: well under a pistol round, but on a smaller area and for ten times as long. Aramid weave alone stretches and lets it through. A thin boron-carbide face, bonded to twelve plies of aramid with a polyurethane interlayer, spreads the load before the weave sees it. The panel is under two kilograms and does not show under a jacket. It is also, incidentally, a very good rifle insert.",
    outcome:
      "The workshops can make ceramic inserts to sell. Lighter and stronger armour can now be studied.",
  },
  {
    id: "signal-analysis",
    kind: "research",
    name: "Signal processing",
    skills: { physics: 1 },
    points: 90,
    cost: 0,
    requires: [],
    trade: { public: true },
    proposal:
      "The houses use phones, banks and couriers like anyone else, and that leaves a trace. Our SIGINT stations were fitted out in the 1990s and listen for words. We propose to study what a bloodline's logistics look like from the outside, in metadata, payments and camera footage, and whether our stations are listening for the right things.",
    findings:
      "The houses are careful about what they say and careless about when. A nest runs on a nocturnal rhythm that no shift worker keeps for years: calls between 23:00 and 04:00, no traffic at all for two hours either side of dawn, the same handsets dark through every summer solstice. Payments for blood come in round sums through the same three or four clinics. None of this needs a word of content, and our station hardware throws it all away before an analyst sees it.",
    outcome:
      "The workshops can retrofit the SIGINT stations, and a SIGINT centre can be raised to its second level.",
  },
  {
    id: "advanced-signals",
    kind: "research",
    name: "Network science",
    skills: { physics: 0.6, psychology: 0.4 },
    points: 140,
    cost: 0,
    requires: ["signal-analysis"],
    trade: { buyer: "a private intelligence contractor that sells to hedge funds", secrecy: 0 },
    classification: "sensitive",
    proposal:
      "Now that we know what a nest's rhythm looks like, the harder question is what it looks like when it is trying not to be seen. The older houses have been hiding for centuries and their thralls are trained to keep normal hours. We propose to model the traffic that is missing: who never calls whom, and what that silence says.",
    findings:
      "Every network has a shape, and a careful one has a hole where its centre should be. A den's thralls call one another constantly but never call the same two numbers, which belong to people who call no one at all. Graphed over three months the gap stands out like a missing tooth. The method works on any covert network, which is why the people who run hedge funds will pay for it.",
    outcome: "Evidence for a lead turns up a follow-up lead 30% of the time, not 20%.",
  },
  {
    id: "pattern-analysis",
    kind: "research",
    name: "Chronobiology",
    skills: { biology: 0.6, psychology: 0.4 },
    points: 180,
    cost: 0,
    requires: ["signal-analysis", "vampire-physiology"],
    trade: { buyer: "a data broker working for three governments at once", secrecy: 0 },
    classification: "sensitive",
    proposal:
      "Their bodies keep a clock that no human shift worker keeps: the same nocturnal rhythm for decades, through every season. If we know that clock exactly, we can look for it in phone traffic, card payments and camera footage.",
    findings:
      "Their day is not 24 hours but 24 hours 40 minutes, held to the night by darkness alone, and it drifts in the weeks around midsummer when the nights are short. A household that drifts the same way, in the same weeks, is not keeping human hours. Our analysts now throw out most of the false alarms before they reach anyone.",
    outcome: "SIGINT and OSINT leads are real 10 points more often.",
  },
  {
    id: "cryptanalysis",
    kind: "research",
    name: "Cryptanalysis",
    skills: { physics: 0.7, humanities: 0.3 },
    points: 220,
    cost: 0,
    requires: ["advanced-signals"],
    classification: "sensitive",
    proposal:
      "The older houses encrypt everything, with schemes their thralls set up decades ago and never changed. Old schemes have old weaknesses.",
    findings:
      "Their keys are generated from the same few dozen texts, scripture and family records, and a thrall who sets one up for a nest uses it everywhere. We cannot read everything, but what we intercept now says much more about who is talking to whom.",
    outcome: "SIGINT evidence counts for more.",
  },
  {
    id: "psychophysiology",
    kind: "research",
    name: "Psychophysiology of deception",
    skills: { biology: 0.5, psychology: 0.5 },
    points: 200,
    cost: 0,
    requires: ["advanced-signals"],
    classification: "sensitive",
    proposal:
      "A source who lies, or speaks under duress, shows it: in the voice, the skin, the eyes. A thrall's tells are different again. We propose to measure both, so our analysts can tell a true report from a planted one.",
    findings:
      "Duress has a signature distinct from lying: the voice pitches up but the pauses shorten. A thrall lying for its master shows neither, which is itself a sign: nobody is that calm. Our analysts now weigh a source's account with far more confidence.",
    outcome: "The section's counter-intelligence is 10 better.",
  },
  {
    id: "trace-evidence",
    kind: "research",
    name: "Trace evidence",
    skills: { physics: 0.6, biology: 0.4 },
    points: 120,
    cost: 0,
    requires: ["forensic-pathology"],
    trade: { public: true },
    proposal:
      "We clean up after ourselves and after them, and so far we have done it by instinct. A forensic scientist knows exactly what a scene gives away.",
    findings:
      "Fibres, glass, soil, the patterns blood leaves: we now know what a police laboratory looks for, and so what has to go before it gets there.",
    outcome: "Cover-ups are 10 points likelier to succeed.",
  },
  {
    id: "stable-isotopes",
    kind: "research",
    name: "Stable isotopes",
    skills: { physics: 1 },
    points: 150,
    cost: 0,
    requires: ["forensic-pathology"],
    room: "forensic",
    proposal:
      "Teeth keep the water and food of childhood in their enamel: the ratios of oxygen and strontium isotopes say where someone grew up. A thrall's teeth would tell us which records to search.",
    findings:
      "With a mass spectrometer in the forensic laboratory, a single tooth places a person's childhood within a few hundred kilometres. Our open-source searches can start from the right town.",
    outcome: "The section's OSINT is 10% more productive.",
  },
  {
    id: "genealogy",
    kind: "research",
    name: "Forensic genetic genealogy",
    skills: { biology: 0.7, humanities: 0.3 },
    points: 250,
    cost: 0,
    requires: ["forensic-pathology", "provirus"],
    room: "forensic",
    classification: "sensitive",
    proposal:
      "The houses turn people they know: brothers, cousins, children. A sample's human DNA, run against the public genealogy databases, could name a relative still living outside.",
    findings:
      "It works as it does for police cold cases: a third cousin in a database narrows the field to one family, and a family that has lost a member to a house often has another who knows something.",
    outcome: "Each tissue sample brought home has a 25% chance of a HUMINT lead on its house.",
  },
  {
    id: "fournier-register",
    kind: "research",
    name: "The Fournier register",
    skills: { humanities: 1 },
    points: 220,
    cost: 0,
    requires: ["history-carcassonne"],
    room: "archive",
    classification: "cdf",
    proposal:
      "Between 1318 and 1325 Jacques Fournier, later Pope Benedict XII, questioned the last Cathars of the Pyrenees. His register follows the survivors of Montségur and their families for eighty years. The families are still there.",
    findings:
      "The register names every household that sheltered the Perfect, village by village. Many of those surnames are still on the same farms. Agnes has drawn on those families for seven hundred years, and some of them have had enough.",
    outcome: "The section's HUMINT is 10% more productive.",
  },
  {
    id: "combat-surgery",
    kind: "research",
    name: "Combat surgery",
    skills: { biology: 1 },
    points: 120,
    cost: 0,
    requires: ["field-medicine"],
    trade: { public: true },
    proposal:
      "We have stopped the fever. We still lose operatives in the first ten minutes, in a car, in the dark, to wounds a surgeon would close in an hour. The surgeons of the Gemelli and the Fatebenefratelli have offered to teach our medics. We propose a course of instruction and a review of what our medics carry.",
    findings:
      "Most of our dead bled out from the limbs and the junctions, the groin and the armpit, where a vampire's grip tears the vessels. A tourniquet does not reach them. Junctional clamps, haemostatic gauze, whole blood carried cold in the vehicle and a medic trained to pack a wound by feel save most of them. The surgeons were frank: this is military medicine, and nothing we do is new except the patient.",
    outcome: "Wounded operatives heal faster still. The workshops can make advanced trauma kits.",
  },
  {
    id: "vampire-physiology",
    kind: "research",
    name: "Vampire Physiology I",
    skills: { biology: 1 },
    points: 120,
    cost: 0,
    requires: ["archives-1"],
    needs: "vampire-material",
    trade: {
      buyer: 'a biotech start-up\'s "longevity" programme, through a shell company',
      secrecy: 0.5,
    },
    classification: "sensitive",
    proposal:
      "The Order has fought them for eight hundred years and has never once put one under a microscope. What we know is folklore and field notes. With remains on the table we propose a full post-mortem, histology and blood chemistry, starting with the questions our operatives ask: why fire and sunlight work, why bullets do not, and what the sleep is.",
    findings:
      'The subject is a human being carrying an integrated retrovirus. The provirus drives tissue repair at a rate we cannot measure with our instruments: a wound closes while we watch it under the microscope. The price is a body that cannot make its own haem and must take it from blood, and a skin loaded with free porphyrins that turn light into heat. The "sleep" is a metabolic shutdown, a torpor, that the body falls into when repair outruns supply. Fire and light are the only things we have seen it fail to repair. One more thing failed it on the bench: silver. The repair enzymes take up silver ions and stall, and a round that breaks up into silver powder leaves enough in a wound to slow the closing for minutes.',
    outcome:
      "We understand the enemy's body. The workshops can make silver frangible rounds. Its weapons, its scent and its blood can now be studied.",
  },
  {
    id: "bite-weave",
    kind: "research",
    name: "Bite-resistant weave",
    skills: { physics: 1 },
    points: 120,
    cost: 0,
    requires: ["composite-armour"],
    proposal:
      "A bite is not a stab. Teeth close from two sides at once and tear as they open, and a knife-rated vest lets them through at the seams. We propose to test the fibres the cut-resistant glove makers use against a bite, measured on the gel blocks with a jaw we have built for the purpose.",
    findings:
      "Ultra-high-molecular-weight polyethylene, the fibre in butchers' gloves and mooring lines, does what aramid does not: it slides under a tooth instead of catching on it, and it does not tear along the line of the bite. Woven tight and laid in twenty plies, it turns a bite into a bruise and takes a good part of a claw strike too. It is light, washable, and looks like nothing under a shirt.",
    outcome:
      "The workshops can make the UHMWPE vest: plainclothes armour that takes less from claws.",
  },
  {
    id: "stf",
    kind: "research",
    name: "Shear-thickening fluid",
    skills: { physics: 1 },
    points: 250,
    cost: 0,
    requires: ["composite-armour"],
    proposal:
      "The harder they strike, the more a soft vest should stiffen. Some fluids do exactly that: they flow when pushed slowly and lock solid when struck. We propose to soak an aramid vest in one and see whether it can stop what a plate stops without being a plate.",
    findings:
      "Silica particles a few hundred nanometres across, suspended in polyethylene glycol, jam into a solid in under a millisecond when struck and flow again a moment later. Soaked into aramid, they stop a claw strike and most pistol rounds at a third of the weight of a plate, and the vest still folds under a jacket.",
    outcome: "The workshops can make the STF vest: near plate protection that can still be hidden.",
  },
  {
    id: "boron-carbide",
    kind: "research",
    name: "Boron carbide",
    skills: { physics: 1 },
    points: 300,
    cost: 0,
    requires: ["stf"],
    proposal:
      "For the raids where we do not need to hide, we can carry as much as an operative can move in. We propose the hardest ceramic the defence industry presses, cut to our own pattern, over a backing of our own fluid.",
    findings:
      "Boron carbide is the third-hardest material known, after diamond and boron nitride. Hot-pressed into full-torso plates over an STF backing, it shatters a rifle round and spreads a claw strike across the whole chest. It is heavy and it is obvious: this is armour for the door, not the street.",
    outcome: "The workshops can make heavy plate: the best armour we have, for tactical kit.",
  },
  {
    id: "uv-weaponry",
    kind: "research",
    name: "Porphyrin photochemistry",
    skills: { physics: 0.7, biology: 0.3 },
    points: 150,
    cost: 0,
    requires: ["vampire-physiology-2"],
    trade: {
      buyer: "a defence contractor's directed-energy group, through a consultancy",
      secrecy: 0.3,
    },
    classification: "sensitive",
    proposal:
      "Sunlight kills them, slowly. A hand torch does nothing at all. Somewhere between the two is a light we could carry. We propose to find which wavelengths their porphyrins absorb, at what intensity they burn, and whether anything that bright can be made small enough to load.",
    findings:
      "Their porphyrins absorb hardest in the near ultraviolet, between 300 and 410 nanometres, and the damage scales with intensity, not total dose. A flash of a few milliseconds at the right band does more than an hour of noon sun. A steady glow at that band does less, but it does it for as long as the lamp lasts: none of them will walk into it. A canister of UV diodes and a battery, thrown like a grenade, makes ground they will not cross. The same light, in a cabinet, sterilises a theatre in under a minute.",
    outcome:
      "The workshops can make UV flares, which vampires won't enter, and UV sterilisers to sell.",
  },
  {
    id: "pheromones",
    kind: "research",
    name: "Pheromone resistance",
    skills: { biology: 0.6, psychology: 0.4 },
    points: 150,
    cost: 0,
    requires: ["vampire-physiology"],
    trade: {
      buyer: "a contract lab doing sedation research for a pharmaceutical company",
      secrecy: 0.4,
    },
    classification: "sensitive",
    proposal:
      "Survivors describe the same thing: a smell, sweet and faintly metallic, and then they could not move. Our operatives report it too, in the moment before they are hit. We propose to isolate whatever they breathe out, find what it does to us, and find out whether it can be blocked.",
    findings:
      "The compound is a volatile steroid, related to androstenone, that binds the vomeronasal and olfactory receptors and triggers the freeze response: a few seconds of stillness in which a victim does not run and an operative does not dodge. A competitive blocker, sprayed into the nose before a raid, occupies the receptors first. Training does the rest. The blocker tastes faintly of frankincense, which the operatives have decided is not a coincidence.",
    outcome: "Vampires land fewer blows on our operatives.",
  },
  {
    id: "haematology",
    kind: "research",
    name: "Haematology",
    skills: { biology: 1 },
    points: 180,
    cost: 0,
    requires: ["field-medicine", "vampire-physiology"],
    trade: {
      buyer:
        "pharmaceutical companies, through cutouts: the anticoagulant data alone is worth a fortune",
      secrecy: 0.5,
    },
    classification: "sensitive",
    proposal:
      "Their blood does things to ours. Transfusions from the victims of a feeding behave strangely in the lab: they clot late and carry oxygen for longer than they should. We propose a study of what in their blood survives in a victim's, and whether any of it could be turned to our use.",
    findings:
      "The victims' red cells carry a modified haemoglobin, picked up from the feeder's saliva, that binds oxygen more tightly and gives it up more slowly in the muscle. In small amounts it is harmless and lasts the life of the cell. A course of injections of the purified protein, given to a volunteer, raised her endurance and her tolerance of blood loss measurably within a month. The same work gives us a synthetic plasma that clots on demand.",
    outcome:
      "Every operative, and every recruit, gains 5 vitality. The workshops can make synthetic plasma to sell.",
  },
  // ----- Engineering -----
  {
    id: "station-retrofit",
    kind: "engineering",
    name: "Station retrofit",
    skills: { electronics: 1 },
    points: 120,
    cost: 250_000,
    requires: ["signal-analysis"],
    outcome: "Every SIGINT station hears more, in its region and next door.",
    proposal: "New analysis rigs for every SIGINT station, present and future.",
    findings: "SIGINT stations now hear more, in their own region and next door.",
  },
  {
    id: "build-helicopter",
    kind: "engineering",
    name: "Build a helicopter",
    skills: { avionics: 0.6, electronics: 0.4 },
    points: 200,
    cost: 450_000,
    requires: [],
    needs: "free-hangar",
    repeatable: true,
    outcome: "A helicopter, at half the price of buying one.",
    proposal:
      "Assemble and fit out a helicopter in our own workshops: half the price of buying one.",
    findings: "A new helicopter is ready in its hangar.",
  },
  {
    id: "make-biopsy-kit",
    kind: "engineering",
    name: "Biopsy kit",
    skills: { chemistry: 1 },
    points: 6,
    cost: 3_000,
    requires: ["archives-1"],
    repeatable: true,
    item: "biopsy-kit",
    outcome: "Biopsy kits, into the armoury: four tissue samples each.",
    proposal:
      "Needles, a bone drill and cold vials in a hard case, for taking tissue from their bodies.",
    findings: "The biopsy kits are in the armoury.",
  },
  {
    id: "make-silver-pistol",
    kind: "engineering",
    name: "9 mm silver magazines (Glock 19)",
    skills: { ballistics: 1 },
    points: 2,
    cost: 300,
    requires: ["vampire-physiology"],
    repeatable: true,
    item: "mag-pistol-silver",
    outcome: "Silver frangible pistol magazines, into the armoury.",
    proposal: "Silver powder pressed into frangible 9 mm cores, loaded into Glock magazines.",
    findings: "The silver pistol magazines are in the armoury.",
  },
  {
    id: "make-silver-smg",
    kind: "engineering",
    name: "9 mm silver magazines (MPX)",
    skills: { ballistics: 1 },
    points: 2,
    cost: 400,
    requires: ["vampire-physiology"],
    repeatable: true,
    item: "mag-smg-silver",
    outcome: "Silver frangible SMG magazines, into the armoury.",
    proposal: "Silver powder pressed into frangible 9 mm cores, loaded into MPX magazines.",
    findings: "The silver SMG magazines are in the armoury.",
  },
  {
    id: "make-silver-rifle",
    kind: "engineering",
    name: "5.56 mm silver magazines (H&K 416)",
    skills: { ballistics: 1 },
    points: 2,
    cost: 500,
    requires: ["vampire-physiology"],
    repeatable: true,
    item: "mag-rifle-silver",
    outcome: "Silver frangible rifle magazines, into the armoury.",
    proposal: "Silver powder pressed into frangible 5.56 mm cores, loaded into rifle magazines.",
    findings: "The silver rifle magazines are in the armoury.",
  },
  {
    id: "make-uhmwpe-vest",
    kind: "engineering",
    name: "UHMWPE vest",
    skills: { ballistics: 1 },
    points: 8,
    cost: 3_000,
    requires: ["bite-weave"],
    repeatable: true,
    item: "uhmwpe-vest",
    outcome: "UHMWPE vests, into the armoury.",
    proposal: "Twenty plies of UHMWPE weave in a vest that goes under a shirt.",
    findings: "The UHMWPE vests are in the armoury.",
  },
  {
    id: "make-stf-vest",
    kind: "engineering",
    name: "STF vest",
    skills: { ballistics: 0.6, chemistry: 0.4 },
    points: 15,
    cost: 9_000,
    requires: ["stf"],
    repeatable: true,
    item: "stf-vest",
    outcome: "STF vests, into the armoury.",
    proposal: "Aramid soaked in shear-thickening fluid, sealed in a concealable carrier.",
    findings: "The STF vests are in the armoury.",
  },
  {
    id: "make-heavy-plate",
    kind: "engineering",
    name: "Heavy plate",
    skills: { ballistics: 1 },
    points: 20,
    cost: 14_000,
    requires: ["boron-carbide"],
    repeatable: true,
    item: "heavy-plate",
    outcome: "Heavy plate, into the armoury.",
    proposal: "Full-torso boron carbide plates over an STF backing, in a carrier.",
    findings: "The heavy plate is in the armoury.",
  },
  {
    id: "make-trauma-kit",
    kind: "engineering",
    name: "Advanced trauma kit",
    skills: { chemistry: 1 },
    points: 4,
    cost: 1_200,
    requires: ["combat-surgery"],
    repeatable: true,
    item: "trauma-kit-adv",
    outcome: "Advanced trauma kits, into the armoury: two uses each.",
    proposal: "Junctional clamps, haemostatic gauze and a cold pack of whole blood, in a pouch.",
    findings: "The advanced trauma kits are in the armoury.",
  },
  {
    id: "make-uv-flare",
    kind: "engineering",
    name: "UV flare",
    skills: { chemistry: 0.5, electronics: 0.5 },
    points: 3,
    cost: 600,
    requires: ["uv-weaponry"],
    repeatable: true,
    item: "uv-flare",
    outcome: "UV flares, into the armoury.",
    proposal: "UV diodes, a battery and a cage, in a canister thrown like a grenade.",
    findings: "The UV flares are in the armoury.",
  },
  {
    id: "make-strobe",
    kind: "engineering",
    name: "Strobes",
    skills: { electronics: 1 },
    points: 3,
    cost: 500,
    requires: ["sensory-physiology"],
    repeatable: true,
    item: "strobe",
    outcome: "Strobes, into the armoury.",
    proposal:
      "LEDs, a capacitor and a timer in a canister, flashing at the rate their retinas can't bear.",
    findings: "Strobes in the armoury.",
  },
  {
    id: "make-flashbang",
    kind: "engineering",
    name: "Flashbangs",
    skills: { chemistry: 1 },
    points: 2,
    cost: 300,
    requires: ["sensory-physiology"],
    repeatable: true,
    item: "flashbang",
    outcome: "Flashbangs, into the armoury.",
    proposal: "A magnesium and perchlorate charge in a perforated steel body.",
    findings: "Flashbangs in the armoury.",
  },
  {
    id: "make-haemolytic-pistol",
    kind: "engineering",
    name: "Haemolytic magazines (Glock 19)",
    skills: { chemistry: 0.5, ballistics: 0.5 },
    points: 2,
    cost: 400,
    requires: ["haemolytic-chemistry"],
    repeatable: true,
    item: "mag-pistol-haemolytic",
    outcome: "Haemolytic magazines (Glock 19), into the armoury.",
    proposal: "9 mm frangible rounds with a gelling core, in Glock magazines.",
    findings: "Haemolytic magazines (Glock 19) in the armoury.",
  },
  {
    id: "make-haemolytic-smg",
    kind: "engineering",
    name: "Haemolytic magazines (MPX)",
    skills: { chemistry: 0.5, ballistics: 0.5 },
    points: 2,
    cost: 450,
    requires: ["haemolytic-chemistry"],
    repeatable: true,
    item: "mag-smg-haemolytic",
    outcome: "Haemolytic magazines (MPX), into the armoury.",
    proposal: "9 mm frangible rounds with a gelling core, in MPX magazines.",
    findings: "Haemolytic magazines (MPX) in the armoury.",
  },
  {
    id: "make-haemolytic-rifle",
    kind: "engineering",
    name: "Haemolytic magazines (H&K 416)",
    skills: { chemistry: 0.5, ballistics: 0.5 },
    points: 2,
    cost: 500,
    requires: ["haemolytic-chemistry"],
    repeatable: true,
    item: "mag-rifle-haemolytic",
    outcome: "Haemolytic magazines (H&K 416), into the armoury.",
    proposal: "5.56 mm frangible rounds with a gelling core, in 416 magazines.",
    findings: "Haemolytic magazines (H&K 416) in the armoury.",
  },
  {
    id: "make-crossbow",
    kind: "engineering",
    name: "Crossbows",
    skills: { ballistics: 1 },
    points: 20,
    cost: 8000,
    requires: ["haemolytic-chemistry"],
    repeatable: true,
    item: "crossbow",
    outcome: "Crossbows, into the armoury.",
    proposal:
      "A compact crossbow with a cocking lever, built to carry a bolt that must arrive in one piece.",
    findings: "Crossbows in the armoury.",
  },
  {
    id: "make-haemolytic-bolt",
    kind: "engineering",
    name: "Haemolytic bolts",
    skills: { chemistry: 0.5, ballistics: 0.5 },
    points: 3,
    cost: 500,
    requires: ["haemolytic-chemistry"],
    repeatable: true,
    item: "bolt-haemolytic",
    outcome: "Haemolytic bolts, into the armoury.",
    proposal: "Crossbow bolts with a hollow head of gelling agent.",
    findings: "Haemolytic bolts in the armoury.",
  },
  {
    id: "make-coated-knife",
    kind: "engineering",
    name: "Coated knives",
    skills: { chemistry: 0.5, ballistics: 0.5 },
    points: 6,
    cost: 1500,
    requires: ["metalloporphyrins"],
    repeatable: true,
    item: "coated-knife",
    outcome: "Coated knives, into the armoury.",
    proposal: "Fighting knives with the tin porphyrin bonded to the blade.",
    findings: "Coated knives in the armoury.",
  },
  {
    id: "make-coated-bolt",
    kind: "engineering",
    name: "Coated bolts",
    skills: { chemistry: 1 },
    points: 3,
    cost: 400,
    requires: ["metalloporphyrins"],
    repeatable: true,
    item: "bolt-coated",
    outcome: "Coated bolts, into the armoury.",
    proposal: "Crossbow bolts with the tin porphyrin bonded to the head.",
    findings: "Coated bolts in the armoury.",
  },
  ...BLOODLINES.map((b): ProjectDef => ({
    id: `make-silencer-${b.id}`,
    kind: "engineering",
    name: `Silencer bolts (${b.short})`,
    skills: { chemistry: 1 },
    points: 8,
    cost: 4_000,
    requires: ["antisense", `strain-${b.id}`],
    needs: `sample:${b.id}`,
    consumes: 0.25,
    repeatable: true,
    item: `silencer-${b.id}` as ItemId,
    outcome: `Silencer bolts for ${b.name}, into the armoury.`,
    proposal: `Antisense strands built against ${b.name}'s repair genes, in a bolt's head. Four bolts to a sample.`,
    findings: `Silencer bolts for ${b.name} in the armoury.`,
  })),
  {
    id: "make-montsegur",
    kind: "engineering",
    name: "The Montségur silencer",
    skills: { chemistry: 1 },
    points: 40,
    cost: 50_000,
    requires: ["root-strain"],
    needs: "elder:carcassonne",
    consumes: 1,
    repeatable: true,
    item: "montsegur-silencer",
    outcome: "The Montségur silencer, into the armoury.",
    proposal:
      "A bolt built against the root strain itself, from a whole sample of one of her elders.",
    findings: "The Montségur silencer is in the armoury.",
  },
  {
    id: "make-haem-serum",
    kind: "engineering",
    name: "Haem serum",
    skills: { chemistry: 1 },
    points: 5,
    cost: 1000,
    requires: ["tissue-regeneration"],
    needs: "vampire-material",
    consumes: 1 / 6,
    repeatable: true,
    item: "haem-serum",
    outcome: "Haem serum, into the armoury.",
    proposal: "Autoinjectors of the growth factors, a sixth of a tissue sample each.",
    findings: "Haem serum in the armoury.",
  },
  {
    id: "make-magnesium-shells",
    kind: "engineering",
    name: "Magnesium shells",
    skills: { chemistry: 0.5, ballistics: 0.5 },
    points: 2,
    cost: 200,
    requires: ["pyrotechnics"],
    repeatable: true,
    item: "magnesium-shells",
    outcome: "Magnesium shells, into the armoury.",
    proposal: "12-gauge shells loaded with magnesium.",
    findings: "Magnesium shells in the armoury.",
  },
  {
    id: "make-sparkle",
    kind: "engineering",
    name: "Sparkles",
    skills: { electronics: 1 },
    points: 6,
    cost: 2000,
    requires: ["pulsed-xenon"],
    repeatable: true,
    item: "sparkle",
    outcome: "Sparkles, into the armoury.",
    proposal: "A xenon flash tube and its capacitor in a grenade body.",
    findings: "Sparkles in the armoury.",
  },
  {
    id: "make-lumen-365",
    kind: "engineering",
    name: "Lumen lamps (365 nm)",
    skills: { electronics: 1 },
    points: 20,
    cost: 15000,
    requires: ["led-arrays"],
    repeatable: true,
    item: "lumen-365",
    outcome: "Lumen lamps (365 nm), into the armoury.",
    proposal: "UVA diodes behind a fused-silica lens, in a pistol-grip housing.",
    findings: "Lumen lamps (365 nm) in the armoury.",
  },
  {
    id: "make-lumen-405",
    kind: "engineering",
    name: "Lumen lamps (405 nm)",
    skills: { electronics: 1 },
    points: 20,
    cost: 15000,
    requires: ["led-arrays"],
    repeatable: true,
    item: "lumen-405",
    outcome: "Lumen lamps (405 nm), into the armoury.",
    proposal: "Violet diodes behind a fused-silica lens, in a pistol-grip housing.",
    findings: "Lumen lamps (405 nm) in the armoury.",
  },
  {
    id: "make-lamp-battery",
    kind: "engineering",
    name: "Lamp batteries",
    skills: { electronics: 1 },
    points: 2,
    cost: 500,
    requires: ["led-arrays"],
    repeatable: true,
    item: "lamp-battery",
    outcome: "Lamp batteries, into the armoury.",
    proposal: "Lithium packs for the lumen lamps.",
    findings: "Lamp batteries in the armoury.",
  },
  {
    id: "make-excimer-lance",
    kind: "engineering",
    name: "Excimer lances",
    skills: { electronics: 1 },
    points: 60,
    cost: 60000,
    requires: ["excimer"],
    repeatable: true,
    item: "excimer-lance",
    outcome: "Excimer lances, into the armoury.",
    proposal: "A xenon-chloride laser, its cooling and its optics, built to carry.",
    findings: "Excimer lances in the armoury.",
  },
  {
    id: "make-lance-capacitor",
    kind: "engineering",
    name: "Lance capacitors",
    skills: { electronics: 1 },
    points: 4,
    cost: 2000,
    requires: ["excimer"],
    repeatable: true,
    item: "lance-capacitor",
    outcome: "Lance capacitors, into the armoury.",
    proposal: "Capacitor banks for the excimer lance.",
    findings: "Lance capacitors in the armoury.",
  },
  {
    id: "make-lantern-suit",
    kind: "engineering",
    name: "Lantern suits",
    skills: { electronics: 0.5, ballistics: 0.5 },
    points: 40,
    cost: 40000,
    requires: ["lantern-suit"],
    repeatable: true,
    item: "lantern-suit",
    outcome: "Lantern suits, into the armoury.",
    proposal: "Plates over STF, lined with UV panels on pressure switches.",
    findings: "Lantern suits in the armoury.",
  },
  {
    id: "make-night-optics",
    kind: "engineering",
    name: "Night optics",
    skills: { electronics: 1 },
    points: 10,
    cost: 6000,
    requires: ["image-intensification"],
    repeatable: true,
    item: "night-optics",
    outcome: "Night optics, into the armoury.",
    proposal: "Intensifier tubes on head mounts.",
    findings: "Night optics in the armoury.",
  },
  {
    id: "make-thermal-sight",
    kind: "engineering",
    name: "Thermal sights",
    skills: { electronics: 1 },
    points: 15,
    cost: 10000,
    requires: ["thermoregulation"],
    repeatable: true,
    item: "thermal-sight",
    outcome: "Thermal sights, into the armoury.",
    proposal: "Thermal cores on head mounts.",
    findings: "Thermal sights in the armoury.",
  },
  {
    id: "make-motion-tracker",
    kind: "engineering",
    name: "Motion trackers",
    skills: { electronics: 1 },
    points: 10,
    cost: 5000,
    requires: ["doppler"],
    repeatable: true,
    item: "motion-tracker",
    outcome: "Motion trackers, into the armoury.",
    proposal: "Handheld through-wall radars.",
    findings: "Motion trackers in the armoury.",
  },
  {
    id: "make-isr-drone",
    kind: "engineering",
    name: "ISR drones",
    skills: { electronics: 0.5, avionics: 0.5 },
    points: 30,
    cost: 25000,
    requires: ["persistent-isr"],
    repeatable: true,
    item: "isr-drone",
    outcome: "ISR drones, into the armoury.",
    proposal: "Quadcopters with a thermal core.",
    findings: "ISR drones in the armoury.",
  },
  {
    id: "make-chelation-bolt",
    kind: "engineering",
    name: "Chelation bolts",
    skills: { chemistry: 1 },
    points: 4,
    cost: 800,
    requires: ["haem-chelation"],
    repeatable: true,
    item: "bolt-chelation",
    outcome: "Chelation bolts, into the armoury.",
    proposal: "Crossbow bolts with a head of chelating agent.",
    findings: "Chelation bolts in the armoury.",
  },
  {
    id: "helicopter-tanks",
    kind: "engineering",
    name: "Helicopter fuel tanks",
    skills: { avionics: 0.7, electronics: 0.3 },
    points: 40,
    cost: 120_000,
    requires: ["archives-2"],
    needs: "helicopter-tanks",
    repeatable: true,
    outcome: "A helicopter at the base reaches 1,300 nm.",
    proposal:
      "Auxiliary tanks in the cabin of one of the base's helicopters, as on search-and-rescue aircraft.",
    findings: "Auxiliary tanks are fitted.",
  },
  {
    id: "jet-tanks",
    kind: "engineering",
    name: "Jet fuel tanks",
    skills: { avionics: 0.7, electronics: 0.3 },
    points: 60,
    cost: 250_000,
    requires: ["archives-2"],
    needs: "jet-tanks",
    repeatable: true,
    outcome: "A jet at the base reaches 3,600 nm.",
    proposal: "Extended-range tanks in the baggage hold of one of the base's jets.",
    findings: "Extended-range tanks are fitted.",
  },
  // ----- Goods, made in quantity into stores (sold, if anyone thinks to, on the dark web: sim/economy/market.ts) -----
  {
    id: "make-plasma",
    kind: "engineering",
    name: "Synthetic plasma",
    skills: { chemistry: 1 },
    points: 45,
    cost: 60_000,
    requires: ["haematology"],
    repeatable: true,
    product: "plasma",
    outcome: "Synthetic plasma, a batch at a time, into stores.",
    proposal: "A clotting, oxygen-carrying plasma built on what their blood taught us.",
    findings: "The synthetic plasma is made and in stores.",
  },
  {
    id: "make-blockers",
    kind: "engineering",
    name: "Pheromone blockers",
    skills: { chemistry: 1 },
    points: 40,
    cost: 45_000,
    requires: ["pheromones"],
    repeatable: true,
    product: "blockers",
    outcome: "Pheromone blockers, a batch at a time, into stores.",
    proposal:
      "Our nasal spray, without the incense, for police who keep finding victims who didn't run.",
    findings: "The pheromone blockers are made and in stores.",
  },
  {
    id: "make-sterilisers",
    kind: "engineering",
    name: "UV sterilisers",
    skills: { electronics: 1 },
    points: 30,
    cost: 35_000,
    requires: ["uv-weaponry"],
    repeatable: true,
    product: "sterilisers",
    outcome: "UV sterilisers, a batch at a time, into stores.",
    proposal:
      "Our munitions research, turned into lamps that clean an operating theatre in a minute.",
    findings: "The UV sterilisers are made and in stores.",
  },
  {
    id: "make-inserts",
    kind: "engineering",
    name: "Ceramic inserts",
    skills: { ballistics: 1 },
    points: 25,
    cost: 25_000,
    requires: ["composite-armour"],
    repeatable: true,
    product: "inserts",
    outcome: "Ceramic inserts, a batch at a time, into stores.",
    proposal: "Body-armour plates on the pattern of our own.",
    findings: "The ceramic inserts are made and in stores.",
  },
];

const byId = new Map(PROJECTS.map((p) => [p.id, p]));
export const projectById = (id: string) => byId.get(id);
export const isProjectId = (id: unknown): id is string => typeof id === "string" && byId.has(id);

/** Effect sizes, kept here so they're easy to tune. */
export const RESEARCH_EFFECTS = {
  /** Field medicine: hp healed per day (from HEAL_PER_DAY, 6); combat surgery on top. */
  healPerDay: 9,
  surgeryHealPerDay: 12,

  /** Network science: the chance a piece of supporting evidence turns up a follow-up lead. */
  followUps: 0.3,
  /** Chronobiology: added to the share of SIGINT and OSINT leads that are real. */
  chronobiology: 0.1,
  /** Cryptanalysis: added to what a piece of SIGINT evidence says. */
  cryptanalysis: 0.05,
  /** Psychophysiology of deception: added to the section's CI. */
  ci: 10,
  /** Trace evidence: added to a cover-up's chance. */
  traceEvidence: 0.1,
  /** Forensic genetic genealogy: the chance a sample brought home names a relative. */
  genealogy: 0.25,
  /** Tracking tags: the chance a released thrall leads to its house. */
  trackingTag: 0.6,
  /** Forensic epidemiology: how much likelier Find picks a feeding operation. */
  epidemiology: 1.5,
  /** Haem chelation: turns a vampire hit by a chelation bolt stays feral. */
  chelation: 3,
  /** Haematology: vitality for every agent. */
  vitality: 5,
  /** Pheromone resistance: taken off a vampire's chance to hit. */
  vampireHit: 0.08,
  /** The Spiritual Exercises: Faith for every operative and recruit. */
  faith: 5,
  /** Pastoral theology: support a released thrall brings its home region. */
  releasedThrall: 0.2,
  /** A chapel: Faith a month for each operative based with one. */
  chapelFaith: 1,
  /** Domination neurology: taken off every vampire's will. */
  will: 10,
  /** Torpor metabolism: TU off finishing a body. */
  finishLess: 2,
  /** Station retrofit: SIGINT rate in the station's region, and next door. */
  sigintOwn: 1.3,
  sigintNeighbour: 1.5,
};

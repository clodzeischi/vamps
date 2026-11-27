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

export type ProjectKind = "research" | "engineering";
/** Material a project needs on hand before it can start. */
export type Need =
  | "vampire-material"
  | "thrall-captive"
  | "vampire-captive"
  | "free-hangar"
  | "helicopter-tanks"
  | "jet-tanks";
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
  needs?: Need;
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
    outcome: "The workshops can make ceramic plate for our kit, and ceramic inserts to sell.",
  },
  {
    id: "signal-analysis",
    kind: "research",
    name: "Signal analysis",
    skills: { physics: 1 },
    points: 90,
    cost: 0,
    requires: [],
    trade: { public: true },
    proposal:
      "The houses use phones, banks and couriers like anyone else, and that leaves a trace. Our SIGINT stations were fitted out in the 1990s and listen for words. We propose to study what a bloodline's logistics look like from the outside, in metadata, payments and camera footage, and whether our stations are listening for the right things.",
    findings:
      "The houses are careful about what they say and careless about when. A nest runs on a nocturnal rhythm that no shift worker keeps for years: calls between 23:00 and 04:00, no traffic at all for two hours either side of dawn, the same handsets dark through every summer solstice. Payments for blood come in round sums through the same three or four clinics. None of this needs a word of content, and our station hardware throws it all away before an analyst sees it.",
    outcome: "The workshops can retrofit the SIGINT stations.",
  },
  {
    id: "advanced-signals",
    kind: "research",
    name: "Advanced signal analysis",
    skills: { physics: 0.7, humanities: 0.3 },
    points: 140,
    cost: 0,
    requires: ["signal-analysis"],
    trade: { buyer: "a private intelligence contractor that sells to hedge funds", secrecy: 0 },
    classification: "sensitive",
    proposal:
      "Now that we know what a nest's rhythm looks like, the harder question is what it looks like when it is trying not to be seen. The older houses have been hiding for centuries and their thralls are trained to keep normal hours. We propose to model the traffic that is missing: who never calls whom, and what that silence says.",
    findings:
      "Every network has a shape, and a careful one has a hole where its centre should be. A den's thralls call one another constantly but never call the same two numbers, which belong to people who call no one at all. Graphed over three months the gap stands out like a missing tooth. The method works on any covert network, which is why the people who run hedge funds will pay for it.",
    outcome: "SIGINT stations hear about a quarter more, in their own region and next door.",
  },
  {
    id: "pattern-analysis",
    kind: "research",
    name: "Pattern analysis",
    skills: { psychology: 0.6, physics: 0.4 },
    points: 180,
    cost: 0,
    requires: ["advanced-signals"],
    trade: { buyer: "a data broker working for three governments at once", secrecy: 0 },
    classification: "sensitive",
    proposal:
      "We have twenty years of intercepts, sources and dead ends in the archive, most of them read once and filed. Banks find fraud by putting millions of ordinary transactions through statistics until the strange ones stand out. We propose to do the same to our own files, and see whether the houses' operations have a shape we could recognise while they are still under way.",
    findings:
      "They do. An operation passes through the same stages in the same order whatever the house: a lull, a burst of property and vehicle purchases, a cluster of missing persons, then silence. The first stage is invisible but the second is not, and a model trained on the archive flags it nine days out on average. Our analysts now see an operation forming instead of one finished.",
    outcome: "Leads stay open half as long again, and come with better intelligence.",
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
    outcome: "Wounded operatives heal faster still.",
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
    id: "uv-weaponry",
    kind: "research",
    name: "Ultraviolet weaponry",
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
      "Their porphyrins absorb hardest in the near ultraviolet, between 300 and 410 nanometres, and the damage scales with intensity, not total dose. A flash of a few milliseconds at the right band does more than an hour of noon sun. A xenon flash tube and capacitor, packed into a round that fires on impact, delivers that flash at contact range. The same tubes, in a cabinet, sterilise a theatre in under a minute.",
    outcome: "The workshops can make UV munitions for our armed teams, and UV sterilisers to sell.",
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
    id: "ceramic-plate",
    kind: "engineering",
    name: "Ceramic plate",
    skills: { ballistics: 1 },
    points: 150,
    cost: 350_000,
    requires: ["composite-armour"],
    outcome: "Plainclothes and tactical kit stop more damage.",
    proposal: "Refit every operative's vest and tactical plate with composite inserts.",
    findings: "Plainclothes and tactical kit now stop more damage.",
  },
  {
    id: "uv-munitions",
    kind: "engineering",
    name: "UV munitions",
    skills: { ballistics: 0.5, chemistry: 0.5 },
    points: 150,
    cost: 300_000,
    requires: ["uv-weaponry"],
    outcome: "Armed teams do far more damage to vampires.",
    proposal: "UV-flash rounds and lamps for every armed team.",
    findings: "Armed teams now do far more damage to vampires.",
  },
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
  /** Advanced signal analysis: SIGINT detection, own region and next door. */
  advancedSignals: 1.25,
  /** Pattern analysis: how much longer leads stay open, and intel added to each. */
  leadLife: 1.5,
  leadIntel: 0.15,
  /** Haematology: vitality for every agent. */
  vitality: 5,
  /** Ceramic plate: armour added to plainclothes and tactical kit. */
  plate: 0.15,
  /** UV munitions: damage to vampires, for armed kit. */
  uvDamage: 1.4,
  /** Pheromone resistance: taken off a vampire's chance to hit. */
  vampireHit: 0.08,
  /** Station retrofit: SIGINT rate in the station's region, and next door. */
  sigintOwn: 1.3,
  sigintNeighbour: 1.5,
};

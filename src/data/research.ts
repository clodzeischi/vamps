// The research and engineering tree. Research costs scientist-days; engineering
// costs engineer-days plus materials, drawn as the work is done. Effects are
// applied in sim/research.ts (look for the project id).

import type { Requirement } from "./engineers";
import type { GoodId } from "../sim/state";

export type ProjectKind = "research" | "engineering";
/** Material a project needs on hand before it can start. */
export type Need = "vampire-material" | "thrall-captive" | "vampire-captive" | "free-hangar";

export interface ProjectDef {
  id: string;
  kind: ProjectKind;
  name: string;
  /** What it is: shown before it starts. */
  description: string;
  /** What it will give us, in a line (shown before it's done; "Opens" is worked out from `requires`). */
  gives: string;
  /** What it found: shown when it completes, and after. */
  result: string;
  /** Staff-days of work. */
  points: number;
  /** Materials (engineering): drawn as the work is done, times the team's waste (sim/engineering.ts). */
  cost: number;
  /** Engineering: what the job asks of the engineers (weights over their aptitudes, adding to 1). */
  skills?: Requirement;
  /** Research that must be done first. */
  requires: string[];
  needs?: Need;
  /** Can be done again (interrogations); engineering ones are ordered in quantity. */
  repeatable?: boolean;
  /** Goods: each unit made goes into the Order's stores (the dark web's Sell tab; sim/market.ts). */
  product?: GoodId;
  /** On the dark web (sim/market.ts). `public`: science the world already has, bought there as
   *  information. Otherwise ours alone: sold once to `buyer`, at a cost in secrecy, and public some
   *  weeks later. Unset: never traded. */
  trade?: { public: true } | { buyer: string; secrecy: number };
}

export const PROJECTS: ProjectDef[] = [
  // ----- Research -----
  {
    id: "field-medicine", kind: "research", name: "Field medicine", points: 60, cost: 0, requires: [], trade: { public: true },
    gives: "Wounded agents heal half as fast again.",
    description: "Trauma care for wounds no hospital should see: bites, blood loss, the fevers that follow.",
    result: "Wounded agents now heal half as fast again.",
  },
  {
    id: "composite-armour", kind: "research", name: "Composite armour", points: 100, cost: 0, requires: [], trade: { public: true },
    gives: "Lets the workshops make ceramic plate, and inserts to sell.",
    description: "Ceramic and aramid layers light enough to wear under a coat, stiff enough to turn a claw.",
    result: "Our workshops can now make ceramic plate.",
  },
  {
    id: "signal-analysis", kind: "research", name: "Signal analysis", points: 90, cost: 0, requires: [], trade: { public: true },
    gives: "Lets the workshops retrofit the stations.",
    description: "Pattern-matching across phone metadata, payments and CCTV: what a bloodline's logistics look like from the outside.",
    result: "Our workshops can now retrofit the SIGINT stations.",
  },
  {
    id: "advanced-signals", kind: "research", name: "Advanced signal analysis", points: 140, cost: 0, requires: ["signal-analysis"], trade: { buyer: "a private intelligence contractor that sells to hedge funds", secrecy: 0 },
    description: "Reading a bloodline's traffic by its shape alone: who calls whom, at what hour, and who never calls at all.",
    gives: "SIGINT stations hear about a quarter more, in their region and next door.",
    result: "Our analysts can now see a bloodline at work in the gaps in the traffic. Every station hears more.",
  },
  {
    id: "pattern-analysis", kind: "research", name: "Pattern analysis", points: 180, cost: 0, requires: ["advanced-signals"], trade: { buyer: "a data broker working for three governments at once", secrecy: 0 },
    description: "Years of intercepts, sources and dead ends, put through the kind of statistics banks use to find fraud.",
    gives: "Leads stay open half as long again, and come with better intelligence.",
    result: "The machine finds the shape of an operation before it is finished. Leads reach us sooner and say more.",
  },
  {
    id: "combat-surgery", kind: "research", name: "Combat surgery", points: 120, cost: 0, requires: ["field-medicine"], trade: { public: true },
    description: "Surgeons from the Gemelli and the Fatebenefratelli, teaching our medics what to do in a car, in the dark, in the first ten minutes.",
    gives: "Wounded agents heal faster still.",
    result: "Our medics now save what they used to bandage. Wounded agents heal faster still.",
  },
  {
    id: "vampire-physiology", kind: "research", name: "Vampire physiology", points: 120, cost: 0, requires: [], trade: { buyer: "a biotech start-up's \"longevity\" programme, through a shell company", secrecy: 0.5 }, needs: "vampire-material",
    gives: "Opens the study of their weapons, their scent and their blood.",
    description: "What they are, under the knife: blood chemistry, the torpor, what fire and sunlight actually do.",
    result: "We understand the enemy's body. New lines of research are open.",
  },
  {
    id: "uv-weaponry", kind: "research", name: "Ultraviolet weaponry", points: 150, cost: 0, requires: ["vampire-physiology"], trade: { buyer: "a defence contractor's directed-energy group, through a consultancy", secrecy: 0.3 },
    gives: "Lets the workshops make UV munitions, and sterilisers to sell.",
    description: "Which wavelengths burn, at what range, and how to put them in a magazine.",
    result: "Our workshops can now make UV munitions.",
  },
  {
    id: "pheromones", kind: "research", name: "Pheromone resistance", points: 150, cost: 0, requires: ["vampire-physiology"], trade: { buyer: "a contract lab doing sedation research for a pharmaceutical company", secrecy: 0.4 },
    gives: "Vampires land fewer blows on our agents.",
    description: "The scent that makes victims still. Blockers, training, and a nasal spray that tastes of church incense.",
    result: "Vampires now land fewer blows on our agents.",
  },
  {
    id: "haematology", kind: "research", name: "Haematology", points: 180, cost: 0, requires: ["vampire-physiology"], trade: { buyer: "pharmaceutical companies, through cutouts: the anticoagulant data alone is worth a fortune", secrecy: 0.5 },
    gives: "Every agent, and every recruit, gains 5 vitality.",
    description: "What their blood does to ours. Turned the right way, it makes a body harder to break.",
    result: "Every agent gains 5 vitality, and so will every recruit.",
  },
  {
    id: "interrogate-thrall", kind: "research", name: "Interrogate a thrall", points: 60, cost: 0, requires: [], needs: "thrall-captive", repeatable: true,
    gives: "Intel on the thrall's bloodline.",
    description: "Patient questioning of a captive thrall: names, addresses, who they bring blood to.",
    result: "The thrall has told us what it knows.",
  },
  {
    id: "interrogate-vampire", kind: "research", name: "Interrogate a vampire", points: 150, cost: 0, requires: [], needs: "vampire-captive", repeatable: true,
    gives: "A great deal of intel on the vampire's bloodline.",
    description: "Weeks in a cell with no blood, a priest and a sunlamp. It will talk, eventually.",
    result: "The vampire has broken. Its bloodline's secrets are ours.",
  },
  // ----- Engineering -----
  {
    id: "ceramic-plate", kind: "engineering", name: "Ceramic plate", skills: { ballistics: 1 }, points: 150, cost: 350_000, requires: ["composite-armour"],
    gives: "Plainclothes and tactical kit stop more damage.",
    description: "Refit every agent's vest and tactical plate with composite inserts.",
    result: "Plainclothes and tactical kit now stop more damage.",
  },
  {
    id: "uv-munitions", kind: "engineering", name: "UV munitions", skills: { ballistics: 0.5, chemistry: 0.5 }, points: 150, cost: 300_000, requires: ["uv-weaponry"],
    gives: "Armed teams do far more damage to vampires.",
    description: "UV-flash rounds and lamps for every armed team.",
    result: "Armed teams now do far more damage to vampires.",
  },
  {
    id: "station-retrofit", kind: "engineering", name: "Station retrofit", skills: { electronics: 1 }, points: 120, cost: 250_000, requires: ["signal-analysis"],
    gives: "Every SIGINT station hears more, in its region and next door.",
    description: "New analysis rigs for every SIGINT station, present and future.",
    result: "SIGINT stations now hear more, in their own region and next door.",
  },
  {
    id: "build-helicopter", kind: "engineering", name: "Build a helicopter", skills: { avionics: 0.6, electronics: 0.4 }, points: 200, cost: 450_000, requires: [], needs: "free-hangar", repeatable: true,
    gives: "A helicopter, at half the price of buying one.",
    description: "Assemble and fit out a helicopter in our own workshops: half the price of buying one.",
    result: "A new helicopter is ready in its hangar.",
  },
  // ----- Goods, made in quantity into stores (sold, if anyone thinks to, on the dark web: sim/market.ts) -----
  {
    id: "make-plasma", kind: "engineering", name: "Synthetic plasma", skills: { chemistry: 1 }, points: 45, cost: 60_000, requires: ["haematology"], repeatable: true, product: "plasma",
    gives: "Synthetic plasma, a batch at a time, into stores.",
    description: "A clotting, oxygen-carrying plasma built on what their blood taught us.",
    result: "The synthetic plasma is made and in stores.",
  },
  {
    id: "make-blockers", kind: "engineering", name: "Pheromone blockers", skills: { chemistry: 1 }, points: 40, cost: 45_000, requires: ["pheromones"], repeatable: true, product: "blockers",
    gives: "Pheromone blockers, a batch at a time, into stores.",
    description: "Our nasal spray, without the incense, for police who keep finding victims who didn't run.",
    result: "The pheromone blockers are made and in stores.",
  },
  {
    id: "make-sterilisers", kind: "engineering", name: "UV sterilisers", skills: { electronics: 1 }, points: 30, cost: 35_000, requires: ["uv-weaponry"], repeatable: true, product: "sterilisers",
    gives: "UV sterilisers, a batch at a time, into stores.",
    description: "Our munitions research, turned into lamps that clean an operating theatre in a minute.",
    result: "The UV sterilisers are made and in stores.",
  },
  {
    id: "make-inserts", kind: "engineering", name: "Ceramic inserts", skills: { ballistics: 1 }, points: 25, cost: 25_000, requires: ["composite-armour"], repeatable: true, product: "inserts",
    gives: "Ceramic inserts, a batch at a time, into stores.",
    description: "Body-armour plates on the pattern of our own.",
    result: "The ceramic inserts are made and in stores.",
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
  /** Intel from interrogations. */
  thrallIntel: 4,
  vampireIntel: 10,
};

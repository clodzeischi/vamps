// The research and engineering tree. Research costs scientist-days; engineering
// costs engineer-days plus materials, paid when the job starts. Effects are
// applied in sim/research.ts (look for the project id).

export type ProjectKind = "research" | "engineering";
/** Material a project needs on hand before it can start. */
export type Need = "vampire-material" | "thrall-captive" | "vampire-captive" | "free-hangar";

export interface ProjectDef {
  id: string;
  kind: ProjectKind;
  name: string;
  description: string;
  /** Shown when it completes. */
  result: string;
  /** Staff-days of work. */
  points: number;
  /** Materials, paid at the start (engineering). */
  cost: number;
  /** Research that must be done first. */
  requires: string[];
  needs?: Need;
  /** Can be done again (interrogations, building a helicopter). */
  repeatable?: boolean;
}

export const PROJECTS: ProjectDef[] = [
  // ----- Research -----
  {
    id: "field-medicine", kind: "research", name: "Field medicine", points: 60, cost: 0, requires: [],
    description: "Trauma care for wounds no hospital should see: bites, blood loss, the fevers that follow.",
    result: "Wounded agents now heal half as fast again.",
  },
  {
    id: "composite-armour", kind: "research", name: "Composite armour", points: 100, cost: 0, requires: [],
    description: "Ceramic and aramid layers light enough to wear under a coat, stiff enough to turn a claw.",
    result: "Our workshops can now make ceramic plate.",
  },
  {
    id: "signal-analysis", kind: "research", name: "Signal analysis", points: 90, cost: 0, requires: [],
    description: "Pattern-matching across phone metadata, payments and CCTV: what a bloodline's logistics look like from the outside.",
    result: "Our workshops can now retrofit the SIGINT stations.",
  },
  {
    id: "vampire-physiology", kind: "research", name: "Vampire physiology", points: 120, cost: 0, requires: [], needs: "vampire-material",
    description: "What they are, under the knife: blood chemistry, the torpor, what fire and sunlight actually do.",
    result: "We understand the enemy's body. New lines of research are open.",
  },
  {
    id: "uv-weaponry", kind: "research", name: "Ultraviolet weaponry", points: 150, cost: 0, requires: ["vampire-physiology"],
    description: "Which wavelengths burn, at what range, and how to put them in a magazine.",
    result: "Our workshops can now make UV munitions.",
  },
  {
    id: "pheromones", kind: "research", name: "Pheromone resistance", points: 150, cost: 0, requires: ["vampire-physiology"],
    description: "The scent that makes victims still. Blockers, training, and a nasal spray that tastes of church incense.",
    result: "Vampires now land fewer blows on our agents.",
  },
  {
    id: "haematology", kind: "research", name: "Haematology", points: 180, cost: 0, requires: ["vampire-physiology"],
    description: "What their blood does to ours. Turned the right way, it makes a body harder to break.",
    result: "Every agent gains 5 vitality, and so will every recruit.",
  },
  {
    id: "interrogate-thrall", kind: "research", name: "Interrogate a thrall", points: 60, cost: 0, requires: [], needs: "thrall-captive", repeatable: true,
    description: "Patient questioning of a captive thrall: names, addresses, who they bring blood to.",
    result: "The thrall has told us what it knows.",
  },
  {
    id: "interrogate-vampire", kind: "research", name: "Interrogate a vampire", points: 150, cost: 0, requires: [], needs: "vampire-captive", repeatable: true,
    description: "Weeks in a cell with no blood, a priest and a sunlamp. It will talk, eventually.",
    result: "The vampire has broken. Its bloodline's secrets are ours.",
  },
  // ----- Engineering -----
  {
    id: "ceramic-plate", kind: "engineering", name: "Ceramic plate", points: 150, cost: 350_000, requires: ["composite-armour"],
    description: "Refit every agent's vest and tactical plate with composite inserts.",
    result: "Plainclothes and tactical kit now stop more damage.",
  },
  {
    id: "uv-munitions", kind: "engineering", name: "UV munitions", points: 150, cost: 300_000, requires: ["uv-weaponry"],
    description: "UV-flash rounds and lamps for every armed team.",
    result: "Armed teams now do far more damage to vampires.",
  },
  {
    id: "station-retrofit", kind: "engineering", name: "Station retrofit", points: 120, cost: 250_000, requires: ["signal-analysis"],
    description: "New analysis rigs for every SIGINT station, present and future.",
    result: "SIGINT stations now hear more, in their own region and next door.",
  },
  {
    id: "build-helicopter", kind: "engineering", name: "Build a helicopter", points: 200, cost: 450_000, requires: [], needs: "free-hangar", repeatable: true,
    description: "Assemble and fit out a helicopter in our own workshops: half the price of buying one.",
    result: "A new helicopter is ready in its hangar.",
  },
];

const byId = new Map(PROJECTS.map((p) => [p.id, p]));
export const projectById = (id: string) => byId.get(id);
export const isProjectId = (id: unknown): id is string => typeof id === "string" && byId.has(id);

/** Effect sizes, kept here so they're easy to tune. */
export const RESEARCH_EFFECTS = {
  /** Field medicine: hp healed per day (from 2). */
  healPerDay: 3,
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

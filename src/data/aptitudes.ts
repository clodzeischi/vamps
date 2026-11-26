// Every person's four aptitudes, by role: operators (the Order's agents: what
// a mission or a covert job tests), scientists, engineers and analysts (what a
// project or the intelligence section asks of them). docs/design/base.md,
// "Scientists and engineers"; analysts: docs/design/intelligence.md.

export type OperatorAptitude = "combat" | "tradecraft" | "insight" | "faith";
type EngineerAptitude = "ballistics" | "avionics" | "electronics" | "chemistry";
type ScienceAptitude = "biology" | "psychology" | "physics" | "humanities";
export type AnalystAptitude = "osint" | "humint" | "sigint" | "ci";
export type Aptitude = OperatorAptitude | EngineerAptitude | ScienceAptitude | AnalystAptitude;
/** A person's aptitudes: the four of their role. */
export type Aptitudes = Partial<Record<Aptitude, number>>;
/** What a project asks of the people on it: weights over their role's aptitudes, adding up to 1. */
export type Requirement = Partial<Record<Aptitude, number>>;
export type StaffRole = "scientist" | "engineer" | "analyst";
/** What a person does for the Order: an operator (an agent, in the field), or lay staff. */
export type Role = "operator" | StaffRole;
export const ROLES: Role[] = ["operator", "scientist", "engineer", "analyst"];

interface AptitudeDef {
  id: Aptitude;
  name: string;
  short: string;
  covers: string;
}

export const APTITUDES: Record<Role, AptitudeDef[]> = {
  operator: [
    { id: "combat", name: "Combat", short: "CMB", covers: "Firearms, blades and close quarters." },
    {
      id: "tradecraft",
      name: "Tradecraft",
      short: "TRD",
      covers: "Surveillance, cover, moving unseen.",
    },
    {
      id: "insight",
      name: "Insight",
      short: "INS",
      covers: "Reading people: interrogation, sources, spotting a lie.",
    },
    {
      id: "faith",
      name: "Faith",
      short: "FTH",
      covers: "Nerve, and resistance to a vampire's pheromones.",
    },
  ],
  scientist: [
    {
      id: "biology",
      name: "Biology",
      short: "BIO",
      covers: "physiology, blood, the virus, autopsies and biopsies, medicine",
    },
    {
      id: "psychology",
      name: "Psychology",
      short: "PSY",
      covers: "the mind: domination, thralls, faith under pressure",
    },
    {
      id: "physics",
      name: "Physics",
      short: "PHY",
      covers: "light and UV, materials, chemistry, signals hardware",
    },
    {
      id: "humanities",
      name: "Humanities",
      short: "HUM",
      covers: "archives, history, languages, theology, provenance",
    },
  ],
  engineer: [
    { id: "ballistics", name: "Ballistics", short: "BAL", covers: "weapons, ammunition, armour" },
    { id: "avionics", name: "Avionics", short: "AVI", covers: "aircraft" },
    {
      id: "electronics",
      name: "Electronics",
      short: "ELE",
      covers: "drones, optics, sensors, SIGINT equipment",
    },
    { id: "chemistry", name: "Chemistry", short: "CHE", covers: "medical kit, vampire chemistry" },
  ],
  analyst: [
    {
      id: "osint",
      name: "OSINT",
      short: "OSI",
      covers: "open sources: the press, registries, social media; works anywhere",
    },
    {
      id: "humint",
      name: "HUMINT",
      short: "HUM",
      covers: "people: sources, debriefs, the police reports",
    },
    {
      id: "sigint",
      name: "SIGINT",
      short: "SIG",
      covers: "traffic: phones, networks, what the stations pick up",
    },
    {
      id: "ci",
      name: "CI",
      short: "CI",
      covers: "counter-intelligence: is it true? weighs the evidence",
    },
  ],
};
export const aptitudeIds = (role: Role): Aptitude[] => APTITUDES[role].map((a) => a.id);
export const OPERATOR_APTITUDES = APTITUDES.operator.map((a) => a.id as OperatorAptitude);

/** Everyone's aptitudes roll in this range when they're put forward. */
export const APTITUDE_ROLL: [number, number] = [40, 60];
/** No duds and no prodigies: a candidate with this many aptitudes in the bottom (or top) quarter of the range is rolled again. */
export const APTITUDE_EXTREME_BAND = 0.25;
export const APTITUDE_EXTREME_LIMIT = 3;

/** The middle: someone here works at the base rate, a lead here multiplies by 1. */
export const APTITUDE_MIDDLE = 50;
/** Aptitudes grow with use, up to this. */
export const APTITUDE_CAP = 100;
/** Growth with use: +1 per `fastDays` of full use up to `fastUntil`, then +1 per `slowDays`. */
export const APTITUDE_GROWTH = { fastUntil: 75, fastDays: 15, slowDays: 45 };

/** Points of work a day from a scientist or engineer at the middle. */
export const POINTS_PER_DAY = 1.5;

/** Engineering materials wasted: ×(1 − (team skill − 50) × perPoint), clamped. A team at 100 uses three quarters. */
export const WASTE = { perPoint: 0.005, min: 0.75, max: 1.25 };

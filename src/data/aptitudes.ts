// Scientists' and engineers' aptitudes, and what a project asks of them
// (docs/design/base.md, "Scientists and engineers").

export type EngineerAptitude = "ballistics" | "avionics" | "electronics" | "chemistry";
export type ScienceAptitude = "biology" | "psychology" | "physics" | "humanities";
export type Aptitude = EngineerAptitude | ScienceAptitude;
/** A person's aptitudes: the four of their role. */
export type Aptitudes = Partial<Record<Aptitude, number>>;
/** What a project asks of the people on it: weights over their role's aptitudes, adding up to 1. */
export type Requirement = Partial<Record<Aptitude, number>>;
export type StaffRole = "scientist" | "engineer";

export interface AptitudeDef { id: Aptitude; name: string; short: string; covers: string }

export const APTITUDES: Record<StaffRole, AptitudeDef[]> = {
  scientist: [
    { id: "biology", name: "Biology", short: "BIO", covers: "physiology, blood, the virus, autopsies and biopsies, medicine" },
    { id: "psychology", name: "Psychology", short: "PSY", covers: "the mind: domination, thralls, faith under pressure" },
    { id: "physics", name: "Physics", short: "PHY", covers: "light and UV, materials, chemistry, signals hardware" },
    { id: "humanities", name: "Humanities", short: "HUM", covers: "archives, history, languages, theology, provenance" },
  ],
  engineer: [
    { id: "ballistics", name: "Ballistics", short: "BAL", covers: "weapons, ammunition, armour" },
    { id: "avionics", name: "Avionics", short: "AVI", covers: "aircraft" },
    { id: "electronics", name: "Electronics", short: "ELE", covers: "drones, optics, sensors, SIGINT equipment" },
    { id: "chemistry", name: "Chemistry", short: "CHE", covers: "medical kit, vampire chemistry" },
  ],
};
export const aptitudeIds = (role: StaffRole): Aptitude[] => APTITUDES[role].map((a) => a.id);

/** A new hire's aptitudes roll in this range (a junior is about 55). */
export const APTITUDE_ROLL: [number, number] = [35, 75];
/** As with operators: a candidate with this many aptitudes in the bottom (or top) quarter is rolled again. */
export const APTITUDE_EXTREME_BAND = 0.25;
export const APTITUDE_EXTREME_LIMIT = 3;

/** The middle: someone here works at the base rate, a lead here multiplies by 1. */
export const APTITUDE_MIDDLE = 50;
export const APTITUDE_CAP = 100;
/** Growth with use: +1 per `fastDays` of full use up to `fastUntil`, then +1 per `slowDays`. */
export const APTITUDE_GROWTH = { fastUntil: 75, fastDays: 15, slowDays: 45 };

/** Points of work a day from a scientist or engineer at the middle. */
export const POINTS_PER_DAY = 1.5;

/** Engineering materials wasted: ×(1 − (team skill − 50) × perPoint), clamped. A team at 100 uses three quarters. */
export const WASTE = { perPoint: 0.005, min: 0.75, max: 1.25 };

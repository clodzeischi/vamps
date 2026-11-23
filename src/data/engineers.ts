// Engineers' aptitudes, and what an engineering job asks of them
// (docs/design/base.md, "Engineers").

export type Aptitude = "ballistics" | "avionics" | "electronics" | "chemistry";
export type Aptitudes = Record<Aptitude, number>;
/** What a job asks of the engineers: weights over the aptitudes, adding up to 1. */
export type Requirement = Partial<Record<Aptitude, number>>;

export const APTITUDES: { id: Aptitude; name: string; short: string; covers: string }[] = [
  { id: "ballistics", name: "Ballistics", short: "BAL", covers: "weapons, ammunition, armour" },
  { id: "avionics", name: "Avionics", short: "AVI", covers: "aircraft" },
  { id: "electronics", name: "Electronics", short: "ELE", covers: "drones, optics, sensors, SIGINT equipment" },
  { id: "chemistry", name: "Chemistry", short: "CHE", covers: "medical kit, vampire chemistry" },
];
export const APTITUDE_IDS: Aptitude[] = APTITUDES.map((a) => a.id);

/** A new engineer's aptitudes roll in this range (a junior is about 55). */
export const APTITUDE_ROLL: [number, number] = [35, 75];
/** As with operators: a candidate with this many aptitudes in the bottom (or top) quarter is rolled again. */
export const APTITUDE_EXTREME_BAND = 0.25;
export const APTITUDE_EXTREME_LIMIT = 3;

/** The middle: an engineer here works at the base rate, a lead here multiplies by 1. */
export const APTITUDE_MIDDLE = 50;
export const APTITUDE_CAP = 100;
/** Growth with use: +1 per `fastDays` of full use up to `fastUntil`, then +1 per `slowDays`. */
export const APTITUDE_GROWTH = { fastUntil: 75, fastDays: 15, slowDays: 45 };

/** Points of work a day from an engineer at the middle. */
export const ENGINEER_POINTS_PER_DAY = 1.5;

/** Materials wasted: ×(1 − (team skill − 50) × perPoint), clamped. A team at 100 uses three quarters. */
export const WASTE = { perPoint: 0.005, min: 0.75, max: 1.25 };

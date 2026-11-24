import type { StaffRole } from "./aptitudes";
// OPV installations. Running costs are scaled by regional support (sim/economy.ts).
export type InstallationKind = "base" | "sigint" | "fuel";

export interface InstallationDef {
  kind: InstallationKind;
  name: string;
  short: string;
  /** First word of a suggested name: "Base Cairo", "Station Budapest". */
  nameStem: string;
  buildCost: number;
  buildDays: number;
  monthlyCost: number;
  description: string;
}

export const INSTALLATIONS: Record<InstallationKind, InstallationDef> = {
  base: {
    kind: "base",
    name: "Operational Base",
    short: "Base",
    nameStem: "Base",
    buildCost: 3_500_000,
    buildDays: 30,
    monthlyCost: 250_000,
    description: "Houses strike teams and their aircraft, laboratories and archives.",
  },
  sigint: {
    kind: "sigint",
    name: "SIGINT Station",
    short: "SIGINT",
    nameStem: "Station",
    buildCost: 600_000,
    buildDays: 10,
    monthlyCost: 120_000,
    description: "Intercepts digital and analog communications. Generates leads.",
  },
  fuel: {
    kind: "fuel",
    name: "Refuelling Station",
    short: "Fuel",
    nameStem: "Airstrip",
    buildCost: 400_000,
    buildDays: 7,
    monthlyCost: 50_000,
    description: "A quiet airstrip with fuel and a mechanic. Our aircraft can stop to refuel (2 hours) and fly on, reaching further.",
  },
};

/** Operational Base capacity: hangars hold one aircraft each, quarters house agents. */
export const BASE_CAPACITY = {
  startHangars: 2,
  maxHangars: 6,
  hangarCost: 400_000,
  hangarDays: 7,
  startQuarters: 16,
  quartersStep: 8,
  quartersCost: 300_000,
  quartersDays: 7,
};

/** Rooms a base building can hold (3 floors of 8, less the entrance); the grid is the real cap. */
export const ROOM_CAP = 23;
/** Synergy (docs/WEB_PORT.md 3.7b): each room in a line of 3, or in an adjacent pair, of one kind. */
export const SYNERGY = { line: 0.2, pair: 0.1 };

export type BaseUpgradeKind = "hangar" | "quarters" | "lab" | "workshop" | "containment" | "sigint";

/** Facilities built inside an Operational Base. `start` is what Base Padua
 *  begins with (other new bases get `startNew`); each build adds `step`. */
export interface FacilityDef {
  kind: BaseUpgradeKind;
  name: string;
  /** "a hangar", "a laboratory". */
  article: string;
  cost: number;
  days: number;
  start: number;
  startNew: number;
  step: number;
  max: number;
  /** What one step gives, for the build button. */
  gives: string;
  /** Monthly running cost per step built (scaled by support like the base). */
  monthly?: number;
  /** Steps from `atLevel` on need this research (e.g. a SIGINT centre upgrade). */
  research?: { atLevel: number; id: string; name: string };
}

export const FACILITIES: Record<BaseUpgradeKind, FacilityDef> = {
  hangar: { kind: "hangar", name: "Hangars", article: "a hangar", cost: BASE_CAPACITY.hangarCost, days: BASE_CAPACITY.hangarDays, start: BASE_CAPACITY.startHangars, startNew: BASE_CAPACITY.startHangars, step: 1, max: BASE_CAPACITY.maxHangars, gives: "room for one more aircraft" },
  quarters: { kind: "quarters", name: "Quarters", article: "quarters", cost: BASE_CAPACITY.quartersCost, days: BASE_CAPACITY.quartersDays, start: BASE_CAPACITY.startQuarters, startNew: BASE_CAPACITY.startQuarters, step: BASE_CAPACITY.quartersStep, max: ROOM_CAP * BASE_CAPACITY.quartersStep, gives: `${BASE_CAPACITY.quartersStep} more beds` },
  lab: { kind: "lab", name: "Laboratories", article: "a laboratory", cost: 500_000, days: 10, start: 1, startNew: 0, step: 1, max: ROOM_CAP, gives: "room for 10 scientists" },
  workshop: { kind: "workshop", name: "Workshops", article: "a workshop", cost: 500_000, days: 10, start: 1, startNew: 0, step: 1, max: ROOM_CAP, gives: "room for 10 engineers" },
  sigint: { kind: "sigint", name: "SIGINT centre", article: "a SIGINT centre", cost: 600_000, days: 10, start: 0, startNew: 0, step: 1, max: 2, monthly: 100_000,
    gives: "listens to the base's region like a SIGINT station; the second level hears 50% more",
    research: { atLevel: 1, id: "signal-analysis", name: "Signal analysis" } },
  containment: { kind: "containment", name: "Containment", article: "containment", cost: 600_000, days: 14, start: 0, startNew: 0, step: 1, max: ROOM_CAP, gives: "3 cells for captives, $40,000/mo upkeep" },
};
export const BASE_UPGRADES = Object.keys(FACILITIES) as BaseUpgradeKind[];

/** Lay staff: vetted for a fee (background checks), then paid a monthly salary.
 *  Analysts need only a bed (no facility): the section works from anywhere. */
export type { StaffRole };
export const STAFF_KINDS: StaffRole[] = ["scientist", "engineer", "analyst"];
/** Share of women among lay candidates (operators: SISTER_SHARE). */
export const LAY_FEMALE_SHARE = 0.45;
export const STAFF: Record<StaffRole, { name: string; plural: string; hire: number; salary: number; facility: BaseUpgradeKind | null; perFacility: number; start: number }> = {
  scientist: { name: "Scientist", plural: "Scientists", hire: 20_000, salary: 20_000, facility: "lab", perFacility: 10, start: 2 },
  engineer: { name: "Engineer", plural: "Engineers", hire: 20_000, salary: 20_000, facility: "workshop", perFacility: 10, start: 2 },
  analyst: { name: "Analyst", plural: "Analysts", hire: 20_000, salary: 20_000, facility: null, perFacility: 0, start: 2 },
};
/** Scientists (and engineers) looking for work each month, Order-wide. */
export const STAFF_CANDIDATES_PER_MONTH = 6;
/** SIGINT centre: share of a SIGINT station's rate, per level built. */
export const SIGINT_CENTRE_RATE = [0, 1, 1.5];
/** Cells per containment facility. */
export const CELLS_PER_CONTAINMENT = 3;
/** Guards, food and medical care kept ready, per containment facility per month, full or empty. */
export const CONTAINMENT_UPKEEP = 40_000;

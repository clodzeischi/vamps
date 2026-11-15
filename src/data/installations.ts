// OPV installations. Running costs are scaled by regional support (sim/economy.ts).
export type InstallationKind = "base" | "sigint";

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
    buildDays: 45,
    monthlyCost: 500_000,
    description: "Houses strike teams and their aircraft, laboratories and archives. Teams deploy from here.",
  },
  sigint: {
    kind: "sigint",
    name: "SIGINT Station",
    short: "SIGINT",
    nameStem: "Station",
    buildCost: 600_000,
    buildDays: 14,
    monthlyCost: 120_000,
    description: "Intercepts phones, banking and CCTV across the whole region. Vampire activity here becomes leads.",
  },
};

/** Operational Base capacity: hangars hold one aircraft each, quarters house agents. */
export const BASE_CAPACITY = {
  startHangars: 2,
  maxHangars: 6,
  hangarCost: 400_000,
  hangarDays: 10,
  startQuarters: 12,
  quartersStep: 6,
  maxQuarters: 36,
  quartersCost: 300_000,
  quartersDays: 10,
};

export type BaseUpgradeKind = "hangar" | "quarters" | "lab" | "workshop" | "containment";

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
}

export const FACILITIES: Record<BaseUpgradeKind, FacilityDef> = {
  hangar: { kind: "hangar", name: "Hangars", article: "a hangar", cost: BASE_CAPACITY.hangarCost, days: BASE_CAPACITY.hangarDays, start: BASE_CAPACITY.startHangars, startNew: BASE_CAPACITY.startHangars, step: 1, max: BASE_CAPACITY.maxHangars, gives: "room for one more aircraft" },
  quarters: { kind: "quarters", name: "Quarters", article: "quarters", cost: BASE_CAPACITY.quartersCost, days: BASE_CAPACITY.quartersDays, start: BASE_CAPACITY.startQuarters, startNew: BASE_CAPACITY.startQuarters, step: BASE_CAPACITY.quartersStep, max: BASE_CAPACITY.maxQuarters, gives: `${BASE_CAPACITY.quartersStep} more agents` },
  lab: { kind: "lab", name: "Laboratories", article: "a laboratory", cost: 500_000, days: 15, start: 1, startNew: 0, step: 1, max: 3, gives: "room for 10 scientists" },
  workshop: { kind: "workshop", name: "Workshops", article: "a workshop", cost: 500_000, days: 15, start: 1, startNew: 0, step: 1, max: 3, gives: "room for 10 engineers" },
  containment: { kind: "containment", name: "Containment", article: "containment", cost: 600_000, days: 20, start: 0, startNew: 0, step: 1, max: 2, gives: "3 cells for captives, $40,000/mo upkeep" },
};
export const BASE_UPGRADES = Object.keys(FACILITIES) as BaseUpgradeKind[];

/** Lay staff: hired for a fee, paid a monthly salary. */
export type StaffKind = "scientist" | "engineer";
export const STAFF: Record<StaffKind, { name: string; plural: string; hire: number; salary: number; facility: BaseUpgradeKind; perFacility: number; start: number }> = {
  scientist: { name: "Scientist", plural: "Scientists", hire: 40_000, salary: 20_000, facility: "lab", perFacility: 10, start: 4 },
  engineer: { name: "Engineer", plural: "Engineers", hire: 40_000, salary: 20_000, facility: "workshop", perFacility: 10, start: 4 },
};
/** Cells per containment facility. */
export const CELLS_PER_CONTAINMENT = 3;
/** Guards, food and medical care kept ready, per containment facility per month, full or empty. */
export const CONTAINMENT_UPKEEP = 40_000;

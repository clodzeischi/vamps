import type { StaffRole } from "./aptitudes";
// OPV installations. Running costs are scaled by regional support (sim/economy/economy.ts).
export type InstallationKind = "base" | "sigint" | "fuel";

interface InstallationDef {
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
    buildCost: 1_500_000,
    buildDays: 14,
    monthlyCost: 150_000,
    description: "A clandestine base for the Order's aircraft, staff and operations. Can be upgraded with a variety of facilities.",
  },
  sigint: {
    kind: "sigint",
    name: "SIGINT Station",
    short: "SIGINT",
    nameStem: "Station",
    buildCost: 300_000,
    buildDays: 6,
    monthlyCost: 80_000,
    description: "Intercepts digital and analog communications. Supports the intelligence efforts.",
  },
  fuel: {
    kind: "fuel",
    name: "Refuelling Station",
    short: "Fuel",
    nameStem: "Airstrip",
    buildCost: 200_000,
    buildDays: 5,
    monthlyCost: 30_000,
    description: "A discrete airstrip with fuel and a mechanic. Extends the strike range of our aircraft.",
  },
};

/** Rooms a base building can hold (3 floors of 8, less the entrance); the grid is the real cap. */
const ROOM_CAP = 23;
/** Synergy (docs/design/base.md): each room in a line of 3, or in an adjacent pair, of one kind. */
export const SYNERGY = { line: 0.2, pair: 0.1 };

export type BaseUpgradeKind = "hangar" | "quarters" | "lab" | "workshop" | "containment" | "sigint" | "storage" | "fusion";

/** Facilities built at an Operational Base: everything about each is here, and the rest of the
 *  game reads it from here. `start` is what Base Padua begins with (other new bases get
 *  `startNew`); each build adds `step`. */
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
  /** Where Padua's room stands (floor −1 to 1, slot 0–7 clockwise from the front left); otherwise
   *  where synergy puts it. */
  startAt?: { floor: number; slot: number };
  /** Who or what one room holds: staff (lab, workshop, fusion centre) or captives (containment). */
  holds?: number;
  /** Monthly running cost per step built, folded into the base's (scaled by support). */
  monthly?: number;
  /** Monthly upkeep per room, paid flat, full or empty (containment: guards, food, medical care). */
  upkeep?: number;
  /** SIGINT centre: share of a SIGINT station's rate at each level (0 = not built). */
  hears?: number[];
  /** Steps from `atLevel` on need this research (e.g. a SIGINT centre upgrade). */
  research?: { atLevel: number; id: string; name: string };
  /** What one step gives, for the build button: from the numbers above. */
  gives: (f: FacilityDef) => string;
}

const pct = (k: number) => `${Math.round(k * 100)}%`;
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export const FACILITIES: Record<BaseUpgradeKind, FacilityDef> = {
  hangar: { kind: "hangar", name: "Hangars", article: "a hangar", cost: 400_000, days: 4, start: 2, startNew: 2, step: 1, max: 6,
    gives: () => "room for one more aircraft" },
  quarters: { kind: "quarters", name: "Quarters", article: "quarters", cost: 300_000, days: 7, start: 16, startNew: 16, step: 8, max: ROOM_CAP * 8,
    gives: (f) => `${f.step} more beds` },
  lab: { kind: "lab", name: "Laboratories", article: "a laboratory", cost: 500_000, days: 10, start: 1, startNew: 0, step: 1, max: ROOM_CAP, holds: 10,
    gives: (f) => `room for ${f.holds} scientists` },
  workshop: { kind: "workshop", name: "Workshops", article: "a workshop", cost: 500_000, days: 10, start: 1, startNew: 0, step: 1, max: ROOM_CAP, holds: 10,
    gives: (f) => `room for ${f.holds} engineers` },
  sigint: { kind: "sigint", name: "SIGINT centre", article: "a SIGINT centre", cost: 600_000, days: 10, start: 1, startNew: 0, step: 1, max: 2, monthly: 100_000,
    startAt: { floor: 1, slot: 2 }, hears: [0, 1, 1.5],
    gives: (f) => `listens to the base's region like a SIGINT station; the second level hears ${pct(f.hears![2]! / f.hears![1]! - 1)} more`,
    research: { atLevel: 1, id: "signal-analysis", name: "Signal analysis" } },
  storage: { kind: "storage", name: "Storage", article: "storage", cost: 200_000, days: 7, start: 1, startNew: 0, step: 1, max: 1,
    startAt: { floor: -1, slot: 6 },
    gives: () => "holds the base's armoury and stores: equipment can be shipped here" },
  fusion: { kind: "fusion", name: "Fusion centre", article: "a fusion centre", cost: 500_000, days: 10, start: 1, startNew: 0, step: 1, max: ROOM_CAP, holds: 10,
    startAt: { floor: -1, slot: 4 },
    gives: (f) => `room for ${f.holds} analysts` },
  containment: { kind: "containment", name: "Containment", article: "containment", cost: 600_000, days: 14, start: 0, startNew: 0, step: 1, max: ROOM_CAP, holds: 3, upkeep: 40_000,
    gives: (f) => `${f.holds} cells for captives, ${usd(f.upkeep!)}/mo upkeep` },
};
/** A facility's build-button line, capitalised. */
export const givesOf = (f: FacilityDef) => f.gives(f).replace(/^./, (c) => c.toUpperCase());

/** Lay staff: vetted for a fee (background checks), then paid a monthly salary by their aptitudes
 *  (PAY_AT_MIDDLE, data/agents.ts). Each works in a room of their facility (its `holds`).
 *  Analysts work in a fusion centre, at any base: the section is the Order's. */
export type { StaffRole };
export const STAFF_KINDS: StaffRole[] = ["scientist", "engineer", "analyst"];
/** Share of women among lay candidates (operators: SISTER_SHARE). */
export const LAY_FEMALE_SHARE = 0.45;
export const STAFF: Record<StaffRole, { name: string; plural: string; hire: number; facility: BaseUpgradeKind; start: number }> = {
  scientist: { name: "Scientist", plural: "Scientists", hire: 20_000, facility: "lab", start: 2 },
  engineer: { name: "Engineer", plural: "Engineers", hire: 20_000, facility: "workshop", start: 2 },
  analyst: { name: "Analyst", plural: "Analysts", hire: 20_000, facility: "fusion", start: 2 },
};
/** Scientists (and engineers) looking for work each month, Order-wide. */
export const STAFF_CANDIDATES_PER_MONTH = 6;

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

export type BaseUpgradeKind = "hangar" | "quarters";

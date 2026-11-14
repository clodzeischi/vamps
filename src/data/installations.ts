// OPV installations. Running costs are scaled by regional support (sim/economy.ts).
export type InstallationKind = "base" | "sigint";

export interface InstallationDef {
  kind: InstallationKind;
  name: string;
  short: string;
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
    buildCost: 3_500_000,
    buildDays: 45,
    monthlyCost: 500_000,
    description: "Houses strike teams and their aircraft, laboratories and archives. Teams deploy from here.",
  },
  sigint: {
    kind: "sigint",
    name: "SIGINT Station",
    short: "SIGINT",
    buildCost: 600_000,
    buildDays: 14,
    monthlyCost: 120_000,
    description: "Intercepts phones, banking and CCTV across the whole region. Vampire activity here becomes leads.",
  },
};

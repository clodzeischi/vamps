export type DifficultyId = "novice" | "inquisitor" | "grand";

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  blurb: string;
  startFunds: number;
  /** Monthly grant from the Holy See. */
  vaticanStipend: number;
  /** Multiplies every region's contribution. */
  regionalFunding: number;
  /** Multiplies the bloodlines' media pressure on support. */
  vampirePressure: number;
  /** Multiplies dark web prices. */
  marketPrices: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: "novice", name: "Novice", blurb: "Generous funding, forgiving press, slower bloodlines.", startFunds: 8_000_000, vaticanStipend: 1_300_000, regionalFunding: 1.25, vampirePressure: 0.7, marketPrices: 1.15 },
  { id: "inquisitor", name: "Inquisitor", blurb: "The intended war. Every mistake is noticed.", startFunds: 5_000_000, vaticanStipend: 800_000, regionalFunding: 0.95, vampirePressure: 1.0, marketPrices: 1.0 },
  { id: "grand", name: "Grand Inquisitor", blurb: "Thin purse, hungry press, bloodlines that hunt back.", startFunds: 3_000_000, vaticanStipend: 550_000, regionalFunding: 0.9, vampirePressure: 1.4, marketPrices: 0.85 },
];

export const isDifficultyId = (id: unknown): id is DifficultyId => DIFFICULTIES.some((d) => d.id === id);

export const difficulty = (id: DifficultyId) => DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]!;

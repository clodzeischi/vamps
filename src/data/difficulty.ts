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
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: "novice", name: "Novice", blurb: "Generous funding, forgiving press, slower bloodlines.", startFunds: 8_000_000, vaticanStipend: 1_300_000, regionalFunding: 1.0, vampirePressure: 0.7 },
  { id: "inquisitor", name: "Inquisitor", blurb: "The intended war. Every mistake is noticed.", startFunds: 5_000_000, vaticanStipend: 800_000, regionalFunding: 0.8, vampirePressure: 1.0 },
  { id: "grand", name: "Grand Inquisitor", blurb: "Thin purse, hungry press, bloodlines that hunt back.", startFunds: 3_000_000, vaticanStipend: 550_000, regionalFunding: 0.6, vampirePressure: 1.4 },
];

export const isDifficultyId = (id: unknown): id is DifficultyId => DIFFICULTIES.some((d) => d.id === id);

export const difficulty = (id: DifficultyId) => DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]!;

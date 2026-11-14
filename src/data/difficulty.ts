export type DifficultyId = "novice" | "inquisitor" | "grand";

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  blurb: string;
  startFunds: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: "novice", name: "Novice", blurb: "Generous funding, forgiving press, slower bloodlines.", startFunds: 8_000_000 },
  { id: "inquisitor", name: "Inquisitor", blurb: "The intended war. Every mistake is noticed.", startFunds: 5_000_000 },
  { id: "grand", name: "Grand Inquisitor", blurb: "Thin purse, hungry press, bloodlines that hunt back.", startFunds: 3_000_000 },
];

export const difficulty = (id: DifficultyId) => DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]!;

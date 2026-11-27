// Each house's strain of the virus, rolled at campaign start (docs/design/research.md,
// "The houses' weaknesses"): the light it burns in, two weaknesses, how much silver
// hurts it, and the three rumours its History names (one true).
import type { Rng } from "../sim/core/rng";
import { BLOODLINES } from "./bloodlines";

export type Band = "uvb" | "uva" | "violet";
export const BANDS: Record<Band, { name: string; nm: number }> = {
  uvb: { name: "UVB", nm: 308 },
  uva: { name: "UVA", nm: 365 },
  violet: { name: "Violet", nm: 405 },
};

export type WeaknessId =
  | "photic"
  | "cold-torpor"
  | "circadian"
  | "acoustic"
  | "one-compound"
  | "thin-skin"
  | "slow-clotting";

export interface WeaknessDef {
  name: string;
  /** What it does in battle. */
  effect: string;
  /** Folklore's garbled word for it. */
  rumour: string;
  /** Whether the battle plays it yet; the rest wait for their gear. */
  built: boolean;
}

export const WEAKNESSES: Record<WeaknessId, WeaknessDef> = {
  photic: {
    name: "Photic seizure",
    effect: "A strobe stuns them for a turn.",
    rumour: "“Cannot abide the dancing lamp.”",
    built: false,
  },
  "cold-torpor": {
    name: "Cold torpor",
    effect: "Torpor lasts two turns longer.",
    rumour: "“Sleeps through the winter.”",
    built: true,
  },
  circadian: {
    name: "Circadian lock",
    effect: "By day they sleep: gunfire doesn't wake them for the first two turns.",
    rumour: "“The dead sleep at noon.”",
    built: true,
  },
  acoustic: {
    name: "Acoustic",
    effect: "A flashbang stuns them for two turns.",
    rumour: "“Church bells drive them off.”",
    built: false,
  },
  "one-compound": {
    name: "One compound",
    effect: "With blockers researched, their domination fails.",
    rumour: "“Incense breaks their hold.”",
    built: false,
  },
  "thin-skin": {
    name: "Thin skin",
    effect: "Fire does half as much again.",
    rumour: "“The fire takes them like straw.”",
    built: true,
  },
  "slow-clotting": {
    name: "Slow clotting",
    effect: "A haemolytic hit costs them 30% of their TU, not 20%.",
    rumour: "“They bleed like the living.”",
    built: false,
  },
};

export const WEAKNESS_IDS = Object.keys(WEAKNESSES) as WeaknessId[];

export interface Strain {
  band: Band;
  weaknesses: [WeaknessId, WeaknessId];
  /** Multiplies silver rounds' damage to its vampires (×0.8 to ×1.5). */
  silver: number;
  /** The three rumours its History names: one of its weaknesses and two that aren't, shuffled. */
  rumours: [WeaknessId, WeaknessId, WeaknessId];
}

/** Silver frangible rounds: worse against people, better against vampires (times the house's roll). */
export const SILVER = { human: 0.7, vampire: 1.25 };

export const SILVER_RANGE = [0.8, 1.5] as const;
/** Huaca's silver is rolled from the top half: the silver-lined coffins of its chronicle. */
const SILVER_FROM_TOP: Record<string, boolean> = { huaca: true };

/** A strain for every house; no two houses share both weaknesses. */
export function rollStrains(r: Rng): Record<string, Strain> {
  const out: Record<string, Strain> = {};
  const pairs = new Set<string>();
  const bands = Object.keys(BANDS) as Band[];
  for (const b of BLOODLINES) {
    let pair: [WeaknessId, WeaknessId];
    do {
      const [x, y] = r.shuffle(WEAKNESS_IDS);
      pair = [x!, y!];
    } while (pairs.has([...pair].sort().join()));
    pairs.add([...pair].sort().join());
    const [lo, hi] = SILVER_RANGE;
    const from = SILVER_FROM_TOP[b.id] ? (lo + hi) / 2 : lo;
    const silver = Math.round(r.real(from, hi) * 20) / 20;
    const false2 = r.shuffle(WEAKNESS_IDS.filter((w) => !pair.includes(w))).slice(0, 2);
    const rumours = r.shuffle([r.pick(pair), ...false2]) as Strain["rumours"];
    out[b.id] = { band: r.pick(bands), weaknesses: pair, silver, rumours };
  }
  return out;
}

/** Silver that a log would remark on: it burns, or it barely marks them. */
export const silverRemarkable = (m: number) => m >= 1.3 || m <= 0.9;

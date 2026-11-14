// Seeded random numbers. The generator's state lives in GameState.rng and is
// saved with the campaign, so loading a save continues the same sequence.
import type { GameState } from "./state";

/** mulberry32: one 32-bit word of state, plenty for a strategy game. */
function next(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  real(lo: number, hi: number): number;
  /** Integer in [lo, hi], inclusive. */
  int(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export function rng(state: Pick<GameState, "rng">): Rng {
  return {
    next: () => next(state),
    real: (lo, hi) => lo + (hi - lo) * next(state),
    int: (lo, hi) => (hi <= lo ? lo : lo + Math.floor(next(state) * (hi - lo + 1))),
    chance: (p) => next(state) < p,
    pick: (items) => {
      if (!items.length) throw new Error("pick from an empty list");
      return items[Math.floor(next(state) * items.length)]!;
    },
  };
}

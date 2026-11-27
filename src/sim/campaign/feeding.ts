// How well each house eats (docs/design/research.md, "Feeding: feral and refined"). A level from 0 to
// 100 that drifts back to its rest; feeding operations that run their course raise it, and every
// operation we foil lowers it (feeding ones most). A starving house fields ferals: worse at hiding,
// better up close.
import type { GameState } from "../core/state";

export const FEEDING = {
  start: 70,
  /** Where it drifts back to, and the share of the gap closed each day. */
  rest: 70,
  drift: 0.03,
  /** A feeding operation that ran its course. */
  fed: 3,
  /** An operation we stopped: a feeding one, any other. */
  foiledFeeding: 10,
  foiled: 4,
  /** Below these, half its vampires come feral; then all but the elder. */
  half: 40,
  all: 20,
};

export const feedingOf = (s: GameState, house: string): number =>
  s.bloodlines[house]?.feeding ?? FEEDING.start;

export function changeFeeding(s: GameState, house: string, d: number) {
  const st = s.bloodlines[house];
  if (st) st.feeding = Math.max(0, Math.min(100, (st.feeding ?? FEEDING.start) + d));
}

/** Daily: every house drifts back toward its rest. */
export function dailyFeeding(s: GameState) {
  for (const st of Object.values(s.bloodlines)) {
    const f = st.feeding ?? FEEDING.start;
    st.feeding = f + (FEEDING.rest - f) * FEEDING.drift;
  }
}

/** The share of a house's vampires (not its elder) that come feral at this feeding level. */
export const feralShare = (feeding: number) =>
  feeding < FEEDING.all ? 1 : feeding < FEEDING.half ? 0.5 : 0;

/** A house hungry enough to field ferals: its leads are sloppier, so more often real. */
export const fieldsFerals = (s: GameState, house: string) => feralShare(feedingOf(s, house)) > 0;

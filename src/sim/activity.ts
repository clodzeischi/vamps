// Vampire activity as the Order assesses it: a per-region tally of what we
// have seen (leads, true or false; network sites found; the houses' media
// campaigns), fading with a half-life of a month. Never what the houses
// really do: the globe's activity overlay shows our picture, errors and all.
import type { GameState } from "./state";

export const ACTIVITY_HALF_LIFE_DAYS = 30;
const DAILY_FADE = Math.pow(0.5, 1 / ACTIVITY_HALF_LIFE_DAYS);
/** Where the overlay is at its deepest. */
export const ACTIVITY_FULL = 4;

/** Something seen in a region: a lead 1, a site found 1, a lair 2, a media campaign 1. */
export function noteActivity(s: GameState, regionId: string, weight = 1) {
  const r = s.regions[regionId];
  if (r) r.activity = (r.activity ?? 0) + weight;
}

export function dailyActivity(s: GameState) {
  for (const r of Object.values(s.regions)) {
    if (!r.activity) continue;
    r.activity *= DAILY_FADE;
    if (r.activity < 0.02) delete r.activity;
  }
}

/** 0..1 for the overlay. */
export const activityShade = (s: GameState, regionId: string) => Math.min(1, (s.regions[regionId]?.activity ?? 0) / ACTIVITY_FULL);

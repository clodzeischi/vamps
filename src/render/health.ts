// Health colours, shared by the squad cards and the bars over units' heads.

const HEALTH_GOOD = "#8fd39a";
const HEALTH_HURT = "#f0c050";
const HEALTH_BAD = "#e0484a";
/** Enemies' bars are always this red, so a bar says whose side it is at a glance. */
export const HEALTH_ENEMY = "#d8343c";

/** Green above two thirds, amber above one third, red below. */
export function healthColor(hp: number, max: number): string {
  const f = max > 0 ? hp / max : 0;
  return f > 2 / 3 ? HEALTH_GOOD : f > 1 / 3 ? HEALTH_HURT : HEALTH_BAD;
}

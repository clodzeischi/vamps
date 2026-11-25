// The six bloodlines as enemies to destroy. Each is a network we climb to its
// lair (sim/networks.ts). A successful assault on the lair destroys the
// bloodline: its operations stop, its homelands begin to recover, and the
// survivors grow bolder.
import { ELDERS } from "../data/people";
import { AGNES, BLOODLINES, bloodlineById } from "../data/bloodlines";
export { AGNES };
import { changeSupport } from "./economy";
import { addLog, post, type GameState } from "./state";

/** Each bloodline destroyed makes the others this much bolder (more operations). */
export const BOLDNESS_PER_FALLEN = 0.2;
/** Support every homeland region gains when its bloodline falls. */
const LIBERATION_SUPPORT = 0.6;

/** The bloodline whose territory a region is. The lines are territorial: every region is exactly one line's, and none operates outside its own. */
export const ownerOf = (regionId: string): string | undefined => BLOODLINES.find((b) => b.homeRegions.includes(regionId))?.id;
export const isDestroyed = (s: GameState, id: string) => !!s.bloodlines[id]?.destroyedAt;
export const aliveBloodlines = (s: GameState) => BLOODLINES.filter((b) => !isDestroyed(s, b.id));
export const destroyedCount = (s: GameState) => BLOODLINES.length - aliveBloodlines(s).length;
/** Multiplies the surviving bloodlines' activity. */
export const boldness = (s: GameState) => 1 + BOLDNESS_PER_FALLEN * destroyedCount(s);

/** A lair the story keeps out of reach for now: Agnes's, until Act 3 (sim/story.ts). */
export function lairLocked(s: GameState, id: string): boolean {
  return id === AGNES && s.story.act < 3;
}

/** A bloodline that runs no operations for now: Agnes, holding the Vatican hostage in Act 2, needs none. */
export const isDormant = (s: GameState, id: string) => id === AGNES && s.story.act === 2;

export function newBloodlineStates(): GameState["bloodlines"] {
  return Object.fromEntries(BLOODLINES.map((b) => [b.id, { lairId: null, destroyedAt: null }]));
}

/** The lair has fallen: the bloodline is finished. */
export function destroyBloodline(s: GameState, id: string) {
  const b = bloodlineById(id);
  const st = s.bloodlines[id];
  if (!b || !st || st.destroyedAt) return;
  st.destroyedAt = s.time;
  // Its works stop: no more operations, leads go cold, sites empty.
  const ops = new Set(s.operations.filter((o) => o.bloodline === id).map((o) => o.id));
  s.operations = s.operations.filter((o) => !ops.has(o.id));
  s.leads = s.leads.filter((l) => !ops.has(l.opId) || !!l.missionId);
  s.sites = s.sites.filter((x) => x.bloodline !== id || !!x.missionId);
  for (const r of b.homeRegions) changeSupport(s, r, LIBERATION_SUPPORT);
  const left = aliveBloodlines(s).length;
  addLog(s, `${b.name} is destroyed.`, "good");
  const elder = ELDERS[id];
  post(s, {
    kind: "sigil",
    speaker: id,
    title: `${b.name} is destroyed`,
    body: `${elder ? `${elder.name}, ${elder.title.replace(/^The /, "the ")}, is ash` : "Its eldest is ash"}, and the sigil is broken. Across its homelands the feeding stops, the money dries up, and people begin, slowly, to trust again. ${left ? `${left} bloodline${left === 1 ? "" : "s"} remain${left === 1 ? "s" : ""}, and ${left === 1 ? "it has" : "they have"} noticed.` : "None remain."}`,
  });
}

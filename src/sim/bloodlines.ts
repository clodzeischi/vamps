// The six bloodlines as enemies to destroy. Intel on a bloodline (0..100)
// accumulates from missions and interrogations; at 100 its lair is found.
// A successful assault on the lair destroys the bloodline: its operations
// stop, its homelands begin to recover, and the survivors grow bolder.
import { ELDERS } from "../data/people";
import { AGNES, BLOODLINES, type BloodlineDef } from "../data/bloodlines";
export { AGNES };
import { regionById } from "../data/regions";
import { changeSupport } from "./economy";
import { SITE_KINDS } from "./missions";
import { rng } from "./rng";
import { addLog, post, type GameState, type Site } from "./state";

/** Each bloodline destroyed makes the others this much bolder (more operations). */
export const BOLDNESS_PER_FALLEN = 0.2;
/** Support every homeland region gains when its bloodline falls. */
export const LIBERATION_SUPPORT = 0.6;
/** A lair stays put until it's assaulted (far future, JSON-safe). */
const NEVER = 8.64e15;

export const bloodlineDef = (id: string): BloodlineDef | undefined => BLOODLINES.find((b) => b.id === id);
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

/** Where a lair is: fixed by the story, or one of the homeland's great cities. */
function lairPlace(s: GameState, b: BloodlineDef) {
  if (b.lair) return b.lair;
  const r = rng(s);
  const regionId = r.pick(b.homeRegions);
  const region = regionById(regionId)!;
  const city = region.cities.length ? r.pick(region.cities.slice(0, 3)) : { name: region.name, ...region.label };
  return { city: city.name, regionId, lat: city.lat, lon: city.lon };
}

function revealLair(s: GameState, b: BloodlineDef) {
  const place = lairPlace(s, b);
  const site: Site = {
    id: `lair-${b.id}`,
    bloodline: b.id,
    kind: "lair",
    regionId: place.regionId,
    city: place.city,
    pos: { lat: place.lat, lon: place.lon },
    revealedAt: s.time,
    expiresAt: NEVER,
    thralls: SITE_KINDS.lair.thralls,
    vampires: SITE_KINDS.lair.vampires,
    missionId: null,
  };
  s.sites.push(site);
  s.bloodlines[b.id]!.lairId = site.id;
  const elder = ELDERS[b.id];
  post(s, {
    kind: "site",
    speaker: b.id,
    title: `The lair of ${b.name}: ${place.city}`,
    body:
      (elder ? `"${elder.reveal}"\n\n` : "") +
      `Everything we have learned about ${b.name} points to one place: ${place.city}. ${elder ? `${elder.name} sleeps there` : "Its eldest sleeps there"}, under the sigil, guarded by everything the line has. Destroy the lair and the bloodline dies with it. It will not be easy, and it will not move.`,
    regionId: place.regionId,
    pos: site.pos,
    refId: site.id,
  });
}

/** The lair has fallen: the bloodline is finished. */
export function destroyBloodline(s: GameState, id: string) {
  const b = bloodlineDef(id);
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

/** Daily: intel at 100 finds a lair. */
export function dailyBloodlines(s: GameState) {
  for (const b of BLOODLINES) {
    const st = s.bloodlines[b.id];
    if (!st || st.destroyedAt || st.lairId || lairLocked(s, b.id)) continue;
    if ((s.intel[b.id] ?? 0) >= 100) revealLair(s, b);
  }
}

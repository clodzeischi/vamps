// Player commands. Each validates first and returns an error message or null.
import { INSTALLATIONS, type InstallationKind } from "../data/installations";
import { neighboursOf, placesIn, regionById } from "../data/regions";
import { sigintBoost } from "./research";
import { angularDistance } from "./geo";
import { BUILD_MIN_SUPPORT } from "./economy";
import { addLog, isReady, supportLevel, type GameState } from "./state";
import { EUROPE_CLOSED, europeClosed, isEurope } from "./story";
import { DAY, type LatLon } from "./time";

export function buildBlocker(s: GameState, kind: InstallationKind, regionId: string): string | null {
  if (s.gameOver) return "The campaign is over.";
  const region = regionById(regionId);
  const st = s.regions[regionId];
  if (!region || !st) return "No region there.";
  const def = INSTALLATIONS[kind];
  if (europeClosed(s) && isEurope(regionId)) return EUROPE_CLOSED;
  if (s.installations.some((i) => i.regionId === regionId && i.kind === kind))
    return `There is already a ${def.name} in ${region.name}.`;
  if (supportLevel(st.support) < BUILD_MIN_SUPPORT)
    return `${region.name} won't tolerate a new installation (support must be +${BUILD_MIN_SUPPORT} or better).`;
  if (s.funds < def.buildCost) return "Not enough funds.";
  return null;
}

export const MAX_NAME_LENGTH = 32;

/** The named place nearest to `pos` in a region: any town in the gazetteer, its main cities, or a fixed station site (Baikal). */
export function nearestPlace(regionId: string, pos: LatLon): string {
  const region = regionById(regionId);
  if (!region) return "Unknown";
  const places = [...placesIn(regionId), ...region.cities, ...(region.station ? [region.station] : [])];
  if (!places.length) return region.name;
  return places.reduce((best, c) => (angularDistance(c, pos) < angularDistance(best, pos) ? c : best)).name;
}

/** "Station Budapest", "Base Cairo"; a numeral if the name is taken ("Base Cairo II"). */
export function suggestName(s: GameState, kind: InstallationKind, regionId: string, pos: LatLon): string {
  const stem = `${INSTALLATIONS[kind].nameStem} ${nearestPlace(regionId, pos)}`;
  const numerals = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"];
  for (const n of numerals) if (!nameTaken(s, stem + n)) return stem + n;
  return `${stem} ${s.nextId}`;
}

const nameTaken = (s: GameState, name: string, except?: string) =>
  s.installations.some((i) => i.id !== except && i.name.toLowerCase() === name.trim().toLowerCase());

export function nameBlocker(s: GameState, name: string, except?: string): string | null {
  const n = name.trim();
  if (!n) return "Give it a name.";
  if (n.length > MAX_NAME_LENGTH) return `Names can be at most ${MAX_NAME_LENGTH} characters.`;
  if (nameTaken(s, n, except)) return "Another installation already has that name.";
  return null;
}

export function renameInstallation(s: GameState, id: string, name: string): string | null {
  const inst = s.installations.find((i) => i.id === id);
  if (!inst) return "That installation is gone.";
  const why = nameBlocker(s, name, id);
  if (why) return why;
  const old = inst.name;
  inst.name = name.trim();
  if (old !== inst.name) addLog(s, `${old} is renamed ${inst.name}.`);
  return null;
}

export function build(s: GameState, kind: InstallationKind, regionId: string, pos: LatLon, name?: string): string | null {
  const why = buildBlocker(s, kind, regionId);
  if (why) return why;
  const chosen = name ?? suggestName(s, kind, regionId, pos);
  const bad = nameBlocker(s, chosen);
  if (bad) return bad;
  const def = INSTALLATIONS[kind];
  s.funds -= def.buildCost;
  s.installations.push({
    id: `${kind}-${s.nextId++}`, kind, name: chosen.trim(), regionId, pos: { ...pos },
    readyAt: s.time + def.buildDays * DAY, evictionWarned: false,
  });
  addLog(s, `Construction of ${chosen.trim()} begins (${def.buildDays} days).`);
  return null;
}

/** SIGINT listening strength, as a daily detection rate: a station hears its own
 *  region well and its neighbours faintly. Stations add up. */
export const SIGINT_OWN_RATE = 0.5;
export const SIGINT_NEIGHBOUR_RATE = 0.015;

/** Daily detection rate per region, summed over every ready SIGINT station. */
export function sigintRates(s: GameState): Map<string, number> {
  const rates = new Map<string, number>();
  const add = (id: string, v: number) => rates.set(id, (rates.get(id) ?? 0) + v);
  const boost = sigintBoost(s);
  for (const i of s.installations) {
    if (i.kind !== "sigint" || !isReady(s, i)) continue;
    add(i.regionId, SIGINT_OWN_RATE * boost.own);
    for (const n of neighboursOf(i.regionId)) add(n, SIGINT_NEIGHBOUR_RATE * boost.neighbour);
  }
  return rates;
}

/** Chance that a running vampire operation in a region surfaces as a lead today. */
export const detectionChance = (rate: number) => 1 - Math.exp(-rate);

/** Regions with a SIGINT station of their own. */
export function coveredRegions(s: GameState): Set<string> {
  return new Set(s.installations.filter((i) => i.kind === "sigint" && isReady(s, i)).map((i) => i.regionId));
}

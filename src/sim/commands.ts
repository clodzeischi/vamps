// Player commands. Each validates first and returns an error message or null.
import { INSTALLATIONS, type InstallationKind } from "../data/installations";
import { regionById } from "../data/regions";
import { installationName } from "./campaign";
import { BUILD_MIN_SUPPORT } from "./economy";
import { addLog, isReady, supportLevel, type GameState } from "./state";
import { DAY, type LatLon } from "./time";

export function buildBlocker(s: GameState, kind: InstallationKind, regionId: string): string | null {
  if (s.gameOver) return "The campaign is over.";
  const region = regionById(regionId);
  const st = s.regions[regionId];
  if (!region || !st) return "No region there.";
  const def = INSTALLATIONS[kind];
  if (s.installations.some((i) => i.regionId === regionId && i.kind === kind))
    return `There is already a ${def.name} in ${region.name}.`;
  if (supportLevel(st.support) < BUILD_MIN_SUPPORT)
    return `${region.name} won't tolerate a new installation (support must be +${BUILD_MIN_SUPPORT} or better).`;
  if (s.funds < def.buildCost) return "Not enough funds.";
  return null;
}

export function build(s: GameState, kind: InstallationKind, regionId: string, pos: LatLon): string | null {
  const why = buildBlocker(s, kind, regionId);
  if (why) return why;
  const def = INSTALLATIONS[kind];
  const region = regionById(regionId)!;
  const at = kind === "sigint" && region.station ? { lat: region.station.lat, lon: region.station.lon } : pos;
  const name = installationName(kind, regionId, at);
  s.funds -= def.buildCost;
  s.installations.push({
    id: `${kind}-${s.nextId++}`, kind, name, regionId, pos: at,
    readyAt: s.time + def.buildDays * DAY, evictionWarned: false,
  });
  addLog(s, `Construction of ${name} begins (${def.buildDays} days).`);
  return null;
}

export function coveredRegions(s: GameState): Set<string> {
  return new Set(s.installations.filter((i) => i.kind === "sigint" && isReady(s, i)).map((i) => i.regionId));
}

// The Order's own media campaigns: money, spent through Church fronts and
// friendly outlets, that pushes a region's support back up against the
// bloodlines' campaigns. Paid daily; gains shrink as a region comes round.
import { regionById } from "../../data/regions";
import { changeSupport } from "../economy/economy";
import { changeSecrecy } from "./secrecy";
import { addLog, type GameState, type MediaLevel } from "../core/state";

interface MediaLevelDef {
  level: MediaLevel;
  name: string;
  description: string;
  /** $ per month for a region of average weight (funding 500). */
  baseCost: number;
  /** Support per month while the region is far from +5. */
  gain: number;
  /** Secrecy per month (saturation draws attention). */
  secrecy: number;
}

export const MEDIA_LEVELS: MediaLevelDef[] = [
  { level: 1, name: "Quiet", description: "Op-eds, parish bulletins, a sympathetic columnist.", baseCost: 60_000, gain: 0.35, secrecy: 0 },
  { level: 2, name: "Sustained", description: "Documentaries, charity drives, friendly talk shows.", baseCost: 150_000, gain: 0.75, secrecy: 0 },
  { level: 3, name: "Saturation", description: "Television, billboards, influencers. Loud: it costs a little secrecy.", baseCost: 350_000, gain: 1.25, secrecy: -0.6 },
];

export const mediaLevel = (l: MediaLevel) => MEDIA_LEVELS[l - 1]!;
export const isMediaLevel = (v: unknown): v is MediaLevel => v === 1 || v === 2 || v === 3;

/** Monthly cost in a region: bigger, richer media markets cost more. */
export function mediaCost(regionId: string, l: MediaLevel): number {
  const weight = 0.5 + (regionById(regionId)?.funding ?? 500) / 1000;
  return Math.round((mediaLevel(l).baseCost * weight) / 10_000) * 10_000;
}

/** Diminishing returns: full effect up to about 0, little near +5. */
export const mediaEffect = (support: number) => Math.min(1, Math.max(0.15, (5.5 - support) / 5));

export function monthlyMediaCost(s: GameState): number {
  return Object.entries(s.media).reduce((t, [id, l]) => t + mediaCost(id, l), 0);
}

export function setMedia(s: GameState, regionId: string, level: MediaLevel | null): string | null {
  const region = regionById(regionId);
  if (!region) return "No region there.";
  if (s.gameOver) return "The campaign is over.";
  if (level === null) {
    if (s.media[regionId]) addLog(s, `Media campaign in ${region.name} ended.`);
    delete s.media[regionId];
    return null;
  }
  if (s.funds < mediaCost(regionId, level) / 30) return "Not enough funds.";
  s.media[regionId] = level;
  addLog(s, `${mediaLevel(level).name} media campaign in ${region.name}: ${mediaCost(regionId, level).toLocaleString("en-US")} a month.`);
  return null;
}

export function dailyMedia(s: GameState) {
  let noise = 0;
  for (const [id, l] of Object.entries(s.media)) {
    const def = mediaLevel(l);
    const cost = mediaCost(id, l) / 30;
    s.funds -= cost;
    s.mediaSpent += cost;
    const support = s.regions[id]?.support ?? 0;
    changeSupport(s, id, (def.gain / 30) * mediaEffect(support));
    noise += def.secrecy / 30;
  }
  // A daily drip (a log line a day would drown the log), unless it breaks the Masquerade.
  if (s.secrecy + noise <= 0) changeSecrecy(s, noise, "media saturation");
  else changeSecrecy(s, noise, "media campaigns: our own noise", undefined, { drip: true });
}

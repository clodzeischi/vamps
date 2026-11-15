// Money and regional support: the Vatican stipend, regional contributions,
// running costs scaled by support, eviction.
import { difficulty } from "../data/difficulty";
import { INSTALLATIONS } from "../data/installations";
import { REGIONS, regionById } from "../data/regions";
import { monthlyMediaCost } from "./media";
import { monthlyPersonnelCost, refreshCandidates } from "./personnel";
import { averageSupport, isReady, post, supportLevel, type GameState, type Installation } from "./state";
import { formatDate } from "./time";

/** $ per funding point per month at full support (see regions.json). */
export const REGION_FUNDING_SCALE = 110;

export const SUPPORT_MIN = -5;
export const SUPPORT_MAX = 5;
/** Lowest rounded support at which new installations are allowed. */
export const BUILD_MIN_SUPPORT = 1;
/** At or below this rounded support, installations are evicted. */
export const EVICTION_SUPPORT = -3;

/** Share of a region's full contribution at a given support (+5 = 100%, -3 = 0). */
export function fundingFactor(support: number): number {
  return Math.max(0, Math.min(1, (support + 3) / 8));
}

export function regionalContribution(s: GameState, regionId: string): number {
  const def = regionById(regionId);
  const st = s.regions[regionId];
  if (!def || !st) return 0;
  return Math.round(def.funding * REGION_FUNDING_SCALE * fundingFactor(st.support) * difficulty(s.difficulty).regionalFunding);
}

/** Running-cost multiplier for installations, by rounded support (docs/WEB_PORT.md 3.2). */
export function runningCostMultiplier(support: number): number {
  const lvl = supportLevel(support);
  if (lvl >= 5) return 0;
  if (lvl >= 3) return 0.5;
  if (lvl >= 1) return 1;
  if (lvl === 0) return 1.5;
  return 2;
}

export function runningCost(s: GameState, i: Installation): number {
  if (!isReady(s, i)) return 0;
  const support = s.regions[i.regionId]?.support ?? 0;
  return Math.round(INSTALLATIONS[i.kind].monthlyCost * runningCostMultiplier(support));
}

export function changeSupport(s: GameState, regionId: string, delta: number) {
  const r = s.regions[regionId];
  if (!r) return;
  r.support = Math.max(SUPPORT_MIN, Math.min(SUPPORT_MAX, r.support + delta));
}

export function monthlyIncome(s: GameState) {
  const stipend = difficulty(s.difficulty).vaticanStipend;
  const regional = REGIONS.reduce((a, r) => a + regionalContribution(s, r.id), 0);
  const running = s.installations.reduce((a, i) => a + runningCost(s, i), 0);
  const { upkeep, leases, staff, containment } = monthlyPersonnelCost(s);
  /** Media is paid daily; this is the full month at current campaigns. */
  const media = monthlyMediaCost(s);
  return { stipend, regional, running, upkeep, leases, staff, containment, media, net: stipend + regional - running - upkeep - leases - staff - containment - media };
}

/** Month end: money, evictions, the report. */
export function monthEnd(s: GameState) {
  const { stipend, regional, running, upkeep, leases, staff, containment } = monthlyIncome(s);
  // Media campaigns were paid day by day; everything else is settled now.
  s.funds += stipend + regional - running - upkeep - leases - staff - containment;
  const media = Math.round(s.mediaSpent);
  s.mediaSpent = 0;

  // Evictions: one month's warning, then out.
  for (const inst of [...s.installations]) {
    const lvl = supportLevel(s.regions[inst.regionId]?.support ?? 0);
    const region = regionById(inst.regionId)?.name ?? inst.regionId;
    if (lvl > EVICTION_SUPPORT) {
      inst.evictionWarned = false;
      continue;
    }
    if (!inst.evictionWarned) {
      inst.evictionWarned = true;
      post(s, {
        kind: "eviction-warning",
        title: `${region} threatens eviction`,
        body: `Public opinion in ${region} has turned against us. Unless support recovers within a month, ${inst.name} will be shut down by the authorities.`,
        regionId: inst.regionId,
        pos: inst.pos,
      });
    } else {
      s.installations = s.installations.filter((x) => x.id !== inst.id);
      post(s, {
        kind: "evicted",
        title: `${inst.name} lost`,
        body: `The authorities in ${region} have raided and closed ${inst.name}. Its staff escaped, but the facility is gone.`,
        regionId: inst.regionId,
        pos: inst.pos,
      });
    }
  }

  const avg = averageSupport(s);
  s.lastReport = {
    month: formatDate(s.time - 1),
    stipend,
    regional,
    running,
    upkeep,
    leases,
    staff,
    containment,
    media,
    balance: s.funds,
    supportChange: avg - s.monthStartSupport,
  };
  s.monthStartSupport = avg;
  s.monthIndex++;
  refreshCandidates(s);
  post(s, { kind: "monthly", title: "Monthly report", body: "" });
}

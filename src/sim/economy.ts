// Money and regional support: the Vatican stipend, regional contributions,
// running costs scaled by support, eviction.
import { AIRCRAFT } from "../data/aircraft";
import { difficulty } from "../data/difficulty";
import { FACILITIES, INSTALLATIONS } from "../data/installations";
import { neighboursOf, REGIONS, regionById } from "../data/regions";
import { monthlyMediaCost } from "./media";
import { monthlyPersonnelCost, refreshCandidates, setStaff, staffAt } from "./personnel";
import { monthlyHumintCost } from "./humint";
import { CELL_MONTHLY_COST, europeClosed, isEurope, stipendShare } from "./story";
import { averageSupport, isReady, post, supportLevel, type GameState, type Installation, isCraftDeployed } from "./state";
import { formatDate } from "./time";
import { closeLedger } from "./ledger";

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

export function regionalContribution(s: GameState, regionId: string, pledge = s.regions[regionId]?.pledge ?? 1): number {
  const def = regionById(regionId);
  const st = s.regions[regionId];
  if (!def || !st) return 0;
  // Closed to us while the Vatican is held hostage: Europe sends nothing.
  if (europeClosed(s) && isEurope(regionId)) return 0;
  return Math.round(def.funding * REGION_FUNDING_SCALE * fundingFactor(st.support) * pledge * difficulty(s.difficulty).regionalFunding);
}

// ---------------------------------------------------------------------------
// Pledges (docs/WEB_PORT.md 3.5): money follows results. Every region keeps a
// record of what we did there this month; at month end the record moves its
// pledge, and the report names who gave more and who gave less.
// ---------------------------------------------------------------------------

export const PLEDGE_MIN = 0.6;
export const PLEDGE_MAX = 2;
/** What moves a region's record. */
export const PLEDGE = {
  /** Any operation of ours there that worked. */
  success: 0.08,
  /** On top: a nest, den or haven burned. */
  strike: 0.12,
  /** On top: a lair. */
  lair: 0.5,
  /** A bloodline operation we knew about and let run. */
  ignored: -0.03,
  /** A site we found and never hit. */
  lapsed: -0.05,
  /** An artifact handed back. */
  returned: 0.1,
};

/** Word spreads: a result counts for this much next door. */
export const PLEDGE_NEIGHBOUR_SHARE = 1 / 3;

export function creditRegion(s: GameState, regionId: string, amount: number) {
  const r = s.regions[regionId];
  if (r) r.credit = (r.credit ?? 0) + amount;
}

/** A result in the field: the region, and a share next door. */
export function creditAround(s: GameState, regionId: string, amount: number) {
  creditRegion(s, regionId, amount);
  for (const n of neighboursOf(regionId)) creditRegion(s, n, amount * PLEDGE_NEIGHBOUR_SHARE);
}

/** Month end: each record settles into its region's pledge. Returns the changes in $ a month. */
export function reviewPledges(s: GameState): { regionId: string; delta: number }[] {
  const out: { regionId: string; delta: number }[] = [];
  for (const [id, r] of Object.entries(s.regions)) {
    if (!r.credit) continue;
    const before = regionalContribution(s, id);
    r.pledge = Math.max(PLEDGE_MIN, Math.min(PLEDGE_MAX, (r.pledge ?? 1) + r.credit));
    r.credit = 0;
    const delta = regionalContribution(s, id) - before;
    if (Math.abs(delta) >= 1_000) out.push({ regionId: id, delta });
  }
  return out.sort((a, b) => b.delta - a.delta);
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
  if (i.cell) return Math.round(CELL_MONTHLY_COST * runningCostMultiplier(support));
  const centre = (i.sigintCentre ?? 0) * (FACILITIES.sigint.monthly ?? 0);
  return Math.round((INSTALLATIONS[i.kind].monthlyCost + centre) * runningCostMultiplier(support));
}

/** Opinion settles back toward where a region started (most start between −1
 *  and +2: neutral): this share of the gap closes each day. The bloodlines
 *  push against it; where nobody pushes, the world stays as it was. */
export const SUPPORT_SETTLE_PER_DAY = 1 / 200;
export const neutralAnchor = (regionId: string) => regionById(regionId)?.startSupport ?? 0;

export function settleSupport(s: GameState) {
  for (const [id, r] of Object.entries(s.regions)) changeSupport(s, id, (neutralAnchor(id) - r.support) * SUPPORT_SETTLE_PER_DAY);
}

/** A region that would evict us. Half the world hostile loses the war. */
export const isHostile = (support: number) => supportLevel(support) <= EVICTION_SUPPORT;
export const hostileRegions = (s: GameState) => Object.values(s.regions).filter((r) => isHostile(r.support)).length;
export const HOSTILE_LOSS = Math.ceil(REGIONS.length / 2);
export const HOSTILE_WARNING = Math.round(REGIONS.length * 0.375);

/** Months in a row in the red before the Holy See dissolves the Order. */
export const DEBT_MONTHS_TO_DISSOLVE = 3;

/** Changes a region's support: the only way it moves (clamped to SUPPORT_MIN..SUPPORT_MAX). */
export function changeSupport(s: GameState, regionId: string, delta: number) {
  const r = s.regions[regionId];
  if (!r) return;
  r.support = Math.max(SUPPORT_MIN, Math.min(SUPPORT_MAX, r.support + delta));
}

export function monthlyIncome(s: GameState) {
  // Held hostage, the Holy See can only send a trickle (sim/story.ts).
  const stipend = Math.round(difficulty(s.difficulty).vaticanStipend * stipendShare(s));
  const regional = REGIONS.reduce((a, r) => a + regionalContribution(s, r.id), 0);
  const running = s.installations.reduce((a, i) => a + runningCost(s, i), 0);
  const { upkeep, leases, staff, containment } = monthlyPersonnelCost(s);
  /** Media is paid daily; this is the full month at current campaigns. */
  const media = monthlyMediaCost(s);
  const humint = monthlyHumintCost(s);
  return { stipend, regional, running, upkeep, leases, staff, containment, media, humint, net: stipend + regional - running - upkeep - leases - staff - containment - media - humint };
}

/** Month end: money, evictions, the report. */
export function monthEnd(s: GameState) {
  const { stipend, regional, running, upkeep, leases, staff, containment, humint } = monthlyIncome(s);
  const paid = Object.fromEntries(REGIONS.map((r) => [r.id, regionalContribution(s, r.id)]));
  // The review comes after this month's money: new pledges pay from next month.
  const pledges = reviewPledges(s);
  const market = Math.round(s.market.earned);
  s.market.earned = 0;
  // Media campaigns were paid day by day; everything else is settled now.
  s.funds += stipend + regional - running - upkeep - leases - staff - containment - humint;
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

  settleDebt(s);
  const hostile = hostileRegions(s);
  if (hostile >= HOSTILE_WARNING && !s.hostileWarned && hostile < HOSTILE_LOSS) {
    s.hostileWarned = true;
    post(s, {
      kind: "debt",
      title: "The Holy See is alarmed",
      body: `${hostile} regions have turned against the Church. If half the world (${HOSTILE_LOSS} regions) turns, the Holy See will abandon the Order and make its peace with whoever is left.`,
    });
  } else if (hostile < HOSTILE_WARNING - 3) s.hostileWarned = false;

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
    humint,
    market,
    pledges,
    media,
    balance: s.funds,
    supportChange: avg - s.monthStartSupport,
    hostile,
  };
  s.monthStartSupport = avg;
  s.monthIndex++;
  closeLedger(s, paid, (id) => regionalContribution(s, id));
  refreshCandidates(s);
  post(s, { kind: "monthly", title: "Monthly report", body: "" });
}

/** Month end, funds settled: consequences of being in the red. */
function settleDebt(s: GameState) {
  if (s.funds >= 0) {
    s.debtMonths = 0;
    return;
  }
  s.debtMonths = (s.debtMonths ?? 0) + 1;
  // Lay staff go unpaid and leave: a quarter the first month, half the next.
  const share = s.debtMonths === 1 ? 0.25 : 0.5;
  let left = 0;
  for (const b of s.installations) {
    for (const k of ["scientist", "engineer"] as const) {
      const n = staffAt(s, b, k);
      const go = Math.ceil(n * share);
      if (go) setStaff(s, b, k, n - go);
      left += go;
    }
  }
  const owed = `The Order is ${Math.round(-s.funds / 1000).toLocaleString("en-US")}k in debt.`;
  if (s.debtMonths === 1) {
    post(s, {
      kind: "debt",
      title: "The Holy See's auditors",
      body: `${owed} Auditors from the Prefecture for the Economic Affairs of the Holy See have arrived at ${s.installations.find((i) => i.kind === "base")?.name ?? "our door"}.${left ? ` ${left} unpaid scientists and engineers have walked out.` : ""} Two more months in the red and the Order will be dissolved.`,
    });
  } else if (s.debtMonths < DEBT_MONTHS_TO_DISSOLVE) {
    // The lessors take their jets back (those on the ground).
    const taken = s.aircraft.filter((a) => AIRCRAFT[a.kind].ownership === "leased" && !isCraftDeployed(s, a));
    s.aircraft = s.aircraft.filter((a) => !taken.includes(a));
    post(s, {
      kind: "debt",
      title: "Final warning from the Holy See",
      body: `${owed}${left ? ` ${left} more staff have left.` : ""}${taken.length ? ` The lessors have repossessed ${taken.map((a) => a.name).join(", ")}.` : ""} One more month in the red and the Order will be dissolved.`,
    });
  } else {
    s.gameOver = "The Holy See has dissolved the Order for insolvency. Its files are sealed in the Archive; its agents return to their convents.";
    post(s, { kind: "game-over", title: "The Order is dissolved", body: s.gameOver });
  }
}

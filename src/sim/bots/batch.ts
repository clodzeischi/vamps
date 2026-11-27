// Headless campaigns for balance testing: one game, start to finish, with a
// bot policy, returning a snapshot per month. Pure and deterministic (seeded),
// so the same job always gives the same result. Run many with scripts/batch.mjs.
import type { DifficultyId } from "../../data/difficulty";
import { basesOf } from "../core/state";
import { REGIONS } from "../../data/regions";
import { hostileRegions, regionalContribution } from "../economy/economy";
import { playTurn, decideArrivals, type BotStats, type PolicyId } from "./bot";
import { newCampaign } from "../campaign/campaign";
import { advance, dismissEvent } from "../core/clock";
import type { GameState } from "../core/state";
import { DAY, HOUR } from "../core/time";
import { AGNES } from "../../data/bloodlines";
import { densRaided } from "../intel/networks";

export interface BatchJob {
  difficulty: DifficultyId;
  seed: number;
  policy: PolicyId;
  months: number;
}

/** The state of a campaign at the end of a month. */
interface Snapshot {
  month: number;
  funds: number;
  secrecy: number;
  /** Average support across all regions. */
  support: number;
  /** Support in the region of the starting SIGINT station. */
  homeSupport: number;
  /** Regions that would evict us (half of them loses the war), and at +3 or better. */
  hostile: number;
  friendly: number;
  agents: number;
  fallen: number;
  bases: number;
  stations: number;
  aircraft: number;
  /** Network sites raided (every house), and the most dens raided in one house. */
  raids: number;
  densMax: number;
  researched: number;
  /** Lairs found so far, and bloodlines destroyed. */
  lairs: number;
  destroyed: number;
  openWar: boolean;
  /** HUMINT assets held. */
  assets: number;
  /** The story: act 1–3, Agnes exposed the Order, Agnes dead. */
  act: number;
  exposed: boolean;
  won: boolean;
  /** Last month's report: the stipend plus regional contributions, dark web sales, and all spending. */
  income: number;
  market: number;
  spending: number;
  /** Operational bases (not the church cell). */
  realBases: number;
  /** Average pledge across regions outside Europe. */
  pledge: number;
  /** What pledges add to (or take from) regional contributions, $ a month. */
  pledgeGain: number;
}

interface GameResult {
  job: BatchJob;
  snapshots: Snapshot[];
  /** Month the campaign ended (game over), or null if it lasted. */
  gameOverMonth: number | null;
  gameOver: string | null;
  /** The game-over dispatch's title ("The world has turned"). */
  gameOverTitle: string | null;
  /** Event counts by kind, debrief outcomes, and the bot's own counters. */
  counts: Record<string, number>;
  /** Wall-clock milliseconds the game took to simulate. */
  ms: number;
  /** Day the first den of the Perfecti (Agnes's line) was burned, or null. */
  agnesDenDay: number | null;
  /** Day Padua fell, or null. */
  fallDay: number | null;
}

/** Network sites burned so far, by kind, over every house. */
function raidCount(s: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of Object.values(s.networks))
    for (const x of n.sites) if (x.raided) out[x.kind] = (out[x.kind] ?? 0) + 1;
  return out;
}
/** Den clues found so far, spent or not, over every house. */
const clueCount = (s: GameState) => Object.values(s.networks).reduce((a, n) => a + n.clues, 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function snapshot(s: GameState, month: number, home: string): Snapshot {
  const sup = REGIONS.map((r) => s.regions[r.id]?.support ?? 0);
  const nets = Object.values(s.networks);
  const r = s.lastReport;
  return {
    month,
    funds: Math.round(s.funds),
    secrecy: Math.round(s.secrecy * 10) / 10,
    support: Math.round(avg(sup) * 100) / 100,
    homeSupport: Math.round((s.regions[home]?.support ?? 0) * 100) / 100,
    hostile: hostileRegions(s),
    friendly: sup.filter((x) => x >= 2.5).length,
    agents: s.agents.length,
    fallen: s.fallen.length,
    bases: basesOf(s).length,
    stations: s.installations.filter((i) => i.kind === "sigint").length,
    aircraft: s.aircraft.length,
    raids: nets.reduce((a, n) => a + n.sites.filter((x) => x.raided).length, 0),
    densMax: Math.max(0, ...nets.map(densRaided)),
    researched: s.research.done.length + s.engineering.done.length,
    lairs: Object.values(s.bloodlines).filter((b) => b.lairId || b.destroyedAt).length,
    destroyed: Object.values(s.bloodlines).filter((b) => b.destroyedAt).length,
    openWar: s.openWar,
    assets: s.assets.length,
    act: s.story.act,
    exposed: s.story.exposed,
    won: s.story.won,
    income: r ? r.stipend + r.regional : 0,
    market: r?.market ?? 0,
    spending: r
      ? r.running +
        r.upkeep +
        r.aircraft +
        r.staff +
        (r.containment ?? 0) +
        (r.humint ?? 0) +
        r.media
      : 0,
    realBases: s.installations.filter((i) => i.kind === "base" && !i.cell).length,
    pledgeGain: REGIONS.reduce(
      (t, x) => t + regionalContribution(s, x.id) - regionalContribution(s, x.id, 1),
      0,
    ),
    pledge:
      Math.round(
        avg(REGIONS.filter((x) => x.group !== "Europe").map((x) => s.regions[x.id]?.pledge ?? 1)) *
          100,
      ) / 100,
  };
}

export function runGame(job: BatchJob): GameResult {
  const t0 = Date.now();
  const s = newCampaign(job.difficulty, job.seed);
  const home = s.installations.find((i) => i.kind === "sigint")?.regionId ?? "";
  const counts: BotStats = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const snapshots: Snapshot[] = [snapshot(s, 0, home)];
  let gameOverMonth: number | null = null;
  let gameOverTitle: string | null = null;
  let agnesDenDay: number | null = null;

  while (s.monthIndex < job.months) {
    // Handle what's waiting: orders for teams on the ground, everything else read and dismissed.
    while (s.events.length) {
      const e = s.events[0]!;
      count(`event_${e.kind}`);
      if (e.kind === "lead")
        count(
          `lead_via_${e.heading === "A volunteer" ? "volunteer" : e.heading === "From an informant" ? "humint" : e.heading === "Open sources" ? "osint" : "sigint"}`,
        );
      if (e.kind === "game-over") gameOverTitle = e.title;
      if (e.kind === "debrief" || e.kind === "coverup-result" || e.kind === "research")
        count(`${e.kind}: ${e.title.split(":")[0]}`);
      if (e.kind === "arrival" && job.policy !== "idle") {
        decideArrivals(s, counts, job.policy === "campaign");
        if (s.events[0] === e) dismissEvent(s);
      } else dismissEvent(s);
    }
    if (s.gameOver) {
      gameOverMonth = s.monthIndex;
      snapshots.push(snapshot(s, s.monthIndex + 1, home));
      break;
    }
    playTurn(s, job.policy, counts);
    const month = s.monthIndex;
    // Where den clues come from: attribute this hour's to what was reported.
    const cluesBefore = clueCount(s);
    const sitesBefore = new Set(s.sites.map((x) => x.id));
    const raidedBefore = raidCount(s);
    advance(s, HOUR);
    // Sites that came on the map, and sites burned, by kind.
    for (const x of s.sites) if (!sitesBefore.has(x.id)) count(`revealed_${x.kind}`);
    for (const [k, n] of Object.entries(raidCount(s)))
      if (n > (raidedBefore[k] ?? 0))
        counts[`burned_${k}`] = (counts[`burned_${k}`] ?? 0) + n - (raidedBefore[k] ?? 0);
    const gained = clueCount(s) - cluesBefore;
    if (gained > 0) {
      const src = s.events.some((e) => e.kind === "research") ? "clues_research" : "clues_field";
      counts[src] = (counts[src] ?? 0) + gained;
    }
    if (agnesDenDay === null && s.networks[AGNES]?.sites.some((x) => x.kind === "den" && x.raided))
      agnesDenDay = Math.floor((s.time - s.startTime) / DAY);
    if (s.monthIndex !== month) snapshots.push(snapshot(s, s.monthIndex, home));
  }
  for (const k of Object.keys(counts)) if (k.startsWith("_")) delete counts[k];
  return {
    job,
    snapshots,
    gameOverMonth,
    gameOver: s.gameOver,
    gameOverTitle,
    counts,
    ms: Date.now() - t0,
    agnesDenDay,
    fallDay: s.story.fellAt === null ? null : Math.floor((s.story.fellAt - s.startTime) / DAY),
  };
}

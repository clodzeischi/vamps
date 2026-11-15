// Headless campaigns for balance testing: one game, start to finish, with a
// bot policy, returning a snapshot per month. Pure and deterministic (seeded),
// so the same job always gives the same result. Run many with scripts/batch.mjs.
import type { DifficultyId } from "../data/difficulty";
import { REGIONS } from "../data/regions";
import { playTurn, decideArrivals, type BotStats, type PolicyId } from "./bot";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import type { GameState } from "./state";
import { HOUR } from "./time";

export interface BatchJob {
  difficulty: DifficultyId;
  seed: number;
  policy: PolicyId;
  months: number;
}

/** The state of a campaign at the end of a month. */
export interface Snapshot {
  month: number;
  funds: number;
  secrecy: number;
  /** Average support across all regions. */
  support: number;
  /** Support in the region of the starting SIGINT station. */
  homeSupport: number;
  /** Regions at support ≤ −3 (evicting) and ≥ +3 (friendly). */
  hostile: number;
  friendly: number;
  agents: number;
  fallen: number;
  bases: number;
  stations: number;
  aircraft: number;
  /** Sum of intel on every bloodline (each 0..100), and the best. */
  intel: number;
  intelMax: number;
  researched: number;
  openWar: boolean;
}

export interface GameResult {
  job: BatchJob;
  snapshots: Snapshot[];
  /** Month the campaign ended (game over), or null if it lasted. */
  gameOverMonth: number | null;
  gameOver: string | null;
  /** Event counts by kind, debrief outcomes, and the bot's own counters. */
  counts: Record<string, number>;
  /** Wall-clock milliseconds the game took to simulate. */
  ms: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function snapshot(s: GameState, month: number, home: string): Snapshot {
  const sup = REGIONS.map((r) => s.regions[r.id]?.support ?? 0);
  const intel = Object.values(s.intel);
  return {
    month,
    funds: Math.round(s.funds),
    secrecy: Math.round(s.secrecy * 10) / 10,
    support: Math.round(avg(sup) * 100) / 100,
    homeSupport: Math.round((s.regions[home]?.support ?? 0) * 100) / 100,
    hostile: sup.filter((x) => x <= -2.5).length,
    friendly: sup.filter((x) => x >= 2.5).length,
    agents: s.agents.length,
    fallen: s.fallen.length,
    bases: s.installations.filter((i) => i.kind === "base").length,
    stations: s.installations.filter((i) => i.kind === "sigint").length,
    aircraft: s.aircraft.length,
    intel: Math.round(intel.reduce((a, b) => a + b, 0)),
    intelMax: Math.round(Math.max(0, ...intel)),
    researched: s.research.done.length + s.engineering.done.length,
    openWar: s.openWar,
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

  while (s.monthIndex < job.months) {
    // Handle what's waiting: orders for teams on the ground, everything else read and dismissed.
    while (s.events.length) {
      const e = s.events[0]!;
      count(`event_${e.kind}`);
      if (e.kind === "debrief" || e.kind === "coverup-result" || e.kind === "research") count(`${e.kind}: ${e.title.split(":")[0]}`);
      if (e.kind === "arrival" && job.policy !== "idle") {
        decideArrivals(s, counts);
        if (s.events[0] === e) dismissEvent(s);
      } else dismissEvent(s);
    }
    if (s.gameOver) {
      gameOverMonth = s.monthIndex;
      break;
    }
    playTurn(s, job.policy, counts);
    const month = s.monthIndex;
    advance(s, HOUR);
    if (s.monthIndex !== month) snapshots.push(snapshot(s, s.monthIndex, home));
  }
  for (const k of Object.keys(counts)) if (k.startsWith("_")) delete counts[k];
  return { job, snapshots, gameOverMonth, gameOver: s.gameOver, counts, ms: Date.now() - t0 };
}

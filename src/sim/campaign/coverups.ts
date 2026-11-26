// Cover-up operations: off-screen work that buys back secrecy.
//
// Offers arrive as a steady trickle, more often after loud incidents and when
// secrecy is low. Each costs money up front, some also tie up agents for a few
// days, and each can fail, or backfire and make things worse. An offer lapses
// if it isn't taken. Asset calls and disinformation (sim/intel/humint.ts) run here
// too: one finish for every covert job, each kind with its own roll and effects.
import { REGIONS, regionById, type City } from "../../data/regions";
import { skillChance } from "../people/skill";
import {
  isSevere,
  judgedMargin,
  pickJudged,
  primaryStat,
  TIER_REWARD,
  verdictLine,
  type Tier,
} from "../intel/judged";
import { changeSupport } from "../economy/economy";
import { rng, type Rng } from "../core/rng";
import { changeSecrecy } from "./secrecy";
import { effectWords } from "../intel/humint";
import { ignoredCall, rollHumint, settleHumint } from "../intel/assetCalls";
import { isHumintTemplate } from "../intel/humintTemplates";
import {
  addLog,
  improvementLine,
  isDeployed,
  isWounded,
  post,
  train,
  type Agent,
  type CoverUp,
  type CovertKind,
  type CovertResult,
  type GameState,
  type LogEntry,
  type Place,
  basesOf,
} from "../core/state";
import { DAY } from "../core/time";
import { TEMPLATES, templateById } from "./coverupTemplates";

/** Most offers open at once. */
const MAX_OFFERS = 3;
/** Daily chance of a new offer with no pressure at all. */
const BASE_OFFER_CHANCE = 0.05;
/** Share of failures that backfire: only hard and very hard jobs (and money-only offers) can. */
const BACKFIRE_SHARE = 0.35;
const BACKFIRE_SHARE_VERY_HARD = 0.5;
const backfireShare = (c: CoverUp) =>
  c.agents === 0
    ? BACKFIRE_SHARE
    : !isSevere(c.tier)
      ? 0
      : c.tier === "very-hard"
        ? BACKFIRE_SHARE_VERY_HARD
        : BACKFIRE_SHARE;

/** The chance a cover-up succeeds, with these agents. */
export function coverUpChance(c: CoverUp, agents: readonly Agent[]): number {
  let p: number;
  if (c.agents === 0) p = 0.6;
  else {
    if (!agents.length) return 0;
    p = skillChance(judgedMargin(agents, c.weights, c.tier));
  }
  return Math.min(0.95, Math.max(0.05, p));
}

/** Agents free for off-screen work: at any base, not deployed, not wounded. */
export const coverUpAgents = (s: GameState) =>
  s.agents.filter((a) => !isDeployed(s, a) && !isWounded(s, a));

export function coverUpBlocker(s: GameState, c: CoverUp, agentIds: string[]): string | null {
  if (s.gameOver) return "The campaign is over.";
  if (s.openWar) return "There is nothing left to cover up.";
  if (c.startedAt) return "Already under way.";
  if (c.expiresAt <= s.time) return "The chance has passed.";
  if (s.funds < c.cost) return "Not enough funds.";
  if (agentIds.length !== c.agents)
    return c.agents === 1 ? "Choose one operative." : `Choose ${c.agents} operatives.`;
  const free = new Set(coverUpAgents(s).map((a) => a.id));
  if (agentIds.some((id) => !free.has(id))) return "One of those operatives isn't available.";
  return null;
}

export function startCoverUp(s: GameState, id: string, agentIds: string[]): string | null {
  const c = s.coverUps.find((x) => x.id === id);
  if (!c) return "That offer is gone.";
  const why = coverUpBlocker(s, c, agentIds);
  if (why) return why;
  s.funds -= c.cost;
  c.agentIds = [...agentIds];
  c.startedAt = s.time;
  c.doneAt = s.time + c.days * DAY;
  addLog(s, `${covertLabel(c)} under way: ${c.title}.`);
  return null;
}

/** Secrecy lost calling off a covert action under way: loose ends, people who saw something. */
export const ABORT_SECRECY = 1;

/** Calls off a cover-up under way: the money is spent, the agents come home,
 *  a little secrecy is lost, and there is no roll (no failure, no backfire). */
export function abortCoverUp(s: GameState, id: string): string | null {
  const c = s.coverUps.find((x) => x.id === id);
  if (!c || !c.startedAt) return "That cover-up isn't under way.";
  s.coverUps = s.coverUps.filter((x) => x !== c);
  for (const a of s.agents) if (c.agentIds.includes(a.id)) backToBase(s, a);
  changeSecrecy(s, -ABORT_SECRECY, `called off: ${c.title}`, c);
  return null;
}

export function declineCoverUp(s: GameState, id: string) {
  const c = s.coverUps.find((x) => x.id === id);
  if (!c || c.startedAt) return;
  s.coverUps = s.coverUps.filter((x) => x !== c);
  addLog(s, `Declined: ${c.title}.`);
}

function someCity(regionId: string, r: Rng): City | null {
  const region = regionById(regionId);
  if (!region?.cities.length) return null;
  return r.pick(region.cities.slice(0, 5));
}

/** Where the next offer is: the last incident if things are hot, else somewhere we operate. */
function offerPlace(s: GameState, r: Rng): Place | null {
  if (s.lastIncident && s.heat >= 1.5 && r.chance(0.75)) return s.lastIncident;
  const ours = [...new Set(s.installations.map((i) => i.regionId))];
  const regionId =
    ours.length && r.chance(0.6) ? r.pick(ours) : r.pick(REGIONS.filter((x) => x.cities.length)).id;
  const city = someCity(regionId, r);
  if (!city) return null;
  return {
    regionId,
    city: city.name,
    pos: { lat: city.lat + r.real(-0.15, 0.15), lon: city.lon + r.real(-0.15, 0.15) },
  };
}

function offer(s: GameState) {
  const r = rng(s);
  const where = offerPlace(s, r);
  if (!where) return;
  const options = TEMPLATES.filter(
    (t) =>
      s.heat >= (t.needsHeat ?? 0) &&
      !s.coverUps.some((c) => c.template === t.id && c.regionId === where.regionId),
  );
  if (!options.length) return;
  const t = r.pick(options);
  const region = regionById(where.regionId)!;
  const fill = (x: string) =>
    x.replaceAll("{city}", where.city).replaceAll("{region}", region.name);
  const round = (n: number, to: number) => Math.round(n / to) * to;
  const judged = t.judged ? pickJudged(t.judged, r) : null;
  const weights = judged ? t.judged!.variants[judged.variant]!.weights : { tradecraft: 1 };
  const tier: Tier = judged?.tier ?? "routine";
  const c: CoverUp = {
    id: `cover-${s.nextId++}`,
    template: t.id,
    title: fill(t.title),
    text: fill(judged?.text ?? t.text ?? ""),
    regionId: where.regionId,
    city: where.city,
    pos: { ...where.pos },
    offeredAt: s.time,
    expiresAt: s.time + r.real(3, 6) * DAY,
    cost: round(r.real(t.cost[0], t.cost[1]), 10_000),
    days: r.int(t.days[0], t.days[1]),
    agents: t.agents,
    kind: "coverup",
    tier,
    weights: { ...weights },
    ...(judged ? { variant: judged.variant } : {}),
    gain: Math.round(r.real(t.gain[0], t.gain[1]) * TIER_REWARD[tier] * 2) / 2,
    agentIds: [],
    startedAt: 0,
    doneAt: 0,
  };
  s.coverUps.push(c);
  post(s, {
    kind: "coverup",
    title: `Cover-up: ${c.title}`,
    body: c.text,
    regionId: c.regionId,
    pos: c.pos,
    refId: c.id,
    effects: coverUpTerms(c),
  });
}

const AGENT_WORDS = ["no operatives", "one operative", "two operatives", "three operatives"];

/** "$120,000 · 3 days · one agent · Secrecy +2.5 if it works" */
export function coverUpTerms(c: CoverUp): string {
  const days = `${c.days} day${c.days === 1 ? "" : "s"}`;
  return [
    `$${c.cost.toLocaleString("en-US")}`,
    days,
    AGENT_WORDS[c.agents] ?? `${c.agents} operatives`,
    `${coverUpReward(c)} if it works`,
  ].join(" · ");
}

/** "Cover-up", "Asset call", "Disinformation". */
export const covertLabel = (c: CoverUp) =>
  c.kind === "call" ? "Agent call" : c.kind === "disinfo" ? "Disinformation" : "Cover-up";

/** What success brings, in a few words. */
export const coverUpReward = (c: CoverUp) =>
  c.effect ? effectWords(c.effect, c.tier) : `Secrecy +${c.gain}`;

/** A cover-up's roll: success, or a failure that may backfire. */
function rollCoverUp(c: CoverUp, p: number, r: Rng): CovertResult {
  return r.next() < p ? "success" : r.chance(backfireShare(c)) ? "backfire" : "fail";
}

/** What a cover-up's result does: its debrief and effects (the verdict on a failure included). */
function settleCoverUp(
  s: GameState,
  c: CoverUp,
  result: CovertResult,
  agents: readonly Agent[],
  r: Rng,
): { body: string; effects: string[] } {
  const t = templateById(c.template);
  const variant = c.variant !== undefined ? t?.judged?.variants[c.variant] : undefined;
  const effects: string[] = [];
  let body: string;
  if (result === "success") {
    changeSecrecy(s, c.gain, c.title);
    effects.push(`Secrecy +${c.gain}`);
    body = variant?.success ?? t?.success ?? "It worked.";
  } else if (result === "fail") {
    body = variant?.fail ?? t?.fail ?? "It didn't work.";
    effects.push("No change");
  } else {
    const loss = Math.round(c.gain * 0.5 * 2) / 2;
    changeSecrecy(s, -loss, `${c.title} backfired`, c);
    changeSupport(s, c.regionId, -0.2);
    effects.push(
      `Secrecy −${loss}`,
      `Support in ${regionById(c.regionId)?.name ?? c.regionId} −0.20`,
    );
    body = variant?.backfire ?? t?.backfire ?? "It went wrong.";
  }
  if (result !== "success" && variant) body += `\n\n${verdictLine(agents, variant, c.tier, r)}`;
  return { body, effects };
}

/** The debrief's word for each result, and how it reads in the log. */
const RESULTS: Record<CovertKind, Partial<Record<CovertResult, [string, LogEntry["tone"]]>>> = {
  coverup: {
    success: ["Covered up", "good"],
    fail: ["Cover-up failed", "neutral"],
    backfire: ["Cover-up backfired", "bad"],
  },
  call: {
    success: ["Handled", "good"],
    shaken: ["Shaken", "neutral"],
    fail: ["Burned", "bad"],
    catastrophe: ["Network blown", "bad"],
  },
  disinfo: {
    success: ["It worked", "good"],
    shaken: ["Shaken", "neutral"],
    fail: ["Burned", "bad"],
    catastrophe: ["Network blown", "bad"],
  },
};
const COVERT_HEADINGS: Partial<Record<CovertKind, string>> = {
  call: "An agent calls",
  disinfo: "Disinformation",
};

/** Agents back from off-screen work go to their base, or the first one if theirs is gone. */
function backToBase(s: GameState, a: Agent) {
  const bases = basesOf(s);
  if (!bases.some((b) => b.id === a.baseId) && bases[0]) a.baseId = bases[0].id;
}

/** A covert job has run its course: the roll, the agents home with what they learned, the debrief. */
function finish(s: GameState, c: CoverUp) {
  const r = rng(s);
  const agents = s.agents.filter((a) => c.agentIds.includes(a.id));
  s.coverUps = s.coverUps.filter((x) => x !== c);
  const p = coverUpChance(c, agents);
  const asset = c.kind !== "coverup";
  const result = asset ? rollHumint(s, c, p, r) : rollCoverUp(c, p, r);

  const stat = primaryStat(c.weights);
  const improved: string[] = [];
  for (const a of agents) {
    backToBase(s, a);
    const line = improvementLine(a, {
      [stat]: train(a, stat, result === "success" ? r.int(1, 2) : r.int(0, 1)),
    });
    if (line) improved.push(line);
    a.missions++;
  }

  const { body, effects } = asset
    ? settleHumint(s, c, result, agents, r)
    : settleCoverUp(s, c, result, agents, r);
  const [word, tone] = RESULTS[c.kind][result]!;
  const heading = COVERT_HEADINGS[c.kind];
  post(s, {
    kind: "coverup-result",
    ...(heading ? { heading } : {}),
    title: `${word}: ${c.title}`,
    body,
    regionId: c.regionId,
    pos: c.pos,
    effects: effects.join(" · "),
    improved,
  });
  addLog(s, `${word}: ${c.title}.`, tone);
}

/** Daily chance of a new offer: a steady trickle, more after noise and when secrecy is low. */
export function offerChance(s: GameState): number {
  const heat = Math.min(0.2, s.heat * 0.025);
  const low = Math.max(0, (60 - s.secrecy) / 60) * 0.1;
  return BASE_OFFER_CHANCE + heat + low;
}

export function hourlyCoverUps(s: GameState) {
  for (const c of [...s.coverUps]) {
    if (c.startedAt && c.doneAt <= s.time) finish(s, c);
    else if (!c.startedAt && c.expiresAt <= s.time) {
      s.coverUps = s.coverUps.filter((x) => x !== c);
      if (c.kind === "call") ignoredCall(s, c);
      else addLog(s, `The chance passed: ${c.title}.`);
    }
  }
}

export function dailyCoverUps(s: GameState) {
  const r = rng(s);
  s.heat *= 0.85;
  if (s.heat < 0.05) s.heat = 0;
  if (s.openWar) return;
  const open = s.coverUps.filter((c) => !c.startedAt).length;
  if (open < MAX_OFFERS && r.chance(offerChance(s))) offer(s);
}

export const isCoverUpTemplate = (id: string) => !!templateById(id) || isHumintTemplate(id);

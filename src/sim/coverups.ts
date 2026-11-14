// Cover-up operations: off-screen work that buys back secrecy.
//
// Offers arrive as a steady trickle, more often after loud incidents and when
// secrecy is low. Each costs money up front, some also tie up agents for a few
// days, and each can fail, or backfire and make things worse. An offer lapses
// if it isn't taken.
//
// HUMINT and counter-intelligence (not built yet) will feed `humintBonus`:
// more offers, and better odds on the ones taken.
import type { StatId } from "../data/agents";
import { REGIONS, regionById, type City } from "../data/regions";
import { teamSkill } from "./combat";
import { changeSupport } from "./economy";
import { rng, type Rng } from "./rng";
import { changeSecrecy } from "./secrecy";
import { addLog, isWounded, post, type Agent, type CoverUp, type GameState, type Place } from "./state";
import { DAY } from "./time";

/** Most offers open at once. */
export const MAX_OFFERS = 3;
/** Daily chance of a new offer with no pressure at all. */
export const BASE_OFFER_CHANCE = 0.05;
/** Share of failures that backfire. */
export const BACKFIRE_SHARE = 0.35;

interface Template {
  id: string;
  title: string;
  text: string;
  /** Money range ($). */
  cost: [number, number];
  days: [number, number];
  agents: number;
  stat: StatId;
  difficulty: number;
  /** Secrecy restored on success. */
  gain: [number, number];
  /** Only offered when there has been recent noise. */
  needsHeat?: number;
  success: string;
  fail: string;
  backfire: string;
}

const TEMPLATES: Template[] = [
  {
    id: "terror",
    title: "A convenient cell, {city}",
    text: "The authorities in {region} still have no explanation for what happened in {city}. A senior security official is open to a generous arrangement: the incident becomes the work of a radical cell, already dead. It needs someone of ours in the room.",
    cost: [400_000, 650_000], days: [5, 7], agents: 1, stat: "insight", difficulty: 50, gain: [5, 7], needsHeat: 3,
    success: "The minister read the statement on the evening news. A cell that never existed has taken the blame, and the story is closed.",
    fail: "The official took the money and lost his nerve. The incident stays unexplained; at least nobody is asking about us.",
    backfire: "The official recorded the meeting. Fragments leaked to a journalist, and now there are questions about a foreign religious order.",
  },
  {
    id: "evidence",
    title: "The evidence locker, {city}",
    text: "A shirt soaked in blood that won't test as human sits in a police evidence room in {city}. Swap it for one soaked in ordinary blood before the lab picks it up.",
    cost: [50_000, 110_000], days: [2, 4], agents: 2, stat: "tradecraft", difficulty: 45, gain: [1.5, 3],
    success: "The swap went unnoticed. The lab report came back: human, type O. Case closed.",
    fail: "The locker was moved before we got to it. The sample is now beyond reach, and we'll have to hope nobody looks closely.",
    backfire: "The team was seen on the evidence room's camera. Now the police are asking who wanted that shirt so badly.",
  },
  {
    id: "editor",
    title: "The story, {city}",
    text: "A reporter in {city} is close to a story about bodies, blood and a church order nobody has heard of. Her editor owes the diocese a favour, and might be persuaded that the story is a liability.",
    cost: [120_000, 220_000], days: [2, 3], agents: 1, stat: "insight", difficulty: 45, gain: [1.5, 3],
    success: "The story was spiked. The reporter has been moved to the business desk.",
    fail: "The editor wouldn't bend. The story runs on page nine, and nobody seems to notice.",
    backfire: "The editor ran a piece about the pressure instead. \"Who is leaning on our newsroom?\"",
  },
  {
    id: "hoax",
    title: "The video, {city}",
    text: "Phone footage from {city} shows something no living man can do. Contacts in the digital-effects trade can release a dozen convincing fakes of the same clip, so that the real one is laughed off with the rest.",
    cost: [180_000, 320_000], days: [3, 5], agents: 0, stat: "tradecraft", difficulty: 0, gain: [2, 4],
    success: "The fakes went viral; the original drowned among them. Commenters agree it was a marketing stunt.",
    fail: "The fakes never caught on. The original is still out there, but it's losing steam on its own.",
    backfire: "A forensic blogger proved the fakes were fakes, and that the original was not. It is being shared everywhere.",
  },
  {
    id: "coroner",
    title: "The coroner, {city}",
    text: "A coroner in {city} has written \"exsanguination, cause unknown\" on a death certificate. A quiet word, and a reason, could make it a ruptured aneurysm.",
    cost: [70_000, 140_000], days: [2, 4], agents: 1, stat: "insight", difficulty: 40, gain: [1.5, 2.5],
    success: "The certificate was re-filed. The family has a funeral to arrange and no questions to ask.",
    fail: "The coroner wouldn't change a word, but he has agreed to say nothing further.",
    backfire: "The coroner reported the approach to the police. A detective now has our cover name.",
  },
  {
    id: "witness",
    title: "A witness, {city}",
    text: "A woman in {city} saw what happened and is telling everyone who'll listen. She's devout. A priest she trusts might help her make peace with it, quietly.",
    cost: [20_000, 60_000], days: [1, 3], agents: 1, stat: "faith", difficulty: 40, gain: [1, 2],
    success: "She has stopped talking about it. She lights a candle every evening now, and sleeps better.",
    fail: "She wouldn't see the priest. She's still talking, though fewer people are listening.",
    backfire: "She thought she was being silenced by a cult, and went to the papers with it.",
  },
  {
    id: "records",
    title: "Hospital records, {city}",
    text: "Admissions in {city} show a cluster of anaemia cases with the same puncture wounds. Before an epidemiologist notices, the records need to say something else.",
    cost: [90_000, 180_000], days: [3, 5], agents: 2, stat: "tradecraft", difficulty: 50, gain: [1.5, 3],
    success: "The records now show a cluster of iron deficiency. Nothing to see.",
    fail: "The hospital moved to a new records system the week we went in. The data are locked away; we'll have to hope nobody looks.",
    backfire: "The hospital's IT security caught the intrusion. The breach made the local news.",
  },
  {
    id: "commissioner",
    title: "A word from the bishop, {region}",
    text: "The bishop of a diocese in {region} plays cards with the police commissioner. A donation to his restoration fund, and the investigations that touch on us could be quietly consolidated and shelved.",
    cost: [150_000, 260_000], days: [4, 6], agents: 0, stat: "faith", difficulty: 0, gain: [1.5, 3],
    success: "Three open files were consolidated into one, and that one is gathering dust.",
    fail: "The commissioner was polite and did nothing.",
    backfire: "The commissioner mentioned the bishop's request to his deputy, who is not a churchgoer.",
  },
];

const templateById = (id: string) => TEMPLATES.find((t) => t.id === id);

/** Placeholder for HUMINT/CI investment: more offers and better odds. */
export function humintBonus(_s: GameState): number {
  return 0;
}

/** The chance a cover-up succeeds, with these agents. */
export function coverUpChance(s: GameState, c: CoverUp, agents: readonly Agent[]): number {
  let p: number;
  if (c.agents === 0) p = 0.6;
  else {
    if (!agents.length) return 0;
    p = 0.55 + (teamSkill(agents, c.stat, "civilian") - c.difficulty) / 60;
  }
  return Math.min(0.95, Math.max(0.1, p + humintBonus(s)));
}

/** Agents free for off-screen work: at any base, not deployed, not wounded. */
export const coverUpAgents = (s: GameState) => s.agents.filter((a) => !a.deployed && !isWounded(s, a));

export function coverUpBlocker(s: GameState, c: CoverUp, agentIds: string[]): string | null {
  if (s.gameOver) return "The campaign is over.";
  if (s.openWar) return "There is nothing left to cover up.";
  if (c.startedAt) return "Already under way.";
  if (c.expiresAt <= s.time) return "The chance has passed.";
  if (s.funds < c.cost) return "Not enough funds.";
  if (agentIds.length !== c.agents) return c.agents === 1 ? "Choose one agent." : `Choose ${c.agents} agents.`;
  const free = new Set(coverUpAgents(s).map((a) => a.id));
  if (agentIds.some((id) => !free.has(id))) return "One of those agents isn't available.";
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
  for (const a of s.agents) if (agentIds.includes(a.id)) a.deployed = true;
  addLog(s, `Cover-up under way: ${c.title}.`);
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
  const regionId = ours.length && r.chance(0.6) ? r.pick(ours) : r.pick(REGIONS.filter((x) => x.cities.length)).id;
  const city = someCity(regionId, r);
  if (!city) return null;
  return { regionId, city: city.name, pos: { lat: city.lat + r.real(-0.15, 0.15), lon: city.lon + r.real(-0.15, 0.15) } };
}

function offer(s: GameState) {
  const r = rng(s);
  const where = offerPlace(s, r);
  if (!where) return;
  const options = TEMPLATES.filter((t) => s.heat >= (t.needsHeat ?? 0) && !s.coverUps.some((c) => c.template === t.id && c.regionId === where.regionId));
  if (!options.length) return;
  const t = r.pick(options);
  const region = regionById(where.regionId)!;
  const fill = (x: string) => x.replaceAll("{city}", where.city).replaceAll("{region}", region.name);
  const round = (n: number, to: number) => Math.round(n / to) * to;
  const c: CoverUp = {
    id: `cover-${s.nextId++}`,
    template: t.id,
    title: fill(t.title),
    text: fill(t.text),
    regionId: where.regionId,
    city: where.city,
    pos: { ...where.pos },
    offeredAt: s.time,
    expiresAt: s.time + r.real(3, 6) * DAY,
    cost: round(r.real(t.cost[0], t.cost[1]), 10_000),
    days: r.int(t.days[0], t.days[1]),
    agents: t.agents,
    stat: t.stat,
    difficulty: t.difficulty,
    gain: Math.round(r.real(t.gain[0], t.gain[1]) * 2) / 2,
    agentIds: [],
    startedAt: 0,
    doneAt: 0,
  };
  s.coverUps.push(c);
  post(s, { kind: "coverup", title: `Cover-up: ${c.title}`, body: c.text, regionId: c.regionId, pos: c.pos, refId: c.id, effects: coverUpTerms(c) });
}

const AGENT_WORDS = ["no agents", "one agent", "two agents", "three agents"];

/** "$120,000 · 3 days · one agent · Secrecy +2.5 if it works" */
export function coverUpTerms(c: CoverUp): string {
  const days = `${c.days} day${c.days === 1 ? "" : "s"}`;
  return [`$${c.cost.toLocaleString("en-US")}`, days, AGENT_WORDS[c.agents] ?? `${c.agents} agents`, `Secrecy +${c.gain} if it works`].join(" · ");
}

function finish(s: GameState, c: CoverUp) {
  const r = rng(s);
  const t = templateById(c.template);
  const agents = s.agents.filter((a) => c.agentIds.includes(a.id));
  const p = coverUpChance(s, c, agents);
  const roll = r.next();
  const result = roll < p ? "success" : r.chance(BACKFIRE_SHARE) ? "backfire" : "fail";
  s.coverUps = s.coverUps.filter((x) => x !== c);

  // Agents come home; their base may be gone.
  const bases = s.installations.filter((i) => i.kind === "base");
  for (const a of agents) {
    a.deployed = false;
    if (!bases.some((b) => b.id === a.baseId) && bases[0]) a.baseId = bases[0].id;
    const gain = result === "success" ? r.int(1, 2) : r.int(0, 1);
    a.stats[c.stat] = Math.min(95, a.stats[c.stat] + gain);
    a.missions++;
  }

  const effects: string[] = [];
  const regionName = regionById(c.regionId)?.name ?? c.regionId;
  let body: string;
  if (result === "success") {
    changeSecrecy(s, c.gain, c.title);
    effects.push(`Secrecy +${c.gain}`);
    body = t?.success ?? "It worked.";
  } else if (result === "fail") {
    body = t?.fail ?? "It didn't work.";
    effects.push("No change");
  } else {
    const loss = Math.round(c.gain * 0.5 * 2) / 2;
    changeSecrecy(s, -loss, `${c.title} backfired`, c);
    changeSupport(s, c.regionId, -0.2);
    effects.push(`Secrecy −${loss}`, `Support in ${regionName} −0.20`);
    body = t?.backfire ?? "It went wrong.";
  }
  const words = { success: "Covered up", fail: "Cover-up failed", backfire: "Cover-up backfired" } as const;
  post(s, {
    kind: "coverup-result",
    title: `${words[result]}: ${c.title}`,
    body,
    regionId: c.regionId,
    pos: c.pos,
    effects: effects.join(" · "),
  });
  addLog(s, `${words[result]}: ${c.title}.`, result === "success" ? "good" : result === "backfire" ? "bad" : "neutral");
}

/** Daily chance of a new offer: a steady trickle, more after noise and when secrecy is low. */
export function offerChance(s: GameState): number {
  const heat = Math.min(0.2, s.heat * 0.025);
  const low = Math.max(0, (60 - s.secrecy) / 60) * 0.1;
  return BASE_OFFER_CHANCE + heat + low + humintBonus(s) * 0.5;
}

export function hourlyCoverUps(s: GameState) {
  for (const c of [...s.coverUps]) {
    if (c.startedAt && c.doneAt <= s.time) finish(s, c);
    else if (!c.startedAt && c.expiresAt <= s.time) {
      s.coverUps = s.coverUps.filter((x) => x !== c);
      addLog(s, `The chance passed: ${c.title}.`);
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

export const isCoverUpTemplate = (id: string) => !!templateById(id);

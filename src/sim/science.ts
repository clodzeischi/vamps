// The research queue: one for the whole Order (docs/design/base.md,
// "Scientists"). Every scientist at every base works the top topic it can;
// the lead scientist, named for the Order and not for a topic, multiplies
// everyone else's aptitudes (over 50). A topic that needs material (remains,
// a captive) needs it at a base with a laboratory and at least one scientist;
// until then it's skipped and the points go to the next.
import { APTITUDE_MIDDLE, POINTS_PER_DAY } from "../data/aptitudes";
import { projectById, type ProjectDef } from "../data/research";
import { requirementOf, skillOn } from "./aptitudes";
import { synergy } from "./building";
import { facilityCount, staffAtWork, staffLead } from "./personnel";
import { isReady, type ActiveProject, type GameState, type Installation } from "./state";

const readyBases = (s: GameState) => s.installations.filter((b) => b.kind === "base" && isReady(s, b));

/** A base where material can be studied: a laboratory and at least one scientist there. */
export const labReady = (s: GameState, base: Installation) =>
  facilityCount(base, "lab") > 0 && staffAtWork(s, "scientist").some((p) => p.baseId === base.id);

/** What the Order's scientists do on a topic today: points a day and their average skill. */
export function researchTeam(s: GameState, p: ProjectDef, leadId?: string | null) {
  const people = staffAtWork(s, "scientist");
  const lead = leadId === undefined ? staffLead(s, "scientist") : people.find((x) => x.id === leadId);
  const req = requirementOf(p);
  const bases = new Map(readyBases(s).map((b) => [b.id, b]));
  let total = 0, plain = 0;
  for (const x of people) {
    const k = skillOn(req, x, lead);
    plain += k;
    total += k * (1 + synergy(bases.get(x.baseId)!, "lab"));
  }
  return { scientists: people.length, rate: POINTS_PER_DAY * (total / APTITUDE_MIDDLE), skill: people.length ? plain / people.length : 0 };
}

/** The research queue, top first. */
export const researchQueue = (s: GameState): ActiveProject[] => s.projects.filter((a) => projectById(a.projectId)?.kind === "research");

/** Why the queue can't work on a topic today, or null. */
export function researchBlocked(s: GameState, a: ActiveProject): string | null {
  const p = projectById(a.projectId);
  if (!p) return "No such topic.";
  if (p.needs === "thrall-captive" || p.needs === "vampire-captive") {
    const base = readyBases(s).find((b) => b.id === a.baseId);
    if (!base || !(base.captives ?? []).some((c) => c.id === a.captiveId)) return "The captive is gone.";
    if (!labReady(s, base)) return `Needs a laboratory and a scientist at ${base.name}.`;
  }
  if (p.needs === "vampire-material" && !materialBase(s)) return "Needs remains or a captive vampire at a base with a laboratory and a scientist.";
  return null;
}

/** A base that holds vampire material and can study it. */
export const materialBase = (s: GameState) =>
  readyBases(s).find((b) => labReady(s, b) && ((b.remains ?? 0) > 0 || (b.captives ?? []).some((c) => c.kind === "vampire")));

/** The topic the Order's scientists work on today: the first in the queue they can. */
export const topOfResearch = (s: GameState) => researchQueue(s).find((a) => !researchBlocked(s, a));

/** Days until a topic is done, with the workable topics ahead of it first, at today's team (Infinity if blocked or nobody). */
export function researchDays(s: GameState, a: ActiveProject): number {
  if (researchBlocked(s, a)) return Infinity;
  let days = 0;
  for (const x of researchQueue(s)) {
    if (x !== a && researchBlocked(s, x)) continue;
    const p = projectById(x.projectId)!;
    const left = Math.max(0, p.points - x.progress);
    if (left > 0) {
      const { rate } = researchTeam(s, p);
      if (rate <= 0) return Infinity;
      days += left / rate;
    }
    if (x === a) break;
  }
  return Math.ceil(days);
}

/** Days a new topic would take at the back of the queue, at today's team. */
export function newTopicDays(s: GameState, p: ProjectDef): number {
  const queue = researchQueue(s).filter((x) => !researchBlocked(s, x));
  const ahead = queue.length ? researchDays(s, queue.at(-1)!) : 0;
  const { rate } = researchTeam(s, p);
  return rate > 0 && Number.isFinite(ahead) ? Math.ceil(ahead + p.points / rate) : Infinity;
}

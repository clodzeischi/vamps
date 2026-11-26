// Engineers at a base: their aptitudes, the lead engineer, and what the team
// gets done on a job (docs/design/base.md, "Engineers").
//
// A job asks for weights over the four aptitudes. Each engineer's skill on it
// is the weighted sum of their aptitudes; the lead's aptitudes, over 50,
// multiply everyone else's. Points a day = 1.5 × skill / 50, summed over the
// base, times the workshops' synergy. The team's average skill sets the
// waste: how much of the materials it uses.
import { installationById } from "./state";
import { APTITUDE_MIDDLE, POINTS_PER_DAY, WASTE } from "../data/aptitudes";
import { staffAtWork, staffLead } from "./personnel";
import { projectById, type ProjectDef } from "../data/research";
import { growAptitudes, requirementOf, skillOn } from "./aptitudes";
import { synergy } from "./building";
import type { ActiveProject, GameState, Installation } from "./state";

const wasteFor = (skill: number) => Math.min(WASTE.max, Math.max(WASTE.min, 1 - (skill - APTITUDE_MIDDLE) * WASTE.perPoint));

/** What a base's engineers do on a job today: points a day, their average skill, and the waste. */
export function teamOn(s: GameState, base: Installation, p: ProjectDef, leadId?: string | null) {
  const people = staffAtWork(s, "engineer", base.id);
  const lead = leadId === undefined ? staffLead(s, "engineer", base) : people.find((x) => x.id === leadId);
  const req = requirementOf(p);
  const skills = people.map((x) => skillOn(req, x, lead));
  const total = skills.reduce((t, k) => t + k, 0);
  const skill = people.length ? total / people.length : 0;
  const rate = POINTS_PER_DAY * (total / APTITUDE_MIDDLE) * (1 + synergy(base, "workshop"));
  return { engineers: people.length, rate, skill, waste: people.length ? wasteFor(skill) : 1 };
}

/** The engineering queue at a base, top first. */
export const engineeringQueue = (s: GameState, baseId: string): ActiveProject[] =>
  s.projects.filter((a) => a.baseId === baseId && projectById(a.projectId)?.kind === "engineering");

const done = (a: ActiveProject) => {
  const p = projectById(a.projectId);
  return !!p && a.progress >= p.points;
};

/** The job the base's engineers work on today: the first in the queue not already done. */
export const topOfQueue = (s: GameState, baseId: string) => engineeringQueue(s, baseId).find((a) => !done(a));

/** A job's queue: its base's workshop queue, or the Order's research queue. */
function queueOf(s: GameState, a: ActiveProject): ActiveProject[] {
  const kind = projectById(a.projectId)?.kind;
  return kind === "engineering" ? engineeringQueue(s, a.baseId) : s.projects.filter((x) => projectById(x.projectId)?.kind === "research");
}

/** Moves a job to place `to` (0 = the top) in its queue; the rest keep their order. */
export function placeProject(s: GameState, runId: string, to: number): string | null {
  const a = s.projects.find((x) => x.id === runId);
  if (!a || !projectById(a.projectId)) return "No such job.";
  const queue = queueOf(s, a);
  if (!Number.isInteger(to) || to < 0 || to >= queue.length) return "Not a place in the queue.";
  const slots = queue.map((x) => s.projects.indexOf(x));
  const order = queue.filter((x) => x !== a);
  order.splice(to, 0, a);
  slots.forEach((slot, i) => (s.projects[slot] = order[i]!));
  return null;
}

/** Days until a job is done, with the queue ahead of it worked first at today's team (Infinity with no engineers). */
export function queueDays(s: GameState, a: ActiveProject): number {
  const base = installationById(s, a.baseId);
  if (!base) return Infinity;
  let days = 0;
  for (const x of engineeringQueue(s, a.baseId)) {
    const p = projectById(x.projectId)!;
    const left = Math.max(0, p.points - x.progress) + (unitsOf(x) - 1) * p.points;
    if (left > 0) {
      const { rate } = teamOn(s, base, p);
      if (rate <= 0) return Infinity;
      days += left / rate;
    }
    if (x === a) break;
  }
  return Math.ceil(days);
}

/** A day's work on a job makes the base's engineers better at what it uses. */
export function growEngineers(s: GameState, base: Installation, p: ProjectDef) {
  growAptitudes(staffAtWork(s, "engineer", base.id), requirementOf(p));
}

/** Units still to make on a job, this one included. */
export const unitsOf = (a: ActiveProject) => a.count ?? 1;

/** The job of this kind already queued at a base, which more of the same joins. */
export const queuedAt = (s: GameState, baseId: string, projectId: string) =>
  engineeringQueue(s, baseId).find((a) => a.projectId === projectId);

/** Days until `qty` more of a job would be done at a base, at today's team: joining the order
 *  already queued for it, or after everything in the queue. */
export function newJobDays(s: GameState, base: Installation, p: ProjectDef, qty = 1): number {
  const queue = engineeringQueue(s, base.id);
  const joins = p.repeatable ? queuedAt(s, base.id, p.id) : undefined;
  const ahead = joins ? queueDays(s, joins) : queue.length ? queueDays(s, queue.at(-1)!) : 0;
  const { rate } = teamOn(s, base, p);
  return rate > 0 && Number.isFinite(ahead) ? Math.ceil(ahead + (qty * p.points) / rate) : Infinity;
}

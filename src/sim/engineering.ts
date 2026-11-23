// Engineers at a base: their aptitudes, the lead engineer, and what the team
// gets done on a job (docs/design/base.md, "Engineers").
//
// A job asks for weights over the four aptitudes. Each engineer's skill on it
// is the weighted sum of their aptitudes; the lead's aptitudes, over 50,
// multiply everyone else's. Points a day = 1.5 × skill / 50, summed over the
// base, times the workshops' synergy. The team's average skill sets the
// waste: how much of the materials it uses.
import { APTITUDE_MIDDLE, POINTS_PER_DAY, WASTE } from "../data/aptitudes";
import { projectById, type ProjectDef } from "../data/research";
import { growAptitudes, requirementOf, skillOn } from "./aptitudes";
import { synergy } from "./building";
import type { ActiveProject, GameState, Installation, StaffMember } from "./state";

/** Engineers at a base who are there (not in transit). */
export const engineersAt = (s: GameState, baseId: string): StaffMember[] =>
  (s.staff ?? []).filter((p) => p.role === "engineer" && p.baseId === baseId && !p.arriveAt);

/** The base's lead engineer, if one is named and is here. */
export function leadOf(s: GameState, base: Installation): StaffMember | undefined {
  return base.leadEngineer ? engineersAt(s, base.id).find((p) => p.id === base.leadEngineer) : undefined;
}

/** Names (or, with null, clears) the lead engineer at a base. Takes effect at once. */
export function setLeadEngineer(s: GameState, baseId: string, staffId: string | null): string | null {
  const base = s.installations.find((b) => b.id === baseId && b.kind === "base");
  if (!base) return "No such base.";
  if (staffId === null) {
    delete base.leadEngineer;
    return null;
  }
  const p = (s.staff ?? []).find((x) => x.id === staffId);
  if (!p || p.role !== "engineer" || p.baseId !== baseId) return `Not an engineer at ${base.name}.`;
  if (p.arriveAt) return "Still in transit.";
  base.leadEngineer = staffId;
  return null;
}

export const wasteFor = (skill: number) => Math.min(WASTE.max, Math.max(WASTE.min, 1 - (skill - APTITUDE_MIDDLE) * WASTE.perPoint));

/** What a base's engineers do on a job today: points a day, their average skill, and the waste. */
export function teamOn(s: GameState, base: Installation, p: ProjectDef, leadId?: string | null) {
  const people = engineersAt(s, base.id);
  const lead = leadId === undefined ? leadOf(s, base) : people.find((x) => x.id === leadId);
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

/** Moves a job up (−1) or down (+1) its queue: its base's workshop queue, or the research queue. */
export function moveProject(s: GameState, runId: string, dir: -1 | 1): string | null {
  const a = s.projects.find((x) => x.id === runId);
  const kind = a && projectById(a.projectId)?.kind;
  if (!a || !kind) return "No such job.";
  const queue = kind === "engineering" ? engineeringQueue(s, a.baseId) : s.projects.filter((x) => projectById(x.projectId)?.kind === "research");
  const i = queue.indexOf(a);
  const other = queue[i + dir];
  if (!other) return dir < 0 ? "Already at the top." : "Already at the bottom.";
  const ia = s.projects.indexOf(a), io = s.projects.indexOf(other);
  s.projects[ia] = other;
  s.projects[io] = a;
  return null;
}

/** Days until a job is done, with the queue ahead of it worked first at today's team (Infinity with no engineers). */
export function queueDays(s: GameState, a: ActiveProject): number {
  const base = s.installations.find((b) => b.id === a.baseId);
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
  growAptitudes(engineersAt(s, base.id), requirementOf(p));
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

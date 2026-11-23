// Engineers at a base: their aptitudes, the lead engineer, and what the team
// gets done on a job (docs/design/base.md, "Engineers").
//
// A job asks for weights over the four aptitudes. Each engineer's skill on it
// is the weighted sum of their aptitudes; the lead's aptitudes, over 50,
// multiply everyone else's. Points a day = 1.5 × skill / 50, summed over the
// base, times the workshops' synergy. The team's average skill sets the
// waste: how much of the materials it uses.
import {
  APTITUDE_CAP, APTITUDE_EXTREME_BAND, APTITUDE_EXTREME_LIMIT, APTITUDE_GROWTH, APTITUDE_IDS, APTITUDE_MIDDLE, APTITUDE_ROLL,
  ENGINEER_POINTS_PER_DAY, WASTE, type Aptitudes, type Requirement,
} from "../data/engineers";
import { projectById, type ProjectDef } from "../data/research";
import { synergy } from "./building";
import type { rng } from "./rng";
import type { ActiveProject, GameState, Installation, StaffMember } from "./state";

type Rng = ReturnType<typeof rng>;

/** A new engineer's aptitudes, rolled again while too many sit near the bottom or the top. */
export function rollAptitudes(r: Rng): Aptitudes {
  const [min, max] = APTITUDE_ROLL;
  const band = (max - min) * APTITUDE_EXTREME_BAND;
  let apt!: Aptitudes;
  for (let tries = 0; tries < 50; tries++) {
    apt = Object.fromEntries(APTITUDE_IDS.map((id) => [id, r.int(min, max)])) as Aptitudes;
    const low = APTITUDE_IDS.filter((id) => apt[id] <= min + band).length;
    const high = APTITUDE_IDS.filter((id) => apt[id] >= max - band).length;
    if (low < APTITUDE_EXTREME_LIMIT && high < APTITUDE_EXTREME_LIMIT) break;
  }
  return apt;
}

/** Every aptitude at one value (tests, and anyone missing them). */
export const flatAptitudes = (v = APTITUDE_MIDDLE): Aptitudes => Object.fromEntries(APTITUDE_IDS.map((id) => [id, v])) as Aptitudes;

export const aptitudesOf = (p: { aptitudes?: Aptitudes }): Aptitudes => p.aptitudes ?? flatAptitudes();

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

/** The lead's multiplier on one aptitude: their aptitude over 50 (no lead: 1). */
export const leadMultiplier = (lead: StaffMember | undefined, id: keyof Aptitudes) => (lead ? aptitudesOf(lead)[id] / APTITUDE_MIDDLE : 1);

/** One engineer's skill on a job, with the lead's multipliers (the lead's own work isn't multiplied). */
export function skillOn(req: Requirement, p: StaffMember, lead?: StaffMember): number {
  const apt = aptitudesOf(p);
  const by = lead && lead.id !== p.id ? lead : undefined;
  return APTITUDE_IDS.reduce((t, id) => t + (req[id] ?? 0) * apt[id] * leadMultiplier(by, id), 0);
}

const requirementOf = (p: ProjectDef): Requirement => p.skills ?? { ballistics: 1 };

export const wasteFor = (skill: number) => Math.min(WASTE.max, Math.max(WASTE.min, 1 - (skill - APTITUDE_MIDDLE) * WASTE.perPoint));

/** What a base's engineers do on a job today: points a day, their average skill, and the waste. */
export function teamOn(s: GameState, base: Installation, p: ProjectDef, leadId?: string | null) {
  const people = engineersAt(s, base.id);
  const lead = leadId === undefined ? leadOf(s, base) : people.find((x) => x.id === leadId);
  const req = requirementOf(p);
  const skills = people.map((x) => skillOn(req, x, lead));
  const total = skills.reduce((t, k) => t + k, 0);
  const skill = people.length ? total / people.length : 0;
  const rate = ENGINEER_POINTS_PER_DAY * (total / APTITUDE_MIDDLE) * (1 + synergy(base, "workshop"));
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

/** Moves a job up (−1) or down (+1) its base's queue. */
export function moveProject(s: GameState, runId: string, dir: -1 | 1): string | null {
  const a = s.projects.find((x) => x.id === runId);
  if (!a || projectById(a.projectId)?.kind !== "engineering") return "No such job.";
  const queue = engineeringQueue(s, a.baseId);
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

/** Aptitudes grow with the work that uses them: fast up to 75, slowly after, to 100. */
export function growEngineers(s: GameState, base: Installation, p: ProjectDef) {
  const req = requirementOf(p);
  const { fastUntil, fastDays, slowDays } = APTITUDE_GROWTH;
  for (const e of engineersAt(s, base.id)) {
    const apt = (e.aptitudes ??= flatAptitudes());
    for (const id of APTITUDE_IDS) {
      const w = req[id] ?? 0;
      if (!w) continue;
      apt[id] = Math.min(APTITUDE_CAP, apt[id] + w / (apt[id] < fastUntil ? fastDays : slowDays));
    }
  }
}

/** Valid aptitudes from a save, or null. */
export function cleanAptitudes(x: unknown): Aptitudes | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  for (const id of APTITUDE_IDS) if (typeof o[id] !== "number" || !Number.isFinite(o[id]) || (o[id] as number) < 0 || (o[id] as number) > APTITUDE_CAP) return null;
  return Object.fromEntries(APTITUDE_IDS.map((id) => [id, o[id] as number])) as Aptitudes;
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

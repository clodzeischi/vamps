// Aptitudes shared by scientists and engineers: rolling them, a person's skill
// on a project (with the lead's multipliers), and growth with use.
import {
  APTITUDE_CAP, APTITUDE_EXTREME_BAND, APTITUDE_EXTREME_LIMIT, APTITUDE_GROWTH, APTITUDE_MIDDLE, APTITUDE_ROLL, aptitudeIds,
  type Aptitude, type Aptitudes, type Requirement, type StaffRole,
} from "../data/aptitudes";
import type { ProjectDef } from "../data/research";
import type { rng } from "./rng";
import type { StaffMember } from "./state";

type Rng = ReturnType<typeof rng>;

/** A new hire's aptitudes, rolled again while too many sit near the bottom or the top. */
export function rollAptitudes(r: Rng, role: StaffRole): Aptitudes {
  const ids = aptitudeIds(role);
  const [min, max] = APTITUDE_ROLL;
  const band = (max - min) * APTITUDE_EXTREME_BAND;
  let apt!: Aptitudes;
  for (let tries = 0; tries < 50; tries++) {
    apt = Object.fromEntries(ids.map((id) => [id, r.int(min, max)]));
    const low = ids.filter((id) => apt[id]! <= min + band).length;
    const high = ids.filter((id) => apt[id]! >= max - band).length;
    if (low < APTITUDE_EXTREME_LIMIT && high < APTITUDE_EXTREME_LIMIT) break;
  }
  return apt;
}

/** Every aptitude of a role at one value (tests, and anyone missing them). */
export const flatAptitudes = (role: StaffRole, v = APTITUDE_MIDDLE): Aptitudes => Object.fromEntries(aptitudeIds(role).map((id) => [id, v]));

/** One aptitude of a person (50 if they somehow lack it). */
export const aptitude = (p: { aptitudes?: Aptitudes }, id: Aptitude): number => p.aptitudes?.[id] ?? APTITUDE_MIDDLE;

/** The lead's multiplier on one aptitude: their aptitude over 50 (no lead: 1). */
export const leadMultiplier = (lead: StaffMember | undefined, id: Aptitude) => (lead ? aptitude(lead, id) / APTITUDE_MIDDLE : 1);

/** What a project asks for (a default for any without). */
export const requirementOf = (p: ProjectDef): Requirement => p.skills ?? (p.kind === "research" ? { biology: 1 } : { ballistics: 1 });

/** One person's skill on a project, with the lead's multipliers (the lead's own work isn't multiplied). */
export function skillOn(req: Requirement, p: StaffMember, lead?: StaffMember): number {
  const by = lead && lead.id !== p.id ? lead : undefined;
  return (Object.entries(req) as [Aptitude, number][]).reduce((t, [id, w]) => t + w * aptitude(p, id) * leadMultiplier(by, id), 0);
}

/** Aptitudes grow with the work that uses them: fast up to 75, slowly after, to 100. */
export function growAptitudes(people: StaffMember[], req: Requirement) {
  const { fastUntil, fastDays, slowDays } = APTITUDE_GROWTH;
  for (const e of people) {
    const apt = (e.aptitudes ??= flatAptitudes(e.role));
    for (const [id, w] of Object.entries(req) as [Aptitude, number][]) {
      if (!w || apt[id] === undefined) continue;
      apt[id] = Math.min(APTITUDE_CAP, apt[id]! + w / (apt[id]! < fastUntil ? fastDays : slowDays));
    }
  }
}

/** Valid aptitudes for a role from a save, or null. */
export function cleanAptitudes(x: unknown, role: StaffRole): Aptitudes | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const ids = aptitudeIds(role);
  for (const id of ids) if (typeof o[id] !== "number" || !Number.isFinite(o[id]) || (o[id] as number) < 0 || (o[id] as number) > APTITUDE_CAP) return null;
  return Object.fromEntries(ids.map((id) => [id, o[id] as number]));
}

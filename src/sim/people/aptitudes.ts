// Aptitudes, every role's: rolling them (no duds, no prodigies), a person's
// skill on a project (with the lead's multipliers), and staff growth with use.
import {
  APTITUDE_CAP, APTITUDE_EXTREME_BAND, APTITUDE_EXTREME_LIMIT, APTITUDE_GROWTH, APTITUDE_MIDDLE, APTITUDE_ROLL, aptitudeIds,
  type Aptitude, type Aptitudes, type Requirement, type Role,
} from "../../data/aptitudes";
import type { ProjectDef } from "../../data/research";
import type { rng } from "../core/rng";
import type { StaffMember } from "../core/state";

type Rng = ReturnType<typeof rng>;

/** How many of a role's aptitudes sit in the bottom and the top band of the roll. */
export function extremeCounts(apt: Aptitudes, role: Role): { low: number; high: number } {
  const [min, max] = APTITUDE_ROLL;
  const band = (max - min) * APTITUDE_EXTREME_BAND;
  const vals = aptitudeIds(role).map((id) => apt[id] ?? APTITUDE_MIDDLE);
  return { low: vals.filter((v) => v <= min + band).length, high: vals.filter((v) => v >= max - band).length };
}

/** A candidate's aptitudes, rolled again while too many sit near the bottom (a dud) or the top (a prodigy). */
export function rollAptitudes(r: Rng, role: Role): Aptitudes {
  let apt!: Aptitudes;
  for (let tries = 0; tries < 50; tries++) {
    apt = Object.fromEntries(aptitudeIds(role).map((id) => [id, r.int(...APTITUDE_ROLL)]));
    const { low, high } = extremeCounts(apt, role);
    if (low < APTITUDE_EXTREME_LIMIT && high < APTITUDE_EXTREME_LIMIT) break;
  }
  return apt;
}

/** Every aptitude of a role at one value (tests, and anyone missing them). */
export const flatAptitudes = (role: Role, v = APTITUDE_MIDDLE): Aptitudes => Object.fromEntries(aptitudeIds(role).map((id) => [id, v]));

/** One aptitude of a person (50 if they somehow lack it). */
export const aptitude = (p: { aptitudes: Aptitudes }, id: Aptitude): number => p.aptitudes[id] ?? APTITUDE_MIDDLE;

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
    const apt = e.aptitudes;
    for (const [id, w] of Object.entries(req) as [Aptitude, number][]) {
      if (!w || apt[id] === undefined) continue;
      apt[id] = Math.min(APTITUDE_CAP, apt[id]! + w / (apt[id]! < fastUntil ? fastDays : slowDays));
    }
  }
}

/** Are these a role's four aptitudes, as saved? */
export function areAptitudes(x: unknown, role: Role): boolean {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return aptitudeIds(role).every((id) => typeof o[id] === "number" && o[id] >= 0 && o[id] <= APTITUDE_CAP);
}

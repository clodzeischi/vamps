// Research and engineering. A project runs at one base, worked by the
// scientists (engineers) assigned to it there: a point per person per day.
// Several can run at once, as staff allow, but a project never spans bases:
// its staff, and any material it needs (remains, a captive, a free hangar),
// are at its base. What is learned is known everywhere.
import { AIRCRAFT } from "../data/aircraft";
import { BLOODLINES } from "../data/bloodlines";
import type { StaffKind } from "../data/installations";
import type { KitId } from "../data/kit";
import { PROJECTS, RESEARCH_EFFECTS, projectById, type Need, type ProjectDef, type ProjectKind } from "../data/research";
import type { CombatMods } from "./combat";
import { acquireAircraft, aircraftAt, freeCells, hangarsOf, staffAt } from "./personnel";
import { addIntel, addLog, isReady, post, type ActiveProject, type Captive, type GameState, type Installation } from "./state";

export const researched = (s: GameState, id: string) => s.research.done.includes(id) || s.engineering.done.includes(id);

export const staffKind = (kind: ProjectKind): StaffKind => (kind === "research" ? "scientist" : "engineer");
const readyBases = (s: GameState) => s.installations.filter((b) => b.kind === "base" && isReady(s, b));
const findBase = (s: GameState, baseId: string) => readyBases(s).find((b) => b.id === baseId);
const defOf = (a: ActiveProject) => projectById(a.projectId);

/** Projects under way, optionally at one base and of one kind. */
export function projectsAt(s: GameState, baseId?: string, kind?: ProjectKind): ActiveProject[] {
  return s.projects.filter((a) => (!baseId || a.baseId === baseId) && (!kind || defOf(a)?.kind === kind));
}

/** Staff of a kind at a base not yet on any project. */
export function freeStaff(s: GameState, base: Installation, kind: StaffKind): number {
  const busy = projectsAt(s, base.id).filter((a) => staffKind(defOf(a)!.kind) === kind).reduce((t, a) => t + a.staff, 0);
  return staffAt(base, kind) - busy;
}

/** Scientists (engineers) across the Order, and how many are free. */
export function staffSummary(s: GameState, kind: ProjectKind) {
  const k = staffKind(kind);
  return readyBases(s).reduce((t, b) => ({ total: t.total + staffAt(b, k), free: t.free + Math.max(0, freeStaff(s, b, k)) }), { total: 0, free: 0 });
}

/** Days left on a project at a given staffing (Infinity with nobody on it). */
export function daysLeft(p: ProjectDef, progress: number, staff: number): number {
  return staff > 0 ? Math.ceil((p.points - progress) / staff) : Infinity;
}

// ----- Captives and remains -----

export const allCaptives = (s: GameState) => readyBases(s).flatMap((b) => (b.captives ?? []).map((c) => ({ base: b, captive: c })));
export const totalRemains = (s: GameState) => readyBases(s).reduce((t, b) => t + (b.remains ?? 0), 0);

/** Puts a captive in a free cell at a base; false if there's no room. */
export function holdCaptive(s: GameState, base: Installation, kind: Captive["kind"], bloodline: string, city: string): boolean {
  if (freeCells(base) <= 0) return false;
  (base.captives ??= []).push({ id: `captive-${s.nextId++}`, kind, bloodline, takenAt: s.time, city });
  return true;
}

function findCaptive(s: GameState, captiveId: string) {
  return allCaptives(s).find((x) => x.captive.id === captiveId);
}

const questioning = (s: GameState, captiveId: string) => s.projects.some((a) => a.captiveId === captiveId);

/** Vampires can be destroyed; thralls are human, and can't be. */
export function executeBlocker(s: GameState, captiveId: string): string | null {
  const held = findCaptive(s, captiveId);
  if (!held) return "No such captive.";
  if (held.captive.kind !== "vampire") return "Thralls are human. The Order does not execute the living.";
  if (questioning(s, captiveId)) return "It is being questioned. Abandon the interrogation first.";
  return null;
}

/** Destroys a captive vampire: fire and sunlight. Its remains go to cold storage. */
export function executeCaptive(s: GameState, captiveId: string): string | null {
  const why = executeBlocker(s, captiveId);
  if (why) return why;
  const { base, captive } = findCaptive(s, captiveId)!;
  base.captives = (base.captives ?? []).filter((c) => c !== captive);
  base.remains = (base.remains ?? 0) + 1;
  addLog(s, `The vampire taken in ${captive.city} was destroyed at ${base.name}. Its remains are in cold storage.`);
  return null;
}

export function releaseBlocker(s: GameState, captiveId: string): string | null {
  const held = findCaptive(s, captiveId);
  if (!held) return "No such captive.";
  if (held.captive.kind !== "thrall") return "A vampire is never released.";
  if (questioning(s, captiveId)) return "They are being questioned. Abandon the interrogation first.";
  return null;
}

/** Hands a thrall over to a convent hospital, freeing the cell. */
export function releaseCaptive(s: GameState, captiveId: string): string | null {
  const why = releaseBlocker(s, captiveId);
  if (why) return why;
  const { base, captive } = findCaptive(s, captiveId)!;
  base.captives = (base.captives ?? []).filter((c) => c !== captive);
  addLog(s, `The thrall taken in ${captive.city} was handed to a convent hospital.`);
  return null;
}

/** A captive at this base of this kind that nobody is questioning yet (longest held first). */
function freeCaptive(s: GameState, base: Installation, kind: Captive["kind"]): Captive | undefined {
  const taken = new Set(s.projects.map((a) => a.captiveId).filter(Boolean));
  return (base.captives ?? []).filter((c) => c.kind === kind && !taken.has(c.id)).sort((a, b) => a.takenAt - b.takenAt)[0];
}

/** Hangars at this base not filled and not promised to a helicopter being built. */
function freeHangars(s: GameState, base: Installation): number {
  const building = projectsAt(s, base.id).filter((a) => a.projectId === "build-helicopter").length;
  return hangarsOf(base) - aircraftAt(s, base.id).length - building;
}

function needMet(s: GameState, base: Installation, need: Need | undefined): boolean {
  switch (need) {
    case undefined: return true;
    case "vampire-material": return (base.remains ?? 0) > 0 || (base.captives ?? []).some((c) => c.kind === "vampire");
    case "thrall-captive": return !!freeCaptive(s, base, "thrall");
    case "vampire-captive": return !!freeCaptive(s, base, "vampire");
    case "free-hangar": return freeHangars(s, base) > 0;
  }
}

export const NEED_WORDS: Record<Need, string> = {
  "vampire-material": "Needs vampire remains or a captive vampire at the base.",
  "thrall-captive": "Needs a captive thrall held at the base.",
  "vampire-captive": "Needs a captive vampire held at the base.",
  "free-hangar": "Needs a free hangar at the base.",
};

/** Projects the player can see: prerequisites done, not finished, not already running (unless repeatable). */
export function visibleProjects(s: GameState, kind: ProjectKind): ProjectDef[] {
  return PROJECTS.filter(
    (p) => p.kind === kind && (p.repeatable || (!researched(s, p.id) && !s.projects.some((a) => a.projectId === p.id))) && p.requires.every((r) => researched(s, r)),
  );
}

export function projectBlocker(s: GameState, id: string, baseId: string, staff = 1): string | null {
  const p = projectById(id);
  if (!p) return "No such project.";
  if (!p.repeatable && researched(s, p.id)) return "Already done.";
  if (!p.repeatable && s.projects.some((a) => a.projectId === p.id)) return "Already under way at another base.";
  if (!p.requires.every((r) => researched(s, r))) return "Not yet understood.";
  const base = findBase(s, baseId);
  if (!base) return "No operational base there.";
  if (!needMet(s, base, p.needs)) return NEED_WORDS[p.needs!];
  const free = freeStaff(s, base, staffKind(p.kind));
  if (free <= 0) return p.kind === "research" ? `No free scientists at ${base.name}.` : `No free engineers at ${base.name}.`;
  if (staff < 1 || staff > free) return `Only ${free} free at ${base.name}.`;
  if (s.funds < p.cost) return "Not enough funds for the materials.";
  return null;
}

/** Starts a project at a base with `staff` people on it (default: every free one). */
export function startProject(s: GameState, id: string, baseId: string, staff?: number): string | null {
  const p = projectById(id);
  const base = findBase(s, baseId);
  const n = staff ?? (p && base ? freeStaff(s, base, staffKind(p.kind)) : 1);
  const why = projectBlocker(s, id, baseId, n);
  if (why) return why;
  s.funds -= p!.cost;
  const a: ActiveProject = { id: `proj-${s.nextId++}`, projectId: id, baseId, staff: n, progress: 0, startedAt: s.time };
  if (p!.needs === "thrall-captive" || p!.needs === "vampire-captive")
    a.captiveId = freeCaptive(s, base!, p!.needs === "thrall-captive" ? "thrall" : "vampire")!.id;
  s.projects.push(a);
  addLog(s, `${p!.kind === "research" ? "Research" : "Work"} begins at ${base!.name}: ${p!.name}.`);
  return null;
}

/** Moves staff on or off a running project (at least one stays on it). */
export function setProjectStaff(s: GameState, projectRunId: string, staff: number): string | null {
  const a = s.projects.find((x) => x.id === projectRunId);
  const base = a && findBase(s, a.baseId);
  if (!a || !base) return "No such project.";
  const most = a.staff + freeStaff(s, base, staffKind(defOf(a)!.kind));
  if (staff < 1) return "At least one has to stay on it; abandon it instead.";
  if (staff > most) return `Only ${most} available at ${base.name}.`;
  a.staff = staff;
  return null;
}

/** Stops a project. Progress and materials are lost; its staff are free again. */
export function cancelProject(s: GameState, projectRunId: string): string | null {
  const a = s.projects.find((x) => x.id === projectRunId);
  if (!a) return "No such project.";
  s.projects = s.projects.filter((x) => x !== a);
  addLog(s, `${defOf(a)?.name ?? "A project"} abandoned.`);
  return null;
}

// ----- Effects -----

/** What research and engineering do to a fight. */
export function combatMods(s: GameState, kit: KitId): CombatMods {
  const armed = kit !== "civilian";
  return {
    armour: armed && researched(s, "ceramic-plate") ? RESEARCH_EFFECTS.plate : 0,
    vampireDamage: armed && researched(s, "uv-munitions") ? RESEARCH_EFFECTS.uvDamage : 1,
    vampireHit: researched(s, "pheromones") ? RESEARCH_EFFECTS.vampireHit : 0,
  };
}

/** Station retrofit: multipliers on SIGINT detection, own region and next door. */
export function sigintBoost(s: GameState): { own: number; neighbour: number } {
  return researched(s, "station-retrofit") ? { own: RESEARCH_EFFECTS.sigintOwn, neighbour: RESEARCH_EFFECTS.sigintNeighbour } : { own: 1, neighbour: 1 };
}

const bloodlineName = (id: string) => BLOODLINES.find((b) => b.id === id)?.name ?? "an unknown bloodline";

/** Applies a finished project; returns extra lines for the dispatch, or null to wait (no hangar yet). */
function complete(s: GameState, p: ProjectDef, a: ActiveProject, base: Installation): string[] | null {
  const lines: string[] = [];
  switch (p.id) {
    case "haematology":
      for (const ag of s.agents) {
        ag.stats.vitality = Math.min(95, ag.stats.vitality + RESEARCH_EFFECTS.vitality);
        ag.hp = Math.min(ag.stats.vitality, ag.hp + RESEARCH_EFFECTS.vitality);
      }
      break;
    case "interrogate-thrall":
    case "interrogate-vampire": {
      const captive = (base.captives ?? []).find((c) => c.id === a.captiveId);
      if (!captive) {
        lines.push("The captive was lost before the questioning was done. Nothing came of it.");
        break;
      }
      base.captives = (base.captives ?? []).filter((c) => c !== captive);
      const gain = captive.kind === "vampire" ? RESEARCH_EFFECTS.vampireIntel : RESEARCH_EFFECTS.thrallIntel;
      addIntel(s, captive.bloodline, gain);
      const intel = `Intel on ${bloodlineName(captive.bloodline)} ${Math.round(s.intel[captive.bloodline]!)}/100.`;
      lines.push(
        captive.kind === "vampire"
          ? `The one taken in ${captive.city} did not survive it. ${intel}`
          : `The thrall taken in ${captive.city} has been handed to a convent hospital. ${intel}`,
      );
      break;
    }
    case "build-helicopter": {
      // Its hangar was promised when the job started; it may have been filled since.
      if (aircraftAt(s, base.id).length >= hangarsOf(base)) return null;
      acquireAircraft(s, base.id, "helicopter", true);
      lines.push(`${s.aircraft.at(-1)!.name} (${AIRCRAFT.helicopter.name}) is ready at ${base.name}.`);
      break;
    }
  }
  if (!p.repeatable) (p.kind === "research" ? s.research : s.engineering).done.push(p.id);
  return lines;
}

/** Daily: assigned staff put their day's work in; finished projects report. */
export function dailyResearch(s: GameState) {
  for (const a of [...s.projects]) {
    const p = defOf(a);
    const base = findBase(s, a.baseId);
    if (!p || !base) {
      s.projects = s.projects.filter((x) => x !== a); // its base is gone
      continue;
    }
    // Staff let go or lost since: a project can't have more people than the base has.
    const k = staffKind(p.kind);
    if (freeStaff(s, base, k) < 0) a.staff = Math.max(0, a.staff + freeStaff(s, base, k));
    a.progress = Math.min(p.points, a.progress + a.staff);
    if (a.progress < p.points) continue;
    const lines = complete(s, p, a, base);
    if (!lines) continue; // waiting (a helicopter with no hangar to go to)
    s.projects = s.projects.filter((x) => x !== a);
    post(s, {
      kind: "research",
      title: `${p.kind === "research" ? "Research complete" : "Engineering complete"}: ${p.name}`,
      body: [`At ${base.name}. ${p.result}`, ...lines].join("\n\n"),
      regionId: base.regionId,
      pos: base.pos,
    });
  }
}

/** A finished project waiting on something (a helicopter with no free hangar). */
export const stalled = (a: ActiveProject) => {
  const p = defOf(a);
  return !!p && a.progress >= p.points;
};

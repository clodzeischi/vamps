// Research and engineering: one project of each kind at a time, worked by
// every scientist (engineer) at every base, a point per person per day.
// Captives and vampire remains are kept at bases and feed some projects.
import { AIRCRAFT } from "../data/aircraft";
import { BLOODLINES } from "../data/bloodlines";
import type { KitId } from "../data/kit";
import { PROJECTS, RESEARCH_EFFECTS, projectById, type Need, type ProjectDef, type ProjectKind } from "../data/research";
import type { CombatMods } from "./combat";
import { acquireAircraft, aircraftAt, freeCells, hangarsOf, staffAt } from "./personnel";
import { addLog, isReady, post, type Captive, type GameState, type Installation } from "./state";

export const researched = (s: GameState, id: string) => s.research.done.includes(id) || s.engineering.done.includes(id);

const readyBases = (s: GameState) => s.installations.filter((b) => b.kind === "base" && isReady(s, b));
const track = (s: GameState, kind: ProjectKind) => (kind === "research" ? s.research : s.engineering);

/** Scientists (research) or engineers (engineering) across the Order. */
export function staffFor(s: GameState, kind: ProjectKind): number {
  return readyBases(s).reduce((t, b) => t + staffAt(b, kind === "research" ? "scientist" : "engineer"), 0);
}

/** Days left on a project at the current staffing (Infinity with nobody on it). */
export function daysLeft(s: GameState, p: ProjectDef, progress: number): number {
  const staff = staffFor(s, p.kind);
  return staff ? Math.ceil((p.points - progress) / staff) : Infinity;
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

const freeHangar = (s: GameState) => readyBases(s).find((b) => aircraftAt(s, b.id).length < hangarsOf(b));

function needMet(s: GameState, need: Need | undefined): boolean {
  switch (need) {
    case undefined: return true;
    case "vampire-material": return totalRemains(s) > 0 || allCaptives(s).some((x) => x.captive.kind === "vampire");
    case "thrall-captive": return allCaptives(s).some((x) => x.captive.kind === "thrall");
    case "vampire-captive": return allCaptives(s).some((x) => x.captive.kind === "vampire");
    case "free-hangar": return !!freeHangar(s);
  }
}

export const NEED_WORDS: Record<Need, string> = {
  "vampire-material": "Needs vampire remains or a captive vampire.",
  "thrall-captive": "Needs a captive thrall in containment.",
  "vampire-captive": "Needs a captive vampire in containment.",
  "free-hangar": "Needs a free hangar at a base.",
};

/** Projects the player can see: prerequisites done, not already finished. */
export function visibleProjects(s: GameState, kind: ProjectKind): ProjectDef[] {
  return PROJECTS.filter((p) => p.kind === kind && (p.repeatable || !researched(s, p.id)) && p.requires.every((r) => researched(s, r)));
}

export function projectBlocker(s: GameState, id: string): string | null {
  const p = projectById(id);
  if (!p) return "No such project.";
  if (!p.repeatable && researched(s, p.id)) return "Already done.";
  if (!p.requires.every((r) => researched(s, r))) return "Not yet understood.";
  const t = track(s, p.kind);
  if (t.active) return `${projectById(t.active.id)?.name ?? "Another project"} is under way.`;
  if (!needMet(s, p.needs)) return NEED_WORDS[p.needs!];
  if (!staffFor(s, p.kind)) return p.kind === "research" ? "No scientists to do it." : "No engineers to do it.";
  if (s.funds < p.cost) return "Not enough funds for the materials.";
  return null;
}

export function startProject(s: GameState, id: string): string | null {
  const why = projectBlocker(s, id);
  if (why) return why;
  const p = projectById(id)!;
  s.funds -= p.cost;
  const active = { id, progress: 0, startedAt: s.time } as GameState["research"]["active"] & object;
  // An interrogation takes a particular captive (the longest held).
  if (p.needs === "thrall-captive" || p.needs === "vampire-captive") {
    const kind = p.needs === "thrall-captive" ? "thrall" : "vampire";
    const c = allCaptives(s).filter((x) => x.captive.kind === kind).sort((a, b) => a.captive.takenAt - b.captive.takenAt)[0]!;
    active.captiveId = c.captive.id;
  }
  track(s, p.kind).active = active;
  addLog(s, `${p.kind === "research" ? "Research" : "Work"} begins: ${p.name}.`);
  return null;
}

/** Stops the current project. Progress and materials are lost. */
export function cancelProject(s: GameState, kind: ProjectKind): string | null {
  const t = track(s, kind);
  if (!t.active) return "Nothing under way.";
  addLog(s, `${projectById(t.active.id)?.name ?? "A project"} abandoned.`);
  t.active = null;
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
function complete(s: GameState, p: ProjectDef, captiveId?: string): string[] | null {
  const lines: string[] = [];
  switch (p.id) {
    case "haematology":
      for (const a of s.agents) {
        a.stats.vitality = Math.min(95, a.stats.vitality + RESEARCH_EFFECTS.vitality);
        a.hp = Math.min(a.stats.vitality, a.hp + RESEARCH_EFFECTS.vitality);
      }
      break;
    case "interrogate-thrall":
    case "interrogate-vampire": {
      const held = allCaptives(s).find((x) => x.captive.id === captiveId);
      if (!held) {
        lines.push("The captive was lost before the questioning was done. Nothing came of it.");
        break;
      }
      const { base, captive } = held;
      base.captives = (base.captives ?? []).filter((c) => c !== captive);
      const gain = captive.kind === "vampire" ? RESEARCH_EFFECTS.vampireIntel : RESEARCH_EFFECTS.thrallIntel;
      const before = s.intel[captive.bloodline] ?? 0;
      s.intel[captive.bloodline] = Math.min(100, before + gain);
      lines.push(
        captive.kind === "vampire"
          ? `The one taken in ${captive.city} did not survive it. Intel on ${bloodlineName(captive.bloodline)} ${Math.round(s.intel[captive.bloodline]!)}/100.`
          : `The thrall taken in ${captive.city} has been handed to a convent hospital. Intel on ${bloodlineName(captive.bloodline)} ${Math.round(s.intel[captive.bloodline]!)}/100.`,
      );
      break;
    }
    case "build-helicopter": {
      const base = freeHangar(s);
      if (!base) return null; // finished, but nowhere to put it
      acquireAircraft(s, base.id, "helicopter", true);
      lines.push(`${s.aircraft.at(-1)!.name} (${AIRCRAFT.helicopter.name}) is ready at ${base.name}.`);
      break;
    }
  }
  if (!p.repeatable) track(s, p.kind).done.push(p.id);
  return lines;
}

/** Daily: staff put their day's work in; finished projects report. */
export function dailyResearch(s: GameState) {
  for (const kind of ["research", "engineering"] as const) {
    const t = track(s, kind);
    if (!t.active) continue;
    const p = projectById(t.active.id);
    if (!p) {
      t.active = null;
      continue;
    }
    t.active.progress = Math.min(p.points, t.active.progress + staffFor(s, kind));
    if (t.active.progress < p.points) continue;
    const lines = complete(s, p, t.active.captiveId);
    if (!lines) continue; // waiting (a helicopter with no hangar to go to)
    t.active = null;
    post(s, {
      kind: "research",
      title: `${kind === "research" ? "Research complete" : "Engineering complete"}: ${p.name}`,
      body: [p.result, ...lines].join("\n\n"),
    });
  }
}

/** A finished project is waiting on something (a helicopter with no free hangar). */
export const stalled = (s: GameState, kind: ProjectKind) => {
  const a = track(s, kind).active;
  const p = a && projectById(a.id);
  return !!p && a.progress >= p.points;
};

/** New campaigns and v4 saves. */
export function initResearch(s: GameState) {
  s.research ??= { done: [], active: null };
  s.engineering ??= { done: [], active: null };
}

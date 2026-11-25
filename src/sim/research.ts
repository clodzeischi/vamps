// Research and engineering. Research is one queue for the Order: every
// scientist works the top topic it can, with the lead scientist's
// multipliers (sim/science.ts). Engineering is a queue at each base: all its
// engineers work the top job, with the lead engineer's multipliers
// (sim/engineering.ts), drawing materials as they go. Material for research
// (remains, a captive) must be at a base with a laboratory and a scientist;
// material for engineering (a free hangar) at the base doing the work. What
// is learned is known everywhere.
import { AIRCRAFT } from "../data/aircraft";
import { VITALITY_CAP } from "../data/agents";
import { bloodlineById } from "../data/bloodlines";
import type { StaffRole } from "../data/installations";
import type { KitId } from "../data/kit";
import { PROJECTS, RESEARCH_EFFECTS, projectById, type Need, type ProjectDef, type ProjectKind } from "../data/research";
import type { CombatMods } from "./combat";
import { engineeringQueue, growEngineers, queueDays, queuedAt, teamOn, topOfQueue, unitsOf } from "./engineering";
import { acquireAircraft, aircraftAt, freeCells, hangarsOf, staffAt, staffAtWork } from "./personnel";
import { requirementOf, growAptitudes } from "./aptitudes";
import { labReady, materialBase, researchDays, researchTeam, topOfResearch } from "./science";
import { addLog, isReady, post, type ActiveProject, type Captive, type GameState, type Installation, readyBase } from "./state";
import { addClues, addPage } from "./networks";

export const researched = (s: GameState, id: string) => s.research.done.includes(id) || s.engineering.done.includes(id);

export const staffKind = (kind: ProjectKind): StaffRole => (kind === "research" ? "scientist" : "engineer");
const readyBases = (s: GameState) => s.installations.filter((b) => b.kind === "base" && isReady(s, b));
const defOf = (a: ActiveProject) => projectById(a.projectId);

/** Projects under way, optionally at one base and of one kind. */
export function projectsAt(s: GameState, baseId?: string, kind?: ProjectKind): ActiveProject[] {
  return s.projects.filter((a) => (!baseId || a.baseId === baseId) && (!kind || defOf(a)?.kind === kind));
}

/** Scientists (engineers) across the Order. */
export function staffSummary(s: GameState, kind: ProjectKind) {
  const k = staffKind(kind);
  return { total: readyBases(s).reduce((t, b) => t + staffAt(s, b, k), 0) };
}

/** Days until a project is done, with its queue ahead of it worked first at today's team. */
export function runDays(s: GameState, a: ActiveProject): number {
  const p = defOf(a);
  if (!p) return Infinity;
  return p.kind === "engineering" ? queueDays(s, a) : researchDays(s, a);
}

// ----- Captives and remains -----

export const allCaptives = (s: GameState) => readyBases(s).flatMap((b) => (b.captives ?? []).map((c) => ({ base: b, captive: c })));
export const totalRemains = (s: GameState) => readyBases(s).reduce((t, b) => t + (b.remains ?? 0), 0);

/** Puts a captive in a free cell at a base; false if there's no room. */
export function holdCaptive(s: GameState, base: Installation, kind: Captive["kind"], bloodline: string, city: string, regionId?: string): boolean {
  if (freeCells(base, s) <= 0) return false;
  (base.captives ??= []).push({ id: `captive-${s.nextId++}`, kind, bloodline, takenAt: s.time, city, ...(regionId ? { regionId } : {}) });
  return true;
}

export function findCaptive(s: GameState, captiveId: string) {
  return allCaptives(s).find((x) => x.captive.id === captiveId);
}

export const questioning = (s: GameState, captiveId: string) => s.projects.some((a) => a.captiveId === captiveId);

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
  const building = projectsAt(s, base.id).filter((a) => a.projectId === "build-helicopter").reduce((t, a) => t + unitsOf(a), 0);
  return hangarsOf(base) - aircraftAt(s, base.id).length - building;
}

function needMet(s: GameState, base: Installation, need: Need | undefined): boolean {
  switch (need) {
    case undefined: return true;
    case "vampire-material": return labReady(s, base) && ((base.remains ?? 0) > 0 || (base.captives ?? []).some((c) => c.kind === "vampire"));
    case "thrall-captive": return labReady(s, base) && !!freeCaptive(s, base, "thrall");
    case "vampire-captive": return labReady(s, base) && !!freeCaptive(s, base, "vampire");
    case "free-hangar": return freeHangars(s, base) > 0;
  }
}

/** Whether some ready base has what this project needs (remains, a captive, a hangar). */
export const needMetSomewhere = (s: GameState, p: ProjectDef) => !p.needs || readyBases(s).some((b) => needMet(s, b, p.needs));

export const NEED_WORDS: Record<Need, string> = {
  "vampire-material": "Needs vampire remains or a captive vampire at a base with a laboratory and a scientist.",
  "thrall-captive": "Needs a captive thrall held at a base with a laboratory and a scientist.",
  "vampire-captive": "Needs a captive vampire held at a base with a laboratory and a scientist.",
  "free-hangar": "Needs a free hangar at the base.",
};

/** Projects the player can see: prerequisites done, not finished, not already running (unless repeatable). */
export function visibleProjects(s: GameState, kind: ProjectKind): ProjectDef[] {
  return PROJECTS.filter(
    (p) => p.kind === kind && (p.repeatable || (!researched(s, p.id) && !s.projects.some((a) => a.projectId === p.id))) && p.requires.every((r) => researched(s, r)),
  );
}

/** Why a project can't be queued (research: the base matters only for a captive to question), or null. */
export function projectBlocker(s: GameState, id: string, baseId?: string): string | null {
  const p = projectById(id);
  if (!p) return "No such project.";
  return p.kind === "engineering" ? queueBlocker(s, id, baseId ?? "", 1) : researchBlocker(s, id, baseId);
}

const isCaptiveNeed = (p: ProjectDef) => p.needs === "thrall-captive" || p.needs === "vampire-captive";

/** Why a topic can't go into the research queue, or null. A captive's questioning names its base. */
export function researchBlocker(s: GameState, id: string, baseId?: string): string | null {
  const p = projectById(id);
  if (!p || p.kind !== "research") return "No such topic.";
  if (!p.repeatable && researched(s, p.id)) return "Already done.";
  if (!p.repeatable && s.projects.some((a) => a.projectId === p.id)) return "Already in the queue.";
  if (!p.requires.every((r) => researched(s, r))) return "Not yet understood.";
  if (isCaptiveNeed(p)) {
    const base = baseId ? readyBase(s, baseId) : undefined;
    if (!base) return "Choose the base holding the captive.";
    if (!freeCaptive(s, base, p.needs === "thrall-captive" ? "thrall" : "vampire")) return NEED_WORDS[p.needs!];
    if (!labReady(s, base)) return `Needs a laboratory and a scientist at ${base.name}.`;
  } else if (p.needs === "vampire-material" && !materialBase(s)) return NEED_WORDS["vampire-material"];
  if (!staffAtWork(s, "scientist").length) return "No scientists.";
  return null;
}

/** Puts a topic at the bottom of the research queue (a captive's questioning: the captive at that base). */
export function queueResearch(s: GameState, id: string, baseId?: string): string | null {
  const why = researchBlocker(s, id, baseId);
  if (why) return why;
  const p = projectById(id)!;
  const a: ActiveProject = { id: `proj-${s.nextId++}`, projectId: id, baseId: "", progress: 0, startedAt: s.time };
  if (isCaptiveNeed(p)) {
    const base = readyBase(s, baseId!)!;
    a.baseId = base.id;
    a.captiveId = freeCaptive(s, base, p.needs === "thrall-captive" ? "thrall" : "vampire")!.id;
  }
  s.projects.push(a);
  addLog(s, `${p.name} goes into the research queue.`);
  return null;
}

/** Most of one thing a single order can ask for. */
export const MAX_QUANTITY = 99;

/** Why `qty` of an engineering job can't be queued at a base, or null. */
export function queueBlocker(s: GameState, id: string, baseId: string, qty = 1): string | null {
  const p = projectById(id);
  if (!p || p.kind !== "engineering") return "No such job.";
  if (!p.repeatable && researched(s, p.id)) return "Already done.";
  if (!p.repeatable && s.projects.some((a) => a.projectId === p.id)) return "Already in a queue.";
  if (!p.requires.every((r) => researched(s, r))) return "Not yet understood.";
  const base = readyBase(s, baseId);
  if (!base) return "No operational base there.";
  if (!Number.isInteger(qty) || qty < 1 || qty > (p.repeatable ? MAX_QUANTITY : 1)) return p.repeatable ? `Between 1 and ${MAX_QUANTITY}.` : "Only one.";
  if (p.needs === "free-hangar") {
    const free = freeHangars(s, base);
    if (free < qty) return free <= 0 ? NEED_WORDS["free-hangar"] : `Only ${free} free hangar${free === 1 ? "" : "s"} at ${base.name}.`;
  } else if (!needMet(s, base, p.needs)) return NEED_WORDS[p.needs!];
  if (!staffAtWork(s, "engineer", base.id).length) return `No engineers at ${base.name}.`;
  return null;
}

/** Puts `qty` of an engineering job in a base's queue: at the bottom, or onto the order for the same
 *  thing already there. Materials are drawn as it's worked. */
export function queueJob(s: GameState, id: string, baseId: string, qty = 1): string | null {
  const why = queueBlocker(s, id, baseId, qty);
  if (why) return why;
  const p = projectById(id)!;
  const base = readyBase(s, baseId)!;
  const order = p.repeatable ? queuedAt(s, baseId, id) : undefined;
  if (order) {
    order.count = unitsOf(order) + qty;
    addLog(s, `${base.name}: ${qty} more ${p.name.toLowerCase()} on the order (${order.count} to make).`);
    return null;
  }
  s.projects.push({ id: `proj-${s.nextId++}`, projectId: id, baseId, progress: 0, startedAt: s.time, ...(qty > 1 ? { count: qty } : {}) });
  addLog(s, `${base.name}: ${qty > 1 ? `${qty} × ` : ""}${p.name.toLowerCase()} goes into the workshop queue.`);
  return null;
}

/** Changes how many an order still has to make (at least the one under way). */
export function setQuantity(s: GameState, runId: string, n: number): string | null {
  const a = s.projects.find((x) => x.id === runId);
  const p = a && defOf(a);
  if (!a || !p || p.kind !== "engineering") return "No such job.";
  if (!p.repeatable) return "Only one.";
  if (!Number.isInteger(n) || n < 1) return "At least the one under way; abandon it instead.";
  if (n > MAX_QUANTITY) return `At most ${MAX_QUANTITY}.`;
  if (p.needs === "free-hangar" && n > unitsOf(a)) {
    const base = readyBase(s, a.baseId);
    if (!base || freeHangars(s, base) < n - unitsOf(a)) return "No free hangar for another.";
  }
  if (n === 1) delete a.count;
  else a.count = n;
  return null;
}

/** Queues a research topic (the base: where a captive to question is held) or one of an engineering job at a base. */
export function startProject(s: GameState, id: string, baseId?: string): string | null {
  const p = projectById(id);
  return p?.kind === "engineering" ? queueJob(s, id, baseId ?? "", 1) : queueResearch(s, id, baseId);
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
  const retro = researched(s, "station-retrofit");
  const adv = researched(s, "advanced-signals") ? RESEARCH_EFFECTS.advancedSignals : 1;
  return { own: (retro ? RESEARCH_EFFECTS.sigintOwn : 1) * adv, neighbour: (retro ? RESEARCH_EFFECTS.sigintNeighbour : 1) * adv };
}

const bloodlineName = (id: string) => bloodlineById(id)?.name ?? "an unknown bloodline";

/** Applies a finished project; returns extra lines for the dispatch, or null to wait (no hangar yet). */
function complete(s: GameState, p: ProjectDef, a: ActiveProject, base: Installation): string[] | null {
  const lines: string[] = [];
  switch (p.id) {
    case "haematology":
      knowledgeEffects(s, p);
      break;
    case "interrogate-thrall":
    case "interrogate-vampire": {
      const captive = (base.captives ?? []).find((c) => c.id === a.captiveId);
      if (!captive) {
        lines.push("The captive was lost before the questioning was done. Nothing came of it.");
        break;
      }
      base.captives = (base.captives ?? []).filter((c) => c !== captive);
      const gain = captive.kind === "vampire" ? RESEARCH_EFFECTS.vampireClues : RESEARCH_EFFECTS.thrallClues;
      addPage(s, captive.bloodline);
      const learned = addClues(s, captive.bloodline, gain).join("; ");
      lines.push(
        captive.kind === "vampire"
          ? `The one taken in ${captive.city} did not survive it. On ${bloodlineName(captive.bloodline)}: ${learned.toLowerCase()}.`
          : `The thrall taken in ${captive.city} has been handed to a convent hospital. On ${bloodlineName(captive.bloodline)}: ${learned.toLowerCase()}.`,
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

/** What knowing a topic does at once (most effects are read from `researched` when they apply). */
function knowledgeEffects(s: GameState, p: ProjectDef) {
  if (p.id === "haematology")
    for (const ag of s.agents) {
      ag.vitality = Math.min(VITALITY_CAP, ag.vitality + RESEARCH_EFFECTS.vitality);
      ag.hp = Math.min(ag.vitality, ag.hp + RESEARCH_EFFECTS.vitality);
    }
}

/** A research topic learned without the work (bought on the dark web as information): done now,
 *  with its effects, and any project on it stops. */
export function learnTopic(s: GameState, id: string): string | null {
  const p = projectById(id);
  if (!p || p.kind !== "research" || p.repeatable) return "No such topic.";
  if (researched(s, id)) return "We know it already.";
  s.projects = s.projects.filter((a) => a.projectId !== id);
  knowledgeEffects(s, p);
  s.research.done.push(id);
  return null;
}

/** Daily: scientists put their day's work into their projects, each base's engineers into the top
 *  of its queue; finished projects report. */
export function dailyResearch(s: GameState) {
  for (const a of [...s.projects]) {
    const p = defOf(a);
    // Its base is gone (an engineering job, or a captive's questioning).
    if (!p || ((p.kind === "engineering" || a.captiveId) && !readyBase(s, a.baseId))) s.projects = s.projects.filter((x) => x !== a);
  }
  dailyScience(s);
  for (const base of readyBases(s)) dailyWorkshop(s, base);
}

/** The Order's scientists on the top of the research queue. */
function dailyScience(s: GameState) {
  const a = topOfResearch(s);
  if (!a) return;
  const p = defOf(a)!;
  const { rate } = researchTeam(s, p);
  if (rate <= 0) return;
  a.progress = Math.min(p.points, a.progress + rate);
  growAptitudes(staffAtWork(s, "scientist"), requirementOf(p));
  if (a.progress < p.points) return;
  const base = (a.captiveId ? readyBase(s, a.baseId) : undefined) ?? (p.needs === "vampire-material" ? materialBase(s) : undefined)
    ?? readyBases(s).find((b) => b.id === staffAtWork(s, "scientist")[0]?.baseId) ?? readyBases(s)[0];
  if (base) finish(s, a, p, base);
}

/** A base's engineers on the top of its queue: a day's work, its materials, and what's finished. */
function dailyWorkshop(s: GameState, base: Installation) {
  // Jobs done but waiting (a helicopter with no free hangar) try again.
  for (const a of engineeringQueue(s, base.id)) if (stalled(a)) unitDone(s, a, defOf(a)!, base);
  const a = topOfQueue(s, base.id);
  if (!a) return;
  const p = defOf(a)!;
  const team = teamOn(s, base, p);
  if (team.rate <= 0) return;
  // A day's work, carried on into the order's next unit when one is done.
  const gain = Math.min(team.rate, p.points * unitsOf(a) - a.progress);
  const spend = Math.round((p.cost * team.waste * gain) / p.points);
  if (spend > s.funds) {
    if (!a.short) addLog(s, `${base.name}: work on ${p.name.toLowerCase()} stops. No money for the materials.`, "bad");
    a.short = true;
    return;
  }
  delete a.short;
  s.funds -= spend;
  a.progress += gain;
  growEngineers(s, base, p);
  while (a.progress >= p.points && s.projects.includes(a)) if (!unitDone(s, a, p, base)) break;
}

/** One unit of an engineering job is made: it goes where it goes, and the order is done when the last
 *  is. False if it has to wait (a helicopter with no hangar to go to). */
function unitDone(s: GameState, a: ActiveProject, p: ProjectDef, base: Installation): boolean {
  let lines: string[] | null = [];
  if (p.product) {
    s.market.stock[p.product] = (s.market.stock[p.product] ?? 0) + 1;
    lines.push(`${s.market.stock[p.product]} in stores.`);
  } else lines = complete(s, p, a, base);
  if (!lines) return false;
  const left = unitsOf(a) - 1;
  if (left > 0) {
    if (left === 1) delete a.count;
    else a.count = left;
    a.progress -= p.points;
    addLog(s, `${base.name}: one ${p.name.toLowerCase()} done, ${left} to go. ${lines.join(" ")}`, "good");
    return true;
  }
  s.projects = s.projects.filter((x) => x !== a);
  post(s, {
    kind: "research",
    title: `Engineering complete: ${p.name}`,
    body: [`At ${base.name}. ${p.result}`, ...lines].join("\n\n"),
    regionId: base.regionId,
    pos: base.pos,
  });
  return true;
}

function finish(s: GameState, a: ActiveProject, p: ProjectDef, base: Installation) {
  const lines = complete(s, p, a, base);
  if (!lines) return; // waiting (a helicopter with no hangar to go to)
  s.projects = s.projects.filter((x) => x !== a);
  post(s, {
    kind: "research",
    title: `${p.kind === "research" ? "Research complete" : "Engineering complete"}: ${p.name}`,
    body: [a.captiveId ? `At ${base.name}. ${p.result}` : p.result, ...lines].join("\n\n"),
    regionId: base.regionId,
    pos: base.pos,
  });
}

/** A finished project waiting on something (a helicopter with no free hangar). */
export const stalled = (a: ActiveProject) => {
  const p = defOf(a);
  return !!p && a.progress >= p.points;
};

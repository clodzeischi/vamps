// The research queue: one for the whole Order (docs/design/base.md,
// "Scientists"). Every scientist at every base works the top topic it can;
// the lead scientist, named for the Order and not for a topic, multiplies
// everyone else's aptitudes (over 50). A topic that needs material (remains,
// a captive) needs it at a base with a laboratory and at least one scientist;
// until then it's skipped and the points go to the next.
import { APTITUDE_MIDDLE, POINTS_PER_DAY } from "../../data/aptitudes";
import {
  projectById,
  STUDY_ROOM_WORDS,
  type Need,
  type ProjectDef,
  type StudyRoom,
} from "../../data/research";
import { bloodlineById } from "../../data/bloodlines";
import { sampleId, sampleOf, type SampleHouse } from "../../data/equipment";
import { stockAt } from "../people/equipment";
import { requirementOf, skillOn } from "../people/aptitudes";
import { synergy } from "./building";
import { facilityCount, staffAtWork, staffLead } from "../people/personnel";
import { isReady, type ActiveProject, type GameState, type Installation } from "../core/state";

const readyBases = (s: GameState) =>
  s.installations.filter((b) => b.kind === "base" && isReady(s, b));

/** A base where material can be studied: a laboratory and at least one scientist there. */
export const labReady = (s: GameState, base: Installation) =>
  facilityCount(base, "lab") > 0 && staffAtWork(s, "scientist").some((p) => p.baseId === base.id);

/** What the Order's scientists do on a topic today: points a day and their average skill. */
export function researchTeam(s: GameState, p: ProjectDef, leadId?: string | null) {
  const people = staffAtWork(s, "scientist");
  const lead =
    leadId === undefined ? staffLead(s, "scientist") : people.find((x) => x.id === leadId);
  const req = requirementOf(p);
  const bases = new Map(readyBases(s).map((b) => [b.id, b]));
  let total = 0,
    plain = 0;
  for (const x of people) {
    const k = skillOn(req, x, lead);
    plain += k;
    total += k * (1 + synergy(bases.get(x.baseId)!, "lab"));
  }
  return {
    scientists: people.length,
    rate: POINTS_PER_DAY * (total / APTITUDE_MIDDLE),
    skill: people.length ? plain / people.length : 0,
  };
}

/** The research queue, top first. */
export const researchQueue = (s: GameState): ActiveProject[] =>
  s.projects.filter((a) => projectById(a.projectId)?.kind === "research");

/** Why the queue can't work on a topic today, or null. */
export function researchBlocked(s: GameState, a: ActiveProject): string | null {
  const p = projectById(a.projectId);
  if (!p) return "No such topic.";
  if (p.needs === "thrall-captive" || p.needs === "vampire-captive") {
    const base = readyBases(s).find((b) => b.id === a.baseId);
    if (!base || !(base.captives ?? []).some((c) => c.id === a.captiveId))
      return "The captive is gone.";
    if (!labReady(s, base)) return `Needs a laboratory and a scientist at ${base.name}.`;
  }
  if (studyBase(s, p) === undefined) return studyWords(p);
  return null;
}

/** Whether a base holds any tissue sample (docs/design/research.md, "Tissue samples"). */
export const holdsSample = (b: Installation) =>
  Object.entries(b.armoury ?? {}).some(([k, n]) => (n ?? 0) > 0 && !!sampleOf(k));

/** Vampire material at a base: a tissue sample, remains, or a captive vampire. */
export const holdsVampireMaterial = (b: Installation) =>
  holdsSample(b) || (b.remains ?? 0) > 0 || (b.captives ?? []).some((c) => c.kind === "vampire");

/** A refined vampire's or an elder's sample of this house at a base (a Strain's material). */
export const holdsHouseSample = (b: Installation, house: string) =>
  Object.entries(b.armoury ?? {}).some(([k, n]) => {
    const x = sampleOf(k);
    return (n ?? 0) > 0 && x?.house === house && x.kind !== "feral";
  });

/** The house a need names (`sample:<house>`, `elder:<house>`), or null. */
export const sampleNeedHouse = (need: Need | undefined): string | null =>
  need?.startsWith("sample:") ? need.slice(7) : need?.startsWith("elder:") ? need.slice(6) : null;

/** An elder's sample of this house at a base (a Lineage's material). */
export const holdsElderSample = (b: Installation, house: string) =>
  stockAt(b, sampleId("elder", house as SampleHouse)) > 0;

/** A need for material in a laboratory: any vampire material, or one house's sample. */
export const isMaterialNeed = (need: Need | undefined): need is Need =>
  need === "vampire-material" || !!sampleNeedHouse(need);

export const holdsMaterial = (b: Installation, need: Need) => {
  const house = sampleNeedHouse(need);
  if (!house) return holdsVampireMaterial(b);
  return need.startsWith("elder:") ? holdsElderSample(b, house) : holdsHouseSample(b, house);
};

/** What a material need asks for, in words. */
export function materialWords(need: Need): string {
  const house = sampleNeedHouse(need);
  return house
    ? `Needs a tissue sample from ${need.startsWith("elder:") ? "an elder" : "a vampire"} of ${bloodlineById(house)?.name ?? house} at a base with a laboratory and a scientist.`
    : "Needs a tissue sample, vampire remains or a captive vampire at a base with a laboratory and a scientist.";
}

/** A base that holds the material (any vampire material by default) and can study it (in that room, if one is needed). */
export const materialBase = (s: GameState, need: Need = "vampire-material", room?: StudyRoom) =>
  readyBases(s).find(
    (b) => labReady(s, b) && (!room || facilityCount(b, room) > 0) && holdsMaterial(b, need),
  );

/** A base with this room and a scientist at work there. */
export const roomBase = (s: GameState, room: StudyRoom) =>
  readyBases(s).find(
    (b) => facilityCount(b, room) > 0 && staffAtWork(s, "scientist").some((p) => p.baseId === b.id),
  );

/** Where a topic that needs material or a room can be worked today, or undefined (null: it needs neither). */
export function studyBase(s: GameState, p: ProjectDef): Installation | undefined | null {
  if (isMaterialNeed(p.needs)) return materialBase(s, p.needs, p.room);
  if (p.room) return roomBase(s, p.room);
  return null;
}

/** Why a topic's material or room is missing, in words. */
export function studyWords(p: ProjectDef): string {
  if (!p.room) return isMaterialNeed(p.needs) ? materialWords(p.needs) : "";
  const room = STUDY_ROOM_WORDS[p.room];
  return isMaterialNeed(p.needs)
    ? materialWords(p.needs).replace(
        "a base with a laboratory",
        `a base with ${room}, a laboratory`,
      )
    : `Needs ${room} and a scientist at the same base.`;
}

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

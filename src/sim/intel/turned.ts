// Turned thralls: a captive released as our source inside its bloodline; the best free operator makes the pitch.
import { bloodlineById } from "../../data/bloodlines";
import { REGIONS, regionById } from "../../data/regions";
import { skillChance } from "../people/skill";
import { findCaptive, questioning } from "../base/research";
import { rng } from "../core/rng";
import { changeSecrecy } from "../campaign/secrecy";
import {
  improvementLine,
  isWounded,
  post,
  train,
  type GameState,
  isDeployed,
  agentName,
} from "../core/state";
import {
  TURN_DIFFICULTY,
  recruitAsset,
  TURNED_FEE_SHARE,
  CATASTROPHE_SHARE,
  hasAsset,
  PR_MEDIA_DAMPING,
} from "./humint";

/** The operator who would make the pitch: the best tradecraft free at the captive's base. */
export function turnOperator(s: GameState, captiveId: string) {
  const held = findCaptive(s, captiveId);
  if (!held) return null;
  return (
    s.agents
      .filter((x) => x.baseId === held.base.id && !isDeployed(s, x) && !isWounded(s, x))
      .sort((x, y) => y.aptitudes.tradecraft - x.aptitudes.tradecraft)[0] ?? null
  );
}

/** Thrall dependence studied: a thrall's withdrawal is known, and turning one is easier. */
export const TURN_DIFFICULTY_STUDIED = 35;
export const turnChance = (s: GameState, tradecraft: number) =>
  skillChance(
    tradecraft -
      (s.research.done.includes("thrall-dependence") ? TURN_DIFFICULTY_STUDIED : TURN_DIFFICULTY),
  );

export function turnBlocker(s: GameState, captiveId: string): string | null {
  const held = findCaptive(s, captiveId);
  if (!held) return "No such captive.";
  if (held.captive.kind !== "thrall") return "A vampire can't be turned.";
  if (questioning(s, captiveId))
    return "They are being questioned. Abandon the interrogation first.";
  if (!turnOperator(s, captiveId)) return `Nobody at ${held.base.name} is free to make the pitch.`;
  return null;
}

/** Releases a thrall as our source inside its bloodline, if an operator can turn them (tradecraft). */
export function turnThrall(s: GameState, captiveId: string): string | null {
  const why = turnBlocker(s, captiveId);
  if (why) return why;
  const r = rng(s);
  const { base, captive } = findCaptive(s, captiveId)!;
  const op = turnOperator(s, captiveId)!;
  base.captives = (base.captives ?? []).filter((x) => x !== captive);
  const bl = bloodlineById(captive.bloodline);
  const regionId =
    captive.regionId ??
    REGIONS.find((x) => x.cities.some((c) => c.name === captive.city))?.id ??
    bl?.homeRegions[0] ??
    base.regionId;
  const region = regionById(regionId);
  const city = region?.cities.find((c) => c.name === captive.city) ??
    region?.cities[0] ?? { name: captive.city, ...base.pos };
  const who = `${agentName(op)}`;
  const ok = r.next() < turnChance(s, op.aptitudes.tradecraft);
  const gain = train(op, "tradecraft", ok ? r.int(1, 2) : r.int(0, 1));
  const improved = [improvementLine(op, { tradecraft: gain })].filter((x): x is string => !!x);
  if (ok) {
    const a = recruitAsset(
      s,
      "informant",
      `turned thrall of ${bl?.short ?? "a bloodline"}`,
      regionId,
      city.name,
      { lat: city.lat, lon: city.lon },
    );
    a.bloodline = captive.bloodline;
    a.monthly = Math.round((a.monthly * TURNED_FEE_SHARE) / 1_000) * 1_000;
    post(s, {
      kind: "coverup-result",
      heading: "A thrall is turned",
      title: `Turned: the thrall from ${captive.city}`,
      body: `${who} sat with the thrall from ${captive.city} for three nights, and on the fourth it agreed. It goes back to ${bl?.name ?? "its masters"} as ours: a voice inside the bloodline, for as long as they don't notice.`,
      regionId,
      pos: a.pos,
      effects: `Informant in ${region?.name}, now and then a den clue on the ${bl?.short ?? "bloodline"} · $${a.monthly.toLocaleString("en-US")}/mo`,
      improved,
    });
    return null;
  }
  const worse = r.chance(CATASTROPHE_SHARE);
  if (worse)
    changeSecrecy(s, -2, `a thrall we released went straight back to its masters`, {
      regionId,
      city: city.name,
      pos: { lat: city.lat, lon: city.lon },
    });
  post(s, {
    kind: "coverup-result",
    heading: "A thrall is turned",
    title: `Not turned: the thrall from ${captive.city}`,
    body: worse
      ? `${who} thought it had worked. The thrall went straight back to ${bl?.name ?? "its masters"} and told them everything it had seen of ${base.name}.`
      : `${who} couldn't reach it. The thrall was handed to a convent hospital; the cell is free.`,
    regionId,
    pos: { lat: city.lat, lon: city.lon },
    effects: worse ? "Secrecy −2" : "No agent",
    improved,
  });
  return null;
}

/** How much of a bloodline media hit lands in a region (PR assets blunt it). */
export const mediaDamping = (s: GameState, regionId: string) =>
  hasAsset(s, regionId, "pr") ? PR_MEDIA_DAMPING : 1;

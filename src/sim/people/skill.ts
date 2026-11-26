// Skill checks: one curve for every roll of our agents against a difficulty
// (a mission's plays, cover-ups and asset jobs, turning a thrall). The margin
// is the team's skill less the difficulty, plus any edge (intel, for a play);
// each point of margin is SKILL_SLOPE-th of the chance, and nothing is ever
// certain either way.
import type { OperatorAptitude } from "../../data/aptitudes";
import { KIT, type KitId } from "../../data/kit";
import type { Agent } from "../core/state";

/** Points of margin per +100% chance. */
const SKILL_SLOPE = 50;

/** The chance a check passes at this margin: an even chance at 0, between 5% and 95%. */
export const skillChance = (margin: number) => Math.min(0.95, Math.max(0.05, 0.5 + margin / SKILL_SLOPE));

/**
 * How good a team is at something: its best member counts most, the rest
 * help. In the field (with a kit) the kit adds its bonus, a crowd is hard to
 * hide and easy to fight with; off-screen work (no kit) is the people alone.
 */
export function teamSkill(agents: readonly Agent[], stat: OperatorAptitude, kit?: KitId): number {
  if (!agents.length) return 0;
  const vals = agents.map((a) => a.aptitudes[stat]);
  const best = Math.max(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  let v = best * 0.6 + avg * 0.4;
  if (!kit) return v;
  const n = agents.length;
  v += KIT[kit].bonus[stat] ?? 0;
  if (stat === "tradecraft") v -= 4 * Math.max(0, n - 2); // a crowd is hard to hide
  if (stat === "combat") v += 4 * Math.min(4, n - 1); // and easy to fight with
  return v;
}

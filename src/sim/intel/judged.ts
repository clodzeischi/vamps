// Judged rolls: random events where the player reads the situation and picks
// who to send (docs/design/covert.md, "Judged events").
//
// Nothing on screen names the stat or shows the odds. The text gives two
// hints: what kind of person the job needs (a variant, with stat weights) and
// how hard it is (a tier). The right agent on a routine job succeeds about
// four times in five; a wrong one about half the time. Failure stays possible
// on a good match, and the debrief says, in the fiction, whether it was a
// misread or bad luck.
import { OPERATOR_APTITUDES, type OperatorAptitude } from "../../data/aptitudes";
import type { Rng } from "../core/rng";
import { teamSkill } from "../people/skill";
import type { Agent } from "../core/state";

export type Tier = "easy" | "routine" | "hard" | "very-hard";
export type Weights = Partial<Record<OperatorAptitude, number>>;

/** The roll's target by tier (on the one skill curve, sim/people/skill.ts), whatever the aptitude. */
export const TIER_DIFFICULTY: Record<Tier, number> = {
  easy: 26,
  routine: 38,
  hard: 48,
  "very-hard": 58,
};
/** How often each tier comes up (among the tiers a template allows). */
const TIER_ODDS: Record<Tier, number> = { easy: 0.3, routine: 0.45, hard: 0.2, "very-hard": 0.05 };
/** What success is worth, by tier: hard jobs pay more. */
export const TIER_REWARD: Record<Tier, number> = {
  easy: 0.75,
  routine: 1,
  hard: 1.4,
  "very-hard": 1.8,
};

/** Only hard and very hard jobs can backfire or burn an asset. */
export const isSevere = (t: Tier) => t === "hard" || t === "very-hard";

/** One reading of a situation: what it needs, and the text that hints at it. */
export interface Variant {
  /** Stat weights; the heaviest is the primary stat (experience, and the debrief). */
  weights: Weights;
  /** One or two sentences that hint at the stat without naming it. */
  hint: string;
  /** Debrief line after a failure by the wrong kind of person: what it needed, in the fiction. */
  why: string;
  /** Only for lay people: the hint wouldn't fit a priest or a prioress (Mass, a car, a daughter). */
  laity?: boolean;
  /** Result text for this reading, when the template's doesn't fit it. */
  success?: string;
  fail?: string;
  backfire?: string;
}

export interface JudgedTemplate {
  /** The situation, before the hints. */
  text: string;
  variants: Variant[];
  /** The tiers this situation can come in, each with its hint ("" for routine: plain text). */
  tiers: Partial<Record<Tier, string>>;
}

export const primaryStat = (w: Weights): OperatorAptitude =>
  (Object.entries(w) as [OperatorAptitude, number][]).sort((a, b) => b[1] - a[1])[0]![0];

/** Weighted skill minus difficulty. */
export function judgedMargin(agents: readonly Agent[], weights: Weights, tier: Tier): number {
  let margin = 0;
  let total = 0;
  for (const [stat, w] of Object.entries(weights) as [OperatorAptitude, number][]) {
    margin += w * (teamSkill(agents, stat) - TIER_DIFFICULTY[tier]);
    total += w;
  }
  return total ? margin / total : 0;
}

/** Picks a reading and a tier for a new offer. */
export function pickJudged(
  t: JudgedTemplate,
  r: Rng,
  allow: (v: Variant) => boolean = () => true,
): { variant: number; tier: Tier; text: string } {
  const fits = t.variants.map((v, i) => [v, i] as const).filter(([v]) => allow(v));
  const variant = r.pick(fits.length ? fits : t.variants.map((v, i) => [v, i] as const))[1];
  const tiers = (Object.keys(t.tiers) as Tier[]).filter((x) => t.tiers[x] !== undefined);
  const total = tiers.reduce((a, x) => a + TIER_ODDS[x], 0);
  let roll = r.real(0, total);
  let tier = tiers[tiers.length - 1]!;
  for (const x of tiers) {
    roll -= TIER_ODDS[x];
    if (roll <= 0) {
      tier = x;
      break;
    }
  }
  const text = [t.text, t.variants[variant]!.hint, t.tiers[tier]].filter(Boolean).join(" ");
  return { variant, tier, text };
}

const BAD_LUCK = [
  "The right person went, and it still went wrong. It happens.",
  "Nobody could have done it better. Some days it goes this way.",
  "It was well done, and it didn't work.",
  "We sent the right one. It wasn't enough this time.",
];
const TOO_GREEN = [
  "It was the right kind of person for it, but it wanted someone more seasoned.",
  "The right instinct, but not yet the experience a job like this asks for.",
  "A good choice that needed a few more years behind it.",
];

/**
 * The debrief line after a failure: a misread (the variant's `why`), the
 * right kind of person short of experience, or bad luck.
 */
export function verdictLine(agents: readonly Agent[], v: Variant, tier: Tier, r: Rng): string {
  if (judgedMargin(agents, v.weights, tier) >= 0) return r.pick(BAD_LUCK);
  const need = primaryStat(v.weights);
  // Was the need the team's strongest suit?
  const suit = OPERATOR_APTITUDES.map((s) => [s, teamSkill(agents, s)] as const).sort(
    (a, b) => b[1] - a[1],
  )[0]![0];
  return suit === need ? r.pick(TOO_GREEN) : v.why;
}

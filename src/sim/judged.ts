// Judged rolls: random events where the player reads the situation and picks
// who to send (docs/WEB_PORT.md, "Judged events").
//
// Nothing on screen names the stat or shows the odds. The text gives two
// hints: what kind of person the job needs (a variant, with stat weights) and
// how hard it is (a tier). The right agent on a routine job succeeds about
// four times in five; a wrong one about half the time. Failure stays possible
// on a good match, and the debrief says, in the fiction, whether it was a
// misread or bad luck.
import type { StatId } from "../data/agents";
import type { Rng } from "./rng";
import type { Agent } from "./state";

export type Tier = "easy" | "routine" | "hard" | "very-hard";
export type Weights = Partial<Record<StatId, number>>;

/** The roll's target by tier. Faith runs higher at recruitment (40–70 against 25–55), so Faith checks sit FAITH_OFFSET higher. */
export const TIER_DIFFICULTY: Record<Tier, number> = { easy: 30, routine: 42, hard: 52, "very-hard": 62 };
export const FAITH_OFFSET = 15;
/** How often each tier comes up (among the tiers a template allows). */
export const TIER_ODDS: Record<Tier, number> = { easy: 0.3, routine: 0.45, hard: 0.2, "very-hard": 0.05 };
/** What success is worth, by tier: hard jobs pay more. */
export const TIER_REWARD: Record<Tier, number> = { easy: 0.75, routine: 1, hard: 1.4, "very-hard": 1.8 };
/** Points of margin per +100% chance: 0.55 + margin / SLOPE. */
export const SLOPE = 40;

/** Only hard and very hard jobs can backfire or burn an asset (an offer without a tier, from an older save, counts as hard). */
export const isSevere = (t?: Tier) => t !== "easy" && t !== "routine";

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

export const primaryStat = (w: Weights): StatId =>
  (Object.entries(w) as [StatId, number][]).sort((a, b) => b[1] - a[1])[0]![0];

export const difficultyFor = (stat: StatId, tier: Tier) => TIER_DIFFICULTY[tier] + (stat === "faith" ? FAITH_OFFSET : 0);

/** A team's skill at off-screen work: the best of them carries it, the rest help. No kit bonus. */
export function judgedSkill(agents: readonly Agent[], stat: StatId): number {
  if (!agents.length) return 0;
  const vals = agents.map((a) => a.stats[stat]);
  return Math.max(...vals) * 0.6 + (vals.reduce((a, b) => a + b, 0) / vals.length) * 0.4;
}

/** Weighted skill minus difficulty. Without a tier (older saves) the stored difficulty is used. */
export function judgedMargin(agents: readonly Agent[], weights: Weights, tier: Tier | undefined, legacyDifficulty: number): number {
  let margin = 0;
  let total = 0;
  for (const [stat, w] of Object.entries(weights) as [StatId, number][]) {
    const d = tier ? difficultyFor(stat, tier) : legacyDifficulty;
    margin += w * (judgedSkill(agents, stat) - d);
    total += w;
  }
  return total ? margin / total : 0;
}

export const chanceFromMargin = (margin: number) => Math.min(0.95, Math.max(0.05, 0.55 + margin / SLOPE));

/** Picks a reading and a tier for a new offer. */
export function pickJudged(t: JudgedTemplate, r: Rng, allow: (v: Variant) => boolean = () => true): { variant: number; tier: Tier; text: string } {
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
export function verdictLine(agents: readonly Agent[], v: Variant, tier: Tier | undefined, legacyDifficulty: number, r: Rng): string {
  if (judgedMargin(agents, v.weights, tier, legacyDifficulty) >= 0) return r.pick(BAD_LUCK);
  const need = primaryStat(v.weights);
  // Was the need the team's strongest suit (Faith measured against its higher baseline)?
  const suit = (["combat", "tradecraft", "insight", "faith"] as StatId[])
    .map((s) => [s, judgedSkill(agents, s) - (s === "faith" ? FAITH_OFFSET : 0)] as const)
    .sort((a, b) => b[1] - a[1])[0]![0];
  return suit === need ? r.pick(TOO_GREEN) : v.why;
}

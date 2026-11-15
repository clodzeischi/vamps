// OPV agents: Catholic religious under the three vows, trained by the Order.
// They take no salary; the Order pays their upkeep.

export type StatId = "combat" | "tradecraft" | "insight" | "faith" | "vitality";

export const STATS: { id: StatId; name: string; short: string; description: string }[] = [
  { id: "combat", name: "Combat", short: "CMB", description: "Firearms, blades and close quarters." },
  { id: "tradecraft", name: "Tradecraft", short: "TRD", description: "Surveillance, cover, moving unseen." },
  { id: "insight", name: "Insight", short: "INS", description: "Reading people: interrogation, sources, spotting a lie." },
  { id: "faith", name: "Faith", short: "FTH", description: "Nerve, and resistance to a vampire's pheromones." },
  { id: "vitality", name: "Vitality", short: "VIT", description: "How much punishment the body takes." },
];

export type Stats = Record<StatId, number>;

/** Training a recruit: one-off. */
export const RECRUIT_COST = 80_000;
/** Housing, food, training and kit per agent per month. */
export const AGENT_UPKEEP = 25_000;
/** Candidates offered each month. */
export const CANDIDATES_PER_MONTH = 6;
/** Share of sisters among recruits (religious vows apply to both). */
export const SISTER_SHARE = 0.35;
/** Hit points a wounded agent recovers a day (field medicine raises it). A bad wound, 35 of 45, is about six days. */
export const HEAL_PER_DAY = 6;
/** Agents at Padua when a campaign starts. */
export const STARTING_AGENTS = 6;

/** Starting stat ranges for a new recruit. */
export const RECRUIT_STAT_RANGES: Record<StatId, [number, number]> = {
  combat: [25, 55],
  tradecraft: [25, 55],
  insight: [25, 55],
  faith: [40, 70],
  vitality: [30, 50],
};

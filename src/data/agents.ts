// OPV agents (operators): Catholic religious under the three vows, trained by the Order.
// They take no salary; the Order pays their upkeep.

/** Training a recruit: one-off. */
export const RECRUIT_COST = 80_000;
/** A month's pay for anyone with 50 in every aptitude: an operator's upkeep (housing, food, training,
 *  kit), a lay staff member's salary. It scales in proportion to their mean aptitude (sim/personnel.ts). */
export const PAY_AT_MIDDLE = 20_000;
/** Candidates offered each month. */
export const CANDIDATES_PER_MONTH = 6;
/** Share of sisters among recruits (religious vows apply to both). */
export const SISTER_SHARE = 0.35;
/** Hit points a wounded agent recovers a day (field medicine raises it). A bad wound, 35 of 45, is about six days. */
export const HEAL_PER_DAY = 6;
/** Agents at Padua when a campaign starts. */
export const STARTING_AGENTS = 4;

/** An operator's Vitality (their hit points), rolled when they're put forward. Their aptitudes: data/aptitudes.ts. */
export const VITALITY_RANGE: [number, number] = [30, 50];
/** Research and kit raise it, up to this. */
export const VITALITY_CAP = 100;
export const VITALITY = { name: "Vitality", short: "VIT", covers: "How much punishment the body takes." };

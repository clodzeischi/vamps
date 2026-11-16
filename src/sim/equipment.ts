// Per-agent equipment (docs/WEB_PORT.md 3.7d): the armoury at each base,
// buying, equipping, and what a kit lets each agent take along.
import { allowedWith, ITEMS, MEDKIT_HEAL, STANDARD_ISSUE, UTILITY_SLOTS, type ItemId, type Slot } from "../data/equipment";
import type { KitId } from "../data/kit";
import { addLog, isReady, type Agent, type GameState, type Gear, type Installation } from "./state";

export const gearOf = (a: Pick<Agent, "gear">): Gear => a.gear ?? { utility: [] };
export const standardIssue = (): Gear => ({ weapon: STANDARD_ISSUE.weapon, armour: STANDARD_ISSUE.armour, utility: [] });

/** What an agent actually takes with a kit: what the kit allows; a knife when the weapon stays behind. */
export function carried(a: Pick<Agent, "gear">, kit: KitId): { weapon: ItemId; armour: ItemId | null; utility: ItemId[]; leftBehind: ItemId[] } {
  const g = gearOf(a);
  const left: ItemId[] = [];
  const keep = (x: ItemId | undefined) => {
    if (!x) return null;
    if (allowedWith(x, kit)) return x;
    left.push(x);
    return null;
  };
  const weapon = keep(g.weapon) ?? "knife";
  const armour = keep(g.armour);
  const utility = g.utility.filter((x) => keep(x) !== null);
  return { weapon, armour, utility, leftBehind: left };
}

export const agentFirepower = (a: Pick<Agent, "gear">, kit: KitId) => ITEMS[carried(a, kit).weapon].firepower ?? 0.55;
export const agentArmour = (a: Pick<Agent, "gear">, kit: KitId) => { const x = carried(a, kit).armour; return x ? ITEMS[x].armour ?? 0 : 0; };

// ----- The armoury -----

export const stockAt = (b: Installation, item: ItemId) => b.armoury?.[item] ?? 0;
export const addStock = (b: Installation, item: ItemId, n: number) => {
  const left = stockAt(b, item) + n;
  b.armoury ??= {};
  if (left > 0) b.armoury[item] = left;
  else delete b.armoury[item];
};
const baseOf = (s: GameState, id: string) => s.installations.find((i) => i.id === id && i.kind === "base" && isReady(s, i));
export const itemKnown = (s: GameState, item: ItemId) => !ITEMS[item].requires || s.research.done.includes(ITEMS[item].requires!) || s.engineering.done.includes(ITEMS[item].requires!);

export function buyBlocker(s: GameState, baseId: string, item: ItemId, n = 1): string | null {
  if (!baseOf(s, baseId)) return "No operational base there.";
  if (!itemKnown(s, item)) return "Not yet available.";
  if (!ITEMS[item].cost) return "Every agent has one.";
  if (s.funds < ITEMS[item].cost * n) return "Not enough funds.";
  return null;
}

export function buyItem(s: GameState, baseId: string, item: ItemId, n = 1): string | null {
  const why = buyBlocker(s, baseId, item, n);
  if (why) return why;
  s.funds -= ITEMS[item].cost * n;
  addStock(baseOf(s, baseId)!, item, n);
  return null;
}

/** An agent who can change kit now: at their base, not away. */
function atHome(s: GameState, agentId: string): { a: Agent; b: Installation } | string {
  const a = s.agents.find((x) => x.id === agentId);
  if (!a) return "No such agent.";
  if (a.deployed || a.arriveAt) return `${a.name} is away.`;
  const b = baseOf(s, a.baseId);
  return b ? { a, b } : "Not at an operational base.";
}

/** Puts an item from the base's armoury in a slot (null empties it); what was there goes back to the armoury. */
export function equip(s: GameState, agentId: string, slot: Slot, item: ItemId | null, index = 0): string | null {
  const at = atHome(s, agentId);
  if (typeof at === "string") return at;
  const { a, b } = at;
  if (item && ITEMS[item].slot !== slot) return "That doesn't go there.";
  if (item && item !== "knife" && stockAt(b, item) <= 0) return `None in ${b.name}'s armoury.`;
  if (slot === "utility" && index >= UTILITY_SLOTS) return "No such slot.";
  const g = (a.gear ??= { utility: [] });
  const old = slot === "utility" ? g.utility[index] : g[slot];
  if (old && old !== "knife") addStock(b, old, 1);
  if (item && item !== "knife") addStock(b, item, -1);
  if (slot === "utility") {
    const u = [...g.utility];
    if (item) u[index] = item;
    else u.splice(index, 1);
    g.utility = u.filter(Boolean);
  } else if (item && item !== "knife") g[slot] = item;
  else delete g[slot];
  return null;
}

/** Fills an agent's slots with the best the armoury has for a kit (keeps what's already better). */
export function issueBest(s: GameState, agentId: string, kit: KitId): string | null {
  const at = atHome(s, agentId);
  if (typeof at === "string") return at;
  const { a, b } = at;
  const best = (slot: Slot, score: (x: ItemId) => number, current?: ItemId) => {
    const options = (Object.keys(ITEMS) as ItemId[]).filter((x) => ITEMS[x].slot === slot && allowedWith(x, kit) && x !== "knife" && stockAt(b, x) > 0 && itemKnown(s, x));
    const pick = options.sort((x, y) => score(y) - score(x) || ITEMS[y].cost - ITEMS[x].cost)[0]; // ties: the dearer one
    const cur = current && allowedWith(current, kit) ? score(current) : -1;
    return pick && score(pick) > cur ? pick : null;
  };
  const g = gearOf(a);
  const w = best("weapon", (x) => ITEMS[x].firepower ?? 0, g.weapon);
  if (w) equip(s, a.id, "weapon", w);
  const ar = best("armour", (x) => ITEMS[x].armour ?? 0, gearOf(a).armour);
  if (ar) equip(s, a.id, "armour", ar);
  // Utility: an incendiary with tactical kit, and a medkit, while there's room.
  for (const want of ["incendiary", "medkit"] as ItemId[]) {
    const u = gearOf(a).utility;
    if (u.includes(want) || u.length >= UTILITY_SLOTS || !allowedWith(want, kit) || stockAt(b, want) <= 0) continue;
    equip(s, a.id, "utility", want, u.length);
  }
  return null;
}

/** Whether the base's armoury has something better for this agent and kit (a weapon or armour). */
export function issueWouldHelp(s: GameState, a: Agent, kit: KitId): boolean {
  const b = baseOf(s, a.baseId);
  if (!b || a.deployed) return false;
  const c = carried(a, kit);
  const better = (slot: Slot, score: (x: ItemId) => number, cur: number) =>
    (Object.keys(ITEMS) as ItemId[]).some((x) => ITEMS[x].slot === slot && allowedWith(x, kit) && x !== "knife" && stockAt(b, x) > 0 && score(x) > cur);
  return better("weapon", (x) => ITEMS[x].firepower ?? 0, ITEMS[c.weapon].firepower ?? 0) || better("armour", (x) => ITEMS[x].armour ?? 0, c.armour ? ITEMS[c.armour].armour ?? 0 : 0);
}

/** Everything an agent carries goes back to the armoury (released from service). */
export function returnGear(s: GameState, a: Agent) {
  const b = baseOf(s, a.baseId);
  if (!b) return;
  const g = gearOf(a);
  for (const x of [g.weapon, g.armour, ...g.utility]) if (x && x !== "knife") addStock(b, x, 1);
  a.gear = { utility: [] };
}

/** Takes one of a used-up item off an agent. */
export function useUp(a: Agent, item: ItemId) {
  const g = gearOf(a);
  const i = g.utility.indexOf(item);
  if (i >= 0) a.gear = { ...g, utility: g.utility.filter((_, k) => k !== i) };
}

/** After a fight: each medkit the team carried patches the worst wound left. Returns how many were used. */
export function useMedkits(s: GameState, team: Agent[], kit: KitId): number {
  let used = 0;
  for (const a of team) {
    for (const x of carried(a, kit).utility.filter((y) => y === "medkit")) {
      const hurt = team.filter((t) => t.hp > 0 && t.hp < t.stats.vitality).sort((p, q) => p.hp / p.stats.vitality - q.hp / q.stats.vitality)[0];
      if (!hurt) break;
      hurt.hp = Math.min(hurt.stats.vitality, hurt.hp + MEDKIT_HEAL);
      useUp(a, x);
      used++;
    }
  }
  if (used) addLog(s, `Field dressings: ${used} trauma kit${used === 1 ? "" : "s"} used.`);
  return used;
}

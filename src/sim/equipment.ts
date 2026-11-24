// Per-agent equipment (docs/design/base.md, docs/design/inventory.md): the
// armoury at each base, buying, equipping, and what a kit lets each agent
// take along. The loadout is a grid (sim/inventory.ts); here it meets the
// armoury, which is a plain count per item.
import { allowedWith, ITEMS, MEDKIT_HEAL, STANDARD_ISSUE, type ItemId } from "../data/equipment";
import type { KitId } from "../data/kit";
import {
  allItems, canPut, cloneGear, countOf, emptyGear, moveWithin, putIn, stowAnywhere, takeOut, WORN,
  type Gear, type Place, type Stowed, type WornSlot,
} from "./inventory";
import { addLog, isReady, type Agent, type GameState, type Installation, isDeployed } from "./state";

export const gearOf = (a: Pick<Agent, "gear">): Gear => a.gear ?? emptyGear();
export function standardIssue(): Gear {
  const g: Gear = { weapon: STANDARD_ISSUE.weapon, armour: STANDARD_ISSUE.armour, stowed: [] };
  for (const x of STANDARD_ISSUE.carried) stowAnywhere(g, x);
  return g;
}

/** What an agent takes with a kit: the loadout less what the kit doesn't allow; a knife when no weapon goes along. */
export function carried(a: Pick<Agent, "gear">, kit: KitId): { gear: Gear; weapon: ItemId; armour: ItemId | null; helmet: ItemId | null; stowed: Stowed[]; leftBehind: ItemId[] } {
  const g = cloneGear(gearOf(a));
  const left: ItemId[] = [];
  for (const slot of WORN) {
    const x = g[slot];
    if (x && !allowedWith(x, kit)) {
      left.push(x);
      delete g[slot];
    }
  }
  g.stowed = g.stowed.filter((x) => allowedWith(x.item, kit) || (left.push(x.item), false));
  return { gear: g, weapon: g.weapon ?? "knife", armour: g.armour ?? null, helmet: g.helmet ?? null, stowed: g.stowed, leftBehind: left };
}

export const agentFirepower = (a: Pick<Agent, "gear">, kit: KitId) => ITEMS[carried(a, kit).weapon].firepower ?? 0.55;
/** Armour and helmet together (capped by the caller). */
export const agentArmour = (a: Pick<Agent, "gear">, kit: KitId) => {
  const c = carried(a, kit);
  return (c.armour ? ITEMS[c.armour].armour ?? 0 : 0) + (c.helmet ? ITEMS[c.helmet].armour ?? 0 : 0);
};

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

// Buying is on the dark web (sim/market.ts): a cart, shipped to a base in 40 hours.

/** An agent who can change kit now: at their base, not away. */
function atHome(s: GameState, agentId: string): { a: Agent; b: Installation } | string {
  const a = s.agents.find((x) => x.id === agentId);
  if (!a) return "No such agent.";
  if (isDeployed(s, a)) return `${a.name} is away.`;
  const b = baseOf(s, a.baseId);
  return b ? { a, b } : "Not at an operational base.";
}

/** Rearranges an agent's own kit: from one place to another (a worn item swaps if the slot is taken). */
export function moveGear(s: GameState, agentId: string, from: Place, to: Place): string | null {
  const at = atHome(s, agentId);
  if (typeof at === "string") return at;
  const g = (at.a.gear ??= emptyGear());
  return moveWithin(g, from, to);
}

/** Takes one from the base's armoury into a place. A worn item already there goes back to the armoury. */
export function fromArmoury(s: GameState, agentId: string, item: ItemId, to?: Place): string | null {
  const at = atHome(s, agentId);
  if (typeof at === "string") return at;
  const { a, b } = at;
  if (item === "knife") return "Every agent has one.";
  if (stockAt(b, item) <= 0) return `None in ${b.name}'s armoury.`;
  const g = (a.gear ??= emptyGear());
  if (!to) {
    if (!stowAnywhere(g, item)) return "No room for it.";
  } else {
    if ("slot" in to && ITEMS[item].slot !== to.slot) return "That doesn't go there.";
    if ("slot" in to && g[to.slot]) addStock(b, takeOut(g, to)!.item, 1);
    if (!canPut(g, item, to)) return "It doesn't fit there.";
    putIn(g, item, to);
  }
  addStock(b, item, -1);
  return null;
}

/** Puts what's at a place back in the base's armoury. */
export function toArmoury(s: GameState, agentId: string, from: Place): string | null {
  const at = atHome(s, agentId);
  if (typeof at === "string") return at;
  const out = takeOut((at.a.gear ??= emptyGear()), from);
  if (!out) return "Nothing there.";
  addStock(at.b, out.item, 1);
  return null;
}

/** Puts an item from the armoury in a worn slot (null empties it); what was there goes back to the armoury. */
export function equip(s: GameState, agentId: string, slot: WornSlot, item: ItemId | null): string | null {
  const at = atHome(s, agentId);
  if (typeof at === "string") return at;
  if (!item || item === "knife") {
    if (gearOf(at.a)[slot]) return toArmoury(s, agentId, { slot });
    return null;
  }
  if (ITEMS[item].slot !== slot) return "That doesn't go there.";
  return fromArmoury(s, agentId, item, { slot });
}

const score = {
  weapon: (x: ItemId) => ITEMS[x].firepower ?? 0,
  armour: (x: ItemId) => ITEMS[x].armour ?? 0,
  helmet: (x: ItemId) => ITEMS[x].armour ?? 0,
} satisfies Record<WornSlot, (x: ItemId) => number>;

/** Fills an agent's slots with the best the armoury has for a kit (keeps what's already better), with magazines. */
export function issueBest(s: GameState, agentId: string, kit: KitId): string | null {
  const at = atHome(s, agentId);
  if (typeof at === "string") return at;
  const { a, b } = at;
  const best = (slot: WornSlot, current?: ItemId) => {
    const options = (Object.keys(ITEMS) as ItemId[]).filter((x) => ITEMS[x].slot === slot && allowedWith(x, kit) && x !== "knife" && stockAt(b, x) > 0);
    const pick = options.sort((x, y) => score[slot](y) - score[slot](x) || ITEMS[y].cost - ITEMS[x].cost)[0]; // ties: the dearer one
    const cur = current && allowedWith(current, kit) ? score[slot](current) : -1;
    return pick && score[slot](pick) > cur ? pick : null;
  };
  for (const slot of WORN) {
    const x = best(slot, gearOf(a)[slot]);
    if (x) equip(s, a.id, slot, x);
  }
  // Two magazines for the weapon in hand, an incendiary with tactical kit, a medkit: while there's room.
  const mag = gearOf(a).weapon ? ITEMS[gearOf(a).weapon!].mag : undefined;
  const wants: ItemId[] = [...(mag ? [mag, mag] : []), "incendiary", "medkit"];
  const have: Partial<Record<ItemId, number>> = {};
  for (const want of wants) {
    have[want] = (have[want] ?? 0) + 1;
    if (countOf(gearOf(a), want) >= have[want]! || !allowedWith(want, kit) || stockAt(b, want) <= 0) continue;
    fromArmoury(s, a.id, want);
  }
  return null;
}

/** Whether the base's armoury has something better for this agent and kit (a weapon, armour or a helmet). */
export function issueWouldHelp(s: GameState, a: Agent, kit: KitId): boolean {
  const b = baseOf(s, a.baseId);
  if (!b || isDeployed(s, a)) return false;
  const c = carried(a, kit);
  const cur = { weapon: c.weapon, armour: c.armour, helmet: c.helmet };
  return WORN.some((slot) => {
    const now = cur[slot] ? score[slot](cur[slot]!) : 0;
    return (Object.keys(ITEMS) as ItemId[]).some((x) => ITEMS[x].slot === slot && allowedWith(x, kit) && x !== "knife" && stockAt(b, x) > 0 && score[slot](x) > now);
  });
}

/** Everything an agent carries goes back to the armoury (released from service). */
export function returnGear(s: GameState, a: Agent) {
  const b = baseOf(s, a.baseId);
  if (!b) return;
  for (const x of allItems(gearOf(a))) if (x !== "knife") addStock(b, x, 1);
  a.gear = emptyGear();
}

/** Takes one of a used-up item off an agent (from the backpack before the pockets: those are for what's needed fast). */
export function useUp(a: Agent, item: ItemId) {
  const g = gearOf(a);
  const all = g.stowed.filter((x) => x.item === item);
  const one = all.find((x) => x.in === "pack") ?? all[0];
  if (one) a.gear = { ...g, stowed: g.stowed.filter((x) => x !== one) };
}

/** After a fight: each medkit the team carried patches the worst wound left. Returns how many were used. */
export function useMedkits(s: GameState, team: Agent[], kit: KitId): number {
  let used = 0;
  for (const a of team) {
    for (const x of carried(a, kit).stowed.filter((y) => y.item === "medkit")) {
      const hurt = team.filter((t) => t.hp > 0 && t.hp < t.vitality).sort((p, q) => p.hp / p.vitality - q.hp / q.vitality)[0];
      if (!hurt) break;
      hurt.hp = Math.min(hurt.vitality, hurt.hp + MEDKIT_HEAL);
      useUp(a, x.item);
      used++;
    }
  }
  if (used) addLog(s, `Field dressings: ${used} trauma kit${used === 1 ? "" : "s"} used.`);
  return used;
}

/**
 * After a battle the player fought: the agent comes home with what they
 * carried out (picked up, used up, swapped). What the kit left at home goes
 * back where it was if there's room, else into the armoury.
 */
export function bringHome(s: GameState, a: Agent, kit: KitId, fought: Gear) {
  const home = cloneGear(fought);
  delete home.ammo;
  for (const x of home.stowed) delete x.ammo;
  const b = baseOf(s, a.baseId);
  const before = gearOf(a);
  const stayed: { item: ItemId; place: Place }[] = [];
  for (const slot of WORN) {
    const x = before[slot];
    if (x && !allowedWith(x, kit)) stayed.push({ item: x, place: { slot } });
  }
  for (const x of before.stowed) if (!allowedWith(x.item, kit)) stayed.push({ item: x.item, place: { in: x.in, x: x.x, y: x.y } });
  for (const { item, place } of stayed) {
    if (canPut(home, item, place)) putIn(home, item, place);
    else if (!stowAnywhere(home, item, undefined, false) && b) addStock(b, item, 1);
  }
  a.gear = home;
}

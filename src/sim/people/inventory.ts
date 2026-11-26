// The agent's inventory as a grid (docs/design/inventory.md), Paradise
// Cracked style: a weapon in the hand, armour and a helmet worn, two 2 × 2
// pockets and a 4 × 5 backpack. Every item takes width × height cells (long
// things stand upright). Pure functions over a Gear: the base (with the
// armoury) and the battle (with time units and the floor) wrap them.
import { ITEMS, type ItemId, type Slot } from "../../data/equipment";

export type Container = "pocket0" | "pocket1" | "pack";
export const CONTAINERS: Record<Container, { w: number; h: number; name: string }> = {
  pocket0: { w: 2, h: 2, name: "Left pocket" },
  pocket1: { w: 2, h: 2, name: "Right pocket" },
  pack: { w: 4, h: 5, name: "Backpack" },
};
const CONTAINER_IDS = Object.keys(CONTAINERS) as Container[];
/** Worn places: one item each. */
export type WornSlot = Exclude<Slot, "carried">;
export const WORN: WornSlot[] = ["weapon", "armour", "helmet"];

/** Something in a pocket or the backpack, its top-left cell at (x, y). */
export interface Stowed {
  item: ItemId;
  in: Container;
  x: number;
  y: number;
  /** A gun put away part-loaded (battle only; at home guns are full). */
  ammo?: number;
}

/** An agent's loadout. */
export interface Gear {
  /** In the hand (none: a knife). */
  weapon?: ItemId;
  /** Rounds in the hand weapon (battle only; undefined: a full clip). */
  ammo?: number;
  armour?: ItemId;
  helmet?: ItemId;
  stowed: Stowed[];
}

/** A place in the inventory: a worn slot, or a cell of a container. */
export type Place = { slot: WornSlot } | { in: Container; x: number; y: number };

export const emptyGear = (): Gear => ({ stowed: [] });
export const sizeOf = (item: ItemId) => ITEMS[item].size;
export const cloneGear = (g: Gear): Gear => ({ ...g, stowed: g.stowed.map((x) => ({ ...x })) });
export const samePlace = (a: Place, b: Place) =>
  "slot" in a
    ? "slot" in b && a.slot === b.slot
    : !("slot" in b) && a.in === b.in && a.x === b.x && a.y === b.y;

/** Every item an agent has, worn and carried. */
export const allItems = (g: Gear): ItemId[] => [
  ...WORN.map((s) => g[s]).filter((x): x is ItemId => !!x),
  ...g.stowed.map((x) => x.item),
];
export const countOf = (g: Gear, item: ItemId) => allItems(g).filter((x) => x === item).length;

/** What's stowed over a cell. */
export function stowedAt(g: Gear, c: Container, x: number, y: number): Stowed | undefined {
  return g.stowed.find((s) => {
    const [w, h] = sizeOf(s.item);
    return s.in === c && x >= s.x && x < s.x + w && y >= s.y && y < s.y + h;
  });
}

/** Whether an item fits with its top-left at (x, y) of a container (`ignore`: a stowed item being moved). */
export function fits(
  g: Gear,
  item: ItemId,
  c: Container,
  x: number,
  y: number,
  ignore?: Stowed,
): boolean {
  const [w, h] = sizeOf(item);
  const box = CONTAINERS[c];
  if (x < 0 || y < 0 || x + w > box.w || y + h > box.h) return false;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) {
      const o = stowedAt(g, c, x + dx, y + dy);
      if (o && o !== ignore) return false;
    }
  return true;
}

/** The first spot an item fits, trying containers in order (pockets first), top to bottom. */
export function findSpot(
  g: Gear,
  item: ItemId,
  order: Container[] = CONTAINER_IDS,
): { in: Container; x: number; y: number } | null {
  for (const c of order) {
    const box = CONTAINERS[c];
    for (let y = 0; y < box.h; y++)
      for (let x = 0; x < box.w; x++) if (fits(g, item, c, x, y)) return { in: c, x, y };
  }
  return null;
}

/** Whether a worn slot takes this item. */
export const slotTakes = (slot: WornSlot, item: ItemId) =>
  ITEMS[item].slot === slot && item !== "knife";

/** What's at a place: a worn item, or the stowed item over that cell. */
export function itemAt(g: Gear, p: Place): { item: ItemId; ammo?: number; stowed?: Stowed } | null {
  if ("slot" in p) {
    const item = g[p.slot];
    return item
      ? { item, ...(p.slot === "weapon" && g.ammo !== undefined ? { ammo: g.ammo } : {}) }
      : null;
  }
  const s = stowedAt(g, p.in, p.x, p.y);
  return s ? { item: s.item, ammo: s.ammo, stowed: s } : null;
}

/** Whether an item can go to a place (empty, or only `ignore` there). */
export function canPut(g: Gear, item: ItemId, p: Place, ignore?: Stowed): boolean {
  if (item === "knife") return false;
  if ("slot" in p) return slotTakes(p.slot, item) && !g[p.slot];
  return fits(g, item, p.in, p.x, p.y, ignore);
}

/** Takes the item at a place out (the place it's anchored at, for a stowed one). */
export function takeOut(g: Gear, p: Place): { item: ItemId; ammo?: number; from: Place } | null {
  if ("slot" in p) {
    const item = g[p.slot];
    if (!item) return null;
    const ammo = p.slot === "weapon" ? g.ammo : undefined;
    delete g[p.slot];
    if (p.slot === "weapon") delete g.ammo;
    return { item, ...(ammo !== undefined ? { ammo } : {}), from: p };
  }
  const s = stowedAt(g, p.in, p.x, p.y);
  if (!s) return null;
  g.stowed = g.stowed.filter((x) => x !== s);
  return {
    item: s.item,
    ...(s.ammo !== undefined ? { ammo: s.ammo } : {}),
    from: { in: s.in, x: s.x, y: s.y },
  };
}

/** Puts an item at a place (the caller checked it fits). */
export function putIn(g: Gear, item: ItemId, p: Place, ammo?: number) {
  if ("slot" in p) {
    g[p.slot] = item;
    if (p.slot === "weapon") {
      if (ammo !== undefined) g.ammo = ammo;
      else delete g.ammo;
    }
    return;
  }
  g.stowed.push({ item, in: p.in, x: p.x, y: p.y, ...(ammo !== undefined ? { ammo } : {}) });
}

/**
 * Moves what's at `from` to `to` in the same inventory. If a worn slot is
 * taken, what's there swaps to where the item came from (if it fits there).
 * Returns null, or why not.
 */
export function moveWithin(g: Gear, from: Place, to: Place): string | null {
  const got = itemAt(g, from);
  if (!got) return "Nothing there.";
  if (samePlace(from, to)) return null;
  if ("slot" in to && !slotTakes(to.slot, got.item)) return "That doesn't go there.";
  const work = cloneGear(g);
  const out = takeOut(work, from)!;
  if (canPut(work, out.item, to)) {
    putIn(work, out.item, to, out.ammo);
  } else if ("slot" in to && work[to.slot]) {
    // A swap: the worn item goes where this one came from.
    const other = takeOut(work, to)!;
    putIn(work, out.item, to, out.ammo);
    if (!canPut(work, other.item, out.from))
      return `No room for the ${ITEMS[other.item].name.toLowerCase()} there.`;
    putIn(work, other.item, out.from, other.ammo);
  } else return "It doesn't fit there.";
  replaceGear(g, work);
  return null;
}

/** Overwrites a gear in place with another's contents. */
function replaceGear(g: Gear, by: Gear) {
  for (const k of Object.keys(g)) delete (g as unknown as Record<string, unknown>)[k];
  Object.assign(g, cloneGear(by));
}

/** Puts an item where it belongs, or anywhere it fits: worn if the slot is free, else pockets, then the backpack. */
export function stowAnywhere(g: Gear, item: ItemId, ammo?: number, wear = true): Place | null {
  const slot = ITEMS[item].slot;
  if (wear && slot !== "carried" && item !== "knife" && !g[slot]) {
    putIn(g, item, { slot }, ammo);
    return { slot };
  }
  // Long things go in the backpack first, so the pockets stay free for what's small.
  const [w, h] = sizeOf(item);
  const order: Container[] = w * h > 2 ? ["pack", "pocket0", "pocket1"] : CONTAINER_IDS;
  const spot = findSpot(g, item, order);
  if (!spot) return null;
  putIn(g, item, spot, ammo);
  return spot;
}

/** A loadout from a list of items: worn ones worn, the rest packed. Returns what didn't fit too. */
export function packGear(items: ItemId[]): { gear: Gear; left: ItemId[] } {
  const gear = emptyGear();
  const left: ItemId[] = [];
  // Big things first, so they find room.
  const sorted = [...items].sort(
    (a, b) => sizeOf(b)[0] * sizeOf(b)[1] - sizeOf(a)[0] * sizeOf(a)[1],
  );
  for (const x of sorted) if (x !== "knife" && !stowAnywhere(gear, x)) left.push(x);
  return { gear, left };
}

/** Stowed items of one kind, quickest to hand first (pockets before the backpack). */
export const stowedOf = (g: Gear, test: (item: ItemId) => boolean) =>
  g.stowed
    .filter((s) => test(s.item))
    .sort((a, b) => (a.in === "pack" ? 1 : 0) - (b.in === "pack" ? 1 : 0));

/** Is this gear, as saved: known items, each where it can go? */
export function isGear(x: unknown, isItem: (x: unknown) => x is ItemId): boolean {
  const g = x as Partial<Gear> | null;
  if (!g || typeof g !== "object" || !Array.isArray(g.stowed)) return false;
  return (
    WORN.every((s) => g[s] == null || (isItem(g[s]) && slotTakes(s, g[s]))) &&
    g.stowed.every(
      (s) =>
        !!s &&
        isItem(s.item) &&
        s.in in CONTAINERS &&
        Number.isInteger(s.x) &&
        Number.isInteger(s.y),
    )
  );
}

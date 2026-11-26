// The inventory (sim/people/inventory.ts) on the battlescape: moving things costs TU; the ground is the tiles near by.
import { type Pt3 } from "./map/map";
import { lineOfSight, WEAPONS } from "./rules";
import { type ShotMode } from "./ballistics";
import { ITEMS, type ItemId } from "../data/equipment";
import {
  canPut,
  cloneGear,
  itemAt,
  moveWithin,
  putIn,
  samePlace,
  takeOut,
  type Place,
} from "../sim/people/inventory";
import { type Battle, INV_TU, type Unit, active, fireMode, modesOf } from "./battle";
import { holding, short } from "./commands";
import { dropItem } from "./harm";
import { handWeapon } from "./setup";

/** A place an item can be: in the inventory, or a floor item (by id). */
export type InvRef = Place | { floor: string };
const isFloor = (r: InvRef): r is { floor: string } => "floor" in r;

/** Items within reach on the ground: this tile and the eight round it, with nothing in the way. */
export const floorNear = (b: Battle, u: Pt3) =>
  b.floor.filter(
    (f) =>
      f.z === u.z &&
      Math.max(Math.abs(f.x - u.x), Math.abs(f.y - u.y)) <= 1 &&
      ((f.x === u.x && f.y === u.y) || lineOfSight(b.map, u, f)),
  );

const refTu = (r: InvRef) =>
  isFloor(r)
    ? INV_TU.floor
    : "slot" in r
      ? INV_TU.hand
      : r.in === "pack"
        ? INV_TU.pack
        : INV_TU.pocket;
/** What moving an item costs: out of one place and into another; a shuffle within one container. */
export function inventoryCost(from: InvRef, to: InvRef): number {
  if (!isFloor(from) && !isFloor(to) && !("slot" in from) && !("slot" in to) && from.in === to.in)
    return INV_TU.shuffle;
  if (isFloor(from) && isFloor(to)) return 0;
  return refTu(from) + refTu(to);
}

/** The item at a reference: in the inventory, or on the ground near by. */
function itemAtRef(b: Battle, u: Unit, r: InvRef): { item: ItemId; ammo?: number } | null {
  if (isFloor(r)) {
    const f = floorNear(b, u).find((x) => x.id === r.floor);
    return f ? { item: f.item, ammo: f.ammo } : null;
  }
  if ("slot" in r && r.slot === "weapon" && u.gear.weapon)
    return { item: u.gear.weapon, ammo: u.ammo };
  return itemAt(u.gear, r);
}

/** The worn slots that can't change mid-fight. */
const lockedSlot = (r: InvRef) => !isFloor(r) && "slot" in r && r.slot !== "weapon";

/** Why an item can't move from one place to another now (null: it can). */
export function inventoryBlocker(b: Battle, u: Unit, from: InvRef, to: InvRef): string | null {
  if (b.result) return "The battle is over";
  if (b.side !== "agent" || u.side !== "agent" || !active(u)) return "Not now";
  const got = itemAtRef(b, u, from);
  if (!got) return "Nothing there";
  if (lockedSlot(from) || lockedSlot(to)) return "Armour stays on in a fight";
  const hold = holding(u);
  if (hold) return hold;
  const tired = short(u, inventoryCost(from, to));
  if (tired) return tired;
  if (isFloor(to)) return null;
  if (isFloor(from)) {
    if (canPut(u.gear, got.item, to)) return null;
    if ("slot" in to && to.slot === "weapon" && ITEMS[got.item].slot === "weapon") return null; // the one in hand goes down
    return "slot" in to ? "That doesn't go there" : "It doesn't fit there";
  }
  const trial = cloneGear(u.gear);
  return moveWithin(trial, from, to);
}

/** Moves an item, paying its time. The weapon in hand's rounds go with it; the hand takes up what's put there. */
export function commandInventory(b: Battle, u: Unit, from: InvRef, to: InvRef): string | null {
  const why = inventoryBlocker(b, u, from, to);
  if (why) return why;
  if (!isFloor(from) && !isFloor(to) && samePlace(from, to)) return null;
  u.tu -= inventoryCost(from, to);
  if (u.gear.weapon) u.gear.ammo = u.ammo;
  if (isFloor(to) && isFloor(from)) return null;
  if (isFloor(from) && !isFloor(to)) {
    const f = b.floor.find((x) => x.id === from.floor)!;
    if ("slot" in to && u.gear[to.slot]) {
      const old = takeOut(u.gear, to)!;
      dropItem(b, u, old.item, old.ammo, true);
    }
    putIn(u.gear, f.item, to, f.ammo);
    b.floor = b.floor.filter((x) => x !== f);
  } else if (isFloor(to) && !isFloor(from)) {
    const out = takeOut(u.gear, from)!;
    dropItem(b, u, out.item, out.ammo, true);
  } else if (!isFloor(from) && !isFloor(to)) moveWithin(u.gear, from, to);
  syncHand(u);
  return null;
}

/** After the hand changes: the weapon, its rounds, and a fire mode it has. */
function syncHand(u: Unit) {
  u.weapon = handWeapon(u.gear);
  const w = WEAPONS[u.weapon];
  u.ammo = u.gear.weapon ? Math.min(w.clip, u.gear.ammo ?? w.clip) : w.clip;
  if (u.gear.weapon) u.gear.ammo = u.ammo;
  u.mode = fireMode(u, u.mode);
}

/** Sets the fire mode for the weapon in hand. */
export function setMode(u: Unit, mode: ShotMode): string | null {
  if (!modesOf(u).includes(mode))
    return `The ${WEAPONS[u.weapon].name.toLowerCase()} doesn't fire that way`;
  u.mode = mode;
  return null;
}

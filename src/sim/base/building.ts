// The base as an office building (docs/design/base.md): a basement and two
// floors, each a 3 × 3 grid round a core (lift and stairs), so a ring of 8
// rooms per floor. The ground floor's front middle tile is the entrance.
// Rooms of one kind in a straight line of 3 (a side of a floor, or a column
// through all three floors) get the line bonus; an adjacent pair gets the
// pair bonus; each room counts in one group at most.
import { FACILITIES, SYNERGY, type BaseUpgradeKind } from "../../data/installations";
import type { Installation } from "../core/state";

export type RoomKind =
  "quarters" | "lab" | "workshop" | "containment" | "sigint" | "storage" | "fusion";
export const ROOM_KINDS: RoomKind[] = [
  "quarters",
  "lab",
  "workshop",
  "fusion",
  "containment",
  "sigint",
  "storage",
];
/** Rooms whose neighbours don't matter (one storage a base). */
const NO_SYNERGY: RoomKind[] = ["storage"];
export const isRoomKind = (k: BaseUpgradeKind): k is RoomKind =>
  (ROOM_KINDS as string[]).includes(k);

export interface Room {
  kind: RoomKind;
  floor: number;
  slot: number;
}
export interface Place {
  floor: number;
  slot: number;
}

/** Floors, bottom up: the basement is −1. A church cell is a basement only. */
export const floorsOf = (b: Installation): number[] => (b.cell ? [-1] : [-1, 0, 1]);
export const FLOOR_NAMES: Record<number, string> = {
  [-1]: "Basement",
  0: "Ground floor",
  1: "First floor",
};
/** Slot → grid cell (x left to right, y front to back), clockwise from the front left. */
export const SLOT_XY: [number, number][] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [0, 2],
  [0, 1],
];
const ENTRANCE: Place = { floor: 0, slot: 1 };
export const isEntrance = (b: Installation, p: Place) =>
  !b.cell && p.floor === ENTRANCE.floor && p.slot === ENTRANCE.slot;

const idx = (p: Place) => (p.floor + 1) * 8 + p.slot;
const SIDES = [
  [0, 1, 2],
  [2, 3, 4],
  [4, 5, 6],
  [6, 7, 0],
];

/** Every line of 3 and adjacent pair in a building, as room indices. */
function groupsFor(floors: number[]): { lines: number[][]; pairs: number[][] } {
  const lines: number[][] = [],
    pairs: number[][] = [];
  for (const f of floors) {
    for (const side of SIDES) lines.push(side.map((slot) => idx({ floor: f, slot })));
    for (let slot = 0; slot < 8; slot++)
      pairs.push([idx({ floor: f, slot }), idx({ floor: f, slot: (slot + 1) % 8 })]);
  }
  if (floors.length === 3)
    for (let slot = 0; slot < 8; slot++) {
      lines.push(floors.map((floor) => idx({ floor, slot })));
      pairs.push(
        [idx({ floor: -1, slot }), idx({ floor: 0, slot })],
        [idx({ floor: 0, slot }), idx({ floor: 1, slot })],
      );
    }
  return { lines, pairs };
}
const GROUPS = { building: groupsFor([-1, 0, 1]), cell: groupsFor([-1]) };

/** The best grouping of a set of rooms: bonus per room index. */
export function solveSynergy(rooms: number[], cell = false): Map<number, number> {
  const { lines, pairs } = cell ? GROUPS.cell : GROUPS.building;
  const have = new Set(rooms);
  const cands = [
    ...lines.filter((g) => g.every((i) => have.has(i))).map((g) => ({ g, v: SYNERGY.line })),
    ...pairs.filter((g) => g.every((i) => have.has(i))).map((g) => ({ g, v: SYNERGY.pair })),
  ].map((c) => ({ ...c, mask: c.g.reduce((m, i) => m | (1 << i), 0) }));
  const memo = new Map<number, { total: number; pick: number[] }>();
  const best = (mask: number): { total: number; pick: number[] } => {
    if (!mask) return { total: 0, pick: [] };
    const hit = memo.get(mask);
    if (hit) return hit;
    const low = mask & -mask;
    let out = best(mask & ~low);
    cands.forEach((c, ci) => {
      if (!(c.mask & low) || (c.mask & mask) !== c.mask) return;
      const rest = best(mask & ~c.mask);
      const total = rest.total + c.v * c.g.length;
      if (total > out.total + 1e-9) out = { total, pick: [ci, ...rest.pick] };
    });
    memo.set(mask, out);
    return out;
  };
  const bonus = new Map<number, number>(rooms.map((i) => [i, 0]));
  for (const ci of best(rooms.reduce((m, i) => m | (1 << i), 0)).pick)
    for (const i of cands[ci]!.g) bonus.set(i, cands[ci]!.v);
  return bonus;
}

/** Synergy bonus of every built room at a base, keyed by "floor:slot". */
export function roomBonuses(b: Installation): Map<string, number> {
  const out = new Map<string, number>();
  for (const kind of ROOM_KINDS) {
    if (NO_SYNERGY.includes(kind)) continue;
    const rooms = roomsOf(b).filter((r) => r.kind === kind);
    const bonus = solveSynergy(rooms.map(idx), b.cell);
    for (const r of rooms) out.set(`${r.floor}:${r.slot}`, bonus.get(idx(r)) ?? 0);
  }
  return out;
}

/** A facility's bonus at a base: the average over its rooms (0 with none). */
export function synergy(b: Installation | undefined, kind: RoomKind): number {
  if (!b) return 0;
  const rooms = roomsOf(b).filter((r) => r.kind === kind);
  if (!rooms.length || NO_SYNERGY.includes(kind)) return 0;
  const bonus = solveSynergy(rooms.map(idx), b.cell);
  return rooms.reduce((sum, r) => sum + (bonus.get(idx(r)) ?? 0), 0) / rooms.length;
}

/** The rooms built at a base (none at a station). */
export const roomsOf = (b: Installation): Room[] => b.rooms ?? [];
export const countRooms = (b: Installation, kind: RoomKind) =>
  roomsOf(b).filter((r) => r.kind === kind).length;

/** Builds or clears rooms of a kind until there are `n`: each new one on the tile with the most synergy,
 *  the newest cleared first. For founding a base, and tests. */
export function setRooms(b: Installation, kind: RoomKind, n: number) {
  b.rooms ??= [];
  while (countRooms(b, kind) < n) {
    const p = bestPlace(b, kind);
    if (!p) break;
    b.rooms.push({ kind, ...p });
  }
  while (countRooms(b, kind) > n) {
    const last: Room = b.rooms.filter((r) => r.kind === kind).at(-1)!;
    b.rooms = b.rooms.filter((r) => r !== last);
  }
}

/** Lays out a new base's rooms from its facilities (beds, labs...: FACILITIES units, as `start`):
 *  the rooms in `fixed` where they're given, the rest where they add the most synergy. */
export function furnish(
  b: Installation,
  facilities: Partial<Record<RoomKind, number>>,
  fixed: Room[] = [],
) {
  b.rooms = fixed.map((r) => ({ ...r }));
  for (const kind of ROOM_KINDS) {
    const n = facilities[kind] ?? 0;
    if (fixed.some((r) => r.kind === kind)) continue;
    setRooms(
      b,
      kind,
      kind === "quarters"
        ? Math.ceil(n / FACILITIES.quarters.step)
        : kind === "sigint"
          ? Math.min(1, n)
          : n,
    );
  }
}

/** A new Operational Base's facilities (Base Padua's are FACILITIES' `start`). */
export const NEW_BASE: Partial<Record<RoomKind, number>> = Object.fromEntries(
  ROOM_KINDS.map((k) => [k, FACILITIES[k].startNew]),
);

export const roomAt = (b: Installation, p: Place): Room | undefined =>
  roomsOf(b).find((r) => r.floor === p.floor && r.slot === p.slot);
const pendingAt = (b: Installation, p: Place) =>
  (b.upgrades ?? []).find((u) => u.floor === p.floor && u.slot === p.slot);
export const pendingRoomAt = (b: Installation, p: Place) => pendingAt(b, p);

/** Tiles where a room could go: not the entrance, not built, not under way. */
export function freePlaces(b: Installation): Place[] {
  const out: Place[] = [];
  for (const floor of floorsOf(b))
    for (let slot = 0; slot < 8; slot++) {
      const p = { floor, slot };
      if (!isEntrance(b, p) && !roomAt(b, p) && !pendingAt(b, p)) out.push(p);
    }
  return out;
}
export const isFree = (b: Installation, p: Place) =>
  freePlaces(b).some((q) => q.floor === p.floor && q.slot === p.slot);

/** The free tile that adds the most synergy for a new room of this kind (planned rooms count). */
export function bestPlace(b: Installation, kind: RoomKind): Place | null {
  const mine = [...roomsOf(b), ...(b.upgrades ?? []).filter((u) => u.slot !== undefined)]
    .filter((r) => r.kind === kind)
    .map((r) => idx(r as Place));
  let best: Place | null = null,
    score = -1;
  // Ties go to the ground floor, then upstairs, then the basement.
  const order = (p: Place) => (p.floor === 0 ? 0 : p.floor === 1 ? 1 : 2);
  for (const p of freePlaces(b).sort((a, c) => order(a) - order(c))) {
    const rooms = [...mine, idx(p)];
    const total = [...solveSynergy(rooms, b.cell).values()].reduce((a, v) => a + v, 0);
    if (total > score + 1e-9) {
      best = p;
      score = total;
    }
  }
  return best;
}

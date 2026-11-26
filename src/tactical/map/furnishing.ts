// Furnishing planned buildings: furniture over several tiles, a flat's rooms by what they are, ceiling lights, cellars.
import type { Rng } from "../../sim/core/rng";
import {
  E,
  edgeAt,
  furnitureSize,
  furnitureSkin,
  isDoor,
  isWindow,
  setTile,
  T,
  tileAt,
  type BattleMap,
  type Furniture,
  type FurnitureKind,
  type Pt,
  type Skin,
} from "./map";
import { centre, rh, rw, type Rect } from "./mapgen";
import { F, floorPlan } from "./buildings";
import { raise } from "./planned";

/** A piece facing (dx, dy) with its corner at (x, y): its length runs across the way it faces. */
function piece(
  kind: FurnitureKind,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
): Furniture {
  const [len, depth] = furnitureSize(kind);
  return dy
    ? { x, y, z, w: len, h: depth, kind, dx, dy }
    : { x, y, z, w: depth, h: len, kind, dx, dy };
}

const tilesOf = (f: Furniture): Pt[] => {
  const out: Pt[] = [];
  for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) out.push({ x, y });
  return out;
};

/** Its back row and front row (each tile with the way out of it). */
function rows(f: Furniture) {
  const all = tilesOf(f);
  const back = all.filter((p) => !all.some((q) => q.x === p.x - f.dx && q.y === p.y - f.dy));
  const front = all.filter((p) => !all.some((q) => q.x === p.x + f.dx && q.y === p.y + f.dy));
  return { all, back, front };
}

const EDGE_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Furniture in a flat: in a room with space, a TV stand against a wall and a
 * sofa facing it (against the far wall, or standing free with room to walk
 * behind); a double bed with its head to a wall, room to get in from the
 * foot. `rooms` are the flat's rooms (local to rect): with two, one is the
 * living room and one the bedroom. Clear of doorways and stairs; every piece
 * left with open floor in front. Returns the pieces placed.
 */
export function furnishFlat(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  z: number,
  rooms: Rect[],
  stairs: Pt[],
) {
  const f = new FlatFurnisher(m, r, rect, z, stairs);
  const order = rooms.length > 1 && r.chance(0.5) ? [rooms[1]!, rooms[0]!] : rooms;
  if (order.length > 1) {
    if (!f.living(f.floorOf(order[0]!))) f.bedroom(f.floorOf(order[0]!));
    if (!f.bedroom(f.floorOf(order[1]!))) f.living(f.floorOf(order[1]!));
  } else if (order[0]) {
    const room = f.floorOf(order[0]);
    // One room: both if they fit, the one chosen first.
    if (r.chance(0.5)) {
      if (f.living(room)) f.bedroom(f.floorOf(order[0]));
    } else if (f.bedroom(room)) f.living(f.floorOf(order[0]));
  }
  return f.placed;
}

/** A room's own floor: the tiles flooded from its middle over open edges. */
interface RoomFloor {
  has: (x: number, y: number) => boolean;
  tiles: Pt[];
}

const FACINGS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
] as const;

class FlatFurnisher {
  readonly placed: Furniture[] = [];
  /** Floor kept clear: in front of each piece, and between a TV and its sofa. */
  private readonly reserved = new Set<number>();
  /** Doors don't change while furnishing: each tile's answer worked out once. */
  private readonly nearDoor = new Map<number, boolean>();
  private readonly stairsAt: Pt[];

  constructor(
    readonly m: BattleMap,
    readonly r: Rng,
    readonly rect: Rect,
    readonly z: number,
    stairs: Pt[],
  ) {
    this.stairsAt = stairs.map((s) => ({ x: rect.x0 + s.x, y: rect.y0 + s.y }));
  }

  private doorNear(x: number, y: number): boolean {
    const { m, z } = this;
    const k = y * m.w + x;
    let near = this.nearDoor.get(k);
    if (near === undefined) {
      near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1 && !near; dx++)
          for (const [ex, ey] of EDGE_DIRS)
            if (isDoor(edgeAt(m, x + dx, y + dy, z, ex, ey))) near = true;
      this.nearDoor.set(k, near);
    }
    return near;
  }

  /** A room's own floor: flooded from its middle over open edges, inside its rect and the strip round it. */
  floorOf(q: Rect): RoomFloor {
    const { m, z, rect } = this;
    const X = (x: number) => rect.x0 + x,
      Y = (y: number) => rect.y0 + y;
    const set = new Set<number>();
    const key = (x: number, y: number) => y * m.w + x;
    const stack = [{ x: X(Math.floor((q.x0 + q.x1) / 2)), y: Y(Math.floor((q.y0 + q.y1) / 2)) }];
    const inBox = (x: number, y: number) =>
      x >= X(q.x0 - 1) && x <= X(q.x1 + 1) && y >= Y(q.y0 - 1) && y <= Y(q.y1 + 1);
    while (stack.length) {
      const p = stack.pop()!;
      const t = tileAt(m, p.x, p.y, z);
      if (set.has(key(p.x, p.y)) || !inBox(p.x, p.y) || (t !== T.FLOOR && t !== T.LOW)) continue;
      set.add(key(p.x, p.y));
      for (const [dx, dy] of EDGE_DIRS)
        if (edgeAt(m, p.x, p.y, z, dx, dy) === E.NONE) stack.push({ x: p.x + dx, y: p.y + dy });
    }
    return {
      has: (x, y) => set.has(key(x, y)),
      tiles: [...set].map((k) => ({ x: k % m.w, y: Math.floor(k / m.w) })),
    };
  }

  private keep(x: number, y: number) {
    this.reserved.add(y * this.m.w + x);
  }

  /** Floor of the room with nothing on it, not kept clear, away from doors and stairs. */
  private free(room: RoomFloor, x: number, y: number): boolean {
    return (
      room.has(x, y) &&
      tileAt(this.m, x, y, this.z) === T.FLOOR &&
      !this.reserved.has(y * this.m.w + x) &&
      !this.doorNear(x, y) &&
      this.stairsAt.every((s) => Math.abs(s.x - x) + Math.abs(s.y - y) > 1)
    );
  }

  /** Open floor of the room one step from p, with no wall or door on the edge between. */
  private openStep(room: RoomFloor, p: Pt, dx: number, dy: number): boolean {
    const { m, z } = this;
    return (
      room.has(p.x + dx, p.y + dy) &&
      tileAt(m, p.x + dx, p.y + dy, z) === T.FLOOR &&
      edgeAt(m, p.x, p.y, z, dx, dy) === E.NONE
    );
  }

  /** It fits: on free floor of the room, nothing on the edges inside it, open floor in front; its back to a wall if `backed`, a way round it if not. */
  private fits(room: RoomFloor, f: Furniture, backed: boolean): boolean {
    const { m, z } = this;
    const { all, back, front } = rows(f);
    if (!all.every((p) => this.free(room, p.x, p.y))) return false;
    for (const p of all)
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const)
        if (
          all.some((q) => q.x === p.x + dx && q.y === p.y + dy) &&
          edgeAt(m, p.x, p.y, z, dx, dy) !== E.NONE
        )
          return false;
    const wallBehind = (p: Pt) => {
      const e = edgeAt(m, p.x, p.y, z, -f.dx, -f.dy);
      return e === E.WALL || (f.kind !== "bed" && isWindow(e));
    };
    if (backed && !back.every(wallBehind)) return false;
    if (!backed && !back.every((p) => this.openStep(room, p, -f.dx, -f.dy))) return false;
    return front.every((p) => this.openStep(room, p, f.dx, f.dy));
  }

  private put(f: Furniture) {
    for (const p of tilesOf(f)) setTile(this.m, p.x, p.y, this.z, T.LOW, furnitureSkin(f.kind));
    for (const p of rows(f).front) this.keep(p.x + f.dx, p.y + f.dy);
    this.m.furniture.push(f);
    this.placed.push(f);
  }

  /** Every way a piece could stand in a room. */
  private options(room: RoomFloor, kind: FurnitureKind, backed: boolean): Furniture[] {
    const out: Furniture[] = [];
    for (const t of room.tiles)
      for (const [dx, dy] of FACINGS) {
        const f = piece(kind, t.x, t.y, this.z, dx, dy);
        if (this.fits(room, f, backed)) out.push(f);
      }
    return out;
  }

  /** A TV stand to a wall; the sofa across from it, 1 to 3 tiles of floor between, to the far wall if it can. */
  living(room: RoomFloor): boolean {
    const pairs: { tv: Furniture; sofa: Furniture; backed: boolean; between: Pt[] }[] = [];
    for (const tv of this.options(room, "tv", true)) {
      const { front } = rows(tv);
      for (let gap = 1; gap <= 3; gap++) {
        const ox = Math.min(...front.map((p) => p.x)) + tv.dx * (gap + 1),
          oy = Math.min(...front.map((p) => p.y)) + tv.dy * (gap + 1);
        const sofa = piece("sofa", ox, oy, this.z, -tv.dx, -tv.dy);
        const between = front.flatMap((p) =>
          Array.from({ length: gap }, (_, k) => ({
            x: p.x + tv.dx * (k + 1),
            y: p.y + tv.dy * (k + 1),
          })),
        );
        if (!between.every((p) => this.free(room, p.x, p.y))) break;
        for (const backed of [true, false])
          if ((backed || gap === 2) && this.fits(room, sofa, backed))
            pairs.push({ tv, sofa, backed, between });
      }
    }
    if (!pairs.length) return false;
    const againstWall = pairs.filter((p) => p.backed);
    const best = this.r.pick(againstWall.length ? againstWall : pairs);
    this.put(best.tv);
    this.put(best.sofa);
    for (const p of best.between) this.keep(p.x, p.y);
    return true;
  }

  /** A double bed with its head to a wall. */
  bedroom(room: RoomFloor): boolean {
    const opts = this.options(room, "bed", true);
    if (!opts.length) return false;
    this.put(this.r.pick(opts));
    return true;
  }
}

/** Ceiling lights down a corridor (every 6 tiles along its middle) and one in each room given. */
export function ceilingLights(
  m: BattleMap,
  rect: Rect,
  z: number,
  corridor: Rect | null,
  rooms: Rect[],
  h?: number,
) {
  if (corridor)
    for (let x = corridor.x0 + 2; x <= corridor.x1 - 1; x += 6)
      m.lights.push({ x: rect.x0 + x, y: rect.y0 + corridor.y0, z, ceiling: true, h });
  for (const q of rooms) {
    const c = centre(q);
    m.lights.push({ x: rect.x0 + c.x, y: rect.y0 + c.y, z, ceiling: true, h });
  }
}

/** A basement under a planned building, rooms split at random, its stairs' feet kept open; ceiling lights. */
export function cellar(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  z: number,
  stairs: Pt[],
  wall: Skin,
  floor: Skin,
): Rect[] {
  const b = floorPlan(r, rw(rect), rh(rect), 3, true);
  for (const s of stairs) b.plan[s.y * rw(rect) + s.x] = F;
  raise(m, r, rect, { z, plan: b.plan, rooms: b.rooms, wall, floor, windows: 0, stairs });
  ceilingLights(m, rect, z, null, b.rooms);
  return b.rooms;
}

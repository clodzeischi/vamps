// Buildings: plans drawn with thick walls then thinned, rooms, doors and windows, storeys and roofs.
import { type Rng } from "../../sim/core/rng";
import {
  E,
  edgeAt,
  isDoor,
  setEdge,
  setTile,
  T,
  tileAt,
  walkable,
  type BattleMap,
  type EdgeKind,
  type Pt,
  type Skin,
} from "./map";
import { type Rect, rw, rh, type Building, centre } from "./mapgen";

// ---------------------------------------------------------------------------
// Buildings

export const W = 1,
  F = 2,
  D = 3;

/** A floor plan: walls round the edge, the inside split into rooms by BSP with a door in every split. */
export function floorPlan(
  r: Rng,
  w: number,
  h: number,
  minRoom: number,
  split: boolean,
): { plan: Uint8Array; rooms: Rect[] } {
  const plan = new Uint8Array(w * h).fill(F);
  const at = (x: number, y: number) => plan[y * w + x]!;
  const set = (x: number, y: number, v: number) => (plan[y * w + x] = v);
  for (let x = 0; x < w; x++) (set(x, 0, W), set(x, h - 1, W));
  for (let y = 0; y < h; y++) (set(0, y, W), set(w - 1, y, W));
  const rooms: Rect[] = [];
  const go = (a: Rect, depth: number) => {
    const cw = rw(a),
      ch = rh(a);
    const canX = cw >= minRoom * 2 + 1,
      canY = ch >= minRoom * 2 + 1;
    const stop = !split || (!canX && !canY) || (depth > 1 && cw * ch < 30 && r.chance(0.5));
    if (stop) return void rooms.push(a);
    const vertical = canX && (!canY || cw > ch || (cw === ch && r.chance(0.5)));
    if (vertical) {
      // A wall down column s; not where it would meet a door in the walls it joins.
      const opts: number[] = [];
      for (let s = a.x0 + minRoom; s <= a.x1 - minRoom; s++)
        if (at(s, a.y0 - 1) !== D && at(s, a.y1 + 1) !== D) opts.push(s);
      if (!opts.length) return void rooms.push(a);
      const s = r.pick(opts);
      for (let y = a.y0; y <= a.y1; y++) set(s, y, W);
      set(s, r.int(a.y0, a.y1), D);
      go({ ...a, x1: s - 1 }, depth + 1);
      go({ ...a, x0: s + 1 }, depth + 1);
    } else {
      const opts: number[] = [];
      for (let s = a.y0 + minRoom; s <= a.y1 - minRoom; s++)
        if (at(a.x0 - 1, s) !== D && at(a.x1 + 1, s) !== D) opts.push(s);
      if (!opts.length) return void rooms.push(a);
      const s = r.pick(opts);
      for (let x = a.x0; x <= a.x1; x++) set(x, s, W);
      set(r.int(a.x0, a.x1), s, D);
      go({ ...a, y1: s - 1 }, depth + 1);
      go({ ...a, y0: s + 1 }, depth + 1);
    }
  };
  go({ x0: 1, y0: 1, x1: w - 2, y1: h - 2 }, 0);
  return { plan, rooms };
}

export const ORTHO = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const;
const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

/**
 * Thins a storey's walls inside `rect` (map coordinates; `rooms` local to it):
 * every wall, door or window tile joins a room beside it and becomes its
 * floor, and the walls move onto the edges between tiles of different
 * rooms, and round the outside. A door or window tile's edge is the one
 * facing away from the room it joined.
 */
export function thinStorey(
  m: BattleMap,
  rect: Rect,
  z: number,
  rooms: Rect[],
  wallSkin: Skin,
  floorSkin: Skin,
) {
  const w = rw(rect),
    h = rh(rect);
  const at = (x: number, y: number) => tileAt(m, rect.x0 + x, rect.y0 + y, z);
  const label = new Int16Array(w * h).fill(-1);
  const join = new Int8Array(w * h).fill(-1);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  rooms.forEach((q, ri) => {
    for (let y = q.y0; y <= q.y1; y++)
      for (let x = q.x0; x <= q.x1; x++) if (inside(x, y)) label[y * w + x] = ri;
  });
  const isWallish = (x: number, y: number) => {
    const t = at(x, y);
    return t === T.WALL || t === T.DOOR || t === T.WINDOW;
  };
  const roomCell = (x: number, y: number) =>
    inside(x, y) && !isWallish(x, y) && label[y * w + x]! >= 0;
  // Plain walls prefer east and south, then the diagonals (so a junction joins a corner, not a notch); doors and windows go straight through.
  const wallOrder = [ORTHO[0], ORTHO[1], DIAG[0], DIAG[1], DIAG[2], DIAG[3], ORTHO[2], ORTHO[3]];
  const openOrder = [...ORTHO, ...DIAG];
  for (let pass = 0; pass < 4; pass++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // Wall tiles, and any floor outside every room (a basement's stair foot cut through a wall).
        if (
          label[y * w + x]! >= 0 ||
          (!isWallish(x, y) && !walkable(m, rect.x0 + x, rect.y0 + y, z))
        )
          continue;
        const order = at(x, y) === T.WALL ? wallOrder : openOrder;
        for (const [dx, dy] of order) {
          const nx = x + dx!,
            ny = y + dy!;
          const ok =
            pass === 0
              ? roomCell(nx, ny)
              : inside(nx, ny) && label[ny * w + nx]! >= 0 && (!dx || !dy);
          if (!ok) continue;
          label[y * w + x] = label[ny * w + nx]!;
          join[y * w + x] = ORTHO.findIndex(([ox, oy]) => ox === dx && oy === dy);
          break;
        }
      }
  // The kind of the edge leaving cell (x, y) in direction d: a door or window if it's that cell's way through.
  const kind = (x: number, y: number, d: number): EdgeKind => {
    if (!inside(x, y)) return E.WALL;
    const t = at(x, y),
      j = join[y * w + x]!;
    if (j >= 0 && (j + 2) % 4 === d)
      return t === T.DOOR ? E.DOOR : t === T.WINDOW ? E.WINDOW : E.WALL;
    return E.WALL;
  };
  const edges: [number, number, number, EdgeKind][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      ORTHO.forEach(([dx, dy], d) => {
        const nx = x + dx,
          ny = y + dy;
        if (inside(nx, ny)) {
          if (d > 1 || label[y * w + x] === label[ny * w + nx]) return; // each inner edge once, from its west or north side
          const a = kind(x, y, d),
            b = kind(nx, ny, (d + 2) % 4);
          edges.push([x, y, d, a !== E.WALL ? a : b]);
        } else edges.push([x, y, d, kind(x, y, d)]);
      });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (isWallish(x, y)) setTile(m, rect.x0 + x, rect.y0 + y, z, T.FLOOR, floorSkin);
  for (const [x, y, d, k] of edges)
    setEdge(m, rect.x0 + x, rect.y0 + y, z, ORTHO[d]![0], ORTHO[d]![1], k, wallSkin);
}

/** Furniture against the walls of each room (after thinning), clear of doorways and the stairs. */
export function furnish(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  z: number,
  rooms: Rect[],
  stair: Pt,
  kinds: Skin[],
  count: (room: Rect) => number,
) {
  const X = (x: number) => rect.x0 + x,
    Y = (y: number) => rect.y0 + y;
  const doorEdge = (x: number, y: number) =>
    ORTHO.some(([dx, dy]) => isDoor(edgeAt(m, X(x), Y(y), z, dx, dy)));
  const nearDoor = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (doorEdge(x + dx, y + dy)) return true;
    return false;
  };
  for (const room of rooms) {
    const spots: Pt[] = [];
    // The room and the strip its walls gave up.
    for (let y = room.y0 - 1; y <= room.y1 + 1; y++)
      for (let x = room.x0 - 1; x <= room.x1 + 1; x++) {
        if (
          x < 0 ||
          y < 0 ||
          x >= rw(rect) ||
          y >= rh(rect) ||
          tileAt(m, X(x), Y(y), z) !== T.FLOOR
        )
          continue;
        const againstWall = ORTHO.some(([dx, dy]) => edgeAt(m, X(x), Y(y), z, dx, dy) === E.WALL);
        if (againstWall && !nearDoor(x, y) && Math.abs(x - stair.x) + Math.abs(y - stair.y) > 1)
          spots.push({ x, y });
      }
    const n = Math.min(spots.length, count(room));
    for (let k = 0; k < n; k++) {
      const s = spots.splice(r.int(0, spots.length - 1), 1)[0]!;
      setTile(m, X(s.x), Y(s.y), z, T.LOW, r.pick(kinds));
    }
  }
}

export interface BuildingStyle {
  wall: Skin;
  floor: Skin;
  furniture: Skin[];
  /** Split into rooms (a barn is one big room). */
  rooms: boolean;
  /** Exterior doors on the ground floor, and how wide. */
  doors: number;
  doorWidth: number;
  windowChance: number;
}

export const HOUSE: BuildingStyle = {
  wall: "brick",
  floor: "indoor",
  furniture: ["table", "crate"],
  rooms: true,
  doors: 2,
  doorWidth: 1,
  windowChance: 0.35,
};

/** `front`: the side (0 north, 1 south, 2 west, 3 east) the first door goes on, the street's. */
export function placeBuilding(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  upper: number,
  style: BuildingStyle,
  basement: boolean,
  front?: number,
): Building {
  const w = rw(rect),
    h = rh(rect);
  const { plan, rooms } = floorPlan(r, w, h, 3, style.rooms);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : plan[y * w + x]!);
  const stair = pickStair(r, rooms, w, h, at);
  const g = m.ground;
  const storeys = Array.from({ length: upper + 1 }, (_, i) => g + i);
  const roof = g + upper + 1;
  // Outer wall tiles whose inside neighbour is a room, for doors and windows.
  const openEdge = outerWall(w, h).filter((e) => at(e.ix, e.iy) === F);

  for (const z of storeys) {
    const local = new Uint8Array(plan);
    if (z === g) placeDoors(r, local, w, h, at, openEdge, style, front);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = local[y * w + x]!;
        const kind = v === W ? T.WALL : v === D ? T.DOOR : T.FLOOR;
        setTile(m, rect.x0 + x, rect.y0 + y, z, kind, v === W ? style.wall : style.floor);
      }
    cutWindows(m, r, rect, z, openEdge, style.windowChance);
    setTile(m, rect.x0 + stair.x, rect.y0 + stair.y, z, T.STAIRS, "wood");
    thinStorey(m, rect, z, rooms, style.wall, style.floor);
    furnish(m, r, rect, z, rooms, stair, style.furniture, (room) =>
      r.int(0, rw(room) * rh(room) >= 12 ? 3 : 1),
    );
  }
  // The roof: walkable, a parapet round the edge, the stairs coming up.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const rim = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      setTile(m, rect.x0 + x, rect.y0 + y, roof, rim ? T.LOW : T.FLOOR, rim ? "parapet" : "roof");
    }
  const cellar = basement && g > 0 ? digBasement(m, r, rect, g - 1, stair) : null;
  const onMap = (q: Rect): Rect => ({
    x0: rect.x0 + q.x0,
    y0: rect.y0 + q.y0,
    x1: rect.x0 + q.x1,
    y1: rect.y0 + q.y1,
  });
  return {
    rect,
    storeys,
    roof,
    basement: cellar ? g - 1 : null,
    stair: { x: rect.x0 + stair.x, y: rect.y0 + stair.y },
    rooms: rooms.map(onMap),
    basementRooms: cellar ? cellar.map(onMap) : [],
  };
}

type PlanAt = (x: number, y: number) => number;
/** A tile of the outer wall, the room tile inside it, and which side it's on (0 north, 1 south, 2 west, 3 east). */
interface WallTile {
  x: number;
  y: number;
  ix: number;
  iy: number;
  side: number;
}

/** The stairwell: one column through every storey, in a room and away from doors. */
function pickStair(r: Rng, rooms: Rect[], w: number, h: number, at: PlanAt): Pt {
  const nearDoor = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === D) return true;
    return false;
  };
  const options: Pt[] = [];
  for (const room of rooms)
    for (let y = room.y0; y <= room.y1; y++)
      for (let x = room.x0; x <= room.x1; x++) if (!nearDoor(x, y)) options.push({ x, y });
  return r.pick(options.length ? options : [centre({ x0: 1, y0: 1, x1: w - 2, y1: h - 2 })]);
}

/** Every outer wall tile but the corners, with the tile inside it. */
function outerWall(w: number, h: number): WallTile[] {
  const out: WallTile[] = [];
  for (let x = 1; x < w - 1; x++)
    out.push({ x, y: 0, ix: x, iy: 1, side: 0 }, { x, y: h - 1, ix: x, iy: h - 2, side: 1 });
  for (let y = 1; y < h - 1; y++)
    out.push({ x: 0, y, ix: 1, iy: y, side: 2 }, { x: w - 1, y, ix: w - 2, iy: y, side: 3 });
  return out;
}

/** Exterior doors on the ground floor: the first on the front if there is one, the rest on different sides where possible. */
function placeDoors(
  r: Rng,
  local: Uint8Array,
  w: number,
  h: number,
  at: PlanAt,
  openEdge: WallTile[],
  style: BuildingStyle,
  front: number | undefined,
) {
  const sides = new Set<number>();
  for (let n = 0, tries = 0; n < style.doors && tries < 40; tries++) {
    const onFront = n === 0 && tries < 20 ? openEdge.filter((e) => e.side === front) : [];
    const e = r.pick(onFront.length ? onFront : openEdge);
    if (sides.has(e.side) && sides.size < 4 && tries < 20) continue;
    const [ax, ay] = e.side < 2 ? [1, 0] : [0, 1];
    // Each tile of the door along the wall, short of the corners, with a room behind it.
    let fits = true;
    for (let k = 0; k < style.doorWidth; k++) {
      const x = e.x + ax * k,
        y = e.y + ay * k;
      const atCorner = e.side < 2 ? x <= 0 || x >= w - 1 : y <= 0 || y >= h - 1;
      if (atCorner || at(e.ix + ax * k, e.iy + ay * k) !== F) fits = false;
    }
    if (!fits) continue;
    for (let k = 0; k < style.doorWidth; k++) local[(e.y + ay * k) * w + e.x + ax * k] = D;
    sides.add(e.side);
    n++;
  }
}

/** Windows: on the outer wall, never next to a door. */
function cutWindows(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  z: number,
  openEdge: WallTile[],
  chance: number,
) {
  for (const e of openEdge) {
    const X = rect.x0 + e.x,
      Y = rect.y0 + e.y;
    if (tileAt(m, X, Y, z) !== T.WALL) continue;
    const besideDoor = ORTHO.some(([dx, dy]) => tileAt(m, X + dx, Y + dy, z) === T.DOOR);
    if (!besideDoor && r.chance(chance)) setTile(m, X, Y, z, T.WINDOW, "none");
  }
}

/** A basement under the building: stone walls, a dirt floor, rooms of its own, some crates. Returns its rooms. */
function digBasement(m: BattleMap, r: Rng, rect: Rect, z: number, stair: Pt): Rect[] {
  const w = rw(rect),
    h = rh(rect);
  const b = floorPlan(r, w, h, 3, true);
  b.plan[stair.y * w + stair.x] = F;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = b.plan[y * w + x]!;
      const kind = v === W ? T.WALL : v === D ? T.DOOR : T.FLOOR;
      setTile(m, rect.x0 + x, rect.y0 + y, z, kind, v === W ? "stone" : "dirt");
    }
  setTile(m, rect.x0 + stair.x, rect.y0 + stair.y, z, T.STAIRS, "wood");
  thinStorey(m, rect, z, b.rooms, "stone", "dirt");
  furnish(m, r, rect, z, b.rooms, stair, ["crate"], () => (r.chance(0.6) ? 1 : 0));
  return b.rooms;
}

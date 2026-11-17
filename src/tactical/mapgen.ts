// Crude procedural battlescapes (docs/WEB_PORT.md 3.11), seeded: the same
// request always gives the same map.
//
// Urban: a street grid; each lot between the roads holds a building (rooms
// split by BSP, doors, windows, stairs to an upper floor and a roof), a park
// or a car park, and one lot is the plaza where the team lands. Rural: a
// farmhouse, a barn and sheds by a dirt road, fenced fields, hedges and trees.
// The bloodline's hideout is the building farthest from the landing zone,
// often with a basement where the vampires sleep.
//
// Plans are drawn with walls a tile thick, then thinned: each wall tile
// becomes floor of the room beside it, and the wall stands on the edge
// between tiles (XCOM style). Rooms gain the space the walls took.
//
// Every walkable tile must be reachable from the landing zone. Props that
// wall a pocket off are cleared; a map that still fails is generated again.
import { rng, type Rng } from "../sim/rng";
import {
  E, edgeAt, emptyMap, idx, setEdge, setTile, skinAt, T, tileAt, unreachableTiles, walkable, reachable,
  type BattleMap, type EdgeKind, type Pt, type Pt3, type Setting, type Skin, type Spawn,
} from "./map";

export type SiteSize = "nest" | "den" | "haven" | "lair";

export interface MapRequest {
  setting: Setting;
  size: SiteSize;
  seed: number;
  thralls: number;
  vampires: number;
  civilians?: number;
  /** Put the hideout's vampires in a basement (default: likelier the bigger the site). */
  basement?: boolean;
}

export const MAP_SIZE: Record<SiteSize, number> = { nest: 28, den: 32, haven: 36, lair: 44 };
/** Storeys a building can have above the ground floor (its roof sits on top). */
const MAX_UPPER = 1;

interface Rect { x0: number; y0: number; x1: number; y1: number }
const rw = (r: Rect) => r.x1 - r.x0 + 1;
const rh = (r: Rect) => r.y1 - r.y0 + 1;
const inset = (r: Rect, d: number): Rect => ({ x0: r.x0 + d, y0: r.y0 + d, x1: r.x1 - d, y1: r.y1 - d });
const centre = (r: Rect): Pt => ({ x: Math.floor((r.x0 + r.x1) / 2), y: Math.floor((r.y0 + r.y1) / 2) });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const overlaps = (a: Rect, b: Rect, margin = 0) =>
  a.x0 - margin <= b.x1 && b.x0 - margin <= a.x1 && a.y0 - margin <= b.y1 && b.y0 - margin <= a.y1;

/** A building as placed: where its rooms are on each level, for spawns. */
interface Building {
  rect: Rect;
  /** Levels of its storeys (ground first), then its roof. */
  storeys: number[];
  roof: number;
  basement: number | null;
  /** Room interiors (shared by every storey). */
  rooms: Rect[];
  basementRooms: Rect[];
  stair: Pt;
}

// ---------------------------------------------------------------------------
// Buildings

const W = 1, F = 2, D = 3;

/** A floor plan: walls round the edge, the inside split into rooms by BSP with a door in every split. */
function floorPlan(r: Rng, w: number, h: number, minRoom: number, split: boolean): { plan: Uint8Array; rooms: Rect[] } {
  const plan = new Uint8Array(w * h).fill(F);
  const at = (x: number, y: number) => plan[y * w + x]!;
  const set = (x: number, y: number, v: number) => (plan[y * w + x] = v);
  for (let x = 0; x < w; x++) set(x, 0, W), set(x, h - 1, W);
  for (let y = 0; y < h; y++) set(0, y, W), set(w - 1, y, W);
  const rooms: Rect[] = [];
  const go = (a: Rect, depth: number) => {
    const cw = rw(a), ch = rh(a);
    const canX = cw >= minRoom * 2 + 1, canY = ch >= minRoom * 2 + 1;
    const stop = !split || (!canX && !canY) || (depth > 1 && cw * ch < 30 && r.chance(0.5));
    if (stop) return void rooms.push(a);
    const vertical = canX && (!canY || cw > ch || (cw === ch && r.chance(0.5)));
    if (vertical) {
      // A wall down column s; not where it would meet a door in the walls it joins.
      const opts: number[] = [];
      for (let s = a.x0 + minRoom; s <= a.x1 - minRoom; s++) if (at(s, a.y0 - 1) !== D && at(s, a.y1 + 1) !== D) opts.push(s);
      if (!opts.length) return void rooms.push(a);
      const s = r.pick(opts);
      for (let y = a.y0; y <= a.y1; y++) set(s, y, W);
      set(s, r.int(a.y0, a.y1), D);
      go({ ...a, x1: s - 1 }, depth + 1);
      go({ ...a, x0: s + 1 }, depth + 1);
    } else {
      const opts: number[] = [];
      for (let s = a.y0 + minRoom; s <= a.y1 - minRoom; s++) if (at(a.x0 - 1, s) !== D && at(a.x1 + 1, s) !== D) opts.push(s);
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


const ORTHO = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * Thins a storey's walls inside `rect` (map coordinates; `rooms` local to it):
 * every wall, door or window tile joins a room beside it and becomes its
 * floor, and the walls move onto the edges between tiles of different
 * rooms, and round the outside. A door or window tile's edge is the one
 * facing away from the room it joined.
 */
function thinStorey(m: BattleMap, rect: Rect, z: number, rooms: Rect[], wallSkin: Skin, floorSkin: Skin) {
  const w = rw(rect), h = rh(rect);
  const at = (x: number, y: number) => tileAt(m, rect.x0 + x, rect.y0 + y, z);
  const label = new Int16Array(w * h).fill(-1);
  const join = new Int8Array(w * h).fill(-1);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  rooms.forEach((q, ri) => {
    for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) if (inside(x, y)) label[y * w + x] = ri;
  });
  const isWallish = (x: number, y: number) => {
    const t = at(x, y);
    return t === T.WALL || t === T.DOOR || t === T.WINDOW;
  };
  const roomCell = (x: number, y: number) => inside(x, y) && !isWallish(x, y) && label[y * w + x]! >= 0;
  // Plain walls prefer east and south, then the diagonals (so a junction joins a corner, not a notch); doors and windows go straight through.
  const wallOrder = [ORTHO[0], ORTHO[1], DIAG[0], DIAG[1], DIAG[2], DIAG[3], ORTHO[2], ORTHO[3]];
  const openOrder = [...ORTHO, ...DIAG];
  for (let pass = 0; pass < 4; pass++)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // Wall tiles, and any floor outside every room (a basement's stair foot cut through a wall).
        if (label[y * w + x]! >= 0 || (!isWallish(x, y) && !walkable(m, rect.x0 + x, rect.y0 + y, z))) continue;
        const order = at(x, y) === T.WALL ? wallOrder : openOrder;
        for (const [dx, dy] of order) {
          const nx = x + dx!, ny = y + dy!;
          const ok = pass === 0 ? roomCell(nx, ny) : inside(nx, ny) && label[ny * w + nx]! >= 0 && (!dx || !dy);
          if (!ok) continue;
          label[y * w + x] = label[ny * w + nx]!;
          join[y * w + x] = ORTHO.findIndex(([ox, oy]) => ox === dx && oy === dy);
          break;
        }
      }
  // The kind of the edge leaving cell (x, y) in direction d: a door or window if it's that cell's way through.
  const kind = (x: number, y: number, d: number): EdgeKind => {
    if (!inside(x, y)) return E.WALL;
    const t = at(x, y), j = join[y * w + x]!;
    if (j >= 0 && (j + 2) % 4 === d) return t === T.DOOR ? E.DOOR : t === T.WINDOW ? E.WINDOW : E.WALL;
    return E.WALL;
  };
  const edges: [number, number, number, EdgeKind][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      ORTHO.forEach(([dx, dy], d) => {
        const nx = x + dx, ny = y + dy;
        if (inside(nx, ny)) {
          if (d > 1 || label[y * w + x] === label[ny * w + nx]) return; // each inner edge once, from its west or north side
          const a = kind(x, y, d), b = kind(nx, ny, (d + 2) % 4);
          edges.push([x, y, d, a !== E.WALL ? a : b]);
        } else edges.push([x, y, d, kind(x, y, d)]);
      });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isWallish(x, y)) setTile(m, rect.x0 + x, rect.y0 + y, z, T.FLOOR, floorSkin);
  for (const [x, y, d, k] of edges) setEdge(m, rect.x0 + x, rect.y0 + y, z, ORTHO[d]![0], ORTHO[d]![1], k, wallSkin);
}

/** Furniture against the walls of each room (after thinning), clear of doorways and the stairs. */
function furnish(m: BattleMap, r: Rng, rect: Rect, z: number, rooms: Rect[], stair: Pt, kinds: Skin[], count: (room: Rect) => number) {
  const X = (x: number) => rect.x0 + x, Y = (y: number) => rect.y0 + y;
  const doorEdge = (x: number, y: number) => ORTHO.some(([dx, dy]) => edgeAt(m, X(x), Y(y), z, dx, dy) === E.DOOR);
  const nearDoor = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (doorEdge(x + dx, y + dy)) return true;
    return false;
  };
  for (const room of rooms) {
    const spots: Pt[] = [];
    // The room and the strip its walls gave up.
    for (let y = room.y0 - 1; y <= room.y1 + 1; y++)
      for (let x = room.x0 - 1; x <= room.x1 + 1; x++) {
        if (x < 0 || y < 0 || x >= rw(rect) || y >= rh(rect) || tileAt(m, X(x), Y(y), z) !== T.FLOOR) continue;
        const againstWall = ORTHO.some(([dx, dy]) => edgeAt(m, X(x), Y(y), z, dx, dy) === E.WALL);
        if (againstWall && !nearDoor(x, y) && Math.abs(x - stair.x) + Math.abs(y - stair.y) > 1) spots.push({ x, y });
      }
    const n = Math.min(spots.length, count(room));
    for (let k = 0; k < n; k++) {
      const s = spots.splice(r.int(0, spots.length - 1), 1)[0]!;
      setTile(m, X(s.x), Y(s.y), z, T.LOW, r.pick(kinds));
    }
  }
}

interface BuildingStyle {
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

const HOUSE: BuildingStyle = { wall: "brick", floor: "indoor", furniture: ["table", "crate"], rooms: true, doors: 2, doorWidth: 1, windowChance: 0.35 };

function placeBuilding(m: BattleMap, r: Rng, rect: Rect, upper: number, style: BuildingStyle, basement: boolean): Building {
  const w = rw(rect), h = rh(rect);
  const { plan, rooms } = floorPlan(r, w, h, 3, style.rooms);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : plan[y * w + x]!);
  const nearDoor = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) === D) return true;
    return false;
  };
  // The stairwell: one column through every storey, away from doors.
  const stairOpts: Pt[] = [];
  for (const room of rooms) for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) if (!nearDoor(x, y)) stairOpts.push({ x, y });
  const stair = r.pick(stairOpts.length ? stairOpts : [centre({ x0: 1, y0: 1, x1: w - 2, y1: h - 2 })]);

  const g = m.ground;
  const storeys = Array.from({ length: upper + 1 }, (_, i) => g + i);
  const roof = g + upper + 1;
  // Outer wall tiles whose inside neighbour is a room, for doors and windows.
  const edge: { x: number; y: number; ix: number; iy: number; side: number }[] = [];
  for (let x = 1; x < w - 1; x++) edge.push({ x, y: 0, ix: x, iy: 1, side: 0 }, { x, y: h - 1, ix: x, iy: h - 2, side: 1 });
  for (let y = 1; y < h - 1; y++) edge.push({ x: 0, y, ix: 1, iy: y, side: 2 }, { x: w - 1, y, ix: w - 2, iy: y, side: 3 });
  const openEdge = edge.filter((e) => at(e.ix, e.iy) === F);

  for (const z of storeys) {
    const local = new Uint8Array(plan);
    // Exterior doors on the ground floor, on different sides where possible.
    if (z === g) {
      const sides = new Set<number>();
      for (let n = 0, tries = 0; n < style.doors && tries < 40; tries++) {
        const e = r.pick(openEdge);
        if (sides.has(e.side) && sides.size < 4 && tries < 20) continue;
        const along = e.side < 2 ? [1, 0] : [0, 1];
        let ok = true;
        for (let k = 0; k < style.doorWidth; k++) {
          const x = e.x + along[0]! * k, y = e.y + along[1]! * k;
          // Along the wall, short of the corners; and a room behind it.
          if ((e.side < 2 ? x <= 0 || x >= w - 1 : y <= 0 || y >= h - 1) || at(e.ix + along[0]! * k, e.iy + along[1]! * k) !== F) ok = false;
        }
        if (!ok) continue;
        for (let k = 0; k < style.doorWidth; k++) local[(e.y + along[1]! * k) * w + e.x + along[0]! * k] = D;
        sides.add(e.side);
        n++;
      }
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = local[y * w + x]!;
        const X = rect.x0 + x, Y = rect.y0 + y;
        if (v === W) setTile(m, X, Y, z, T.WALL, style.wall);
        else if (v === D) setTile(m, X, Y, z, T.DOOR, style.floor);
        else setTile(m, X, Y, z, T.FLOOR, style.floor);
      }
    // Windows: on the outer wall, never next to a door.
    for (const e of openEdge) {
      const X = rect.x0 + e.x, Y = rect.y0 + e.y;
      if (tileAt(m, X, Y, z) !== T.WALL) continue;
      const besideDoor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tileAt(m, X + dx!, Y + dy!, z) === T.DOOR);
      if (!besideDoor && r.chance(style.windowChance)) setTile(m, X, Y, z, T.WINDOW, "none");
    }
    setTile(m, rect.x0 + stair.x, rect.y0 + stair.y, z, T.STAIRS, "wood");
    thinStorey(m, rect, z, rooms, style.wall, style.floor);
    furnish(m, r, rect, z, rooms, stair, style.furniture, (room) => r.int(0, rw(room) * rh(room) >= 12 ? 3 : 1));
  }
  // The roof: walkable, a parapet round the edge, the stairs coming up.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const rim = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      setTile(m, rect.x0 + x, rect.y0 + y, roof, rim ? T.LOW : T.FLOOR, rim ? "parapet" : "roof");
    }

  let basementLevel: number | null = null;
  let basementRooms: Rect[] = [];
  if (basement && g > 0) {
    basementLevel = g - 1;
    const b = floorPlan(r, w, h, 3, true);
    b.plan[stair.y * w + stair.x] = F;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = b.plan[y * w + x]!;
        setTile(m, rect.x0 + x, rect.y0 + y, basementLevel, v === W ? T.WALL : v === D ? T.DOOR : T.FLOOR, v === W ? "stone" : "dirt");
      }
    setTile(m, rect.x0 + stair.x, rect.y0 + stair.y, basementLevel, T.STAIRS, "wood");
    thinStorey(m, rect, basementLevel, b.rooms, "stone", "dirt");
    // Some crates down there too.
    furnish(m, r, rect, basementLevel, b.rooms, stair, ["crate"], () => (r.chance(0.6) ? 1 : 0));
    basementRooms = b.rooms.map((q) => ({ x0: rect.x0 + q.x0, y0: rect.y0 + q.y0, x1: rect.x0 + q.x1, y1: rect.y0 + q.y1 }));
  }
  return {
    rect, storeys, roof, basement: basementLevel, stair: { x: rect.x0 + stair.x, y: rect.y0 + stair.y },
    rooms: rooms.map((q) => ({ x0: rect.x0 + q.x0, y0: rect.y0 + q.y0, x1: rect.x0 + q.x1, y1: rect.y0 + q.y1 })),
    basementRooms,
  };
}

// ---------------------------------------------------------------------------
// Outdoor dressing

const fill = (m: BattleMap, rect: Rect, z: number, t: (typeof T)[keyof typeof T], skin: Skin) => {
  for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) setTile(m, x, y, z, t, skin);
};

/** A prop on open ground, if the tile is bare floor. */
function prop(m: BattleMap, x: number, y: number, t: (typeof T)["LOW"] | (typeof T)["HIGH"], skin: Skin) {
  if (tileAt(m, x, y, m.ground) === T.FLOOR) setTile(m, x, y, m.ground, t, skin);
}

function park(m: BattleMap, r: Rng, a: Rect) {
  fill(m, a, m.ground, T.FLOOR, "grass");
  for (let k = Math.floor((rw(a) * rh(a)) / 10); k > 0; k--) prop(m, r.int(a.x0, a.x1), r.int(a.y0, a.y1), T.HIGH, "tree");
  // A hedge with gaps across the middle.
  if (r.chance(0.6)) {
    const y = r.int(a.y0 + 1, a.y1 - 1);
    for (let x = a.x0; x <= a.x1; x++) if (r.chance(0.7)) prop(m, x, y, T.LOW, "hedge");
  }
  for (let k = r.int(1, 3); k > 0; k--) prop(m, r.int(a.x0, a.x1), r.int(a.y0, a.y1), T.LOW, "bench");
}

function carPark(m: BattleMap, r: Rng, a: Rect) {
  fill(m, a, m.ground, T.FLOOR, "tarmac");
  // Rows of cars two tiles long, an aisle between rows.
  for (let y = a.y0 + 1; y <= a.y1 - 1; y += 4)
    for (let x = a.x0; x <= a.x1; x += 2) {
      if (!r.chance(0.55)) continue;
      prop(m, x, y, T.LOW, "car");
      prop(m, x, y + 1, T.LOW, "car");
    }
}

/** A 3 × 3 landing zone, cleared, at `c`. */
function landingZone(m: BattleMap, c: Pt): Pt3[] {
  const lz: Pt3[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx, y = c.y + dy;
      if (!walkable(m, x, y, m.ground)) setTile(m, x, y, m.ground, T.FLOOR, m.setting === "urban" ? "pavement" : "grass");
      lz.push({ x, y, z: m.ground });
    }
  return lz;
}

// ---------------------------------------------------------------------------
// Urban

/** Where the roads (3 wide) cross an axis: between blocks of about 10–14, none at the map's edge. */
function roadLines(r: Rng, n: number): number[] {
  const blocks = Math.max(2, Math.round(n / 13));
  const size = (n - 3 * (blocks - 1)) / blocks;
  const out: number[] = [];
  for (let i = 1; i < blocks; i++) out.push(Math.round(i * (size + 3) - 3 + r.int(-2, 2)));
  return out;
}

function spans(roads: number[], n: number): [number, number][] {
  const out: [number, number][] = [];
  let a = 0;
  for (const p of roads) {
    if (p - 1 >= a) out.push([a, p - 1]);
    a = p + 3;
  }
  if (a <= n - 1) out.push([a, n - 1]);
  return out;
}

function urban(m: BattleMap, r: Rng, basement: boolean): Building[] {
  const n = m.w;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, m.ground, T.FLOOR, "pavement");
  const rx = roadLines(r, n), ry = roadLines(r, n);
  for (const p of rx) fill(m, { x0: p, y0: 0, x1: p + 2, y1: n - 1 }, m.ground, T.FLOOR, "road");
  for (const p of ry) fill(m, { x0: 0, y0: p, x1: n - 1, y1: p + 2 }, m.ground, T.FLOOR, "road");
  // Parked cars along the outer lanes, never in a junction.
  const junction = (x: number, y: number) => rx.some((p) => x >= p - 1 && x <= p + 3) && ry.some((p) => y >= p - 1 && y <= p + 3);
  for (const p of rx)
    for (const lane of [p, p + 2])
      for (let y = 0; y < n - 1; y += 3) if (r.chance(0.3) && !junction(lane, y) && !junction(lane, y + 1)) prop(m, lane, y, T.LOW, "car"), prop(m, lane, y + 1, T.LOW, "car");
  for (const p of ry)
    for (const lane of [p, p + 2])
      for (let x = 0; x < n - 1; x += 3) if (r.chance(0.3) && !junction(x, lane) && !junction(x + 1, lane)) prop(m, x, lane, T.LOW, "car"), prop(m, x + 1, lane, T.LOW, "car");

  // Lots: the blocks between roads, a pavement round each.
  const lots: Rect[] = [];
  for (const [x0, x1] of spans(rx, n)) for (const [y0, y1] of spans(ry, n)) if (x1 - x0 >= 4 && y1 - y0 >= 4) lots.push(inset({ x0, y0, x1, y1 }, 1));
  // Big lots split in two by an alley.
  for (let i = 0; i < lots.length; i++) {
    const l = lots[i]!;
    if (rw(l) >= 15 && rw(l) >= rh(l)) {
      const s = r.int(l.x0 + 6, l.x1 - 6);
      lots.splice(i--, 1, { ...l, x1: s - 1 }, { ...l, x0: s + 1 });
    } else if (rh(l) >= 15) {
      const s = r.int(l.y0 + 6, l.y1 - 6);
      lots.splice(i--, 1, { ...l, y1: s - 1 }, { ...l, y0: s + 1 });
    }
  }
  // The landing plaza: a lot on the edge of the map.
  const onEdge = lots.filter((l) => l.x0 <= 1 || l.y0 <= 1 || l.x1 >= n - 2 || l.y1 >= n - 2);
  const plaza = r.pick(onEdge.length ? onEdge : lots);
  const lzAt = centre(plaza);
  // The hideout: the biggest lot of those farthest from the plaza.
  const buildable = lots.filter((l) => l !== plaza && rw(l) >= 5 && rh(l) >= 5);
  const far = [...buildable].sort((a, b) => dist(centre(b), lzAt) - dist(centre(a), lzAt));
  const hideoutLot = far.slice(0, 2).sort((a, b) => rw(b) * rh(b) - rw(a) * rh(a))[0];
  // At least two buildings, and the far side of the map built up.
  const forced = new Set(far.slice(0, Math.max(2, Math.ceil(buildable.length * 0.4))));

  const buildings: Building[] = [];
  for (const lot of lots) {
    if (lot === plaza) {
      fill(m, lot, m.ground, T.FLOOR, "stone");
      // Trees and benches round the edge only: the middle is for landing.
      for (let x = lot.x0; x <= lot.x1; x += 3) if (r.chance(0.5)) prop(m, x, r.pick([lot.y0, lot.y1]), T.HIGH, "tree");
      for (let k = r.int(1, 3); k > 0; k--) prop(m, r.pick([lot.x0, lot.x1]), r.int(lot.y0, lot.y1), T.LOW, "bench");
      continue;
    }
    const isHideout = lot === hideoutLot;
    const roll = r.next();
    if (isHideout || forced.has(lot) || (rw(lot) >= 6 && rh(lot) >= 6 && roll < 0.65)) {
      // The building fills most of the lot; any strip left over is a yard.
      const bw = Math.min(rw(lot), r.int(7, 13)), bh = Math.min(rh(lot), r.int(7, 13));
      const bx = r.int(lot.x0, lot.x1 - bw + 1), by = r.int(lot.y0, lot.y1 - bh + 1);
      const rect = { x0: bx, y0: by, x1: bx + bw - 1, y1: by + bh - 1 };
      for (let y = lot.y0; y <= lot.y1; y++)
        for (let x = lot.x0; x <= lot.x1; x++)
          if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1) {
            setTile(m, x, y, m.ground, T.FLOOR, "grass");
            if (r.chance(0.04)) prop(m, x, y, T.HIGH, "tree");
            else if (r.chance(0.03)) prop(m, x, y, T.LOW, "bin");
          }
      const upper = r.chance(0.55) ? MAX_UPPER : 0;
      const style = { ...HOUSE, wall: r.pick<Skin>(["brick", "plaster"]) };
      buildings.push(placeBuilding(m, r, rect, upper, style, isHideout && basement));
    } else if (roll < 0.8) carPark(m, r, lot);
    else park(m, r, lot);
  }
  // Bins and the odd tree on the pavements.
  for (let k = Math.floor(n / 3); k > 0; k--) {
    const x = r.int(0, n - 1), y = r.int(0, n - 1);
    if (skinAt(m, x, y, m.ground) === "pavement") prop(m, x, y, r.chance(0.5) ? T.LOW : T.HIGH, r.chance(0.5) ? "bin" : "tree");
  }
  m.lz = landingZone(m, lzAt);
  return buildings;
}

// ---------------------------------------------------------------------------
// Rural

function rural(m: BattleMap, r: Rng, basement: boolean): Building[] {
  const n = m.w;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, m.ground, T.FLOOR, "grass");
  const taken: Rect[] = [];
  // A dirt road across the map, two wide.
  const horizontal = r.chance(0.5);
  const at = r.int(Math.floor(n * 0.3), Math.floor(n * 0.6));
  const road: Rect = horizontal ? { x0: 0, y0: at, x1: n - 1, y1: at + 1 } : { x0: at, y0: 0, x1: at + 1, y1: n - 1 };
  fill(m, road, m.ground, T.FLOOR, "dirt");
  taken.push(road);

  const place = (w: number, h: number, near?: Rect): Rect | null => {
    for (let tries = 0; tries < 200; tries++) {
      let x: number, y: number;
      if (near && tries < 120) {
        x = r.int(Math.max(2, near.x0 - w - 6), Math.min(n - w - 2, near.x1 + 6));
        y = r.int(Math.max(2, near.y0 - h - 6), Math.min(n - h - 2, near.y1 + 6));
      } else {
        x = r.int(2, n - w - 2);
        y = r.int(2, n - h - 2);
      }
      const rect = { x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 };
      if (rect.x1 > n - 3 || rect.y1 > n - 3 || rect.x0 < 2 || rect.y0 < 2) continue;
      if (taken.some((t) => overlaps(t, rect, 2))) continue;
      taken.push(rect);
      return rect;
    }
    return null;
  };

  const buildings: Building[] = [];
  const houseRect = place(r.int(8, 11), r.int(7, 9), road);
  const house = houseRect ? placeBuilding(m, r, houseRect, MAX_UPPER, { ...HOUSE, wall: "plaster", windowChance: 0.4 }, basement) : null;
  if (house) buildings.push(house);
  const barnRect = place(r.int(10, 13), r.int(8, 10), houseRect ?? road);
  if (barnRect) {
    const barn = placeBuilding(m, r, barnRect, 0, { wall: "planks", floor: "dirt", furniture: ["hay", "hay", "crate"], rooms: false, doors: 2, doorWidth: 2, windowChance: 0.1 }, false);
    // Hay bales in clumps.
    for (let k = r.int(3, 6); k > 0; k--) {
      const x = r.int(barnRect.x0 + 2, barnRect.x1 - 2), y = r.int(barnRect.y0 + 2, barnRect.y1 - 2);
      if (tileAt(m, x, y, m.ground) === T.FLOOR && Math.abs(x - barn.stair.x) + Math.abs(y - barn.stair.y) > 1) setTile(m, x, y, m.ground, T.LOW, "hay");
    }
    buildings.push(barn);
  }
  for (let k = r.int(1, 2); k > 0; k--) {
    const shed = place(r.int(5, 6), r.int(5, 6), houseRect ?? undefined);
    if (shed) buildings.push(placeBuilding(m, r, shed, 0, { wall: "planks", floor: "dirt", furniture: ["crate"], rooms: false, doors: 1, doorWidth: 1, windowChance: 0.15 }, false));
  }
  // A car or tractor by the house.
  if (houseRect) {
    const x = Math.min(n - 2, houseRect.x1 + 2), y = houseRect.y0;
    prop(m, x, y, T.LOW, "car");
    prop(m, x, y + 1, T.LOW, "car");
  }
  // Fenced fields with gaps.
  for (let k = r.int(1, 3); k > 0; k--) {
    const f = place(r.int(6, 10), r.int(6, 10));
    if (!f) break;
    for (let x = f.x0; x <= f.x1; x++) for (const y of [f.y0, f.y1]) if (r.chance(0.85)) prop(m, x, y, T.LOW, "fence");
    for (let y = f.y0; y <= f.y1; y++) for (const x of [f.x0, f.x1]) if (r.chance(0.85)) prop(m, x, y, T.LOW, "fence");
    for (let y = f.y0 + 1; y < f.y1; y++) for (let x = f.x0 + 1; x < f.x1; x++) setTile(m, x, y, m.ground, T.FLOOR, "dirt");
  }
  // Woods: clumps of trees on open grass.
  for (let k = r.int(3, 6); k > 0; k--) {
    const c = { x: r.int(1, n - 2), y: r.int(1, n - 2) };
    const rad = r.int(2, 4);
    for (let y = c.y - rad; y <= c.y + rad; y++)
      for (let x = c.x - rad; x <= c.x + rad; x++)
        if (dist({ x, y }, c) <= rad && r.chance(0.45) && skinAt(m, x, y, m.ground) === "grass" && !taken.some((t) => overlaps(t, { x0: x, y0: y, x1: x, y1: y }, 1)))
          prop(m, x, y, T.HIGH, "tree");
  }
  // A hedgerow along the road.
  for (let i = 0; i < n; i++) {
    const x = horizontal ? i : road.x0 - 1, y = horizontal ? road.y0 - 1 : i;
    if (r.chance(0.35)) prop(m, x, y, T.LOW, "hedge");
  }
  // Land in the open, far from the house.
  const hc = houseRect ? centre(houseRect) : { x: n / 2, y: n / 2 };
  let best: Pt = { x: 3, y: 3 }, bestScore = -1;
  for (let k = 0; k < 120; k++) {
    const edge = r.int(0, 3);
    const c = edge === 0 ? { x: r.int(3, n - 4), y: 3 } : edge === 1 ? { x: r.int(3, n - 4), y: n - 4 } : edge === 2 ? { x: 3, y: r.int(3, n - 4) } : { x: n - 4, y: r.int(3, n - 4) };
    const clear = !taken.some((t) => overlaps(t, { x0: c.x - 1, y0: c.y - 1, x1: c.x + 1, y1: c.y + 1 }, 1));
    const score = dist(c, hc) * (clear ? 1 : 0.3);
    if (score > bestScore) (best = c), (bestScore = score);
  }
  m.lz = landingZone(m, best);
  return buildings;
}

// ---------------------------------------------------------------------------
// Spawns and validation

function spawnsFor(m: BattleMap, r: Rng, req: MapRequest, buildings: Building[]): Spawn[] {
  const used = new Set<number>(m.lz.map((p) => idx(m, p.x, p.y, p.z)));
  const lz = m.lz[4] ?? m.lz[0]!;
  const free = (p: Pt3) => tileAt(m, p.x, p.y, p.z) === T.FLOOR && !used.has(idx(m, p.x, p.y, p.z));
  const inRooms = (rooms: Rect[], z: number): Pt3[] => rooms.flatMap((q) => {
    const out: Pt3[] = [];
    for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) out.push({ x, y, z });
    return out;
  }).filter(free);
  const take = (from: Pt3[], side: Spawn["side"]): boolean => {
    const ok = from.filter(free);
    if (!ok.length) return false;
    const p = r.pick(ok);
    used.add(idx(m, p.x, p.y, p.z));
    out.push({ ...p, side });
    return true;
  };
  const out: Spawn[] = [];
  // The hideout: farthest from the landing zone.
  const byFar = [...buildings].sort((a, b) => dist(centre(b.rect), lz) - dist(centre(a.rect), lz));
  const hideout = byFar.find((b) => b.basement !== null) ?? byFar[0];
  const vampireSpots = hideout
    ? hideout.basement !== null ? inRooms(hideout.basementRooms, hideout.basement) : inRooms(hideout.rooms, hideout.storeys.at(-1)!)
    : [];
  // Anywhere outdoors at least 40% of the map away from the landing zone.
  const outdoors: Pt3[] = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (dist({ x, y }, lz) > m.w * 0.4) outdoors.push({ x, y, z: m.ground });
  const hideoutGround = hideout ? inRooms(hideout.rooms, m.ground) : [];
  const otherRooms = byFar.slice(hideout ? 1 : 0, 3).flatMap((b) => b.storeys.flatMap((z) => inRooms(b.rooms, z)));

  for (let k = 0; k < req.vampires; k++) take(vampireSpots, "vampire") || take(hideoutGround, "vampire") || take(outdoors, "vampire");
  for (let k = 0; k < req.thralls; k++) {
    const pool = k % 3 === 0 ? hideoutGround : k % 3 === 1 ? otherRooms : outdoors;
    take(pool, "thrall") || take(hideoutGround, "thrall") || take(outdoors, "thrall");
  }
  const anywhere: Pt3[] = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (dist({ x, y }, lz) > 6) anywhere.push({ x, y, z: m.ground });
  for (let k = 0; k < (req.civilians ?? 0); k++) take(anywhere, "civilian");
  return out;
}

/** Clears props walling off unreachable pockets, a few passes. True if the map ends fully connected. */
function repair(m: BattleMap): boolean {
  for (let pass = 0; pass < 6; pass++) {
    const lost = unreachableTiles(m);
    if (!lost.length) return true;
    for (const p of lost)
      for (const [dx, dy] of ORTHO) {
        const t = tileAt(m, p.x + dx, p.y + dy, p.z);
        if (t === T.LOW || t === T.HIGH) {
          const under = skinAt(m, p.x, p.y, p.z);
          setTile(m, p.x + dx, p.y + dy, p.z, T.FLOOR, under === "none" ? "grass" : under);
        }
        // Still shut in after a couple of passes: knock a doorway through.
        if (pass >= 2 && edgeAt(m, p.x, p.y, p.z, dx, dy) === E.WALL && walkable(m, p.x + dx, p.y + dy, p.z)) setEdge(m, p.x, p.y, p.z, dx, dy, E.DOOR, "stone");
      }
  }
  return !unreachableTiles(m).length;
}

/** Street lamps along the roads (town); a lamp over every outside door. */
function lightsFor(m: BattleMap, r: Rng): Pt3[] {
  const out: Pt3[] = [];
  const g = m.ground;
  const far = (p: Pt3, d: number) => out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= d);
  // Doors to the outside: a lamp on the outdoor side of the doorway.
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      for (const [dx, dy] of ORTHO) {
        if (edgeAt(m, x, y, g, dx, dy) !== E.DOOR || tileAt(m, x, y, g + 1) === T.VOID) continue;
        const p = { x: x + dx, y: y + dy, z: g };
        if (walkable(m, p.x, p.y, g) && tileAt(m, p.x, p.y, g + 1) === T.VOID && far(p, 4) && r.chance(0.7)) out.push(p);
      }
  // Street lamps: pavement beside a road, spaced out.
  if (m.setting === "urban")
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (skinAt(m, x, y, g) !== "pavement" || tileAt(m, x, y, g) !== T.FLOOR) continue;
        const byRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => skinAt(m, x + dx!, y + dy!, g) === "road");
        if (byRoad && far({ x, y, z: g }, 7)) out.push({ x, y, z: g });
      }
  return out;
}

/** One attempt at a map, before validation (exported for debugging). */
export function buildMap(req: MapRequest, attempt = 0) {
  const seed = (req.seed + attempt * 7919) >>> 0;
  const r = rng({ rng: seed });
  if (req.setting === "lair" || req.setting === "montsegur") return { m: lair(req, r), r, buildings: [] as Building[] };
  const basement = req.basement ?? r.chance(req.size === "nest" ? 0.5 : 0.8);
  const n = MAP_SIZE[req.size];
  const ground = basement ? 1 : 0;
  const m = emptyMap(n, n, ground + MAX_UPPER + 2, ground, req.setting, req.seed);
  const buildings = req.setting === "urban" ? urban(m, r, basement) : rural(m, r, basement);
  return { m, r, buildings };
}

/** Tries a seed until a map comes out fully connected (it nearly always does first time). */
export function generateMap(req: MapRequest): BattleMap {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { m, r, buildings } = buildMap(req, attempt);
    if (!repair(m)) continue;
    const deep = m.setting === "lair" || m.setting === "montsegur";
    m.spawns = deep ? lairSpawns(m, r, req) : spawnsFor(m, r, req, buildings);
    m.lights = deep ? [...m.lights, ...lightsFor(m, r)] : lightsFor(m, r);
    const seen = reachable(m, m.lz[0]!);
    if (m.spawns.every((s) => seen[idx(m, s.x, s.y, s.z)])) return m;
  }
  throw new Error(`No connected map for seed ${req.seed}`);
}

// ---------------------------------------------------------------------------
// Lairs (docs/WEB_PORT.md 3.11, T5)
//
// Three levels on a 44 × 44 map. The surface: a walled churchyard with a
// ruined chapel (or, for Montségur, the castle's broken walls on a rocky
// slope). From inside the chapel a stair goes down to the catacombs: rooms
// cut into the rock, joined by corridors, with sarcophagi, pillars and
// braziers. From the farthest room another stair goes down to the crypt:
// the eldest's hall, lined with pillars, and its side chambers.
// ---------------------------------------------------------------------------

const LAIR = { crypt: 0, catacombs: 1, surface: 2 } as const;

/** Rooms carved into rock on one level; walls of rock stand on their edges, solid rock beyond. */
class Carver {
  readonly cut: Uint8Array;
  constructor(readonly m: BattleMap, readonly z: number) {
    this.cut = new Uint8Array(m.w * m.h);
  }
  room(a: Rect) {
    for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) if (x > 0 && y > 0 && x < this.m.w - 1 && y < this.m.h - 1) this.cut[y * this.m.w + x] = 1;
  }
  /** An L-shaped corridor from a to b. */
  corridor(r: Rng, a: Pt, b: Pt, wide: boolean) {
    const xFirst = r.chance(0.5);
    const mid = xFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    for (const [p, q] of [[a, mid], [mid, b]] as const) {
      for (let x = Math.min(p.x, q.x); x <= Math.max(p.x, q.x); x++)
        for (let y = Math.min(p.y, q.y); y <= Math.max(p.y, q.y); y++) this.room({ x0: x, y0: y, x1: x + (wide ? 1 : 0), y1: y + (wide ? 1 : 0) });
    }
  }
  /** Carved floor, walled round on its edges; the rest left solid (nothing drawn). */
  apply(floor: Skin, wall: Skin) {
    const { m, z } = this;
    const cut = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && !!this.cut[y * m.w + x];
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!cut(x, y)) continue;
        setTile(m, x, y, z, T.FLOOR, floor);
        for (const [dx, dy] of ORTHO) if (!cut(x + dx, y + dy)) setEdge(m, x, y, z, dx, dy, E.WALL, wall);
      }
  }
}

/** Where the deep levels' rooms are, for spawns. */
const lairRooms = new WeakMap<BattleMap, { catacombs: Rect[]; hall: Rect; chambers: Rect[]; chapel: Rect }>();

function lair(req: MapRequest, r: Rng): BattleMap {
  const n = MAP_SIZE.lair;
  const mont = req.setting === "montsegur";
  const m = emptyMap(n, n, 4, LAIR.surface, req.setting, req.seed);
  const g = LAIR.surface;

  // The surface.
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, g, T.FLOOR, mont ? "dirt" : "grass");
  const cw = r.int(11, 13), ch = r.int(9, 10);
  const chapel: Rect = { x0: r.int(14, n - cw - 14), y0: r.int(14, n - ch - 14), x1: 0, y1: 0 };
  chapel.x1 = chapel.x0 + cw - 1;
  chapel.y1 = chapel.y0 + ch - 1;
  if (mont) {
    // The castle: a broken curtain wall round the keep, rubble where it fell; rock on the slope.
    const ring: Rect = inset({ x0: 0, y0: 0, x1: n - 1, y1: n - 1 }, 7);
    // The wall stands on the ring's outer edge; rubble lies where it fell.
    for (let x = ring.x0; x <= ring.x1; x++)
      for (const y of [ring.y0, ring.y1]) {
        const roll = r.next();
        if (roll < 0.6) setEdge(m, x, y, g, 0, y === ring.y0 ? -1 : 1, E.WALL, "stone");
        else if (roll < 0.8) setTile(m, x, y, g, T.LOW, "rubble");
      }
    for (let y = ring.y0; y <= ring.y1; y++)
      for (const x of [ring.x0, ring.x1]) {
        const roll = r.next();
        if (roll < 0.6) setEdge(m, x, y, g, x === ring.x0 ? -1 : 1, 0, E.WALL, "stone");
        else if (roll < 0.8) setTile(m, x, y, g, T.LOW, "rubble");
      }
    for (let k = 0; k < 70; k++) {
      const x = r.int(1, n - 2), y = r.int(1, n - 2);
      if (!overlaps({ x0: x, y0: y, x1: x, y1: y }, chapel, 2)) prop(m, x, y, r.chance(0.6) ? T.HIGH : T.LOW, r.chance(0.6) ? "rock" : "rubble");
    }
  } else {
    // A churchyard: a low wall with gaps, rows of graves, yews.
    const yard: Rect = inset(chapel, -6);
    for (let x = yard.x0; x <= yard.x1; x++) for (const y of [yard.y0, yard.y1]) if (r.chance(0.8)) prop(m, x, y, T.LOW, "parapet");
    for (let y = yard.y0; y <= yard.y1; y++) for (const x of [yard.x0, yard.x1]) if (r.chance(0.8)) prop(m, x, y, T.LOW, "parapet");
    for (let y = yard.y0 + 2; y < yard.y1 - 1; y += 3)
      for (let x = yard.x0 + 2; x < yard.x1 - 1; x += 2)
        if (!overlaps({ x0: x, y0: y, x1: x, y1: y }, chapel, 1) && r.chance(0.55)) prop(m, x, y, T.LOW, "grave");
    for (let k = 0; k < 30; k++) {
      const x = r.int(1, n - 2), y = r.int(1, n - 2);
      if (!overlaps({ x0: x, y0: y, x1: x, y1: y }, yard, 1)) prop(m, x, y, T.HIGH, "tree");
    }
  }
  const keep = placeBuilding(m, r, chapel, 0, {
    wall: "stone", floor: "stone", furniture: ["bench", "bench", "altar"], rooms: false, doors: 2, doorWidth: 2, windowChance: mont ? 0.1 : 0.4,
  }, false);

  // The catacombs: the first room is under the chapel, round the way down.
  const cat = new Carver(m, LAIR.catacombs);
  const free = (p: Pt) => tileAt(m, p.x, p.y, g) === T.FLOOR && Math.abs(p.x - keep.stair.x) + Math.abs(p.y - keep.stair.y) > 2;
  let entry: Pt = centre(chapel);
  for (let k = 0; k < 40; k++) {
    const p = { x: r.int(chapel.x0 + 2, chapel.x1 - 2), y: r.int(chapel.y0 + 2, chapel.y1 - 2) };
    if (free(p)) { entry = p; break; }
  }
  setTile(m, entry.x, entry.y, g, T.FLOOR, "stone");
  const rooms: Rect[] = [{ x0: entry.x - 2, y0: entry.y - 2, x1: entry.x + 2, y1: entry.y + 2 }];
  for (let k = 0; k < 60 && rooms.length < 9; k++) {
    const w = r.int(4, 8), h = r.int(4, 7);
    const a = { x0: r.int(3, n - w - 4), y0: r.int(3, n - h - 4), x1: 0, y1: 0 };
    a.x1 = a.x0 + w - 1;
    a.y1 = a.y0 + h - 1;
    if (!rooms.some((q) => overlaps(q, a, 2))) rooms.push(a);
  }
  for (const a of rooms) cat.room(a);
  // Join each room to the nearest one already joined (a tree), then a couple of loops.
  const joined = [rooms[0]!];
  for (const a of rooms.slice(1).sort((p, q) => dist(centre(p), entry) - dist(centre(q), entry))) {
    const near = [...joined].sort((p, q) => dist(centre(p), centre(a)) - dist(centre(q), centre(a)))[0]!;
    cat.corridor(r, centre(a), centre(near), r.chance(0.3));
    joined.push(a);
  }
  for (let k = 0; k < 2; k++) cat.corridor(r, centre(r.pick(rooms)), centre(r.pick(rooms)), false);
  cat.apply("crypt", "rock");
  setTile(m, entry.x, entry.y, LAIR.catacombs, T.STAIRS, "wood");
  // Sarcophagi and pillars, clear of the corridors' mouths (anything that blocks a pocket is cleared by repair).
  for (const a of rooms.slice(1)) {
    if (rw(a) >= 6 && rh(a) >= 5) for (const p of [{ x: a.x0 + 1, y: a.y0 + 1 }, { x: a.x1 - 1, y: a.y1 - 1 }]) setTile(m, p.x, p.y, LAIR.catacombs, T.HIGH, "pillar");
    for (let k = r.int(1, 3); k > 0; k--) {
      const x = r.int(a.x0 + 1, a.x1 - 1), y = r.int(a.y0 + 1, a.y1 - 1);
      if (tileAt(m, x, y, LAIR.catacombs) === T.FLOOR && dist({ x, y }, entry) > 2) setTile(m, x, y, LAIR.catacombs, T.LOW, "sarcophagus");
    }
    m.lights.push({ ...centre(a), z: LAIR.catacombs });
  }

  // The crypt, under the farthest room.
  const far = [...rooms].sort((p, q) => dist(centre(q), entry) - dist(centre(p), entry))[0]!;
  const down = centre(far);
  if (tileAt(m, down.x, down.y, LAIR.catacombs) !== T.FLOOR) setTile(m, down.x, down.y, LAIR.catacombs, T.FLOOR, "crypt");
  const crypt = new Carver(m, LAIR.crypt);
  const hw = mont ? 18 : 15, hh = mont ? 12 : 10;
  const hall: Rect = {
    x0: Math.max(3, Math.min(n - hw - 3, down.x - (down.x > n / 2 ? hw - 3 : 2))),
    y0: Math.max(3, Math.min(n - hh - 3, down.y - Math.floor(hh / 2))),
    x1: 0, y1: 0,
  };
  hall.x1 = hall.x0 + hw - 1;
  hall.y1 = hall.y0 + hh - 1;
  crypt.room(hall);
  // The way down lands inside the hall, at one end.
  const landing = { x: Math.max(hall.x0, Math.min(hall.x1, down.x)), y: Math.max(hall.y0, Math.min(hall.y1, down.y)) };
  if (landing.x !== down.x || landing.y !== down.y) crypt.corridor(r, landing, down, false);
  const chambers: Rect[] = [];
  for (const side of [-1, 1]) {
    const cy = side < 0 ? hall.y0 - 6 : hall.y1 + 2;
    const c: Rect = { x0: hall.x0 + r.int(2, hw - 7), y0: cy, x1: 0, y1: cy + 3 };
    c.x1 = c.x0 + 4;
    if (c.y0 < 2 || c.y1 > n - 3) continue;
    crypt.room(c);
    crypt.corridor(r, centre(c), { x: centre(c).x, y: side < 0 ? hall.y0 : hall.y1 }, false);
    chambers.push(c);
  }
  crypt.apply("crypt", "rock");
  setTile(m, down.x, down.y, LAIR.crypt, T.STAIRS, "wood");
  // Two rows of pillars down the hall; the altar at the far end.
  for (const py of [hall.y0 + 2, hall.y1 - 2])
    for (let x = hall.x0 + 3; x <= hall.x1 - 3; x += 3) if (dist({ x, y: py }, down) > 2) setTile(m, x, py, LAIR.crypt, T.HIGH, "pillar");
  const altarX = down.x > (hall.x0 + hall.x1) / 2 ? hall.x0 + 1 : hall.x1 - 1;
  for (let y = centre(hall).y - 1; y <= centre(hall).y + 1; y++) setTile(m, altarX, y, LAIR.crypt, T.LOW, "altar");
  for (const x of [hall.x0 + 2, centre(hall).x, hall.x1 - 2]) m.lights.push({ x, y: centre(hall).y, z: LAIR.crypt });

  lairRooms.set(m, { catacombs: rooms, hall, chambers, chapel });

  // Land at the edge, far from the chapel.
  let best: Pt = { x: 3, y: 3 }, score = -1;
  for (const c of [{ x: 3, y: 3 }, { x: n - 4, y: 3 }, { x: 3, y: n - 4 }, { x: n - 4, y: n - 4 }, { x: n / 2, y: 3 }, { x: 3, y: n / 2 }]) {
    const d = dist(c, centre(chapel));
    if (d > score) (best = { x: Math.floor(c.x), y: Math.floor(c.y) }), (score = d);
  }
  m.lz = landingZone(m, best);
  return m;
}

/** The eldest at the altar; the vampires in the crypt and the catacombs; thralls through the catacombs and up top. */
function lairSpawns(m: BattleMap, r: Rng, req: MapRequest): Spawn[] {
  const info = lairRooms.get(m)!;
  const out: Spawn[] = [];
  const used = new Set<number>();
  const pick = (rooms: Rect[], z: number): Pt3 | null => {
    const spots: Pt3[] = [];
    for (const a of rooms) for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) {
      const i = idx(m, x, y, z);
      if (tileAt(m, x, y, z) === T.FLOOR && !used.has(i)) spots.push({ x, y, z });
    }
    if (!spots.length) return null;
    const p = r.pick(spots);
    used.add(idx(m, p.x, p.y, p.z));
    return p;
  };
  const hallFar: Rect = { ...info.hall };
  const elder = pick([hallFar], LAIR.crypt);
  if (elder) out.push({ ...elder, side: "vampire", elder: true });
  for (let k = 1; k < req.vampires; k++) {
    const p = k % 3 === 2 ? pick(info.catacombs.slice(1), LAIR.catacombs) : pick([info.hall, ...info.chambers], LAIR.crypt);
    if (p) out.push({ ...p, side: "vampire" });
  }
  const surface: Rect = inset(info.chapel, -5);
  for (let k = 0; k < req.thralls; k++) {
    const p = k % 3 === 0 ? pick([surface], LAIR.surface) : k % 3 === 1 ? pick(info.catacombs, LAIR.catacombs) : pick([...info.chambers, info.hall], LAIR.crypt);
    if (p) out.push({ ...p, side: "thrall" });
  }
  return out;
}

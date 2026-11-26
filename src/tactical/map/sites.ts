// Special sites (docs/design/tactical.md, Maps): an apartment block, an
// industrial site with a blood bank under the warehouse, and the town's
// recognisable buildings (a hospital, a supermarket, a petrol station, a
// corner shop).
//
// Buildings here are drawn from planned floors rather than random splits: a
// plan (walls, floors, doors on a tile grid, mapgen's W / F / D) per storey,
// raised and thinned like any other building (walls onto the edges).
import type { Rng } from "../../sim/core/rng";
import {
  E,
  edgeAt,
  furnitureSize,
  furnitureSkin,
  isDoor,
  isWindow,
  setTile,
  skinAt,
  T,
  tileAt,
  type BattleMap,
  type Furniture,
  type FurnitureKind,
  type Pt,
  type Pt3,
  type Skin,
} from "./map";
import { centre, rh, rw, PAVE, ROAD_W, type Building, type Rect } from "./mapgen";
import {
  clearVehicles,
  doorsOut,
  fill,
  isRoad,
  landingZone,
  OUT,
  prop,
  someVehicle,
  treeRoom,
  vehicle,
} from "./dressing";
import { D, F, floorPlan, ORTHO, placeBuilding, thinStorey, W } from "./buildings";
import { kerbCorner } from "./urban";
import { glaze } from "./spawns";

// ---------------------------------------------------------------------------
// Planned buildings

/** One storey of a planned building (all local to its rect). */
interface Storey {
  z: number;
  /** W, F or D per tile, w × h. */
  plan: Uint8Array;
  rooms: Rect[];
  wall: Skin;
  floor: Skin;
  /** Chance an outer wall tile beside a room is a window. */
  windows: number;
  /** Stairs up to the next storey. */
  stairs: Pt[];
  /** Tiles left open (no floor: an open hall seen from its gallery). */
  hole?: (x: number, y: number) => boolean;
  /** Which outer wall tiles are windows (in place of the chance): the same on every floor. */
  pattern?: (x: number, y: number) => boolean;
}

/** Puts a storey on the map: walls, doors, windows, stairs, then thins its walls onto the edges. */
export function raise(m: BattleMap, r: Rng, rect: Rect, st: Storey) {
  const w = rw(rect),
    h = rh(rect);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : st.plan[y * w + x]!;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (st.hole?.(x, y)) continue;
      const v = at(x, y);
      setTile(
        m,
        rect.x0 + x,
        rect.y0 + y,
        st.z,
        v === W ? T.WALL : v === D ? T.DOOR : T.FLOOR,
        v === W ? st.wall : st.floor,
      );
    }
  // Windows: outer wall, a room behind, never beside a door or on a corner.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const outer = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (!outer || corner || at(x, y) !== W) continue;
      const ix = x === 0 ? 1 : x === w - 1 ? w - 2 : x,
        iy = y === 0 ? 1 : y === h - 1 ? h - 2 : y;
      const besideDoor = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => at(x + dx!, y + dy!) === D);
      if (
        at(ix, iy) === F &&
        !besideDoor &&
        !st.hole?.(ix, iy) &&
        (st.pattern ? st.pattern(x, y) : r.chance(st.windows))
      )
        setTile(m, rect.x0 + x, rect.y0 + y, st.z, T.WINDOW, "none");
    }
  for (const s of st.stairs) setTile(m, rect.x0 + s.x, rect.y0 + s.y, st.z, T.STAIRS, "wood");
  thinStorey(m, rect, st.z, st.rooms, st.wall, st.floor);
}

/** A flat roof over a rect: walkable, a parapet round its edge. */
function roofOver(m: BattleMap, rect: Rect, z: number) {
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) {
      const rim = x === rect.x0 || y === rect.y0 || x === rect.x1 || y === rect.y1;
      setTile(m, x, y, z, rim ? T.LOW : T.FLOOR, rim ? "parapet" : "roof");
    }
}

const local = (rect: Rect, q: Rect): Rect => ({
  x0: rect.x0 + q.x0,
  y0: rect.y0 + q.y0,
  x1: rect.x0 + q.x1,
  y1: rect.y0 + q.y1,
});

/**
 * A corridor plan: a corridor two tiles wide along x through the middle,
 * units (flats, wards, cold stores) either side, each with a door onto it,
 * split in two rooms when wide enough. A lobby (optional) takes the middle
 * unit on the south side, open to the corridor.
 */
function corridorPlan(
  r: Rng,
  w: number,
  h: number,
  o: { unit: [number, number]; split: boolean; lobby: boolean },
) {
  const plan = new Uint8Array(w * h).fill(F);
  const set = (x: number, y: number, v: number) => (plan[y * w + x] = v);
  for (let x = 0; x < w; x++) (set(x, 0, W), set(x, h - 1, W));
  for (let y = 0; y < h; y++) (set(0, y, W), set(w - 1, y, W));
  const cy = Math.floor(h / 2) - 1;
  for (let x = 1; x < w - 1; x++) (set(x, cy - 1, W), set(x, cy + 2, W));
  const corridor: Rect = { x0: 1, y0: cy, x1: w - 2, y1: cy + 1 };
  const rooms: Rect[] = [corridor];
  const units: Rect[][] = [];
  let lobby: Rect | null = null;
  for (const [y0, y1, wallY, south] of [
    [1, cy - 2, cy - 1, false],
    [cy + 3, h - 2, cy + 2, true],
  ] as const) {
    if (y1 < y0) continue;
    const spans: [number, number][] = [];
    for (let x = 1; x <= w - 2;) {
      let uw = r.int(o.unit[0], o.unit[1]);
      if (w - 2 - (x + uw - 1) < o.unit[0] + 1) uw = w - 2 - x + 1;
      const x1 = Math.min(w - 2, x + uw - 1);
      spans.push([x, x1]);
      if (x1 + 1 < w - 1) for (let y = y0; y <= y1; y++) set(x1 + 1, y, W);
      x = x1 + 2;
    }
    const lobbyAt = south && o.lobby ? Math.floor(spans.length / 2) : -1;
    spans.forEach(([a, b], i) => {
      if (i === lobbyAt) {
        // Open onto the corridor all along.
        for (let x = a; x <= b; x++) set(x, wallY, D);
        lobby = { x0: a, y0, x1: b, y1 };
        rooms.push(lobby);
        return;
      }
      set(r.int(a, b), wallY, D);
      const unit: Rect[] = [];
      if (o.split && b - a + 1 >= 6) {
        const s = Math.floor((a + b) / 2);
        for (let y = y0; y <= y1; y++) set(s, y, W);
        set(s, r.int(y0, y1), D);
        unit.push({ x0: a, y0, x1: s - 1, y1 }, { x0: s + 1, y0, x1: b, y1 });
      } else unit.push({ x0: a, y0, x1: b, y1 });
      units.push(unit);
      rooms.push(...unit);
    });
  }
  return { plan, rooms, units, corridor, lobby: lobby as Rect | null, cy };
}

/**
 * Props against the walls of each room (its rect, and the strip its walls
 * gave up when that strip is truly its own, not a corridor's), clear of
 * doorways and the stairs; LOW or HIGH, `count(room)` of them, kinds picked
 * from `kinds`.
 */
export function fit(
  m: BattleMap,
  r: Rng,
  rect: Rect,
  z: number,
  rooms: Rect[],
  stairs: Pt[],
  kinds: Skin[],
  t: (typeof T)["LOW"] | (typeof T)["HIGH"],
  count: (q: Rect) => number,
  avoid?: (x: number, y: number) => boolean,
) {
  const X = (x: number) => rect.x0 + x,
    Y = (y: number) => rect.y0 + y;
  const door = (x: number, y: number) =>
    ORTHO.some(([dx, dy]) => isDoor(edgeAt(m, X(x), Y(y), z, dx, dy)));
  const nearDoor = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (door(x + dx, y + dy)) return true;
    return false;
  };
  for (const q of rooms) {
    const spots: Pt[] = [];
    // The room's rect and the strip round it its walls gave up, where that strip opens onto nothing outside it (else it's another room's).
    const inner = (x: number, y: number) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1;
    const outer = (x: number, y: number) =>
      x >= q.x0 - 1 && x <= q.x1 + 1 && y >= q.y0 - 1 && y <= q.y1 + 1;
    const ours = (x: number, y: number) =>
      inner(x, y) ||
      ORTHO.every(
        ([dx, dy]) =>
          outer(x + dx, y + dy) ||
          edgeAt(m, X(x), Y(y), z, dx, dy) !== E.NONE ||
          tileAt(m, X(x + dx), Y(y + dy), z) === T.VOID,
      );
    for (let y = q.y0 - 1; y <= q.y1 + 1; y++)
      for (let x = q.x0 - 1; x <= q.x1 + 1; x++) {
        if (tileAt(m, X(x), Y(y), z) !== T.FLOOR || !ours(x, y)) continue;
        const wall = ORTHO.some(
          ([dx, dy]) =>
            edgeAt(m, X(x), Y(y), z, dx, dy) === E.WALL ||
            isWindow(edgeAt(m, X(x), Y(y), z, dx, dy)),
        );
        if (
          wall &&
          !nearDoor(x, y) &&
          !avoid?.(X(x), Y(y)) &&
          stairs.every((s) => Math.abs(x - s.x) + Math.abs(y - s.y) > 1)
        )
          spots.push({ x, y });
      }
    for (let k = Math.min(spots.length, count(q)); k > 0; k--) {
      const p = spots.splice(r.int(0, spots.length - 1), 1)[0]!;
      setTile(m, X(p.x), Y(p.y), z, t, r.pick(kinds));
    }
  }
}

// ---------------------------------------------------------------------------
// Furniture over several tiles

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
 * left with open floor in front. Returns the tiles it filled.
 */
function furnishFlat(m: BattleMap, r: Rng, rect: Rect, z: number, rooms: Rect[], stairs: Pt[]) {
  const X = (x: number) => rect.x0 + x,
    Y = (y: number) => rect.y0 + y;
  const stairsAt = stairs.map((s) => ({ x: X(s.x), y: Y(s.y) }));
  // Doors don't change while furnishing: each tile's answer worked out once.
  const nearDoor = new Map<number, boolean>();
  const doorNear = (x: number, y: number) => {
    const k = y * m.w + x;
    let near = nearDoor.get(k);
    if (near === undefined) {
      near = false;
      for (let dy = -1; dy <= 1 && !near; dy++)
        for (let dx = -1; dx <= 1 && !near; dx++)
          for (const [ex, ey] of EDGE_DIRS)
            if (isDoor(edgeAt(m, x + dx, y + dy, z, ex, ey))) near = true;
      nearDoor.set(k, near);
    }
    return near;
  };
  // A room's own floor: flooded from its middle over open edges, inside its rect and the strip round it.
  const floorOf = (q: Rect) => {
    const set = new Set<number>();
    const key = (x: number, y: number) => y * m.w + x;
    const c = { x: X(Math.floor((q.x0 + q.x1) / 2)), y: Y(Math.floor((q.y0 + q.y1) / 2)) };
    const stack = [c];
    const inBox = (x: number, y: number) =>
      x >= X(q.x0 - 1) && x <= X(q.x1 + 1) && y >= Y(q.y0 - 1) && y <= Y(q.y1 + 1);
    while (stack.length) {
      const p = stack.pop()!;
      if (
        set.has(key(p.x, p.y)) ||
        !inBox(p.x, p.y) ||
        (tileAt(m, p.x, p.y, z) !== T.FLOOR && tileAt(m, p.x, p.y, z) !== T.LOW)
      )
        continue;
      set.add(key(p.x, p.y));
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        if (edgeAt(m, p.x, p.y, z, dx, dy) === E.NONE) stack.push({ x: p.x + dx, y: p.y + dy });
    }
    return {
      has: (x: number, y: number) => set.has(key(x, y)),
      tiles: [...set].map((k) => ({ x: k % m.w, y: Math.floor(k / m.w) })),
    };
  };
  const placed: Furniture[] = [];
  // Floor kept clear: in front of each piece, and between a TV and its sofa.
  const reserved = new Set<number>();
  const keep = (x: number, y: number) => reserved.add(y * m.w + x);
  const free = (room: ReturnType<typeof floorOf>, x: number, y: number) =>
    room.has(x, y) &&
    tileAt(m, x, y, z) === T.FLOOR &&
    !reserved.has(y * m.w + x) &&
    !doorNear(x, y) &&
    stairsAt.every((s) => Math.abs(s.x - x) + Math.abs(s.y - y) > 1);
  /** It fits: on free floor of the room, nothing on the edges inside it, open floor in front; its back to a wall if `backed`. */
  const fits = (room: ReturnType<typeof floorOf>, f: Furniture, backed: boolean) => {
    const { all, back, front } = rows(f);
    if (!all.every((p) => free(room, p.x, p.y))) return false;
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
    const wallBehind = (p: Pt) =>
      edgeAt(m, p.x, p.y, z, -f.dx, -f.dy) === E.WALL ||
      (f.kind !== "bed" && isWindow(edgeAt(m, p.x, p.y, z, -f.dx, -f.dy)));
    if (backed && !back.every(wallBehind)) return false;
    // Open behind a free-standing piece: a way round it.
    if (
      !backed &&
      !back.every(
        (p) =>
          room.has(p.x - f.dx, p.y - f.dy) &&
          tileAt(m, p.x - f.dx, p.y - f.dy, z) === T.FLOOR &&
          edgeAt(m, p.x, p.y, z, -f.dx, -f.dy) === E.NONE,
      )
    )
      return false;
    return front.every(
      (p) =>
        room.has(p.x + f.dx, p.y + f.dy) &&
        tileAt(m, p.x + f.dx, p.y + f.dy, z) === T.FLOOR &&
        edgeAt(m, p.x, p.y, z, f.dx, f.dy) === E.NONE,
    );
  };
  const put = (f: Furniture) => {
    for (const p of tilesOf(f)) setTile(m, p.x, p.y, z, T.LOW, furnitureSkin(f.kind));
    for (const p of rows(f).front) keep(p.x + f.dx, p.y + f.dy);
    m.furniture.push(f);
    placed.push(f);
  };
  const DIRS = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const;
  /** Every way a piece could stand in a room. */
  const options = (room: ReturnType<typeof floorOf>, kind: FurnitureKind, backed: boolean) => {
    const out: Furniture[] = [];
    for (const t of room.tiles)
      for (const [dx, dy] of DIRS) {
        const f = piece(kind, t.x, t.y, z, dx, dy);
        if (fits(room, f, backed)) out.push(f);
      }
    return out;
  };
  const living = (room: ReturnType<typeof floorOf>) => {
    // A TV stand to a wall; the sofa across from it, 1 to 3 tiles of floor between, to the far wall if it can.
    const pairs: [Furniture, Furniture, boolean, Pt[]][] = [];
    for (const tv of options(room, "tv", true)) {
      const { front } = rows(tv);
      for (let gap = 1; gap <= 3; gap++) {
        const ox = Math.min(...front.map((p) => p.x)) + tv.dx * (gap + 1),
          oy = Math.min(...front.map((p) => p.y)) + tv.dy * (gap + 1);
        const sofa = piece("sofa", ox, oy, z, -tv.dx, -tv.dy);
        const between = front.flatMap((p) =>
          Array.from({ length: gap }, (_, k) => ({
            x: p.x + tv.dx * (k + 1),
            y: p.y + tv.dy * (k + 1),
          })),
        );
        if (!between.every((p) => free(room, p.x, p.y))) break;
        for (const backed of [true, false])
          if ((backed || gap === 2) && fits(room, sofa, backed))
            pairs.push([tv, sofa, backed, between]);
      }
    }
    if (!pairs.length) return false;
    const best = pairs.filter((p) => p[2]).length ? pairs.filter((p) => p[2]) : pairs;
    const [tv, sofa, , between] = r.pick(best);
    put(tv);
    put(sofa);
    for (const p of between) keep(p.x, p.y);
    return true;
  };
  const bedroom = (room: ReturnType<typeof floorOf>) => {
    const opts = options(room, "bed", true);
    if (!opts.length) return false;
    put(r.pick(opts));
    return true;
  };
  const order = rooms.length > 1 && r.chance(0.5) ? [rooms[1]!, rooms[0]!] : rooms;
  if (order.length > 1) {
    living(floorOf(order[0]!)) || bedroom(floorOf(order[0]!));
    bedroom(floorOf(order[1]!)) || living(floorOf(order[1]!));
  } else if (order[0]) {
    const room = floorOf(order[0]);
    if (r.chance(0.5)) living(room) && bedroom(floorOf(order[0]));
    else bedroom(room) && living(floorOf(order[0]));
  }
  return placed;
}

/** Ceiling lights down a corridor (every 6 tiles along its middle) and one in each room given. */
function ceilingLights(
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
function cellar(
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

/** Parks cars along a street's two parking lanes (a road along x, rows y0 … y0 + 7), clear of `keep` columns. */
function parkStreet(m: BattleMap, r: Rng, y0: number, keep: (x: number) => boolean) {
  for (const [lane, front] of [
    [y0, -1],
    [y0 + ROAD_W - 2, 1],
  ] as const)
    for (let x = r.int(0, 3); x < m.w;) {
      const kind = someVehicle(r);
      const len = { car: 3, suv: 4, truck: 6, ambulance: 4, container: 4 }[kind];
      let clear = x + len <= m.w;
      for (let i = 0; i < len; i++) if (keep(x + i)) clear = false;
      if (clear && r.chance(0.5) && vehicle(m, r, x, lane, true, kind, front))
        x += len + r.int(1, 3);
      else x += r.int(1, 3);
    }
}

/** Trees on grass in a rect, spaced (never two side by side). */
function scatterTrees(m: BattleMap, r: Rng, a: Rect, chance: number) {
  for (let y = a.y0; y <= a.y1; y++)
    for (let x = a.x0; x <= a.x1; x++)
      if (
        skinAt(m, x, y, m.ground) === "grass" &&
        tileAt(m, x, y, m.ground) === T.FLOOR &&
        treeRoom(m, x, y) &&
        r.chance(chance)
      )
        prop(m, x, y, T.HIGH, "tree");
}

/** A street along the map's south edge: the road (8) and its pavement (PAVE). Returns the road's first row. */
function southStreet(m: BattleMap): number {
  const n = m.w,
    y0 = m.h - ROAD_W;
  fill(m, { x0: 0, y0, x1: n - 1, y1: m.h - 1 }, m.ground, T.FLOOR, "road");
  fill(m, { x0: 0, y0: y0 - PAVE, x1: n - 1, y1: y0 - 1 }, m.ground, T.FLOOR, "pavement");
  return y0;
}

/** A 3 × 3 landing zone on the road at column x (vehicles moved off first). */
function roadLz(m: BattleMap, x: number, roadY: number): Pt3[] {
  clearVehicles(m, { x0: x - 3, y0: roadY, x1: x + 3, y1: m.h - 1 });
  return landingZone(m, { x, y: roadY + 4 });
}

// ---------------------------------------------------------------------------
// Apartment block

/** Storeys of an apartment block (ground included), by site size. */
export const APARTMENT_STOREYS = { nest: 4, den: 5, haven: 6, lair: 6 } as const;

/**
 * An apartment block on a street: one tall block, a corridor through every
 * floor with flats either side, a stairwell at each end of it, a lobby off
 * the street, a walkable roof (a helicopter sets down there), a cellar. A
 * car park behind it, reached by a driveway down the side; a lawn with trees
 * on the other side; a paved forecourt in front.
 */
export function apartments(m: BattleMap, r: Rng, basement: boolean): Building[] {
  const n = m.w,
    g = m.ground;
  const storeys = m.levels - 1 - g;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: m.h - 1 }, g, T.FLOOR, "grass");
  const roadY = southStreet(m);
  const rect: Rect = { x0: 4, y0: 8, x1: n - 5, y1: roadY - PAVE - 4 };
  const w = rw(rect),
    h = rh(rect);
  // Outside: a car park behind (a row of bays, nose-in, off an aisle), a
  // driveway down the east side to the street, a forecourt in front.
  const bays: Rect = { x0: 0, y0: 0, x1: n - 2, y1: 3 };
  fill(m, { x0: 0, y0: 0, x1: n - 2, y1: 6 }, g, T.FLOOR, "tarmac");
  fill(m, { x0: 0, y0: 7, x1: n - 1, y1: 7 }, g, T.FLOOR, "pavement");
  const drive: Rect = { x0: n - 4, y0: 7, x1: n - 2, y1: roadY - 1 };
  fill(m, drive, g, T.FLOOR, "tarmac");
  fill(
    m,
    { x0: rect.x0, y0: rect.y1 + 1, x1: drive.x0 - 1, y1: roadY - PAVE - 1 },
    g,
    T.FLOOR,
    "pavement",
  );
  for (let x = 0; x + 2 <= bays.x1; x += 3) {
    for (let y = bays.y0; y <= bays.y1; y++) m.bayLines.push({ x, y, alongX: false });
    if (x + 2 < bays.x1 && r.chance(0.6))
      vehicle(m, r, x + 1, 0, false, r.chance(0.7) ? "car" : "suv", -1);
  }

  // The block.
  const cp = corridorPlan(r, w, h, { unit: [5, 7], split: true, lobby: true });
  const stairs: Pt[] = [
    { x: 1, y: cp.cy },
    { x: w - 2, y: cp.cy + 1 },
  ];
  const ground = new Uint8Array(cp.plan);
  // Ways out: each end of the corridor, and the lobby's front door (two wide) onto the street.
  ground[(cp.cy + 1) * w] = D;
  ground[cp.cy * w + w - 1] = D;
  const lobby = cp.lobby!;
  const lx = Math.floor((lobby.x0 + lobby.x1) / 2);
  ground[(h - 1) * w + lx] = D;
  ground[(h - 1) * w + lx + 1] = D;
  const wall = r.pick<Skin>(["brick", "plaster"]);
  // One rhythm of windows per face (every other tile, or two in three), the same on every floor: the flats are stacked alike.
  const rhythm = [0, 1, 2, 3].map(() => ({ every: r.pick([2, 3]), phase: r.int(0, 2) }));
  const windows = (x: number, y: number) => {
    const side = y === 0 ? 0 : y === h - 1 ? 1 : x === 0 ? 2 : 3;
    const { every, phase } = rhythm[side]!;
    return ((side < 2 ? x : y) + phase) % every !== 0;
  };
  const levels: number[] = [];
  for (let i = 0; i < storeys; i++) {
    const z = g + i;
    levels.push(z);
    raise(m, r, rect, {
      z,
      plan: i === 0 ? ground : cp.plan,
      rooms: cp.rooms,
      wall,
      floor: "indoor",
      windows: 0,
      pattern: windows,
      stairs,
    });
    // Flats on every floor; the lobby and the ground floor's flats alike.
    for (const unit of cp.units) furnishFlat(m, r, rect, z, unit, stairs);
    // A table or a crate besides, clear of the furniture (its front stays open).
    const byFurniture = (x: number, y: number) =>
      [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(
        ([dx, dy]) =>
          ["sofa", "tv", "bed"].includes(skinAt(m, x + dx!, y + dy!, z)) &&
          tileAt(m, x + dx!, y + dy!, z) === T.LOW,
      );
    fit(
      m,
      r,
      rect,
      z,
      cp.units.flat(),
      stairs,
      ["table", "crate", "table"],
      T.LOW,
      () => r.int(0, 1),
      byFurniture,
    );
    ceilingLights(m, rect, z, cp.corridor, []);
  }
  // A luxury block: the top two floors mostly glass, all round (a long view, and a sniper's).
  if (r.chance(0.5)) {
    const panes = new Set<number>();
    for (let y = rect.y0; y <= rect.y1; y++)
      for (let x = rect.x0; x <= rect.x1; x++) if (r.chance(0.7)) panes.add(y * m.w + x);
    for (const z of levels.slice(-2))
      glaze(m, r, rect, z, [0, 1, 2, 3], (x, y) => panes.has(y * m.w + x));
  }
  const roof = g + storeys;
  roofOver(m, rect, roof);
  let basementRooms: Rect[] = [];
  if (basement && g > 0)
    basementRooms = cellar(m, r, rect, g - 1, stairs, "stone", "concrete").map((q) =>
      local(rect, q),
    );

  // A lawn down the west side, planters and bins out front, lamps along the drive.
  scatterTrees(m, r, { x0: 0, y0: 8, x1: rect.x0 - 2, y1: roadY - PAVE - 1 }, 0.3);
  for (let x = rect.x0; x < drive.x0 - 1; x += 4)
    if (Math.abs(x - (rect.x0 + lx)) > 2)
      prop(m, x, roadY - PAVE - 1, T.LOW, r.chance(0.75) ? "hedge" : "bench");
  prop(m, rect.x0 + lx + 3, rect.y1 + 1, T.LOW, "bin");
  for (let y = 9; y < roadY - PAVE; y += 8) m.lights.push({ x: n - 1, y, z: g });

  // The street: parked both sides, clear of the driveway and the landing zone.
  const lzX = Math.floor(n * 0.3);
  parkStreet(
    m,
    r,
    roadY,
    (x) => (x >= drive.x0 - 2 && x <= drive.x1 + 2) || Math.abs(x - lzX) <= 3,
  );
  m.lz = roadLz(m, lzX, roadY);
  const c = centre(rect);
  m.airLz = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) m.airLz.push({ x: c.x + dx, y: c.y + dy, z: roof });
  return [
    {
      rect,
      storeys: levels,
      roof,
      basement: basementRooms.length ? g - 1 : null,
      rooms: cp.rooms.map((q) => local(rect, q)),
      basementRooms,
      stair: { x: rect.x0 + stairs[0]!.x, y: rect.y0 + stairs[0]!.y },
    },
  ];
}

// ---------------------------------------------------------------------------
// Industrial site

/**
 * A works yard behind a fence on a street: a warehouse (a hall of pallet
 * racking two storeys high with a gallery round it, offices at one end,
 * dock doors with trucks backed up to them), shipping containers, pallets,
 * a gatehouse; under the warehouse, the blood bank (cold stores full of
 * fridges, a lab, a ward), where the vampires sleep.
 */
export function industrial(m: BattleMap, r: Rng): Building[] {
  const n = m.w,
    g = m.ground;
  fill(m, { x0: 0, y0: 0, x1: n - 1, y1: m.h - 1 }, g, T.FLOOR, "grass");
  const roadY = southStreet(m);
  const yard: Rect = { x0: 0, y0: 0, x1: n - 1, y1: roadY - PAVE - 1 };
  fill(m, yard, g, T.FLOOR, "tarmac");
  // The gate: a driveway across the pavement.
  const gate = { x0: Math.floor(n * 0.55), x1: Math.floor(n * 0.55) + 5 };
  fill(m, { x0: gate.x0, y0: roadY - PAVE, x1: gate.x1, y1: roadY - 1 }, g, T.FLOOR, "tarmac");

  // The warehouse.
  const rect: Rect = { x0: 3, y0: 2, x1: n - 4, y1: 15 };
  const w = rw(rect),
    h = rh(rect);
  const OFF = 7; // the offices' wall column
  const plan = (z: "ground" | "upper") => {
    const p = new Uint8Array(w * h).fill(F);
    const set = (x: number, y: number, v: number) => (p[y * w + x] = v);
    for (let x = 0; x < w; x++) (set(x, 0, W), set(x, h - 1, W));
    for (let y = 0; y < h; y++) (set(0, y, W), set(w - 1, y, W), set(OFF, y, W));
    if (z === "ground") {
      for (let x = 1; x < OFF; x++) set(x, 6, W);
      set(3, 6, D);
      set(OFF, 10, D); // offices to the hall
      set(3, h - 1, D); // the office door
    } else set(OFF, 3, D); // the upstairs office onto the gallery
    return p;
  };
  const hall: Rect = { x0: OFF + 1, y0: 1, x1: w - 2, y1: h - 2 };
  const offices: Rect[] = [
    { x0: 1, y0: 1, x1: OFF - 1, y1: 5 },
    { x0: 1, y0: 7, x1: OFF - 1, y1: h - 2 },
  ];
  const ground = plan("ground");
  // Dock doors, two wide, onto the yard; a side door.
  const docks = [hall.x0 + 3, hall.x0 + Math.floor((rw(hall) - 2) / 2) + 2, hall.x1 - 4].filter(
    (x, i, a) => i === 0 || x - a[i - 1]! >= 5,
  );
  for (const x of docks) ground[(h - 1) * w + x] = ground[(h - 1) * w + x + 1] = D;
  ground[5 * w + w - 1] = D;
  const officeStair: Pt = { x: 2, y: 10 },
    hallStair: Pt = { x: w - 2, y: 1 };
  raise(m, r, rect, {
    z: g,
    plan: ground,
    rooms: [...offices, hall],
    wall: "metal",
    floor: "concrete",
    windows: 0.15,
    stairs: [officeStair, hallStair],
  });
  // Racking: double rows along the hall with aisles between, a cross aisle, the docks' end clear.
  const crossX = Math.floor((hall.x0 + hall.x1) / 2);
  for (const ry of [3, 7])
    for (let x = hall.x0 + 2; x <= hall.x1 - 2; x++)
      if (Math.abs(x - crossX) > 1)
        for (const y of [ry, ry + 1]) setTile(m, rect.x0 + x, rect.y0 + y, g, T.HIGH, "rack");
  fit(m, r, rect, g, offices, [officeStair], ["table", "table", "crate"], T.LOW, () => r.int(2, 3));
  // Upstairs: an office, and a gallery round the hall over the floor.
  const gallery = (x: number, y: number) =>
    x >= hall.x0 &&
    x <= hall.x1 &&
    y >= hall.y0 &&
    y <= hall.y1 &&
    !(x === hall.x0 || x === hall.x1 || y === hall.y0 || y === hall.y1);
  raise(m, r, rect, {
    z: g + 1,
    plan: plan("upper"),
    rooms: [{ x0: 1, y0: 1, x1: OFF - 1, y1: h - 2 }, hall],
    wall: "metal",
    floor: "concrete",
    windows: 0.45,
    stairs: [officeStair],
    hole: gallery,
  });
  fit(
    m,
    r,
    rect,
    g + 1,
    [{ x0: 1, y0: 1, x1: OFF - 1, y1: h - 2 }],
    [officeStair],
    ["table", "crate"],
    T.LOW,
    () => 3,
  );
  roofOver(m, rect, g + 2);
  // Lights over the hall (hung under the roof) and in the offices.
  for (let x = hall.x0 + 3; x <= hall.x1 - 2; x += 6)
    for (const y of [5, 9])
      m.lights.push({ x: rect.x0 + x, y: rect.y0 + y, z: g, ceiling: true, h: 2 * 2.5 - 0.4 });
  ceilingLights(m, rect, g, null, offices);

  // The blood bank, below: a corridor, cold stores, a lab, a ward.
  const bp = corridorPlan(r, w, h, { unit: [5, 8], split: false, lobby: false });
  bp.plan[officeStair.y * w + officeStair.x] = F;
  raise(m, r, rect, {
    z: g - 1,
    plan: bp.plan,
    rooms: bp.rooms,
    wall: "clinic",
    floor: "tile",
    windows: 0,
    stairs: [officeStair],
  });
  bp.units.forEach((u, i) => {
    const kind = i % 3;
    if (kind === 0)
      fit(m, r, rect, g - 1, u, [officeStair], ["fridge"], T.HIGH, (q) => Math.min(6, rw(q) + 1));
    else if (kind === 1)
      fit(m, r, rect, g - 1, u, [officeStair], ["bed"], T.LOW, () => r.int(2, 4));
    else {
      fit(m, r, rect, g - 1, u, [officeStair], ["counter"], T.LOW, () => 2);
      fit(m, r, rect, g - 1, u, [officeStair], ["fridge"], T.HIGH, () => 1);
    }
  });
  ceilingLights(m, rect, g - 1, bp.corridor, bp.units.flat());

  // The yard: trucks backed up to the docks, containers, pallets, a gatehouse, a fence with the gate.
  for (const x of docks)
    if (r.chance(0.75)) vehicle(m, r, rect.x0 + x, rect.y1 + 1, false, "truck", 1);
  const boxes: Rect = { x0: rect.x1 - 6, y0: rect.y1 + 9, x1: n - 2, y1: roadY - PAVE - 2 };
  for (let k = 0; k < 3; k++)
    vehicle(
      m,
      r,
      r.int(2, Math.max(2, gate.x0 - 8)),
      r.int(rect.y1 + 9, Math.max(rect.y1 + 9, roadY - PAVE - 4)),
      true,
      "container",
      1,
    );
  for (let k = r.int(4, 8); k > 0; k--)
    prop(m, r.int(boxes.x0, boxes.x1), r.int(boxes.y0, boxes.y1), T.LOW, "crate");
  const hutRect: Rect = {
    x0: gate.x1 + 2,
    y0: roadY - PAVE - 6,
    x1: gate.x1 + 5,
    y1: roadY - PAVE - 2,
  };
  clearVehicles(m, { x0: hutRect.x0 - 1, y0: hutRect.y0 - 1, x1: hutRect.x1 + 1, y1: hutRect.y1 });
  const hut = placeBuilding(
    m,
    r,
    hutRect,
    0,
    {
      wall: "metal",
      floor: "concrete",
      furniture: ["table"],
      rooms: false,
      doors: 1,
      doorWidth: 1,
      windowChance: 0.6,
    },
    false,
  );
  for (let x = 0; x < n; x++) if (x < gate.x0 || x > gate.x1) prop(m, x, yard.y1, T.LOW, "fence");
  for (let y = 0; y < yard.y1; y++)
    (prop(m, 0, y, T.LOW, "fence"), prop(m, n - 1, y, T.LOW, "fence"));
  for (let x = 1; x < n - 1; x++) prop(m, x, 0, T.LOW, "fence");
  // Floodlights along the fence.
  for (let x = 4; x < n - 2; x += 9) m.lights.push({ x, y: yard.y1 - 1, z: g });

  // Arriving: by road at the gate, or a helicopter in the open yard.
  const gx = gate.x0 + 2;
  parkStreet(m, r, roadY, (x) => x >= gate.x0 - 2 && x <= gate.x1 + 2);
  m.lz = roadLz(m, gx, roadY);
  const air = { x: gate.x0 + 1, y: Math.floor((rect.y1 + 1 + yard.y1) / 2) + 2 };
  clearVehicles(m, { x0: air.x - 2, y0: air.y - 2, x1: air.x + 2, y1: air.y + 2 });
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      if (tileAt(m, air.x + dx, air.y + dy, g) !== T.FLOOR)
        setTile(m, air.x + dx, air.y + dy, g, T.FLOOR, "tarmac");
  m.airLz = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) m.airLz.push({ x: air.x + dx, y: air.y + dy, z: g });
  return [
    {
      rect,
      storeys: [g, g + 1],
      roof: g + 2,
      basement: g - 1,
      rooms: [...offices, hall].map((q) => local(rect, q)),
      basementRooms: bp.rooms.map((q) => local(rect, q)),
      stair: { x: rect.x0 + officeStair.x, y: rect.y0 + officeStair.y },
    },
    hut,
  ];
}

// ---------------------------------------------------------------------------
// The town's recognisable buildings

/**
 * Plans are drawn facing south (the street along their bottom edge, y = d − 1)
 * and turned to face the lot's street side: these map a canonical tile, rect
 * or plan to the lot's frame (w × d canonical; front side 0 N, 1 S, 2 W, 3 E).
 */
function turn(w: number, d: number, front: number) {
  const pt = (p: Pt): Pt =>
    front === 1
      ? p
      : front === 0
        ? { x: p.x, y: d - 1 - p.y }
        : front === 2
          ? { x: d - 1 - p.y, y: p.x }
          : { x: p.y, y: p.x };
  const rect = (q: Rect): Rect => {
    const a = pt({ x: q.x0, y: q.y0 }),
      b = pt({ x: q.x1, y: q.y1 });
    return {
      x0: Math.min(a.x, b.x),
      y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x),
      y1: Math.max(a.y, b.y),
    };
  };
  const size = front < 2 ? { w, h: d } : { w: d, h: w };
  const plan = (p: Uint8Array) => {
    const out = new Uint8Array(size.w * size.h);
    for (let y = 0; y < d; y++)
      for (let x = 0; x < w; x++) {
        const q = pt({ x, y });
        out[q.y * size.w + q.x] = p[y * w + x]!;
      }
    return out;
  };
  return { pt, rect, plan, size };
}

/** A lit sign over the outside of the doorway at canonical tile (x, d − 1) of a turned plan. */
function signAt(
  m: BattleMap,
  rect: Rect,
  t: ReturnType<typeof turn>,
  x: number,
  d: number,
  front: number,
  z: number,
  text: string,
  w: number,
  bg: string,
  fg: string,
) {
  const p = t.pt({ x, y: d - 1 });
  const [dx, dy] = OUT[front]!;
  m.signs.push({ x: rect.x0 + p.x, y: rect.y0 + p.y, z, dx, dy, w, text, bg, fg });
}

/** Where a lot's frontage puts a vehicle in the street's near parking lane, `len` long, at `along` tiles from the lot's start. */
function kerbside(
  m: BattleMap,
  r: Rng,
  lot: Rect,
  front: number,
  along: number,
  kind: "ambulance" | "car",
) {
  const len = kind === "ambulance" ? 4 : 3;
  const alongX = front < 2;
  const x = alongX ? lot.x0 + along : front === 2 ? lot.x0 - PAVE - 2 : lot.x1 + PAVE + 1;
  const y = alongX ? (front === 0 ? lot.y0 - PAVE - 2 : lot.y1 + PAVE + 1) : lot.y0 + along;
  const area: Rect = alongX
    ? { x0: x - 1, y0: y, x1: x + len, y1: y + 1 }
    : { x0: x, y0: y - 1, x1: x + 1, y1: y + len };
  clearVehicles(m, area);
  vehicle(m, r, x, y, alongX, kind, front === 1 || front === 2 ? -1 : 1);
}

/**
 * A hospital: two storeys of wards off a corridor (beds along the walls), a
 * lobby with the reception desk off the street, a stairwell at each end of
 * the corridor, the morgue below when there's a basement; an ambulance at
 * the kerb, a red sign over the doors.
 */
export function hospital(
  m: BattleMap,
  r: Rng,
  lot: Rect,
  front: number,
  basement: boolean,
): Building {
  const g = m.ground;
  const W0 = front < 2 ? rw(lot) : rh(lot),
    D0 = front < 2 ? rh(lot) : rw(lot);
  const t = turn(W0, D0, front);
  const rect: Rect = {
    x0: lot.x0,
    y0: lot.y0,
    x1: lot.x0 + t.size.w - 1,
    y1: lot.y0 + t.size.h - 1,
  };
  const cp = corridorPlan(r, W0, D0, { unit: [4, 6], split: false, lobby: true });
  const stairsC: Pt[] = [
    { x: 1, y: cp.cy },
    { x: W0 - 2, y: cp.cy + 1 },
  ];
  const lobby = cp.lobby!,
    lx = Math.floor((lobby.x0 + lobby.x1) / 2);
  const ground = new Uint8Array(cp.plan);
  ground[(D0 - 1) * W0 + lx] = ground[(D0 - 1) * W0 + lx + 1] = D;
  ground[(cp.cy + 1) * W0] = D;
  const rooms = cp.rooms.map(t.rect),
    wards = cp.units.flat().map(t.rect),
    stairs = stairsC.map(t.pt);
  const levels = [g, g + 1];
  for (const z of levels) {
    raise(m, r, rect, {
      z,
      plan: t.plan(z === g ? ground : cp.plan),
      rooms,
      wall: "clinic",
      floor: "tile",
      windows: 0.55,
      stairs,
    });
    fit(m, r, rect, z, wards, stairs, ["bed"], T.LOW, (q) =>
      Math.min(4, Math.max(2, Math.floor((rw(q) * rh(q)) / 5))),
    );
    ceilingLights(
      m,
      rect,
      z,
      null,
      [...wards, t.rect(cp.corridor)].map((q) => q),
    );
  }
  // Reception: a desk across the lobby, benches to wait on.
  fit(m, r, rect, g, [t.rect(lobby)], stairs, ["counter"], T.LOW, () => 2);
  fit(m, r, rect, g, [t.rect(lobby)], stairs, ["bench"], T.LOW, () => 2);
  roofOver(m, rect, g + 2);
  let basementRooms: Rect[] = [];
  if (basement && g > 0) {
    const cells = cellar(m, r, rect, g - 1, stairs, "clinic", "tile");
    fit(m, r, rect, g - 1, cells, stairs, ["fridge"], T.HIGH, () => 2);
    fit(m, r, rect, g - 1, cells, stairs, ["bed"], T.LOW, () => 1);
    basementRooms = cells.map((q) => local(rect, q));
  }
  signAt(m, rect, t, lx, D0, front, g, "+ HOSPITAL", 4, "#b8202a", "#ffffff");
  kerbside(m, r, lot, front, 1, "ambulance");
  return {
    rect,
    storeys: levels,
    roof: g + 2,
    basement: basementRooms.length ? g - 1 : null,
    rooms: rooms.map((q) => local(rect, q)),
    basementRooms,
    stair: { x: rect.x0 + stairs[0]!.x, y: rect.y0 + stairs[0]!.y },
  };
}

/**
 * A supermarket: one big hall, glass along the street with the doors in the
 * middle, checkouts inside them, aisles of shelving, fridges along the back
 * wall, a stockroom behind (crates; a ladder to the roof); a green sign.
 */
export function supermarket(
  m: BattleMap,
  r: Rng,
  lot: Rect,
  front: number,
  basement: boolean,
): Building {
  const g = m.ground;
  const W0 = front < 2 ? rw(lot) : rh(lot),
    D0 = front < 2 ? rh(lot) : rw(lot);
  const t = turn(W0, D0, front);
  const rect: Rect = {
    x0: lot.x0,
    y0: lot.y0,
    x1: lot.x0 + t.size.w - 1,
    y1: lot.y0 + t.size.h - 1,
  };
  const plan = new Uint8Array(W0 * D0).fill(F);
  const set = (x: number, y: number, v: number) => (plan[y * W0 + x] = v);
  // A deep lot has a stockroom across the back (a wall at row 4); a shallow one is all shop floor.
  const deep = D0 >= 12,
    hy = deep ? 5 : 1;
  for (let x = 0; x < W0; x++) (set(x, 0, W), set(x, D0 - 1, W), deep && set(x, 4, W));
  for (let y = 0; y < D0; y++) (set(0, y, W), set(W0 - 1, y, W));
  const mid = Math.floor(W0 / 2) - 1;
  if (deep) (set(mid, 4, D), set(mid + 1, 4, D)); // to the stockroom
  (set(mid, D0 - 1, D), set(mid + 1, D0 - 1, D)); // the entrance
  set(W0 - 1, 2, D); // the delivery door
  const stock: Rect = { x0: 1, y0: 1, x1: W0 - 2, y1: 3 },
    hall: Rect = { x0: 1, y0: hy, x1: W0 - 2, y1: D0 - 2 };
  const rooms = deep ? [stock, hall] : [hall];
  const ladder = t.pt({ x: 1, y: 1 });
  raise(m, r, rect, {
    z: g,
    plan: t.plan(plan),
    rooms: rooms.map(t.rect),
    wall: r.pick<Skin>(["brick", "plaster"]),
    floor: "tile",
    windows: 0,
    stairs: [ladder],
  });
  // Floor-to-ceiling glass all along the front, but the doors.
  glaze(m, r, rect, g, [front], 1);
  const at = (x: number, y: number, k: (typeof T)["LOW"] | (typeof T)["HIGH"], skin: Skin) => {
    const p = t.pt({ x, y });
    if (tileAt(m, rect.x0 + p.x, rect.y0 + p.y, g) === T.FLOOR)
      setTile(m, rect.x0 + p.x, rect.y0 + p.y, g, k, skin);
  };
  // Fridges along the back of the hall, clear of the stockroom doors (and the ladder and the delivery door).
  for (let x = 2; x < W0 - 3; x++) if (x < mid - 1 || x > mid + 2) at(x, hy, T.HIGH, "fridge");
  // Aisles: shelving runs across, a tile deep, two clear between, broken for a cross aisle; checkouts inside the doors.
  const cross = new Set([mid, mid + 1]);
  for (let y = hy + 2; y <= D0 - 5; y += 3)
    for (let x = 2; x < W0 - 2; x++) if (!cross.has(x)) at(x, y, T.HIGH, "shelf");
  for (let x = 2; x < W0 - 2; x += 3) if (!cross.has(x)) at(x, D0 - 3, T.LOW, "counter");
  const cellarStair = t.pt({ x: W0 - 3, y: 2 });
  if (deep)
    fit(m, r, rect, g, [t.rect(stock)], [ladder, cellarStair], ["crate"], T.LOW, () => r.int(3, 6));
  for (let x = 3; x < W0 - 2; x += 6)
    for (const y of [hy + 1, D0 - 4]) {
      const p = t.pt({ x, y });
      m.lights.push({ x: rect.x0 + p.x, y: rect.y0 + p.y, z: g, ceiling: true });
    }
  roofOver(m, rect, g + 1);
  let basementRooms: Rect[] = [];
  if (basement && g > 0) {
    // The cellar's stairs come up in the stockroom.
    basementRooms = cellar(m, r, rect, g - 1, [cellarStair], "stone", "concrete").map((q) =>
      local(rect, q),
    );
  }
  signAt(m, rect, t, mid, D0, front, g, "SUPERMARKET", 5, "#1f6a3a", "#f4f0d8");
  return {
    rect,
    storeys: [g],
    roof: g + 1,
    basement: basementRooms.length ? g - 1 : null,
    rooms: rooms.map(t.rect).map((q) => local(rect, q)),
    basementRooms,
    stair: { x: rect.x0 + ladder.x, y: rect.y0 + ladder.y },
  };
}

/**
 * A petrol station: the forecourt at road height with a driveway in and one
 * out across the pavement, two islands of pumps under a canopy (lit
 * beneath), the kiosk at the back with its sign, a car filling up.
 */
export function petrolStation(m: BattleMap, r: Rng, lot: Rect, front: number): Building | null {
  const g = m.ground;
  const W0 = front < 2 ? rw(lot) : rh(lot),
    D0 = front < 2 ? rh(lot) : rw(lot);
  if (W0 < 10 || D0 < 9) return null;
  const t = turn(W0, D0, front);
  const P = (x: number, y: number) => {
    const p = t.pt({ x, y });
    return { x: lot.x0 + p.x, y: lot.y0 + p.y };
  };
  // The driveways must reach the road (outside the lot: canonical y = D0 … D0 + PAVE, road at D0 + PAVE).
  const drives = [1, W0 - 4];
  for (const dx of drives)
    for (let k = 0; k < 3; k++) {
      const p = P(dx + k, D0 + PAVE);
      if (!isRoad(m, p.x, p.y)) return null;
    }
  for (const dx of drives)
    for (let k = 0; k < 3; k++)
      for (let y = D0; y < D0 + PAVE; y++) {
        const p = P(dx + k, y);
        if (skinAt(m, p.x, p.y, g) !== "pavement" || kerbCorner(m, p.x, p.y)) return null;
      }
  fill(m, lot, g, T.FLOOR, "tarmac");
  for (const dx of drives)
    for (let k = 0; k < 3; k++)
      for (let y = D0; y < D0 + PAVE; y++) {
        const p = P(dx + k, y);
        setTile(m, p.x, p.y, g, T.FLOOR, "tarmac");
      }
  for (const dx of drives) {
    const a = P(dx - 1, D0 + PAVE),
      b = P(dx + 3, D0 + PAVE + 1);
    clearVehicles(m, {
      x0: Math.min(a.x, b.x),
      y0: Math.min(a.y, b.y),
      x1: Math.max(a.x, b.x),
      y1: Math.max(a.y, b.y),
    });
  }
  // The kiosk: across the back, its door onto the forecourt.
  const kw = Math.min(W0, 7),
    kx = Math.floor((W0 - kw) / 2);
  const kioskC: Rect = { x0: kx, y0: 0, x1: kx + kw - 1, y1: 3 };
  const kiosk = t.rect(kioskC);
  const kioskW = {
    x0: lot.x0 + kiosk.x0,
    y0: lot.y0 + kiosk.y0,
    x1: lot.x0 + kiosk.x1,
    y1: lot.y0 + kiosk.y1,
  };
  for (let y = kioskW.y0; y <= kioskW.y1; y++)
    for (let x = kioskW.x0; x <= kioskW.x1; x++) setTile(m, x, y, g, T.FLOOR, "tile");
  const b = placeBuilding(
    m,
    r,
    kioskW,
    0,
    {
      wall: "plaster",
      floor: "tile",
      furniture: ["counter", "crate"],
      rooms: false,
      doors: 1,
      doorWidth: 1,
      windowChance: 0.6,
    },
    false,
    front,
  );
  glaze(m, r, kioskW, g, [front], 0.9); // the kiosk's front: glass onto the pumps
  for (const d of doorsOut(m, kioskW))
    if (d.dx === OUT[front]![0] && d.dy === OUT[front]![1])
      m.signs.push({
        x: d.x - d.dx,
        y: d.y - d.dy,
        z: g,
        dx: d.dx,
        dy: d.dy,
        w: 3,
        text: r.pick(["FUEL", "PETROL", "GAS"]),
        bg: "#d8a020",
        fg: "#2a1a10",
      });
  // Pump islands under the canopy, the canopy lit beneath.
  const iy = Math.max(5, Math.floor((4 + D0) / 2) - 0);
  const islands = [Math.floor(W0 / 2) - 3, Math.floor(W0 / 2) + 2];
  for (const ix of islands)
    for (const y of [iy - 1, iy]) {
      const p = P(ix, y);
      setTile(m, p.x, p.y, g, T.HIGH, "pump");
    }
  const c0 = P(islands[0]! - 2, iy - 2),
    c1 = P(islands[1]! + 2, iy + 1);
  m.canopies.push({
    x0: Math.min(c0.x, c1.x),
    y0: Math.min(c0.y, c1.y),
    x1: Math.max(c0.x, c1.x),
    y1: Math.max(c0.y, c1.y),
    z: g,
    h: 3.6,
  });
  for (const ix of islands) {
    const p = P(ix + 1, iy);
    m.lights.push({ x: p.x, y: p.y, z: g, ceiling: true, h: 3.5 });
  }
  // A car at a pump.
  const car = t.rect({ x0: islands[0]! + 1, y0: iy - 1, x1: islands[0]! + 2, y1: iy + 1 });
  if (r.chance(0.7)) vehicle(m, r, lot.x0 + car.x0, lot.y0 + car.y0, front >= 2, "car", 1);
  return b;
}

const SHOPS: { text: string; bg: string; fg: string }[] = [
  { text: "MINI MART", bg: "#c83a2a", fg: "#fff4d8" },
  { text: "GROCERY", bg: "#2a6a3a", fg: "#f4f0d8" },
  { text: "PHARMACY", bg: "#1a8a4a", fg: "#ffffff" },
  { text: "BAKERY", bg: "#7a4a2a", fg: "#f8e8c8" },
  { text: "NEWS", bg: "#1a3a7a", fg: "#ffffff" },
  { text: "24 HRS", bg: "#2a2a2e", fg: "#f8d040" },
];

/**
 * A corner shop on a house's ground floor: shelving and a counter instead of
 * the furniture, glass along the street, a sign over the street door, a
 * ceiling light in each room (a shop is lit; the flats above aren't).
 */
export function cornerShop(m: BattleMap, r: Rng, b: Building, front: number) {
  const g = m.ground,
    [dx, dy] = OUT[front]!;
  const all: Rect = { x0: 0, y0: 0, x1: m.w - 1, y1: m.h - 1 };
  for (const q of b.rooms)
    for (let y = q.y0 - 1; y <= q.y1 + 1; y++)
      for (let x = q.x0 - 1; x <= q.x1 + 1; x++)
        if (
          x >= b.rect.x0 &&
          x <= b.rect.x1 &&
          y >= b.rect.y0 &&
          y <= b.rect.y1 &&
          tileAt(m, x, y, g) === T.LOW
        )
          setTile(m, x, y, g, T.FLOOR, "indoor");
  fit(m, r, all, g, b.rooms, [b.stair], ["shelf"], T.HIGH, (q) =>
    Math.min(3, Math.floor((rw(q) * rh(q)) / 6)),
  );
  fit(m, r, all, g, b.rooms.slice(0, 1), [b.stair], ["counter"], T.LOW, () => 1);
  ceilingLights(m, all, g, null, b.rooms);
  // A glass shopfront along the street side.
  glaze(m, r, b.rect, g, [front], 0.85);
  const door = doorsOut(m, b.rect).find((d) => d.dx === dx && d.dy === dy);
  if (door) m.signs.push({ x: door.x - dx, y: door.y - dy, z: g, dx, dy, w: 3, ...r.pick(SHOPS) });
}

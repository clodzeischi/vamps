// Planned buildings, for the special sites (docs/design/tactical.md, Maps):
// drawn from planned floors rather than random splits. A plan (walls, floors,
// doors on a tile grid, mapgen's W / F / D) per storey, raised and thinned
// like any other building (walls onto the edges); corridors with rooms off
// them; fitting a plan to a lot.
import type { Rng } from "../../sim/core/rng";
import {
  E,
  edgeAt,
  isDoor,
  isWindow,
  setTile,
  T,
  tileAt,
  type BattleMap,
  type Pt,
  type Skin,
} from "./map";
import { rh, rw, type Rect } from "./mapgen";
import { D, F, ORTHO, thinStorey, W } from "./buildings";

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
export function roofOver(m: BattleMap, rect: Rect, z: number) {
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) {
      const rim = x === rect.x0 || y === rect.y0 || x === rect.x1 || y === rect.y1;
      setTile(m, x, y, z, rim ? T.LOW : T.FLOOR, rim ? "parapet" : "roof");
    }
}

export const local = (rect: Rect, q: Rect): Rect => ({
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
export function corridorPlan(
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

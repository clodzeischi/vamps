// Outdoor dressing: what stands about between the buildings (vehicles, trees, fences, street furniture).
import { type Rng } from "../../sim/core/rng";
import { cornerShop } from "./landmarks";
import {
  edgeAt,
  furnitureSkin,
  isDoor,
  setTile,
  skinAt,
  T,
  tileAt,
  walkable,
  VEHICLE_LENGTH,
  vehicleSkin,
  type BattleMap,
  type Pt,
  type Pt3,
  type Skin,
  type VehicleKind,
} from "./map";
import { type Rect, PAVE, overlaps, type Building, rw, rh, MAX_UPPER, inset } from "./mapgen";
import { kerbCorner } from "./urban";
import { ORTHO, HOUSE, placeBuilding } from "./buildings";

// ---------------------------------------------------------------------------
// Outdoor dressing

export const fill = (
  m: BattleMap,
  rect: Rect,
  z: number,
  t: (typeof T)[keyof typeof T],
  skin: Skin,
) => {
  for (let y = rect.y0; y <= rect.y1; y++)
    for (let x = rect.x0; x <= rect.x1; x++) setTile(m, x, y, z, t, skin);
};

/** A prop on open ground, if the tile is bare floor. */
export function prop(
  m: BattleMap,
  x: number,
  y: number,
  t: (typeof T)["LOW"] | (typeof T)["HIGH"],
  skin: Skin,
) {
  if (tileAt(m, x, y, m.ground) === T.FLOOR && !kerbCorner(m, x, y))
    setTile(m, x, y, m.ground, t, skin);
}

/**
 * A vehicle two tiles across, long along x or y, its corner at (x, y), if
 * every tile under it is bare floor. Its front faces `front` along its length.
 */
export function vehicle(
  m: BattleMap,
  r: Rng,
  x: number,
  y: number,
  alongX: boolean,
  kind: VehicleKind,
  front: 1 | -1,
): boolean {
  const len = VEHICLE_LENGTH[kind];
  const w = alongX ? len : 2,
    h = alongX ? 2 : len;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      if (tileAt(m, x + dx, y + dy, m.ground) !== T.FLOOR) return false;
  const under = skinAt(m, x, y, m.ground);
  const skin = vehicleSkin(kind),
    t = skin === "truck" ? T.HIGH : T.LOW;
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++) setTile(m, x + dx, y + dy, m.ground, t, skin);
  m.vehicles.push({ x, y, z: m.ground, w, h, kind, front, under, paint: r.int(0, 999) });
  return true;
}

/** What's parked: mostly cars, some SUVs, the odd truck. */
export const someVehicle = (r: Rng, trucks = true): VehicleKind => {
  const k = r.next();
  return k < 0.6 ? "car" : k < 0.9 || !trucks ? "suv" : "truck";
};

/** Vehicles the repair had to break into (a tile cleared): gone, every tile back to the floor under it. */
export function dropBrokenVehicles(m: BattleMap) {
  m.vehicles = m.vehicles.filter((v) => {
    const skin = vehicleSkin(v.kind);
    let whole = true;
    for (let dy = 0; dy < v.h; dy++)
      for (let dx = 0; dx < v.w; dx++)
        if (
          skinAt(m, v.x + dx, v.y + dy, v.z) !== skin ||
          tileAt(m, v.x + dx, v.y + dy, v.z) === T.FLOOR
        )
          whole = false;
    if (whole) return true;
    for (let dy = 0; dy < v.h; dy++)
      for (let dx = 0; dx < v.w; dx++) setTile(m, v.x + dx, v.y + dy, v.z, T.FLOOR, v.under);
    return false;
  });
}

/** Furniture the repair had to break into: gone, its tiles back to bare floor. */
export function dropBrokenFurniture(m: BattleMap) {
  m.furniture = m.furniture.filter((f) => {
    const skin = furnitureSkin(f.kind);
    let whole = true;
    for (let dy = 0; dy < f.h; dy++)
      for (let dx = 0; dx < f.w; dx++)
        if (
          tileAt(m, f.x + dx, f.y + dy, f.z) !== T.LOW ||
          skinAt(m, f.x + dx, f.y + dy, f.z) !== skin
        )
          whole = false;
    if (whole) return true;
    for (let dy = 0; dy < f.h; dy++)
      for (let dx = 0; dx < f.w; dx++)
        if (tileAt(m, f.x + dx, f.y + dy, f.z) === T.LOW)
          setTile(m, f.x + dx, f.y + dy, f.z, T.FLOOR, "indoor");
    return false;
  });
}

// Lot sides: 0 north (y0), 1 south (y1), 2 west (x0), 3 east (x1).
/** The way out of a lot's side, and the side's tiles. */
export const OUT = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
] as const;
export function sideTiles(l: Rect, s: number): Pt[] {
  const out: Pt[] = [];
  if (s < 2) for (let x = l.x0; x <= l.x1; x++) out.push({ x, y: s === 0 ? l.y0 : l.y1 });
  else for (let y = l.y0; y <= l.y1; y++) out.push({ x: s === 2 ? l.x0 : l.x1, y });
  return out;
}

/** A road tile (a vehicle parked on the road counts). */
export function isRoad(m: BattleMap, x: number, y: number): boolean {
  const k = skinAt(m, x, y, m.ground);
  if (k === "road") return true;
  if (k !== "car" && k !== "truck") return false;
  return m.vehicles.some(
    (v) => v.under === "road" && x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h,
  );
}

/** The lot's sides that face a street across the pavement (most of the side does), longest frontage first. */
export function streetSides(m: BattleMap, l: Rect): number[] {
  const out: { s: number; n: number; len: number }[] = [];
  for (let s = 0; s < 4; s++) {
    const t = sideTiles(l, s),
      [dx, dy] = OUT[s]!;
    const n = t.filter((p) => isRoad(m, p.x + dx * (PAVE + 1), p.y + dy * (PAVE + 1))).length;
    if (n * 2 >= t.length) out.push({ s, n, len: t.length });
  }
  return out.sort((a, b) => b.n - a.n).map((o) => o.s);
}

/** Vehicles over any tile of `a`: gone, their tiles back to what was under them. */
export function clearVehicles(m: BattleMap, a: Rect) {
  m.vehicles = m.vehicles.filter((v) => {
    if (!overlaps(a, { x0: v.x, y0: v.y, x1: v.x + v.w - 1, y1: v.y + v.h - 1 })) return true;
    for (let dy = 0; dy < v.h; dy++)
      for (let dx = 0; dx < v.w; dx++) setTile(m, v.x + dx, v.y + dy, v.z, T.FLOOR, v.under);
    return false;
  });
}

/** Two tiles (Chebyshev) from every tree already in `a`, so trees don't clump into walls. */
export const treeRoom = (m: BattleMap, x: number, y: number) => {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (skinAt(m, x + dx, y + dy, m.ground) === "tree") return false;
  return true;
};

/**
 * A paved walk from just outside a door (x, y) to the pavement: straight out
 * when that gets there, else the shortest way over the lot's grass.
 */
function walkway(m: BattleMap, lot: Rect, x: number, y: number, dx: number, dy: number) {
  const g = m.ground;
  const inLot = (p: Pt) => p.x >= lot.x0 && p.x <= lot.x1 && p.y >= lot.y0 && p.y <= lot.y1;
  const paved = (p: Pt) =>
    !inLot(p) && skinAt(m, p.x, p.y, g) === "pavement" && tileAt(m, p.x, p.y, g) === T.FLOOR;
  const open = (p: Pt) =>
    inLot(p) && tileAt(m, p.x, p.y, g) === T.FLOOR && skinAt(m, p.x, p.y, g) === "grass";
  const line: Pt[] = [];
  for (let p = { x, y }; open(p); p = { x: p.x + dx, y: p.y + dy }) line.push(p);
  const end = line.length ? { x: line.at(-1)!.x + dx, y: line.at(-1)!.y + dy } : null;
  let path = end && paved(end) ? line : null;
  if (!path && open({ x, y })) {
    // Breadth first over the grass; ties keep the way the walk was going.
    const prev = new Map<number, number>(),
      key = (p: Pt) => p.y * m.w + p.x;
    const q: Pt[] = [{ x, y }];
    prev.set(key(q[0]!), -1);
    let hit: Pt | null = null;
    for (let i = 0; i < q.length && !hit; i++) {
      const c = q[i]!;
      for (const [ex, ey] of [
        [dx, dy],
        ...ORTHO.filter(([ox, oy]) => ox !== dx || oy !== dy),
      ] as const) {
        const nb = { x: c.x + ex, y: c.y + ey };
        if (paved(nb)) {
          hit = c;
          break;
        }
        if (open(nb) && !prev.has(key(nb))) (prev.set(key(nb), key(c)), q.push(nb));
      }
    }
    if (hit) {
      path = [];
      for (let k = key(hit); k >= 0; k = prev.get(k)!)
        path.push({ x: k % m.w, y: Math.floor(k / m.w) });
    }
  }
  for (const p of path ?? []) setTile(m, p.x, p.y, g, T.FLOOR, "pavement");
}

/** The ground-floor doors out of a building: the tile outside each, and the way out. */
export function doorsOut(
  m: BattleMap,
  rect: Rect,
): { x: number; y: number; dx: number; dy: number }[] {
  const out: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let s = 0; s < 4; s++)
    for (const p of sideTiles(rect, s)) {
      const [dx, dy] = OUT[s]!;
      if (isDoor(edgeAt(m, p.x, p.y, m.ground, dx, dy)))
        out.push({ x: p.x + dx, y: p.y + dy, dx, dy });
    }
  return out;
}

/**
 * A house on its lot: up against the street side (a corner lot: both), or
 * set back behind a front garden; the front door on the street, a paved walk
 * from every door to the pavement; grass behind with a tree or two and the
 * bins by the back door.
 */
export function houseLot(
  m: BattleMap,
  r: Rng,
  lot: Rect,
  isHideout: boolean,
  basement: boolean,
  shop = false,
): Building {
  const g = m.ground;
  const fronts = streetSides(m, lot);
  const bw = Math.min(rw(lot), r.int(7, 13)),
    bh = Math.min(rh(lot), r.int(7, 13));
  const setback = r.chance(0.45) ? 2 : 0;
  const ns = fronts.find((s) => s < 2),
    ew = fronts.find((s) => s >= 2);
  const sx = Math.min(setback, rw(lot) - bw),
    sy = Math.min(setback, rh(lot) - bh);
  const bx =
    ew === 2 ? lot.x0 + sx : ew === 3 ? lot.x1 - bw + 1 - sx : r.int(lot.x0, lot.x1 - bw + 1);
  const by =
    ns === 0 ? lot.y0 + sy : ns === 1 ? lot.y1 - bh + 1 - sy : r.int(lot.y0, lot.y1 - bh + 1);
  const rect = { x0: bx, y0: by, x1: bx + bw - 1, y1: by + bh - 1 };
  for (let y = lot.y0; y <= lot.y1; y++)
    for (let x = lot.x0; x <= lot.x1; x++)
      if (x < rect.x0 || x > rect.x1 || y < rect.y0 || y > rect.y1)
        setTile(m, x, y, g, T.FLOOR, "grass");
  const upper = r.chance(0.55) ? MAX_UPPER : 0;
  const style = { ...HOUSE, wall: r.pick<Skin>(["brick", "plaster"]) };
  const b = placeBuilding(m, r, rect, upper, style, isHideout && basement, fronts[0]);
  // A corner shop downstairs, its door on the street.
  if (shop && fronts.length) cornerShop(m, r, b, fronts[0]!);
  const doors = doorsOut(m, rect);
  for (const d of doors) walkway(m, lot, d.x, d.y, d.dx, d.dy);
  // A front garden: a low hedge along the pavement, open where the walk comes through.
  if (setback && r.chance(0.5))
    for (const s of fronts)
      for (const p of sideTiles(lot, s))
        if (skinAt(m, p.x, p.y, g) === "grass") prop(m, p.x, p.y, T.LOW, "hedge");
  // The bins: by a door that isn't on the street, beside its walk.
  const back = doors.find((d) => !fronts.some((s) => OUT[s]![0] === d.dx && OUT[s]![1] === d.dy));
  if (back && r.chance(0.7))
    for (const [ox, oy] of [
      [back.dy, back.dx],
      [-back.dy, -back.dx],
    ] as const) {
      const x = back.x + ox,
        y = back.y + oy;
      if (skinAt(m, x, y, g) === "grass" && tileAt(m, x, y, g) === T.FLOOR) {
        prop(m, x, y, T.LOW, "bin");
        break;
      }
    }
  // Trees in the yard, off the walks, not against the house.
  const near = (x: number, y: number) =>
    x >= rect.x0 - 1 && x <= rect.x1 + 1 && y >= rect.y0 - 1 && y <= rect.y1 + 1;
  for (let y = lot.y0; y <= lot.y1; y++)
    for (let x = lot.x0; x <= lot.x1; x++)
      if (!near(x, y) && skinAt(m, x, y, g) === "grass" && treeRoom(m, x, y) && r.chance(0.12))
        prop(m, x, y, T.HIGH, "tree");
  return b;
}

/**
 * A park: grass, a footpath through from one street to the far side (a
 * cross on a big park), benches along it facing the path, trees scattered
 * (never two side by side), a hedge along the street with gaps for the path.
 */
export function park(m: BattleMap, r: Rng, a: Rect) {
  const g = m.ground;
  fill(m, a, g, T.FLOOR, "grass");
  const fronts = streetSides(m, a);
  const paths: { alongX: boolean; at: number }[] = [];
  const main = (fronts[0] ?? 0) < 2 ? false : true; // a path from a north/south street runs along y
  paths.push({ alongX: main, at: main ? r.int(a.y0 + 2, a.y1 - 3) : r.int(a.x0 + 2, a.x1 - 3) });
  if (rw(a) >= 10 && rh(a) >= 10)
    paths.push({
      alongX: !main,
      at: !main ? r.int(a.y0 + 2, a.y1 - 3) : r.int(a.x0 + 2, a.x1 - 3),
    });
  const onPath = (x: number, y: number) =>
    paths.some((p) => (p.alongX ? y === p.at || y === p.at + 1 : x === p.at || x === p.at + 1));
  for (let y = a.y0; y <= a.y1; y++)
    for (let x = a.x0; x <= a.x1; x++) if (onPath(x, y)) setTile(m, x, y, g, T.FLOOR, "pavement");
  // Benches beside the path, every few tiles, alternating sides.
  for (const p of paths) {
    const len = p.alongX ? rw(a) : rh(a);
    for (let i = 2, k = 0; i < len - 2; i += 4, k++) {
      if (!r.chance(0.6)) continue;
      const side = k % 2 ? -1 : 2;
      const x = p.alongX ? a.x0 + i : p.at + side,
        y = p.alongX ? p.at + side : a.y0 + i;
      if (!onPath(x, y)) prop(m, x, y, T.LOW, "bench");
    }
  }
  // Hedge along the streets, open where a path comes out.
  if (r.chance(0.6))
    for (const s of fronts)
      for (const t of sideTiles(a, s)) if (!onPath(t.x, t.y)) prop(m, t.x, t.y, T.LOW, "hedge");
  // Trees: random, spaced, off the path and the hedge line.
  for (let tries = Math.floor((rw(a) * rh(a)) / 4); tries > 0; tries--) {
    const x = r.int(a.x0 + 1, a.x1 - 1),
      y = r.int(a.y0 + 1, a.y1 - 1);
    if (
      skinAt(m, x, y, g) === "grass" &&
      tileAt(m, x, y, g) === T.FLOOR &&
      treeRoom(m, x, y) &&
      r.chance(0.5)
    )
      prop(m, x, y, T.HIGH, "tree");
  }
}

/**
 * A car park, its tarmac at road height like the road it opens onto: one
 * aisle three wide straight in from the street, through a dropped-kerb
 * driveway across the pavement (nothing parked in the road in front of it),
 * nose-in bays three wide either side, painted (map.bayLines). False if no street side can take the
 * driveway (the caller makes it a park).
 */
export function carPark(m: BattleMap, r: Rng, a: Rect): boolean {
  const g = m.ground;
  for (const s of streetSides(m, a)) {
    const [dx, dy] = OUT[s]!;
    const alongY = s < 2; // the aisle runs in from the street
    const v0 = alongY ? a.x0 : a.y0,
      v1 = alongY ? a.x1 : a.y1,
      width = v1 - v0 + 1;
    const len = alongY ? rh(a) : rw(a);
    if (width < 5) continue;
    const av = width >= 11 ? v0 + Math.floor((width - 3) / 2) : width >= 8 ? v0 + 4 : v1 - 2;
    // (u, v) to the map: u tiles in from the street side, v across.
    const at = (u: number, v: number): Pt => {
      const edge = s === 0 ? a.y0 : s === 1 ? a.y1 : s === 2 ? a.x0 : a.x1;
      const w = edge - (dx + dy) * u;
      return alongY ? { x: v, y: w } : { x: w, y: v };
    };
    // The driveway across the pavement, and road beyond it.
    const drive: Pt[] = [];
    for (let u = -PAVE; u <= -1; u++) for (let v = av; v <= av + 2; v++) drive.push(at(u, v));
    const ok =
      drive.every(
        (p) =>
          skinAt(m, p.x, p.y, g) === "pavement" &&
          tileAt(m, p.x, p.y, g) === T.FLOOR &&
          !kerbCorner(m, p.x, p.y),
      ) &&
      [av, av + 1, av + 2].every((v) => {
        const p = at(-PAVE - 1, v);
        return isRoad(m, p.x, p.y);
      });
    if (!ok) continue;
    fill(m, a, g, T.FLOOR, "tarmac");
    for (const p of drive) setTile(m, p.x, p.y, g, T.FLOOR, "tarmac");
    // Keep the parking lane in front of the driveway clear (and a tile either side).
    const c0 = at(-PAVE - 1, av - 1),
      c1 = at(-PAVE - 2, av + 3);
    clearVehicles(m, {
      x0: Math.min(c0.x, c1.x),
      y0: Math.min(c0.y, c1.y),
      x1: Math.max(c0.x, c1.x),
      y1: Math.max(c0.y, c1.y),
    });
    // Bays either side of the aisle, noses to it; a car in a four-deep bay pulls up to the aisle.
    for (const [lo, hi, nose] of [
      [v0, av - 1, 1],
      [av + 3, v1, -1],
    ] as const) {
      const depth = hi - lo + 1;
      if (depth < 3) continue;
      // Painted dividers half a tile either side of each bay, the bay's depth.
      for (let u = 0; u < len; u += 3)
        for (let v = lo; v <= hi; v++) {
          const p = at(u, v);
          m.bayLines.push({ ...p, alongX: alongY });
        }
      for (let u = 1; u + 1 < len; u += 3) {
        if (!r.chance(0.6)) continue;
        const kind: VehicleKind = depth >= 4 ? someVehicle(r, false) : "car";
        const l = VEHICLE_LENGTH[kind];
        const vs = nose === 1 ? av - l : av + 3; // its near end at the aisle
        const p = at(u, vs),
          q = at(u + 1, vs + l - 1);
        vehicle(m, r, Math.min(p.x, q.x), Math.min(p.y, q.y), alongY, kind, nose);
      }
    }
    return true;
  }
  return false;
}

/** Street lamps along a kerb every STREET_GAP tiles; street trees halfway between. */
const STREET_GAP = 8;

/**
 * A tile on the kerb line (the pavement's outer row, or a driveway across
 * it): the side of it the road is on, and its place in the rhythm along the
 * street (0 … STREET_GAP − 1: lamps at 0, trees at half), staggered from one
 * side of the road to the other. Null off the kerb line.
 */
export function kerbSlot(
  m: BattleMap,
  x: number,
  y: number,
): { side: number; slot: number } | null {
  const k = skinAt(m, x, y, m.ground);
  if ((k !== "pavement" && k !== "tarmac") || kerbCorner(m, x, y)) return null;
  for (let side = 0; side < 4; side++) {
    const [dx, dy] = OUT[side]!;
    if (!isRoad(m, x + dx, y + dy)) continue;
    const along = side < 2 ? x : y;
    const stagger = side % 2 ? STREET_GAP / 2 : 0;
    return { side, slot: (along + (m.seed % STREET_GAP) + stagger) % STREET_GAP };
  }
  return null;
}

/** Free pavement on the kerb line, for a lamp or a tree. */
export const kerbFree = (m: BattleMap, x: number, y: number) =>
  skinAt(m, x, y, m.ground) === "pavement" &&
  tileAt(m, x, y, m.ground) === T.FLOOR &&
  kerbSlot(m, x, y) !== null;

/**
 * Street trees: some sides of the street are tree-lined, a tree every
 * STREET_GAP tiles between the lamps; none in front of a door or beside a
 * driveway, nor along the plaza (its own ring of trees lines it). A bin by
 * the odd lamp post.
 */
export function streetTrees(m: BattleMap, r: Rng, plaza?: Rect) {
  const g = m.ground;
  const lined = [0, 1, 2, 3].map(() => r.chance(0.6));
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const k = kerbSlot(m, x, y);
      if (!k || !kerbFree(m, x, y)) continue;
      const [dx, dy] = OUT[k.side]!;
      if (k.slot === STREET_GAP / 2 && lined[k.side]) {
        // The tile behind (the pavement's inner row) mustn't open into a door or a walk.
        const ix = x - dx,
          iy = y - dy;
        // (A doorway a tile either side counts: a double door, a shop front.)
        const door = [-1, 0, 1].some(
          (k) =>
            isDoor(edgeAt(m, ix + k * dy, iy + k * dx, g, -dx, -dy)) ||
            skinAt(m, ix + k * dy - dx, iy + k * dx - dy, g) === "pavement",
        );
        const drive = [
          [dy, dx],
          [-dy, -dx],
        ].some(([ox, oy]) => skinAt(m, x + ox!, y + oy!, g) === "tarmac");
        const byPlaza =
          plaza &&
          Math.max(plaza.x0 - x, x - plaza.x1, 0) <= PAVE &&
          Math.max(plaza.y0 - y, y - plaza.y1, 0) <= PAVE;
        if (!door && !drive && !byPlaza) prop(m, x, y, T.HIGH, "tree");
      } else if (k.slot === 1 && r.chance(0.25)) prop(m, x, y, T.LOW, "bin");
    }
}

/** About how far apart the plaza's trees stand (tiles). */
const PLAZA_GAP = 4;

/**
 * The plaza's planting: one ring of trees a tile in from its edge (clear of
 * the rounded kerb corners), a tree on each corner of the ring and the rest
 * evenly spaced, the same from either end of a side. None within rotor reach
 * of the landing zone (`lz`, its middle). Benches midway between trees on
 * every side, or on none.
 */
export function plazaTrees(m: BattleMap, r: Rng, lot: Rect, lz: Pt) {
  const ring = inset(lot, 1);
  if (rw(ring) < 3 || rh(ring) < 3) return;
  const benches = r.chance(0.6);
  const clear = (x: number, y: number) => Math.max(Math.abs(x - lz.x), Math.abs(y - lz.y)) >= 3;
  for (let s = 0; s < 4; s++) {
    const side = sideTiles(ring, s),
      last = side.length - 1;
    // Gaps: as near PLAZA_GAP as can be, never under 3, and a count that can be
    // symmetric (an odd side can't have a tree at its half-way point).
    let n = 1;
    for (let k = 2; last / k >= 3; k++)
      if (
        (last % 2 === 0 || k % 2) &&
        Math.abs(last / k - PLAZA_GAP) < Math.abs(last / n - PLAZA_GAP)
      )
        n = k;
    const step = last / n;
    // Rounded from whichever end is nearer, so a side is its own mirror.
    const at = Array.from({ length: n + 1 }, (_, i) =>
      i <= n / 2 ? Math.round(i * step) : last - Math.round((n - i) * step),
    );
    for (const i of at) {
      const t = side[i]!;
      if (clear(t.x, t.y) && tileAt(m, t.x, t.y, m.ground) === T.FLOOR)
        prop(m, t.x, t.y, T.HIGH, "tree");
    }
    if (benches)
      for (let k = 0; k < n; k++) {
        if ((at[k + 1]! - at[k]!) % 2) continue; // only where there's a true middle
        const t = side[(at[k]! + at[k + 1]!) / 2]!;
        if (clear(t.x, t.y) && tileAt(m, t.x, t.y, m.ground) === T.FLOOR)
          prop(m, t.x, t.y, T.LOW, "bench");
      }
  }
}

/** A 3 × 3 landing zone, cleared, at `c`. */
export function landingZone(m: BattleMap, c: Pt): Pt3[] {
  const lz: Pt3[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx,
        y = c.y + dy;
      if (!walkable(m, x, y, m.ground))
        setTile(m, x, y, m.ground, T.FLOOR, m.setting === "urban" ? "pavement" : "grass");
      lz.push({ x, y, z: m.ground });
    }
  return lz;
}

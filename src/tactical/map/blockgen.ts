// Proof of concept: battle maps assembled from blocks (docs/design/levels.md,
// "The prototype").
//
// The map is a grid of 8-tile units. Roads are laid first, by rule, a unit
// wide (parking, two lanes, parking; no pavement: lots bring their own
// frontage). They are the main dividers: the open ground with the long
// sightlines, where every crossing is a decision. Then the ground beside
// the roads is cut into lots one or two units wide and deep, each fronting a
// road, so nothing is ever cut off from the street; each lot takes a block
// of its size turned to face the road. Twenty candidates are made and
// scored on avenues of approach, cover, sightlines and height; the best is
// kept.

import { rng, type Rng } from "../../sim/core/rng";
import {
  emptyMap,
  idx,
  neighbours,
  reachable,
  setTile,
  skinAt,
  tileAt,
  walkable,
  T,
  type BattleMap,
  type Pt,
  type Pt3,
  type Setting,
} from "./map";
import {
  stamp,
  turnSide,
  type BlockData,
  type Side,
  type Target,
  type Terrain,
  type Turn,
} from "./blocks";
import { BANK, U } from "./blockbank";
import { landingZone, vehicle } from "./dressing";
import type { Building } from "./mapgen";

export type Layout = "square" | "long";

const SIDES: Side[] = ["n", "e", "s", "w"];
const DIR: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const OPP: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

/** Blocks by terrain, with their size in units: wide along the road, deep away from it. */
interface Kind {
  b: BlockData;
  wide: number;
  deep: number;
}
const kinds = (t: Terrain): Kind[] =>
  BANK.filter((b) => b.terrains.includes(t)).map((b) => ({ b, wide: b.w / U, deep: b.h / U }));

// ---------------------------------------------------------------------------
// Roads

type Cell = { kind: "road"; arms: Set<Side> } | { kind: "lot"; lot: number } | { kind: "empty" };

export interface Lot {
  /** The cell on the road, its front side, the way along the road it extends. */
  x: number;
  y: number;
  front: Side;
  along: Side;
  wide: number;
  deep: number;
  /** A block, or the landing ground. */
  block: BlockData | null;
}

function roadNet(W: number, H: number, r: Rng, layout: Layout): Cell[][] {
  const g: Cell[][] = Array.from({ length: H }, () =>
    Array.from({ length: W }, (): Cell => ({ kind: "empty" })),
  );
  const lay = (x: number, y: number, a: Side) => {
    const c = g[y]![x]!;
    if (c.kind !== "road") g[y]![x] = { kind: "road", arms: new Set([a]) };
    else c.arms.add(a);
  };
  const link = (x: number, y: number, s: Side) => {
    const [dx, dy] = DIR[s];
    lay(x, y, s);
    lay(x + dx, y + dy, OPP[s]);
  };
  /** A road along row y from x0 to x1, out over the map's edge where it reaches one. */
  const row = (y: number, x0: number, x1: number) => {
    const [a, b] = [Math.min(x0, x1), Math.max(x0, x1)];
    for (let x = a; x < b; x++) link(x, y, "e");
    if (a === b) lay(a, y, "e");
    if (a === 0) lay(0, y, "w");
    if (b === W - 1) lay(W - 1, y, "e");
  };
  const col = (x: number, y0: number, y1: number) => {
    const [a, b] = [Math.min(y0, y1), Math.max(y0, y1)];
    for (let y = a; y < b; y++) link(x, y, "s");
    if (a === b) lay(x, a, "s");
    if (a === 0) lay(x, 0, "n");
    if (b === H - 1) lay(x, H - 1, "s");
  };
  if (layout === "long") {
    // A road the length of the map (the fast way), now and then a cross street (a choke point).
    const c = r.int(1, W - 2);
    if (r.chance(0.5)) col(c, 0, H - 1);
    else {
      // A dog-leg: the road jogs across half way.
      const j = r.int(2, H - 3);
      const c2 = c === 1 ? 2 : 1;
      col(c, 0, j);
      row(j, c, c2);
      col(c2, j, H - 1);
    }
    if (r.chance(0.6)) row(r.int(2, H - 3), 0, W - 1);
    return g;
  }
  const N = W;
  const inner = () => r.int(1, N - 2);
  switch (r.pick(["straight", "two", "t", "t", "z", "l", "cross"])) {
    case "straight":
      row(inner(), 0, N - 1);
      break;
    case "two": {
      const a = r.int(0, N - 4);
      const b = r.int(a + 3, N - 1);
      row(a, 0, N - 1);
      row(b, 0, N - 1);
      if (r.chance(0.6)) col(inner(), a, b);
      break;
    }
    case "t": {
      const y = inner();
      row(y, 0, N - 1);
      const x = inner();
      if (r.chance(0.5)) col(x, 0, y);
      else col(x, y, N - 1);
      break;
    }
    case "z": {
      const a = r.int(0, N - 1);
      let b = r.int(0, N - 1);
      if (Math.abs(b - a) < 2) b = a < N / 2 ? N - 1 : 0;
      const c = inner();
      row(a, 0, c);
      col(c, a, b);
      row(b, c, N - 1);
      break;
    }
    case "l": {
      const y = inner(),
        x = inner();
      row(y, 0, x);
      col(x, y, r.chance(0.5) ? 0 : N - 1);
      break;
    }
    default:
      row(inner(), 0, N - 1);
      col(inner(), 0, N - 1);
  }
  return r.chance(0.5) ? transpose(g) : g;
}

function transpose(g: Cell[][]): Cell[][] {
  const swap: Record<Side, Side> = { n: "w", w: "n", s: "e", e: "s" };
  return g[0]!.map((_, x) =>
    g.map((row) => {
      const c = row[x]!;
      return c.kind === "road"
        ? { kind: "road", arms: new Set([...c.arms].map((a) => swap[a])) }
        : c;
    }),
  );
}

const isRoad = (g: Cell[][], x: number, y: number) => g[y]?.[x]?.kind === "road";
const roadSides = (g: Cell[][], x: number, y: number) =>
  SIDES.filter((s) => isRoad(g, x + DIR[s][0], y + DIR[s][1]));

/** Every cell off the road has a road within two cells in a straight line (a lot can reach it). */
function covered(g: Cell[][]): boolean {
  for (let y = 0; y < g.length; y++)
    for (let x = 0; x < g[0]!.length; x++) {
      if (isRoad(g, x, y)) continue;
      const ok = SIDES.some((s) => {
        const [dx, dy] = DIR[s];
        return isRoad(g, x + dx, y + dy) || isRoad(g, x + 2 * dx, y + 2 * dy);
      });
      if (!ok) return false;
    }
  return true;
}

// ---------------------------------------------------------------------------
// Lots

export interface BlockMapPlan {
  W: number;
  H: number;
  terrain: Terrain;
  cells: Cell[][];
  lots: Lot[];
  target: number;
  landing: number;
}

const turnFor = (s: Side): Turn => ([0, 1, 2, 3] as Turn[]).find((t) => turnSide("s", t) === s)!;

/** The cells a lot covers. */
function lotCells(l: Pick<Lot, "x" | "y" | "front" | "along" | "wide" | "deep">): Pt[] {
  const [ax, ay] = DIR[l.along],
    [bx, by] = DIR[OPP[l.front]];
  const out: Pt[] = [];
  for (let i = 0; i < l.wide; i++)
    for (let j = 0; j < l.deep; j++)
      out.push({ x: l.x + ax * i + bx * j, y: l.y + ay * i + by * j });
  return out;
}

const alongs = (front: Side): Side[] => (front === "n" || front === "s" ? ["e", "w"] : ["n", "s"]);

function plan(
  terrain: Terrain,
  W: number,
  H: number,
  layout: Layout,
  target: Target,
  r: Rng,
): BlockMapPlan | null {
  let cells: Cell[][] | null = null;
  for (let k = 0; k < 60 && !cells; k++) {
    const g = roadNet(W, H, r, layout);
    let roads = 0;
    for (const row of g) for (const c of row) if (c.kind === "road") roads++;
    if (covered(g) && roads <= W * H * 0.45) cells = g;
  }
  if (!cells) return null;
  const g = cells;
  const lots: Lot[] = [];
  const bank = kinds(terrain);
  const free = (p: Pt) =>
    p.x >= 0 && p.y >= 0 && p.x < W && p.y < H && g[p.y]![p.x]!.kind === "empty";
  /** Would this lot leave a cell behind it that no lot could take (off every road)? */
  const orphanBehind = (l: Lot) => {
    const [bx, by] = DIR[OPP[l.front]];
    const [ax, ay] = DIR[l.along];
    for (let i = 0; i < l.wide; i++) {
      const p = { x: l.x + ax * i + bx * l.deep, y: l.y + ay * i + by * l.deep };
      if (free(p) && !roadSides(g, p.x, p.y).length) return true;
    }
    return false;
  };
  const place = (x: number, y: number, front: Side, choices: (Kind | null)[]): number | null => {
    for (const k of choices) {
      const wide = k?.wide ?? 1,
        deep = k?.deep ?? 1;
      for (const along of r.shuffle(alongs(front))) {
        const l: Lot = { x, y, front, along, wide, deep, block: k?.b ?? null };
        if (!lotCells(l).every(free)) continue;
        if (deep < 2 && orphanBehind(l)) continue;
        lots.push(l);
        for (const p of lotCells(l)) g[p.y]![p.x] = { kind: "lot", lot: lots.length - 1 };
        return lots.length - 1;
      }
    }
    return null;
  };
  const edgeCells: Pt[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (free({ x, y }) && roadSides(g, x, y).length) edgeCells.push({ x, y });
  // The landing: a lot of open ground on the map's edge (a long map's start: its south end).
  const start = r
    .shuffle(edgeCells)
    .filter((p) =>
      layout === "long" ? p.y === H - 1 : p.x === 0 || p.y === 0 || p.x === W - 1 || p.y === H - 1,
    );
  let landing: number | null = null;
  for (const p of start) {
    landing = place(p.x, p.y, r.pick(roadSides(g, p.x, p.y)), [null]);
    if (landing !== null) break;
  }
  if (landing === null) return null;
  const L = lots[landing]!;
  // The target: a structure fronting a road, far from the landing (a long map: its far end).
  const far = (p: Pt) =>
    layout === "long"
      ? p.y <= 1
      : Math.max(Math.abs(p.x - L.x), Math.abs(p.y - L.y)) >= Math.ceil(W / 2);
  const targets = bank.filter(
    (k) => k.b.type === "structure" && (layout === "long" || k.b.targets.includes(target)),
  );
  let tl: number | null = null;
  for (const p of r.shuffle(edgeCells.filter((p) => free(p) && far(p)))) {
    for (const s of r.shuffle(roadSides(g, p.x, p.y))) {
      tl = place(p.x, p.y, s, r.shuffle(targets));
      if (tl !== null) break;
    }
    if (tl !== null) break;
  }
  if (tl === null) return null;
  // The rest: each cell on a road starts a lot (structures twice as likely as open ground), each block at most twice.
  const uses = new Map<string, number>();
  for (const l of lots) if (l.block) uses.set(l.block.id, 1);
  for (const p of r.shuffle(edgeCells)) {
    if (!free(p)) continue;
    const pool = bank.filter((k) => (uses.get(k.b.id) ?? 0) < 2);
    const order = [
      ...new Set(r.shuffle(pool.flatMap((k) => (k.b.type === "structure" ? [k, k] : [k])))),
    ];
    for (const s of r.shuffle(roadSides(g, p.x, p.y))) {
      const i = place(p.x, p.y, s, order);
      if (i !== null) {
        const id = lots[i]!.block!.id;
        uses.set(id, (uses.get(id) ?? 0) + 1);
        break;
      }
    }
  }
  // Every cell must be a road or in a lot.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (free({ x, y })) return null;
  return { W, H, terrain, cells: g, lots, target: tl, landing };
}

// ---------------------------------------------------------------------------
// Realising a plan

const SETTING: Record<Terrain, Setting> = {
  light: "urban",
  dense: "apartments",
  rural: "rural",
  industrial: "industrial",
};

const town = (t: Terrain) => t !== "rural";

function drawRoad(m: BattleMap, terrain: Terrain, cx: number, cy: number, arms: Set<Side>) {
  for (let y = 0; y < U; y++)
    for (let x = 0; x < U; x++) {
      let skin: "road" | "dirt" | "grass" = "road";
      if (!town(terrain)) {
        // A country lane: 4 wide down the middle of each arm, grass verges.
        const mid = (v: number) => v >= 2 && v <= 5;
        const lane =
          (mid(x) && mid(y)) ||
          (arms.has("n") && y < 2 && mid(x)) ||
          (arms.has("s") && y > 5 && mid(x)) ||
          (arms.has("w") && x < 2 && mid(y)) ||
          (arms.has("e") && x > 5 && mid(y));
        skin = lane ? "dirt" : "grass";
      }
      setTile(m, cx * U + x, cy * U + y, m.ground, T.FLOOR, skin);
    }
}

/** Cars in a town road's parking lanes, on straight stretches. */
function parkCars(m: BattleMap, r: Rng, cx: number, cy: number, arms: Set<Side>) {
  const ew = arms.has("e") && arms.has("w") && !arms.has("n") && !arms.has("s");
  const ns = arms.has("n") && arms.has("s") && !arms.has("e") && !arms.has("w");
  if (!ew && !ns) return;
  for (const lane of [0, 6])
    if (r.chance(0.4)) {
      const kind = r.pick(["car", "car", "suv", "truck"] as const);
      const at = r.int(0, kind === "truck" ? 2 : 4);
      if (ew) vehicle(m, r, cx * U + at, cy * U + lane, true, kind, lane === 0 ? -1 : 1);
      else vehicle(m, r, cx * U + lane, cy * U + at, false, kind, lane === 0 ? 1 : -1);
    }
}

/** The tiles a lot covers. */
function lotRect(l: Lot) {
  const cs = lotCells(l);
  return {
    x0: Math.min(...cs.map((c) => c.x)) * U,
    y0: Math.min(...cs.map((c) => c.y)) * U,
    x1: (Math.max(...cs.map((c) => c.x)) + 1) * U - 1,
    y1: (Math.max(...cs.map((c) => c.y)) + 1) * U - 1,
  };
}

/** Indoors: walkable with a floor or roof over it. */
const indoor = (m: BattleMap, x: number, y: number, z: number) =>
  walkable(m, x, y, z) && z + 1 < m.levels && tileAt(m, x, y, z + 1) !== T.VOID;

function realise(p: BlockMapPlan, seed: number, r: Rng) {
  const blocks = p.lots.flatMap((l) => (l.block ? [l.block] : []));
  const below = Math.max(0, ...blocks.map((b) => b.below));
  const above = Math.max(1, ...blocks.map((b) => b.lv.length - b.below));
  const m = emptyMap(p.W * U, p.H * U, below + above, below, SETTING[p.terrain], seed);
  for (let cy = 0; cy < p.H; cy++)
    for (let cx = 0; cx < p.W; cx++) {
      const c = p.cells[cy]![cx]!;
      if (c.kind !== "road") continue;
      drawRoad(m, p.terrain, cx, cy, c.arms);
      if (town(p.terrain)) parkCars(m, r, cx, cy, c.arms);
    }
  const buildings: Building[] = [];
  p.lots.forEach((l, i) => {
    const R = lotRect(l);
    if (!l.block) {
      // The landing ground: a green (a paved square in the city, a yard at the works), a ring of trees.
      const ground =
        p.terrain === "industrial" ? "tarmac" : p.terrain === "dense" ? "pavement" : "grass";
      for (let y = R.y0; y <= R.y1; y++)
        for (let x = R.x0; x <= R.x1; x++) {
          const rim = x === R.x0 || y === R.y0 || x === R.x1 || y === R.y1;
          const tree = rim && (x + y) % 3 === 0 && r.chance(0.5) && p.terrain !== "industrial";
          setTile(m, x, y, m.ground, tree ? T.HIGH : T.FLOOR, tree ? "tree" : ground);
        }
      return;
    }
    stamp(m, l.block, R.x0, R.y0, turnFor(l.front));
    if (l.block.type !== "structure") return;
    const tiles: Pt3[] = [];
    for (let z = 0; z < m.levels; z++)
      for (let y = R.y0; y <= R.y1; y++)
        for (let x = R.x0; x <= R.x1; x++) if (indoor(m, x, y, z)) tiles.push({ x, y, z });
    const isTarget = i === p.target;
    const one = (t: Pt3) => ({ x0: t.x, y0: t.y, x1: t.x, y1: t.y });
    const b: Building = {
      rect: R,
      storeys: [...new Set(tiles.filter((t) => t.z >= m.ground).map((t) => t.z))].sort(
        (a, b) => a - b,
      ),
      roof: m.levels - 1,
      // Spawns put the vampires in the farthest building with a basement: the target's (a
      // ground-level one with no rooms puts them on its ground floor).
      basement: isTarget ? (l.block.below ? m.ground - 1 : m.ground) : null,
      rooms: tiles.filter((t) => t.z >= m.ground).map(one),
      basementRooms: tiles.filter((t) => t.z < m.ground).map(one),
      stair: { x: R.x0, y: R.y0 },
    };
    if (isTarget) buildings.unshift(b);
    else buildings.push(b);
  });
  // Works are fenced from their neighbours: chain-link along a shared boundary of open
  // ground, a gate (two tiles) in the middle of each unit.
  if (p.terrain === "industrial") fenceBoundaries(m, p);
  // Town roads get a kerb: open grass beside a road (a garden's edge, a verge) is paved.
  if (town(p.terrain))
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (skinAt(m, x, y, m.ground) !== "grass" || tileAt(m, x, y, m.ground) !== T.FLOOR)
          continue;
        if (SIDES.some((s) => skinAt(m, x + DIR[s][0], y + DIR[s][1], m.ground) === "road"))
          setTile(m, x, y, m.ground, T.FLOOR, "pavement");
      }
  const LZ = lotRect(p.lots[p.landing]!);
  m.lz = landingZone(m, { x: (LZ.x0 + LZ.x1 + 1) >> 1, y: (LZ.y0 + LZ.y1 + 1) >> 1 });
  return { m, buildings };
}

function fenceBoundaries(m: BattleMap, p: BlockMapPlan) {
  const lotOf = (cx: number, cy: number) => {
    const c = p.cells[cy]?.[cx];
    return c?.kind === "lot" && c.lot !== p.landing ? c.lot : -1;
  };
  const open = (x: number, y: number) =>
    tileAt(m, x, y, m.ground) === T.FLOOR && !indoor(m, x, y, m.ground);
  for (let cy = 0; cy < p.H; cy++)
    for (let cx = 0; cx < p.W; cx++) {
      const a = lotOf(cx, cy);
      if (a < 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const b = lotOf(cx + dx, cy + dy);
        if (b < 0 || b === a) continue;
        for (let i = 0; i < U; i++) {
          if (i === 3 || i === 4) continue;
          // The tile on this side of the boundary, and the one across it.
          const x = dx ? (cx + 1) * U - 1 : cx * U + i,
            y = dx ? cy * U + i : (cy + 1) * U - 1;
          if (open(x, y) && open(x + dx, y + dy)) setTile(m, x, y, m.ground, T.LOW, "fence");
        }
      }
    }
}

// ---------------------------------------------------------------------------
// Scoring: avenues of approach, cover and concealment, sightlines, height

export interface Score {
  total: number;
  /** Shortest route from landing to target, in tiles. */
  length: number;
  /** Street tiles (the road and two tiles either side) on the shortest route; the fewest any route crosses. */
  fastStreet: number;
  quietStreet: number;
  /** Longest stretch of the shortest route with no cover within a tile. */
  bareRun: number;
  /** Longest straight open run off the streets. */
  sightline: number;
  crossesRoad: boolean;
  /** Standable tiles above the street (not the target's) within 15 tiles of the target. */
  overlooks: number;
  /** Highest standable level above the street. */
  height: number;
  variety: number;
  roadShare: number;
}

const COVER = new Set<number>([T.LOW, T.HIGH, T.WALL, T.WINDOW]);

function score(m: BattleMap, p: BlockMapPlan, target: Building): Score {
  const g = m.ground;
  const road = (x: number, y: number) => isRoad(p.cells, Math.floor(x / U), Math.floor(y / U));
  const street = (q: Pt3) =>
    q.z === g &&
    !indoor(m, q.x, q.y, q.z) &&
    (road(q.x, q.y) || SIDES.some((s) => road(q.x + 2 * DIR[s][0], q.y + 2 * DIR[s][1])));
  const inT = (x: number, y: number) =>
    x >= target.rect.x0 && x <= target.rect.x1 && y >= target.rect.y0 && y <= target.rect.y1;
  const goal = (q: Pt3) => q.z === g && inT(q.x, q.y) && indoor(m, q.x, q.y, q.z);
  const key = (q: Pt3) => idx(m, q.x, q.y, q.z);
  // The fast way (fewest steps) and the quiet way (fewest street tiles: a 0-1 search).
  const search = (weigh: boolean): { path: Pt3[]; cost: number } | null => {
    const cost = new Map<number, number>(),
      prev = new Map<number, Pt3 | null>();
    const dq: Pt3[] = [];
    for (const q of m.lz) {
      cost.set(key(q), 0);
      prev.set(key(q), null);
      dq.push(q);
    }
    while (dq.length) {
      const q = dq.shift()!;
      const c = cost.get(key(q))!;
      if (goal(q)) {
        const path: Pt3[] = [];
        for (let s: Pt3 | null = q; s; s = prev.get(key(s))!) path.push(s);
        return { path: path.reverse(), cost: c };
      }
      for (const n of neighbours(m, q, true)) {
        const w = weigh ? (street(n) ? 1 : 0) : 1;
        if (c + w < (cost.get(key(n)) ?? Infinity)) {
          cost.set(key(n), c + w);
          prev.set(key(n), q);
          if (w && weigh) dq.push(n);
          else if (weigh) dq.unshift(n);
          else dq.push(n);
        }
      }
    }
    return null;
  };
  let roadTiles = 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (road(x, y)) roadTiles++;
  const roadShare = roadTiles / (m.w * m.h);
  const fast = search(false),
    quiet = search(true);
  if (!fast || !quiet)
    return {
      total: -1e9,
      length: 0,
      fastStreet: 0,
      quietStreet: 0,
      bareRun: 0,
      sightline: 0,
      crossesRoad: false,
      overlooks: 0,
      height: 0,
      variety: 0,
      roadShare,
    };
  const first = fast.path;
  const fastStreet = first.filter(street).length;
  const quietStreet = quiet.cost;
  const covered = (q: Pt3) => {
    if (indoor(m, q.x, q.y, q.z)) return true;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (COVER.has(tileAt(m, q.x + dx, q.y + dy, q.z))) return true;
    return false;
  };
  let bareRun = 0,
    run = 0;
  for (const q of first) {
    run = covered(q) ? 0 : run + 1;
    bareRun = Math.max(bareRun, run);
  }
  const open = (x: number, y: number) =>
    tileAt(m, x, y, g) === T.FLOOR && !indoor(m, x, y, g) && !street({ x, y, z: g });
  let sightline = 0;
  for (const alongX of [true, false]) {
    const [A, B] = alongX ? [m.h, m.w] : [m.w, m.h];
    for (let a = 0; a < A; a++) {
      let len = 0;
      for (let b = 0; b < B; b++) {
        len = (alongX ? open(b, a) : open(a, b)) ? len + 1 : 0;
        sightline = Math.max(sightline, len);
      }
    }
  }
  const crossesRoad = first.some((q) => road(q.x, q.y));
  const tc = { x: (target.rect.x0 + target.rect.x1) / 2, y: (target.rect.y0 + target.rect.y1) / 2 };
  let overlooks = 0,
    height = 0;
  for (let z = g + 1; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!walkable(m, x, y, z)) continue;
        height = Math.max(height, z - g);
        if (!inT(x, y) && Math.hypot(x - tc.x, y - tc.y) <= 15) overlooks++;
      }
  const variety = new Set(p.lots.flatMap((l) => (l.block ? [l.block.id] : []))).size;
  // Two to three turns' walk (about 14 tiles a turn) on a square map; four to six on a long one.
  const [lo, hi] = p.H > p.W ? [4, 6] : [2, 3.5];
  const turns = first.length / 14;
  const total =
    (crossesRoad ? 25 : 0) +
    (quietStreet <= 12 ? 20 : -Math.min(40, (quietStreet - 12) * 2)) +
    (fastStreet - quietStreet >= 6 ? 15 : 0) +
    (overlooks > 0 ? 10 : 0) -
    Math.max(0, bareRun - 5) * 6 -
    Math.max(0, sightline - 16) * 2 -
    (turns < lo ? (lo - turns) * 30 : turns > hi ? (turns - hi) * 20 : 0) -
    Math.max(0, roadShare - 0.4) * 200 +
    variety * 3;
  return {
    total,
    length: first.length,
    fastStreet,
    quietStreet,
    bareRun,
    sightline,
    crossesRoad,
    overlooks,
    height,
    variety,
    roadShare,
  };
}

// ---------------------------------------------------------------------------
// The generator

export interface BlockMap {
  m: BattleMap;
  buildings: Building[];
  plan: BlockMapPlan;
  score: Score;
}

export interface BlockMapRequest {
  seed: number;
  terrain: Terrain;
  /** Units a side of a square map (the long map is 4 × 7). */
  size?: number;
  layout?: Layout;
  target?: Target;
  candidates?: number;
}

/** Makes candidate maps and keeps the best. */
export function blockMap(req: BlockMapRequest): BlockMap {
  const layout = req.layout ?? "square";
  const [W, H] = layout === "long" ? [4, 7] : [req.size ?? 5, req.size ?? 5];
  const r = rng({ rng: req.seed >>> 0 });
  const candidates = req.candidates ?? 20;
  let best: BlockMap | null = null;
  for (let k = 0; k < candidates * 4 && (!best || k < candidates); k++) {
    const p = plan(req.terrain, W, H, layout, req.target ?? "nest", r);
    if (!p) continue;
    const { m, buildings } = realise(p, req.seed, r);
    const seen = reachable(m, m.lz[0]!);
    // No ground cut off from the landing, at street level or below.
    let pockets = 0;
    for (let z = 0; z <= m.ground; z++)
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) if (walkable(m, x, y, z) && !seen[idx(m, x, y, z)]) pockets++;
    if (pockets) continue;
    const sc = score(m, p, buildings[0]!);
    if (!best || sc.total > best.score.total) best = { m, buildings, plan: p, score: sc };
  }
  if (!best) throw new Error(`No block map for seed ${req.seed}`);
  return best;
}

const GLYPH: Record<string, string> = { road: "=", pavement: ".", tarmac: "#", dirt: "-" };

/** The ground level as text: = road, . pavement, , grass, # tarmac, - dirt, o indoors (X the target), l low, H high, L landing. */
export function ascii(bm: BlockMap): string {
  const { m } = bm;
  const t = bm.buildings[0]!.rect;
  const lz = new Set(m.lz.map((p) => `${p.x},${p.y}`));
  const out: string[] = [];
  for (let y = 0; y < m.h; y++) {
    let line = "";
    for (let x = 0; x < m.w; x++) {
      const k = tileAt(m, x, y, m.ground);
      const inT = x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1;
      line += lz.has(`${x},${y}`)
        ? "L"
        : k === T.LOW
          ? "l"
          : k === T.HIGH
            ? "H"
            : k === T.VOID
              ? " "
              : k === T.FLIGHT
                ? "^"
                : indoor(m, x, y, m.ground)
                  ? inT
                    ? "X"
                    : "o"
                  : (GLYPH[skinAt(m, x, y, m.ground)] ?? ",");
    }
    out.push(line);
  }
  return out.join("\n");
}

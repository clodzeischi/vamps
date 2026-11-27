// Proof of concept: battle maps assembled from 10 × 10 blocks (docs/design/levels.md).
//
// The map is a grid of slots. Roads are laid first, by rule, as the main
// dividers: they are the open ground with the long sightlines, and every
// crossing is a decision. Slots on a road take a building or a car park,
// turned so its front faces the road. Slots off the road take open,
// cover-rich ground (back gardens, overgrown lots): the quiet ways round.
// Twenty candidates are made and scored on avenues of approach, cover,
// sightlines and height; the best is kept.
//
// The blocks here are simplified (no furniture models, boxes for props):
// enough to test layout, not looks.

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
  type Flight,
  type Pt,
  type Pt3,
} from "./map";
import {
  edgeIndex,
  newBlock,
  stamp,
  turnSide,
  type BlockData,
  type BlockType,
  type Side,
  type Target,
  type Turn,
} from "./blocks";
import { landingZone, vehicle } from "./dressing";
import type { Building } from "./mapgen";

const B = 10;

// ---------------------------------------------------------------------------
// Blocks, drawn as text: one grid per level, bottom up. Front (the entrance) is south.

/** A character: the floor (with walls, "floor/exterior/interior") and what stands on it. */
const LEGEND: Record<string, [string, string]> = {
  " ": ["", ""],
  ".": ["pavement", ""],
  ",": ["grass", ""],
  "#": ["tarmac", ""],
  "-": ["dirt", ""],
  r: ["roof", ""],
  w: ["wood/brick/plaster", ""],
  v: ["indoor/brick/plaster", ""],
  k: ["tile/brick/plaster", ""],
  c: ["concrete/brick/plaster", ""],
  p: ["wood/plaster/plaster", ""],
  q: ["indoor/plaster/plaster", ""],
  b: ["concrete/concrete/concrete", ""],
  T: ["grass", "high:tree"],
  H: ["grass", "high:hedge"],
  F: ["grass", "low:fence"],
  O: ["grass", "high:crate"],
  G: ["grass", "low:crate"],
  C: ["tarmac", "low:car"],
  U: ["tarmac", "high:truck"],
  B: ["pavement", "low:bench"],
  K: ["tile/brick/plaster", "low:counter"],
  S: ["tile/brick/plaster", "high:shelf"],
  D: ["wood/brick/plaster", "low:table"],
  E: ["indoor/brick/plaster", "low:sofa"],
  Q: ["indoor/brick/plaster", "low:bed"],
  P: ["wood/plaster/plaster", "low:table"],
  X: ["concrete/brick/plaster", "low:crate"],
  Y: ["concrete/brick/plaster", "high:rack"],
  Z: ["concrete/concrete/concrete", "low:crate"],
  W: ["concrete/concrete/concrete", "high:rack"],
};

interface Spec {
  id: string;
  type: BlockType;
  targets?: Target[];
  /** Basement levels at the bottom of `levels`. */
  below?: number;
  levels: string[][];
  /** Exceptions: [x, y, level, side, kind]. */
  doors?: [number, number, number, Side, string?][];
  /** Indoor flights: [x, y, level, dx, dy] (1 × 2, going up dx, dy). */
  stairs?: [number, number, number, number, number][];
  /** Windows every other tile on outside walls above ground and on it (default true). */
  windows?: boolean;
}

const DIR: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

function build(s: Spec): BlockData {
  const below = s.below ?? 0;
  const b = newBlock(
    {
      id: s.id,
      name: s.id,
      terrains: ["light"],
      type: s.type,
      entrances: ["s"],
      targets: s.targets ?? [],
    },
    B,
    B,
    below,
    s.levels.length - below,
  );
  s.levels.forEach((rows, z) => {
    const L = b.lv[z]!;
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const ch = rows[y]?.[x] ?? " ";
        const [f, o] = LEGEND[ch] ?? ["", ""];
        L.floor[y * B + x] = f;
        L.obj[y * B + x] = o;
      }
  });
  // Windows on outside walls (every other tile, on walled floors facing open ground).
  if (s.windows !== false)
    s.levels.forEach((_, z) => {
      if (z < below) return;
      const L = b.lv[z]!;
      const walled = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < B && y < B && L.floor[y * B + x]!.includes("/");
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          if (!walled(x, y) || (x + y) % 2) continue;
          for (const side of ["n", "e", "s", "w"] as Side[]) {
            const [dx, dy] = DIR[side];
            if (walled(x + dx, y + dy)) continue;
            const e = edgeIndex(B, x, y, dx, dy);
            L[e.list][e.i] = "window";
          }
        }
    });
  for (const [x, y, z, side, kind] of s.doors ?? []) {
    const [dx, dy] = DIR[side];
    const e = edgeIndex(B, x, y, dx, dy);
    b.lv[z]![e.list][e.i] = kind ?? "door";
  }
  b.flights = (s.stairs ?? []).map(([x, y, z, dx, dy]): Flight => ({
    x,
    y,
    z,
    w: dy ? 1 : 2,
    h: dy ? 2 : 1,
    kind: "indoor",
    dx,
    dy,
  }));
  return b;
}

export const SPECS: Spec[] = [
  // A two-storey house: front garden, living room and kitchen, two bedrooms up.
  {
    id: "house",
    type: "structure",
    targets: ["nest"],
    levels: [
      [
        ",,,,,,,,,,",
        ",T,,,G,,T,",
        ",wwwwkkkk,",
        ",wwwwkkKk,",
        ",wwDwkkkk,",
        ",wwwwkSkk,",
        ",wwwwkkkk,",
        ",,.,,,,,,,",
        "HH.HHH,,HH",
        "..........",
      ],
      [
        "          ",
        "          ",
        " vvvvqqqq ",
        " vvvvqqqq ",
        " vQvvqqPq ",
        " vvvvqqqq ",
        " vvvvqqqq ",
        "          ",
        "          ",
        "          ",
      ],
      [
        "          ",
        "          ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        "          ",
        "          ",
        "          ",
      ],
    ],
    doors: [
      [2, 6, 0, "s"],
      [6, 2, 0, "n"],
      [4, 4, 0, "e"],
      [4, 3, 1, "e"],
    ],
    stairs: [[1, 3, 0, 0, -1]],
  },
  // A bungalow set back on its lot, a drive and a carport beside it.
  {
    id: "bungalow",
    type: "structure",
    targets: ["nest"],
    levels: [
      [
        ",,,T,,,,,,",
        ",,,,,,,,,,",
        ",pppppp,,,",
        ",ppPppp##,",
        ",qqqqqq#C,",
        ",qQqqqq#C,",
        ",qqqqqq#C,",
        ",,,,.,,##,",
        "F,,,.,,##F",
        "..........",
      ],
      [
        "          ",
        "          ",
        " rrrrrr   ",
        " rrrrrr   ",
        " rrrrrr   ",
        " rrrrrr   ",
        " rrrrrr   ",
        "          ",
        "          ",
        "          ",
      ],
    ],
    doors: [
      [4, 6, 0, "s"],
      [2, 2, 0, "n"],
      [4, 3, 0, "s"],
      [6, 3, 0, "e"],
    ],
  },
  // A corner shop: glass front on the street, shelves, the stockroom behind, a flat above.
  {
    id: "shop",
    type: "structure",
    targets: ["nest"],
    levels: [
      [
        ",,,,,G,,,,",
        ".cccccccc.",
        ".cXcccXcc.",
        ".kkkkkkkk.",
        ".kSkSkSkk.",
        ".kSkSkSkk.",
        ".kkkkkkKk.",
        ".kkkkkkKk.",
        "..........",
        "..........",
      ],
      [
        "          ",
        " vvvvqqqq ",
        " vvvvqqqq ",
        " vQvvqEqq ",
        " vvvvqqqq ",
        " vvvvqqqq ",
        " vvvvqqqq ",
        " vvvvqqqq ",
        "          ",
        "          ",
      ],
      [
        "          ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        "          ",
        "          ",
      ],
    ],
    doors: [
      [1, 7, 0, "s", "glass"],
      [2, 7, 0, "s", "glass"],
      [3, 7, 0, "s"],
      [4, 7, 0, "s", "glass"],
      [5, 7, 0, "s", "glass"],
      [6, 7, 0, "s", "glass"],
      [8, 1, 0, "n"],
      [5, 2, 0, "s"],
      [4, 4, 1, "e"],
    ],
    stairs: [[8, 2, 0, 0, -1]],
  },
  // A garage and workshop with a basement: the den.
  {
    id: "workshop",
    type: "structure",
    targets: ["nest", "den"],
    below: 1,
    levels: [
      [
        "          ",
        "          ",
        " bbbbbbbb ",
        " bZbbbbWb ",
        " bbbbbbbb ",
        " bbbbbZbb ",
        " bbbbbbbb ",
        "          ",
        "          ",
        "          ",
      ],
      [
        ",,,,,,,,,,",
        ",ccccccccG",
        ",ccccccYc,",
        ",cXccccYc,",
        ",ccccccYc,",
        ",cXcccccc,",
        ",cccccccc,",
        "##########",
        "##########",
        "..........",
      ],
      [
        "          ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        " rrrrrrrr ",
        "          ",
        "          ",
        "          ",
      ],
    ],
    doors: [
      [3, 6, 1, "s"],
      [4, 6, 1, "s"],
      [5, 6, 1, "s"],
      [7, 6, 1, "s"],
      [8, 1, 1, "n"],
    ],
    stairs: [[1, 3, 0, 0, -1]],
  },
  // A back garden: fences, a shed, a tree, washing.
  {
    id: "backyard",
    type: "open",
    levels: [
      [
        "FFFF,FFFFF",
        "F,,,,,,,OF",
        "F,T,,,,,OF",
        ",,,,,G,,,,",
        "FFFF,FFFFF",
        "F,,,,,,,,F",
        "F,G,,,,T,F",
        ",,,,,,,,,,",
        "F,,,,,,G,F",
        "FFFF,FFFFF",
      ],
    ],
  },
  // An overgrown lot: hedges and trees, a broken shed.
  {
    id: "lot",
    type: "open",
    levels: [
      [
        ",,,T,,,,,,",
        ",HH,,,,TT,",
        ",,,,,,,T,,",
        ",,,OO,,,,,",
        "T,,O,,,,H,",
        ",,,,,,,,H,",
        ",,G,,T,,,,",
        ",,,,,,,,,T",
        ",T,,HHH,,,",
        ",,,,,,,,,,",
      ],
    ],
  },
  // A pocket park: a path, benches, trees.
  {
    id: "park",
    type: "open",
    levels: [
      [
        "HHHH..HHHH",
        ",,,,..,,,,",
        ",T,,..,,T,",
        ",,,B..B,,,",
        "..........",
        "..........",
        ",,,B..B,,,",
        ",T,,..,,T,",
        ",,,,..,,,,",
        "HHHH..HHHH",
      ],
    ],
  },
  // A car park: two rows of bays off an aisle, the drive on the street.
  {
    id: "carpark",
    type: "open",
    windows: false,
    levels: [
      [
        ",,,,,,,,,,",
        ",CC#C#CC#,",
        ",CC#C#CC#,",
        ",CC#C#CC#,",
        ",########,",
        ",########,",
        ",C#CC#U#C,",
        ",C#CC#U#C,",
        ",C#CC#U#C,",
        ",,,####,,,",
      ],
    ],
  },
];

export const BANK: Record<string, BlockData> = Object.fromEntries(
  SPECS.map((s) => [s.id, build(s)]),
);
const STRUCTURES = SPECS.filter((s) => s.type === "structure").map((s) => s.id);
const OPEN = ["backyard", "lot", "park"];

// ---------------------------------------------------------------------------
// The slot grid and its roads

type Slot =
  | { kind: "road"; arms: Set<Side> }
  | { kind: "block"; id: string; turn: Turn; front: Side | null }
  | { kind: "landing" }
  | { kind: "empty" };

const SIDES: Side[] = ["n", "e", "s", "w"];
const OPP: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

/** A road network on an N × N slot grid, by the light-urban rule: one road across, a Z, or a T. */
function roads(N: number, r: Rng): Slot[][] {
  const g: Slot[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, (): Slot => ({ kind: "empty" })),
  );
  const lay = (x: number, y: number, a: Side) => {
    const s = g[y]![x]!;
    if (s.kind !== "road") g[y]![x] = { kind: "road", arms: new Set([a]) };
    else s.arms.add(a);
  };
  const link = (x: number, y: number, side: Side) => {
    const [dx, dy] = DIR[side];
    lay(x, y, side);
    lay(x + dx, y + dy, OPP[side]);
  };
  /** A road along row y from x0 to x1, out over the map's edge at either end that's on it. */
  const row = (y: number, x0: number, x1: number) => {
    for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x++) link(x, y, "e");
    if (x0 === 0 || x1 === 0) lay(0, y, "w");
    if (x0 === N - 1 || x1 === N - 1) lay(N - 1, y, "e");
  };
  const col = (x: number, y0: number, y1: number) => {
    for (let y = Math.min(y0, y1); y < Math.max(y0, y1); y++) link(x, y, "s");
    if (y0 === 0 || y1 === 0) lay(x, 0, "n");
    if (y0 === N - 1 || y1 === N - 1) lay(x, N - 1, "s");
  };
  const inner = () => r.int(1, N - 2);
  const shape = r.pick(N >= 5 ? ["straight", "z", "t", "t", "cross"] : ["straight", "z", "t", "t"]);
  if (shape === "straight") row(inner(), 0, N - 1);
  else if (shape === "z") {
    // In from the west on one row, a turn, out to the east on another.
    const a = r.int(0, N - 1);
    let b = r.int(0, N - 1);
    if (b === a) b = a < N / 2 ? N - 1 : 0;
    const c = r.int(1, N - 2);
    row(a, 0, c);
    col(c, a, b);
    row(b, c, N - 1);
  } else if (shape === "t") {
    const y = inner();
    row(y, 0, N - 1);
    const x = inner();
    // The stem runs to the north or south edge.
    if (r.chance(0.5)) col(x, 0, y);
    else col(x, y, N - 1);
  } else {
    row(inner(), 0, N - 1);
    col(inner(), 0, N - 1);
  }
  // Turn the whole network a quarter at random, so the Z and the T come every way.
  return r.chance(0.5) ? transpose(g) : g;
}

function transpose(g: Slot[][]): Slot[][] {
  const swap: Record<Side, Side> = { n: "w", w: "n", s: "e", e: "s" };
  return g[0]!.map((_, x) =>
    g.map((rowG) => {
      const s = rowG[x]!;
      return s.kind === "road"
        ? { kind: "road", arms: new Set([...s.arms].map((a) => swap[a])) }
        : s;
    }),
  );
}

/** Draws a road slot: road 8 wide down the middle of each arm, a pavement 1 wide elsewhere. */
function drawRoad(m: BattleMap, sx: number, sy: number, arms: Set<Side>) {
  const z = m.ground;
  for (let y = 0; y < B; y++)
    for (let x = 0; x < B; x++) {
      const mid = (v: number) => v >= 1 && v <= 8;
      const road =
        (mid(x) && mid(y)) ||
        (arms.has("n") && y < 1 && mid(x)) ||
        (arms.has("s") && y > 8 && mid(x)) ||
        (arms.has("w") && x < 1 && mid(y)) ||
        (arms.has("e") && x > 8 && mid(y));
      // A dead end (one arm): the far half is pavement, a turning head.
      setTile(m, sx * B + x, sy * B + y, z, T.FLOOR, road ? "road" : "pavement");
    }
  // Only one arm: close the end with pavement.
  if (arms.size === 1) {
    const [a] = [...arms];
    for (let y = 0; y < B; y++)
      for (let x = 0; x < B; x++) {
        const far = a === "n" ? y > 8 : a === "s" ? y < 1 : a === "w" ? x > 8 : x < 1;
        if (far) setTile(m, sx * B + x, sy * B + y, z, T.FLOOR, "pavement");
      }
  }
}

/** Cars parked in a road slot's parking lanes, along straight stretches. */
function parkCars(m: BattleMap, r: Rng, sx: number, sy: number, arms: Set<Side>) {
  const ew = arms.has("e") && arms.has("w") && !arms.has("n") && !arms.has("s");
  const ns = arms.has("n") && arms.has("s") && !arms.has("e") && !arms.has("w");
  if (!ew && !ns) return;
  for (const lane of [1, 7])
    if (r.chance(0.45)) {
      const at = r.int(1, 5);
      const kind = r.pick(["car", "car", "suv", "truck"] as const);
      if (ew) vehicle(m, r, sx * B + at, sy * B + lane, true, kind, lane === 1 ? -1 : 1);
      else vehicle(m, r, sx * B + lane, sy * B + at, false, kind, lane === 1 ? 1 : -1);
    }
}

// ---------------------------------------------------------------------------
// Filling

export interface BlockMapPlan {
  N: number;
  slots: Slot[][];
  target: Pt;
  landing: Pt;
}

const at = (g: Slot[][], x: number, y: number) => g[y]?.[x];
const roadSides = (g: Slot[][], x: number, y: number) =>
  SIDES.filter((s) => {
    const [dx, dy] = DIR[s];
    return at(g, x + dx, y + dy)?.kind === "road";
  });
const turnFor = (side: Side): Turn =>
  ([0, 1, 2, 3] as Turn[]).find((t) => turnSide("s", t) === side)!;

/** One plan: roads, the landing, the target, then everything else. Null if this road net can't take the mission. */
function plan(N: number, r: Rng, targetKind: Target): BlockMapPlan | null {
  const g = roads(N, r);
  const free: Pt[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) if (g[y]![x]!.kind === "empty") free.push({ x, y });
  // The landing: an empty edge slot.
  const edge = free.filter((p) => p.x === 0 || p.y === 0 || p.x === N - 1 || p.y === N - 1);
  if (!edge.length) return null;
  const landing = r.pick(edge);
  g[landing.y]![landing.x] = { kind: "landing" };
  // The target: on a road, in the far part of the map from the landing (at least two slots away).
  const cheb = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const far = free.filter(
    (p) =>
      roadSides(g, p.x, p.y).length && cheb(p, landing) >= Math.min(2, N - 2) + (N >= 5 ? 1 : 0),
  );
  if (!far.length) return null;
  const target = r.pick(far);
  const tIds = STRUCTURES.filter((id) => BANK[id]!.targets.includes(targetKind));
  const tSide = r.pick(roadSides(g, target.x, target.y));
  g[target.y]![target.x] = { kind: "block", id: r.pick(tIds), turn: turnFor(tSide), front: tSide };
  // The rest: on a road, a building (or now and then a car park); off it, open ground.
  const uses = new Map<string, number>();
  const take = (ids: string[]) => {
    const ok = ids.filter((id) => (uses.get(id) ?? 0) < 2);
    const id = r.pick(ok.length ? ok : ids);
    uses.set(id, (uses.get(id) ?? 0) + 1);
    return id;
  };
  for (const p of r.shuffle(free)) {
    if (g[p.y]![p.x]!.kind !== "empty") continue;
    const sides = roadSides(g, p.x, p.y);
    if (sides.length) {
      const side = r.pick(sides);
      const id = r.chance(0.15) ? "carpark" : take(STRUCTURES);
      g[p.y]![p.x] = { kind: "block", id, turn: turnFor(side), front: side };
    } else {
      // Behind a building whose back faces here, a back garden; else any open block, turned at random.
      g[p.y]![p.x] = {
        kind: "block",
        id: take(OPEN),
        turn: r.int(0, 3) as Turn,
        front: null,
      };
    }
  }
  return { N, slots: g, target, landing };
}

/** Stamps a plan into a map. Returns the map and its buildings (the target's first). */
function realise(p: BlockMapPlan, seed: number, r: Rng): { m: BattleMap; buildings: Building[] } {
  const ids = p.slots.flat().flatMap((s) => (s.kind === "block" ? [s.id] : []));
  const below = Math.max(0, ...ids.map((id) => BANK[id]!.below));
  const above = Math.max(1, ...ids.map((id) => BANK[id]!.lv.length - BANK[id]!.below));
  const n = p.N * B;
  const m = emptyMap(n, n, below + above, below, "urban", seed);
  const buildings: Building[] = [];
  for (let sy = 0; sy < p.N; sy++)
    for (let sx = 0; sx < p.N; sx++) {
      const s = p.slots[sy]![sx]!;
      if (s.kind === "road") {
        drawRoad(m, sx, sy, s.arms);
        parkCars(m, r, sx, sy, s.arms);
      } else if (s.kind === "landing") {
        for (let y = 0; y < B; y++)
          for (let x = 0; x < B; x++) {
            const rim = x === 0 || y === 0 || x === B - 1 || y === B - 1;
            const tree = rim && (x + y) % 3 === 0 && r.chance(0.6);
            setTile(
              m,
              sx * B + x,
              sy * B + y,
              m.ground,
              tree ? T.HIGH : T.FLOOR,
              tree ? "tree" : "grass",
            );
          }
      } else if (s.kind === "block") {
        const b = BANK[s.id]!;
        stamp(m, b, sx * B, sy * B, s.turn);
        if (b.type === "structure") {
          const tiles: Pt3[] = [];
          for (let z = 0; z < m.levels; z++)
            for (let y = sy * B; y < sy * B + B; y++)
              for (let x = sx * B; x < sx * B + B; x++)
                if (indoor(m, x, y, z)) tiles.push({ x, y, z });
          const isTarget = sx === p.target.x && sy === p.target.y;
          const storeys = [...new Set(tiles.filter((t) => t.z >= m.ground).map((t) => t.z))].sort();
          const bld: Building = {
            rect: { x0: sx * B, y0: sy * B, x1: sx * B + B - 1, y1: sy * B + B - 1 },
            storeys,
            roof: m.levels - 1,
            // The target is the hideout (spawns pick the farthest building with a basement): a ground-level "basement" with no rooms puts its vampires on the ground floor.
            basement: isTarget ? (b.below ? m.ground - 1 : m.ground) : null,
            rooms: tiles.map((t) => ({ x0: t.x, y0: t.y, x1: t.x, y1: t.y })),
            basementRooms: tiles
              .filter((t) => t.z < m.ground)
              .map((t) => ({ x0: t.x, y0: t.y, x1: t.x, y1: t.y })),
            stair: { x: sx * B, y: sy * B },
          };
          if (isTarget) buildings.unshift(bld);
          else buildings.push(bld);
        }
      }
    }
  m.lz = landingZone(m, { x: p.landing.x * B + 5, y: p.landing.y * B + 5 });
  return { m, buildings };
}

const INDOOR = new Set(["wood", "indoor", "tile", "concrete"]);
const indoor = (m: BattleMap, x: number, y: number, z: number) =>
  walkable(m, x, y, z) && INDOOR.has(skinAt(m, x, y, z));

// ---------------------------------------------------------------------------
// Scoring: avenues of approach, cover and concealment, sightlines, height

export interface Score {
  total: number;
  /** Separate routes from landing to target (0 when unreachable). */
  routes: number;
  /** Shortest route in tiles. */
  length: number;
  /** Longest stretch of that route with no cover within a tile. */
  bareRun: number;
  /** Longest straight open run off the roads, in tiles. */
  sightline: number;
  /** Does the shortest route cross a road? */
  crossesRoad: boolean;
  /** Street tiles (road, pavement) on the quietest route: the fewest any route must cross. */
  quietStreet: number;
  /** Street tiles on the shortest route. */
  fastStreet: number;
  /** Upper storeys (not the target's) within 15 tiles of the target. */
  overlooks: number;
  /** Distinct blocks used. */
  variety: number;
  /** Share of the ground level that is road. */
  roadShare: number;
}

const key3 = (m: BattleMap, p: Pt3) => idx(m, p.x, p.y, p.z);

function bfs(
  m: BattleMap,
  from: Pt3[],
  goal: (p: Pt3) => boolean,
  banned?: Set<number>,
): Pt3[] | null {
  const prev = new Map<number, number>();
  const pts = new Map<number, Pt3>();
  const q: Pt3[] = [];
  for (const p of from) {
    prev.set(key3(m, p), -1);
    pts.set(key3(m, p), p);
    q.push(p);
  }
  for (let i = 0; i < q.length; i++) {
    const p = q[i]!;
    if (goal(p)) {
      const path: Pt3[] = [];
      for (let k = key3(m, p); k !== -1; k = prev.get(k)!) path.push(pts.get(k)!);
      return path.reverse();
    }
    for (const n of neighbours(m, p, true)) {
      const k = key3(m, n);
      if (prev.has(k) || banned?.has(k)) continue;
      prev.set(k, key3(m, p));
      pts.set(k, n);
      q.push(n);
    }
  }
  return null;
}

const street = (m: BattleMap, x: number, y: number, z: number) =>
  z === m.ground && (skinAt(m, x, y, z) === "road" || skinAt(m, x, y, z) === "pavement");

/** The fewest street tiles any route from the landing to the goal crosses (0-1 search). */
function quietest(m: BattleMap, goal: (p: Pt3) => boolean): number {
  const cost = new Map<number, number>();
  const dq: [Pt3, number][] = m.lz.map((p) => [p, 0]);
  for (const p of m.lz) cost.set(key3(m, p), 0);
  while (dq.length) {
    const [p, c] = dq.shift()!;
    if (c > (cost.get(key3(m, p)) ?? Infinity)) continue;
    if (goal(p)) return c;
    for (const n of neighbours(m, p, true)) {
      const w = street(m, n.x, n.y, n.z) ? 1 : 0;
      const k = key3(m, n);
      if (c + w < (cost.get(k) ?? Infinity)) {
        cost.set(k, c + w);
        if (w) dq.push([n, c + w]);
        else dq.unshift([n, c]);
      }
    }
  }
  return Infinity;
}

const COVER = new Set<number>([T.LOW, T.HIGH, T.WALL, T.WINDOW]);

export function score(m: BattleMap, target: Building | undefined, ids: string[]): Score {
  const g = m.ground;
  const goal = (p: Pt3) =>
    !!target &&
    p.z === g &&
    indoor(m, p.x, p.y, p.z) &&
    p.x >= target.rect.x0 &&
    p.x <= target.rect.x1 &&
    p.y >= target.rect.y0 &&
    p.y <= target.rect.y1;
  const first = bfs(m, m.lz, goal);
  let roadTiles = 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) if (skinAt(m, x, y, g) === "road") roadTiles++;
  const roadShare = roadTiles / (m.w * m.h);
  if (!first)
    return {
      total: -1e9,
      routes: 0,
      length: 0,
      bareRun: 0,
      sightline: 0,
      crossesRoad: false,
      quietStreet: 0,
      fastStreet: 0,
      overlooks: 0,
      variety: 0,
      roadShare,
    };
  // Separate routes: ban a band round each route found (all but its ends) and look again.
  let routes = 1;
  const banned = new Set<number>();
  let path: Pt3[] | null = first;
  while (path && routes < 3) {
    for (const p of path.slice(6, -3))
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          for (let z = 0; z < m.levels; z++) banned.add(idx(m, p.x + dx, p.y + dy, z));
    path = bfs(m, m.lz, goal, banned);
    if (path && path.length <= first.length * 1.6) routes++;
    else break;
  }
  // Cover along the shortest route: the longest run of tiles with nothing to duck behind.
  const covered = (p: Pt3) => {
    if (indoor(m, p.x, p.y, p.z)) return true;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = p.x + dx,
          y = p.y + dy;
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        if (COVER.has(tileAt(m, x, y, p.z)) || indoor(m, x, y, p.z)) return true;
      }
    return false;
  };
  let bareRun = 0,
    run = 0;
  for (const p of first) {
    run = covered(p) ? 0 : run + 1;
    bareRun = Math.max(bareRun, run);
  }
  // Sightlines off the roads: the longest straight run of open, outdoor ground along a row or column.
  const open = (x: number, y: number) =>
    tileAt(m, x, y, g) === T.FLOOR && !indoor(m, x, y, g) && !street(m, x, y, g);
  let sightline = 0;
  for (const alongX of [true, false])
    for (let a = 0; a < m.w; a++) {
      let len = 0;
      for (let b = 0; b < m.w; b++) {
        const [x, y] = alongX ? [b, a] : [a, b];
        len = open(x, y) ? len + 1 : 0;
        sightline = Math.max(sightline, len);
      }
    }
  const quietStreet = quietest(m, goal);
  const fastStreet = first.filter((p) => street(m, p.x, p.y, p.z)).length;
  const crossesRoad = first.some((p) => skinAt(m, p.x, p.y, p.z) === "road");
  // Height: other buildings' upper floors near the target, to shoot down from.
  const tc = {
    x: (target!.rect.x0 + target!.rect.x1) / 2,
    y: (target!.rect.y0 + target!.rect.y1) / 2,
  };
  let overlooks = 0;
  for (let z = g + 1; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const inTarget =
          x >= target!.rect.x0 &&
          x <= target!.rect.x1 &&
          y >= target!.rect.y0 &&
          y <= target!.rect.y1;
        if (!inTarget && walkable(m, x, y, z) && Math.hypot(x - tc.x, y - tc.y) <= 15) overlooks++;
      }
  const variety = new Set(ids).size;
  // About two to three turns' walk (some 14 tiles a turn) from landing to target.
  const turns = first.length / 14;
  const total =
    (routes - 1) * 15 +
    (quietStreet <= 12 ? 20 : -Math.min(40, (quietStreet - 12) * 2)) +
    (fastStreet - quietStreet >= 6 ? 15 : 0) +
    (crossesRoad ? 25 : 0) +
    (overlooks > 0 ? 10 : 0) -
    Math.max(0, bareRun - 5) * 6 -
    Math.max(0, sightline - 15) * 2 -
    (turns < 2 ? (2 - turns) * 30 : turns > 3.5 ? (turns - 3.5) * 20 : 0) -
    Math.max(0, roadShare - 0.35) * 200 +
    variety * 3;
  return {
    total,
    routes,
    length: first.length,
    bareRun,
    sightline,
    crossesRoad,
    quietStreet,
    fastStreet,
    overlooks,
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

/** Makes `candidates` maps and keeps the best. `size` in slots (4 or 5). */
export function blockMap(
  seed: number,
  size = 4,
  targetKind: Target = "nest",
  candidates = 20,
): BlockMap {
  const r = rng({ rng: seed >>> 0 });
  let best: BlockMap | null = null;
  for (let k = 0; k < candidates * 3 && (!best || k < candidates); k++) {
    const p = plan(size, r, targetKind);
    if (!p) continue;
    const { m, buildings } = realise(p, seed, r);
    const seen = reachable(m, m.lz[0]!);
    // Every building's ground floor must be reachable from the landing.
    const ok = buildings.every((b) =>
      b.rooms.some(
        (q) => q.x0 >= 0 && seen[idx(m, q.x0, q.y0, m.ground)] && indoor(m, q.x0, q.y0, m.ground),
      ),
    );
    // Nor any pocket of ground cut off (a fenced yard whose gates face walls).
    let pockets = 0;
    for (let z = 0; z <= m.ground; z++)
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) if (walkable(m, x, y, z) && !seen[idx(m, x, y, z)]) pockets++;
    if (!ok || pockets) continue;
    const ids = p.slots.flat().flatMap((s) => (s.kind === "block" ? [s.id] : []));
    const sc = score(m, buildings[0], ids);
    if (!best || sc.total > best.score.total) best = { m, buildings, plan: p, score: sc };
  }
  if (!best) throw new Error(`No block map for seed ${seed}`);
  return best;
}

/** The ground level as text: = road, . pavement, , grass, # tarmac, o indoors, l low cover, H high, L landing, X target. */
export function ascii(bm: BlockMap): string {
  const { m } = bm;
  const t = bm.buildings[0]!.rect;
  const lz = new Set(m.lz.map((p) => `${p.x},${p.y}`));
  const out: string[] = [];
  for (let y = 0; y < m.h; y++) {
    let line = "";
    for (let x = 0; x < m.w; x++) {
      const k = tileAt(m, x, y, m.ground),
        s = skinAt(m, x, y, m.ground);
      const inT = x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1;
      const sp = m.spawns.find((q) => q.x === x && q.y === y);
      line += lz.has(`${x},${y}`)
        ? "L"
        : sp
          ? sp.side === "vampire"
            ? "V"
            : sp.side === "thrall"
              ? "t"
              : "c"
          : k === T.LOW
            ? "l"
            : k === T.HIGH
              ? "H"
              : k === T.FLIGHT
                ? "^"
                : k === T.VOID
                  ? " "
                  : INDOOR.has(s)
                    ? inT
                      ? "X"
                      : "o"
                    : s === "road"
                      ? "="
                      : s === "pavement"
                        ? "."
                        : s === "tarmac"
                          ? "#"
                          : ",";
    }
    out.push(line);
  }
  return out.join("\n");
}

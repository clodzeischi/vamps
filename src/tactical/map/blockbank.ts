// The block bank for the block generator (blockgen.ts): the blocks drawn in
// the block editor (src/data/blocks/*.json), and the first ones, drawn here
// in code with a few drawing calls (enough to test layouts, not looks),
// until each is redrawn in the editor. A drawn block with a code block's id
// replaces it. Sizes are whole units of 8
// tiles (8 × 8, 8 × 16, 16 × 8, 16 × 16). The front (the side on the road)
// is south, and the block's last row or two is its frontage (pavement, a
// forecourt, a hedge and gate).

import { BLOCKS } from "../../data/blockBank";
import { VEHICLE_LENGTH, type Flight, type Sign, type Vehicle, type VehicleKind } from "./map";
import {
  BLOCK,
  edgeIndex,
  newBlock,
  type BlockData,
  type BlockType,
  type Side,
  type Target,
  type Terrain,
} from "./blocks";

/** The grid unit in tiles: a road is one unit wide (parking, two lanes, parking). */
export const U = BLOCK;

/** Floors: "skin" (no walls) or "floor/exterior/interior" (walled). */
const FLOOR: Record<string, string> = {
  " ": "",
  ".": "pavement",
  ",": "grass",
  "#": "tarmac",
  "-": "dirt",
  n: "concrete",
  r: "roof",
  w: "wood/brick/plaster",
  v: "indoor/brick/plaster",
  q: "indoor/plaster/plaster",
  p: "wood/plaster/plaster",
  k: "tile/brick/plaster",
  c: "concrete/brick/plaster",
  b: "concrete/concrete/concrete",
  R: "concrete/metal/plaster",
  u: "concrete/metal/metal",
  f: "tile/clinic/clinic",
  W: "dirt/wood/wood",
  i: "indoor/clinic/clinic",
  j: "concrete/clinic/clinic",
  s: "stone/stone/plaster",
};

/** What stands on a floor. */
const OBJ: Record<string, string> = {
  ".": "",
  T: "high:tree",
  H: "high:hedge",
  F: "low:fence",
  G: "low:crate",
  O: "high:crate",
  C: "low:car",
  B: "low:bench",
  K: "low:counter",
  S: "high:shelf",
  D: "low:table",
  E: "low:sofa",
  Q: "low:bed",
  Y: "high:rack",
  M: "high:metal",
  m: "low:metal",
  J: "high:planks",
  j: "low:planks",
  h: "high:hay",
  I: "low:hay",
  g: "low:grave",
  e: "low:bench",
  d: "high:fridge",
  P: "high:pump",
};

const DIR: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** A block being drawn: floors and objects per level, then doors, stairs, vehicles, signs. */
class Draw {
  fl: string[][][];
  ob: string[][][];
  doors: [number, number, number, Side, string][] = [];
  flights: Flight[] = [];
  vehicles: Vehicle[] = [];
  signs: Sign[] = [];
  /** Windows every `windows` tiles along outside walls (0: none). */
  windows = 2;

  constructor(
    readonly w: number,
    readonly h: number,
    readonly levels: number,
    readonly below = 0,
    ground = ",",
  ) {
    this.fl = Array.from({ length: levels }, (_, z) =>
      Array.from({ length: h }, () => Array<string>(w).fill(z === below ? ground : " ")),
    );
    this.ob = Array.from({ length: levels }, () =>
      Array.from({ length: h }, () => Array<string>(w).fill(".")),
    );
  }
  box(z: number, x0: number, y0: number, x1: number, y1: number, ch: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.fl[z]![y]![x] = ch;
    return this;
  }
  /** Objects in a rectangle. */
  put(z: number, x0: number, y0: number, x1: number, y1: number, ch: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.ob[z]![y]![x] = ch;
    return this;
  }
  /** Objects at points. */
  at(z: number, ch: string, ...pts: [number, number][]) {
    for (const [x, y] of pts) this.ob[z]![y]![x] = ch;
    return this;
  }
  door(z: number, side: Side, kind: string, ...pts: [number, number][]) {
    for (const [x, y] of pts) this.doors.push([x, y, z, side, kind]);
    return this;
  }
  /** A run of doors (or glass, or openings) along one wall. */
  doorRun(z: number, side: Side, kind: string, x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) this.doors.push([x, y, z, side, kind]);
    return this;
  }
  /** An indoor flight, 1 × 2 from its corner, going up (dx, dy). */
  flight(z: number, x: number, y: number, dx: number, dy: number) {
    this.flights.push({ x, y, z, w: dy ? 1 : 2, h: dy ? 2 : 1, kind: "indoor", dx, dy });
    return this;
  }
  /**
   * A switchback stairwell, 3 wide (x … x + 2) and 4 deep (y … y + 3), from level z0 up to z1:
   * the flights alternate between columns x and x + 1, and column x + 2 is the landing that joins
   * each floor's two ends (without it, the floor a flight arrives on is cut off from its corridor).
   */
  stairwell(x: number, y: number, z0: number, z1: number) {
    for (let z = z0; z < z1; z++)
      if ((z - z0) % 2 === 0) this.flight(z, x, y + 1, 0, -1);
      else this.flight(z, x + 1, y + 1, 0, 1);
    return this;
  }
  vehicle(z: number, x: number, y: number, alongX: boolean, kind: VehicleKind = "car") {
    const len = VEHICLE_LENGTH[kind];
    this.vehicles.push({
      x,
      y,
      z,
      w: alongX ? len : 2,
      h: alongX ? 2 : len,
      kind,
      front: 1,
      under: "tarmac",
      paint: -1,
    });
    return this;
  }
  /** A lit sign over the outside of the wall at (x, y), facing `side`. */
  sign(
    z: number,
    x: number,
    y: number,
    side: Side,
    w: number,
    text: string,
    bg: string,
    fg: string,
  ) {
    const [dx, dy] = DIR[side];
    this.signs.push({ x, y, z, dx, dy, w, text, bg, fg });
    return this;
  }

  block(id: string, type: BlockType, terrains: Terrain[], targets: Target[] = []): BlockData {
    const b = newBlock(
      { id, name: id, terrains, type, entrances: ["s"], targets },
      this.w,
      this.h,
      this.below,
      this.levels - this.below,
    );
    const { w, h } = this;
    for (let z = 0; z < this.levels; z++) {
      const L = b.lv[z]!;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const f = this.fl[z]![y]![x]!,
            o = this.ob[z]![y]![x]!;
          if (!(f in FLOOR)) throw new Error(`${id}: floor "${f}"`);
          if (!(o in OBJ)) throw new Error(`${id}: object "${o}"`);
          L.floor[y * w + x] = FLOOR[f]!;
          L.obj[y * w + x] = FLOOR[f] ? OBJ[o]! : "";
        }
      // Windows on outside walls, every `windows` tiles, never in basements.
      if (this.windows && z >= this.below) {
        const walled = (x: number, y: number) =>
          x >= 0 && y >= 0 && x < w && y < h && L.floor[y * w + x]!.includes("/");
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            if (!walled(x, y) || (x + y) % this.windows) continue;
            for (const side of ["n", "e", "s", "w"] as Side[]) {
              const [dx, dy] = DIR[side];
              if (walled(x + dx, y + dy)) continue;
              const e = edgeIndex(w, x, y, dx, dy);
              L[e.list][e.i] = "window";
            }
          }
      }
    }
    for (const [x, y, z, side, kind] of this.doors) {
      const [dx, dy] = DIR[side];
      const e = edgeIndex(w, x, y, dx, dy);
      b.lv[z]![e.list][e.i] = kind;
    }
    b.flights = this.flights.map((f) => ({ ...f }));
    b.vehicles = this.vehicles.map((v) => ({ ...v }));
    b.signs = this.signs.map((s) => ({ ...s }));
    return b;
  }

  /** Mirrors the drawing left to right (a second house from the first). */
  mirror() {
    const W = this.w;
    const flip: Record<Side, Side> = { n: "n", s: "s", e: "w", w: "e" };
    for (const lv of [...this.fl, ...this.ob]) for (const row of lv) row.reverse();
    this.doors = this.doors.map(([x, y, z, s, k]) => [W - 1 - x, y, z, flip[s], k]);
    this.flights = this.flights.map((f) => ({ ...f, x: W - f.x - f.w, dx: -f.dx }));
    this.vehicles = this.vehicles.map((v) => ({ ...v, x: W - v.x - v.w }));
    this.signs = this.signs.map((s) => ({ ...s, x: W - 1 - s.x, dx: -s.dx }));
    return this;
  }
}

// ---------------------------------------------------------------------------
// Light urban: drawn (src/data/blocks/, drafts in scripts/blocks/light.ts), but
// for the corner shop of dense urban and the car park.

/** A corner shop with a flat above (8 × 8): glass front, shelves, counter. */
function shop(): BlockData {
  const d = new Draw(8, 8, 3);
  d.box(0, 0, 6, 7, 7, ".");
  d.box(0, 1, 1, 6, 5, "k").box(1, 1, 1, 6, 5, "v").box(2, 1, 1, 6, 5, "r");
  d.flight(0, 6, 2, 0, -1);
  d.at(0, "S", [2, 2], [2, 3], [4, 2], [4, 3]).at(0, "K", [5, 5]).at(0, "d", [1, 1], [1, 2]);
  d.at(1, "Q", [2, 3], [3, 3]);
  d.door(0, "s", "glass", [1, 5], [2, 5], [5, 5], [6, 5]).door(0, "s", "slide", [3, 5], [4, 5]);
  d.door(0, "n", "door", [4, 1]);
  d.sign(0, 3, 5, "s", 3, "MINI MART", "#2a6a3a", "#f0f0e0");
  return d.block("shop", "structure", ["dense"], ["nest"]);
}

/** A car park (16 × 8): a row of bays, the aisle, the drive. */
function carpark(): BlockData {
  const d = new Draw(16, 8, 1, 0, "#");
  d.box(0, 0, 7, 15, 7, ".").box(0, 6, 7, 9, 7, "#");
  d.windows = 0;
  for (const x of [1, 3, 6, 8, 11, 13]) d.vehicle(0, x, 0, false);
  d.at(0, "O", [15, 6]).at(0, "F", [0, 6], [1, 6], [14, 6]);
  return d.block("carpark", "open", ["light", "dense", "industrial"]);
}

// Rural: all drawn in the editor (src/data/blocks/).

// ---------------------------------------------------------------------------
// Dense urban: tall, so position and recon matter

/**
 * A tower of `storeys` (16 × 16): a corridor through every floor, flats or
 * hotel rooms either side, a stairwell at each end up to the roof. The
 * ground floor has a lobby on the street and a shop beside it.
 */
function tower(id: string, storeys: number, hotel: boolean): BlockData {
  const S = storeys;
  const d = new Draw(16, 16, S + 1, 0, ".");
  const north = hotel
    ? [
        [4, 5],
        [6, 7],
        [8, 9],
        [10, 11],
      ]
    : [
        [4, 6],
        [7, 8],
        [9, 11],
      ];
  const south = hotel
    ? [
        [1, 3],
        [4, 6],
        [7, 9],
        [10, 12],
        [13, 14],
      ]
    : [
        [1, 4],
        [5, 9],
        [10, 14],
      ];
  for (let z = 0; z < S; z++) {
    d.box(z, 1, 1, 3, 6, "k").box(z, 12, 1, 14, 6, "k").box(z, 1, 7, 14, 8, "k");
    north.forEach(([a, b], i) => {
      d.box(z, a!, 1, b!, 6, i % 2 ? "q" : "v").door(z, "s", "door", [a! + 1, 6]);
      d.at(z, "Q", [a!, 2]).at(z, i % 2 ? "E" : "D", [b!, 4]);
    });
    south.forEach(([a, b], i) => {
      if (z === 0 && a! <= 9 && b! >= 5) return; // the lobby and shop below
      d.box(z, a!, 9, b!, 12, i % 2 ? "q" : "v").door(z, "n", "door", [a! + 1, 9]);
      d.at(z, "Q", [a!, 11]);
      if (b! - a! >= 2) d.at(z, i % 2 ? "D" : "E", [b!, 12]);
    });
  }
  // The ground floor: the lobby, glass on the street; a shop or café beside it.
  d.box(0, 5, 9, 9, 12, "w").door(0, "n", "door", [7, 9]);
  d.door(0, "s", "slide", [7, 12], [8, 12]).door(0, "s", "glass", [6, 12]);
  if (hotel) {
    d.at(0, "K", [5, 10], [5, 11]).at(0, "E", [9, 10], [9, 11]);
    d.sign(0, 7, 12, "s", 4, "HOTEL", "#4a1a2a", "#f0d890");
  } else d.at(0, "m", [9, 10], [9, 11]);
  if (hotel) {
    d.box(0, 1, 9, 4, 12, "c")
      .door(0, "s", "slide", [2, 12], [3, 12])
      .door(0, "s", "glass", [1, 12]);
    d.at(0, "D", [1, 10], [3, 10]).door(0, "n", "door", [3, 9]);
  } else {
    d.box(0, 1, 9, 4, 12, "c")
      .door(0, "s", "slide", [2, 12], [3, 12])
      .door(0, "s", "glass", [1, 12], [4, 12]);
    d.at(0, "S", [1, 10], [3, 10]).at(0, "K", [4, 10]);
    d.sign(0, 2, 12, "s", 3, "LIQUOR", "#1a2a5a", "#f0f0f0");
  }
  d.stairwell(1, 3, 0, S).stairwell(12, 3, 0, S);
  // The roof: plant to hide behind, a water tank.
  d.box(S, 1, 1, 14, 12, "r");
  d.put(S, 6, 3, 7, 4, "M").put(S, 10, 10, 11, 11, "M").at(S, "m", [4, 10], [5, 10], [9, 6]);
  d.at(0, "B", [3, 14], [12, 14]).at(0, "T", [1, 14], [14, 14]);
  return d.block(id, "structure", ["dense"], hotel ? ["den", "haven"] : ["den", "haven"]);
}

/** A walk-up tenement (8 × 16): a shop on the street, flats above, a back court behind. */
function tenement(id: string, storeys: number, mirrored: boolean): BlockData {
  const S = storeys;
  const d = new Draw(8, 16, S + 1, 0, "#");
  d.box(0, 0, 14, 7, 15, ".");
  for (let z = 0; z < S; z++) {
    d.box(z, 5, 4, 7, 13, "c");
    if (z === 0) d.box(z, 0, 4, 4, 13, "k");
    else {
      d.box(z, 0, 4, 4, 8, "v").box(z, 0, 9, 4, 13, "q");
      d.door(z, "e", "door", [4, 8], [4, 11]);
      d.at(z, "Q", [1, 5], [2, 5]).at(z, "E", [1, 12]);
    }
  }
  d.stairwell(5, 5, 0, S);
  d.box(S, 0, 4, 7, 13, "r").at(S, "M", [1, 6]).at(S, "m", [2, 11]);
  d.door(0, "s", "door", [2, 13], [7, 13]).door(
    0,
    "s",
    "glass",
    [0, 13],
    [1, 13],
    [3, 13],
    [4, 13],
  );
  d.door(0, "n", "door", [7, 4]).door(0, "e", "door", [4, 10]);
  d.at(0, "S", [1, 6], [1, 7], [3, 6], [3, 7]).at(0, "K", [3, 11]).at(0, "d", [0, 4], [1, 4]);
  d.sign(0, 2, 13, "s", 3, "DELI", "#6a2a1a", "#f0e0c0");
  d.at(0, "O", [1, 1], [2, 1]).at(0, "G", [6, 1], [5, 0]);
  if (mirrored) d.mirror();
  return d.block(id, "structure", ["dense"], ["nest", "den"]);
}

/** Lock-up storage (16 × 8): a row of units with roller doors off a lane, the office on the street. */
function storage(): BlockData {
  const d = new Draw(16, 8, 2, 0, "#");
  d.windows = 4;
  for (let i = 0; i < 8; i++) {
    const x = i * 2;
    d.box(0, x, 0, x + 1, 2, i % 2 ? "R" : "u").box(1, x, 0, x + 1, 2, "r");
    d.door(0, "s", "garage", [x, 2], [x + 1, 2]);
  }
  d.at(0, "O", [0, 0], [9, 1]).at(0, "G", [5, 0], [14, 0], [12, 1]);
  d.box(0, 0, 5, 3, 7, "c")
    .box(1, 0, 5, 3, 7, "r")
    .door(0, "n", "door", [1, 5])
    .door(0, "e", "door", [3, 6]);
  d.box(0, 4, 7, 15, 7, ".").box(0, 8, 7, 11, 7, "#");
  d.put(0, 5, 6, 7, 6, "F").put(0, 12, 6, 15, 6, "F");
  return d.block("storage", "structure", ["dense", "industrial"], ["nest"]);
}

/** A back court (8 × 8): skips, bins, pallets, a burning barrel. */
function court(): BlockData {
  const d = new Draw(8, 8, 1, 0, "#");
  d.at(0, "O", [1, 1], [2, 1]).at(0, "G", [5, 0], [6, 0]).at(0, "j", [1, 5]).at(0, "m", [4, 4]);
  d.put(0, 0, 6, 2, 6, "F").put(0, 5, 6, 7, 6, "F").box(0, 0, 7, 7, 7, ".");
  return d.block("court", "open", ["dense", "industrial"]);
}

function bar(): BlockData {
  const d = new Draw(8, 8, 3, 0, "#");
  d.box(0, 0, 6, 7, 7, ".");
  d.box(0, 0, 1, 7, 5, "w").box(1, 0, 1, 7, 5, "v").box(2, 0, 1, 7, 5, "r");
  d.flight(0, 7, 2, 0, -1);
  d.at(0, "K", [1, 2], [2, 2], [3, 2]).at(0, "D", [5, 3], [2, 4]);
  d.at(1, "Q", [1, 2], [2, 2]).at(1, "E", [4, 4]);
  d.door(0, "s", "door", [3, 5]).door(0, "s", "glass", [1, 5], [5, 5]).door(0, "n", "door", [1, 1]);
  d.sign(0, 3, 5, "s", 3, "BAR", "#3a1a4a", "#ff70d0");
  return d.block("bar", "structure", ["dense"], ["nest"]);
}

// ---------------------------------------------------------------------------
// Industrial: many kinds of works, not one warehouse

function warehouse(): BlockData {
  const d = new Draw(16, 16, 3, 0, "#");
  d.windows = 4;
  d.box(0, 0, 15, 15, 15, ".").box(0, 10, 15, 13, 15, "#");
  d.box(0, 1, 1, 14, 10, "R").box(0, 11, 1, 14, 4, "c");
  d.box(1, 1, 1, 14, 10, "r").box(1, 11, 1, 14, 4, "c").box(2, 11, 1, 14, 4, "r");
  d.flight(0, 11, 2, 0, -1).door(0, "w", "door", [11, 4]);
  d.put(0, 2, 3, 8, 3, "Y").put(0, 2, 6, 9, 6, "Y").at(0, "j", [12, 7], [13, 8]);
  d.door(0, "s", "garage", [3, 10], [4, 10], [8, 10], [9, 10]).door(0, "w", "door", [1, 6]);
  d.vehicle(0, 2, 12, true, "truck");
  return d.block("warehouse", "structure", ["industrial"], ["den", "haven"]);
}

function containers(): BlockData {
  const d = new Draw(16, 16, 2, 0, "#");
  d.windows = 0;
  d.vehicle(0, 1, 1, true, "container").vehicle(0, 9, 1, true, "container");
  d.vehicle(0, 2, 4, true, "container").vehicle(0, 10, 5, true, "container");
  d.vehicle(0, 1, 8, true, "container").vehicle(0, 9, 9, true, "container");
  d.at(0, "G", [7, 7]);
  d.box(0, 13, 12, 14, 13, "c").box(1, 13, 12, 14, 13, "r").door(0, "w", "door", [13, 13]);
  d.put(0, 0, 14, 4, 14, "F").put(0, 11, 14, 12, 14, "F").at(0, "F", [15, 14]);
  d.box(0, 0, 15, 15, 15, ".").box(0, 5, 15, 10, 15, "#");
  return d.block("containers", "open", ["industrial"]);
}

function tanks(): BlockData {
  const d = new Draw(16, 16, 2, 0, "n");
  for (const [x, y] of [
    [2, 2],
    [8, 2],
    [2, 7],
    [8, 7],
  ] as const)
    d.put(0, x, y, x + 2, y + 2, "M");
  d.put(0, 1, 6, 11, 6, "m").at(0, ".", [5, 6], [6, 6]);
  d.box(0, 13, 1, 14, 4, "c").box(1, 13, 1, 14, 4, "r").door(0, "s", "door", [13, 4]);
  d.box(0, 0, 12, 15, 14, "#").put(0, 0, 13, 5, 13, "F").put(0, 10, 13, 15, 13, "F");
  d.box(0, 0, 15, 15, 15, ".").box(0, 6, 15, 9, 15, "#");
  return d.block("tanks", "open", ["industrial"]);
}

function works(): BlockData {
  const d = new Draw(16, 16, 3, 0, "#");
  d.windows = 4;
  d.box(0, 1, 1, 14, 11, "R").box(0, 1, 1, 5, 5, "c");
  d.box(1, 1, 1, 14, 11, "r").box(1, 1, 1, 5, 5, "c").box(2, 1, 1, 5, 5, "r");
  d.flight(0, 1, 2, 0, -1).door(0, "s", "door", [3, 5]);
  d.put(0, 8, 3, 9, 4, "M").put(0, 12, 3, 12, 4, "M").put(0, 3, 8, 11, 8, "m").at(0, ".", [7, 8]);
  d.put(0, 4, 10, 5, 10, "M").put(0, 13, 7, 13, 9, "Y");
  d.door(0, "s", "garage", [6, 11], [7, 11])
    .door(0, "s", "door", [8, 11])
    .door(0, "e", "door", [14, 6]);
  d.box(0, 0, 15, 15, 15, ".").box(0, 6, 15, 9, 15, "#");
  return d.block("works", "structure", ["industrial"], ["den"]);
}

function scrapyard(): BlockData {
  const d = new Draw(16, 16, 2, 0, "-");
  d.put(0, 2, 2, 3, 3, "M").put(0, 7, 2, 9, 2, "M").put(0, 12, 3, 13, 4, "M");
  d.put(0, 3, 7, 4, 8, "M").put(0, 10, 8, 10, 9, "M").at(0, "M", [6, 11]);
  d.put(0, 6, 5, 7, 6, "C").put(0, 12, 10, 13, 11, "C").at(0, "C", [5, 13], [9, 13]);
  d.box(0, 1, 11, 3, 13, "c").box(1, 1, 11, 3, 13, "r").door(0, "e", "door", [3, 12]);
  d.put(0, 0, 15, 5, 15, "F").put(0, 10, 15, 15, 15, "F");
  return d.block("scrapyard", "open", ["industrial"]);
}

function timber(): BlockData {
  const d = new Draw(16, 8, 2, 0, "#");
  d.windows = 0;
  d.put(0, 1, 1, 2, 2, "J").put(0, 5, 1, 6, 2, "J").put(0, 9, 1, 10, 2, "J");
  d.at(0, "j", [1, 4], [2, 4], [6, 4]);
  d.box(0, 12, 0, 15, 3, "R").box(1, 12, 0, 15, 3, "r").doorRun(0, "s", "open", 12, 3, 15, 3);
  d.at(0, "J", [13, 1], [14, 1]);
  d.box(0, 0, 7, 15, 7, ".")
    .box(0, 4, 7, 9, 7, "#")
    .put(0, 0, 6, 3, 6, "F")
    .put(0, 10, 6, 15, 6, "F");
  return d.block("timber", "open", ["industrial"]);
}

/** A cold store (16 × 16) with the blood bank below it. */
function coldstore(): BlockData {
  const d = new Draw(16, 16, 3, 1, "#");
  d.windows = 4;
  d.box(1, 1, 1, 12, 9, "f").box(1, 1, 1, 5, 4, "R").box(1, 9, 6, 12, 9, "c");
  d.box(2, 1, 1, 12, 9, "r");
  d.at(1, "d", [1, 1], [2, 1], [4, 1], [5, 1]);
  d.door(1, "s", "door", [3, 4], [11, 9])
    .door(1, "s", "garage", [2, 9], [3, 9])
    .door(1, "w", "door", [9, 7]);
  d.box(0, 1, 1, 12, 9, "f").flight(0, 12, 4, 0, -1);
  d.put(0, 3, 2, 10, 2, "d").put(0, 3, 6, 10, 6, "d").at(0, ".", [6, 2], [7, 6]);
  d.at(0, "Q", [11, 8], [10, 8]);
  d.vehicle(1, 2, 11, true, "truck");
  d.box(1, 0, 15, 15, 15, ".").box(1, 9, 15, 13, 15, "#");
  return d.block("coldstore", "structure", ["industrial"], ["den", "haven"]);
}

/** Small workshop units (16 × 8): three roller doors on a yard. */
function units(): BlockData {
  const d = new Draw(16, 8, 2, 0, "#");
  d.windows = 4;
  d.box(0, 0, 0, 4, 4, "R")
    .box(0, 5, 0, 10, 4, "u")
    .box(0, 11, 0, 15, 4, "R")
    .box(1, 0, 0, 15, 4, "r");
  d.door(0, "s", "garage", [1, 4], [2, 4], [7, 4], [8, 4], [12, 4], [13, 4]);
  d.at(0, "G", [1, 1], [3, 2])
    .vehicle(0, 6, 1, false)
    .at(0, "Y", [15, 1], [15, 2])
    .at(0, "O", [11, 1]);
  d.box(0, 0, 7, 15, 7, ".")
    .box(0, 1, 7, 2, 7, "#")
    .box(0, 7, 7, 8, 7, "#")
    .box(0, 12, 7, 13, 7, "#");
  return d.block("units", "structure", ["industrial"], ["nest"]);
}

// ---------------------------------------------------------------------------
// Landmarks: hideouts a player names at a glance, used only as targets

/** A hospital (16 × 16): wards off a corridor on two floors, the lobby on the street, the morgue below. */
function hospital(): BlockData {
  const d = new Draw(16, 16, 4, 1, ".");
  for (const z of [1, 2]) {
    d.box(z, 1, 5, 14, 6, "f").box(z, 12, 1, 14, 4, "f");
    d.box(z, 1, 1, 4, 4, "i").box(z, 5, 1, 8, 4, "j").box(z, 9, 1, 11, 4, "i");
    d.door(z, "s", "door", [2, 4], [6, 4], [10, 4]);
    d.at(z, "Q", [1, 1], [3, 1], [5, 1], [7, 1], [9, 1], [11, 1]);
    d.box(z, 1, 7, 4, 11, "j").box(z, 11, 7, 14, 11, "i").door(z, "n", "door", [2, 7], [12, 7]);
    d.at(z, "Q", [1, 10], [3, 10], [12, 10], [14, 10]);
    if (z === 1) d.box(z, 5, 7, 10, 11, "f");
    else d.box(z, 5, 7, 10, 11, "i").door(z, "n", "door", [7, 7]).at(z, "Q", [5, 10], [8, 10]);
  }
  // The lobby: glass on the street, the reception desk, rows of seats.
  d.door(1, "s", "slide", [7, 11], [8, 11]).door(1, "s", "glass", [6, 11], [9, 11]);
  d.at(1, "K", [5, 9], [5, 10]).at(1, "e", [9, 8], [9, 9]);
  d.sign(1, 7, 11, "s", 4, "HOSPITAL", "#c02020", "#ffffff");
  // The morgue: cold drawers, slabs.
  d.box(0, 5, 1, 14, 8, "f").put(0, 5, 1, 10, 1, "d").at(0, "Q", [7, 4], [9, 4], [7, 6], [9, 6]);
  d.stairwell(12, 1, 0, 2);
  d.box(3, 1, 1, 14, 11, "r").put(3, 6, 4, 7, 5, "M");
  d.vehicle(1, 10, 13, true, "ambulance");
  return d.block("hospital", "structure", ["light", "dense"], ["nest", "den", "haven", "rescue"]);
}

/** A supermarket (16 × 16): checkouts behind a glass front, aisles, fridges, the stockroom; its car park. */
function supermarket(): BlockData {
  const d = new Draw(16, 16, 2, 0, "#");
  d.box(0, 1, 3, 14, 10, "k").box(0, 1, 1, 14, 2, "c").box(1, 1, 1, 14, 10, "r");
  d.door(0, "s", "door", [4, 2], [11, 2]).door(0, "n", "door", [7, 1]);
  for (const x of [3, 6, 9, 12]) d.put(0, x, 5, x, 7, "S");
  d.put(0, 2, 3, 13, 3, "d").at(0, ".", [4, 3], [11, 3]);
  d.at(0, "K", [4, 9], [7, 9], [10, 9]).at(0, "G", [2, 1], [13, 1]);
  d.doorRun(0, "s", "glass", 1, 10, 14, 10).door(0, "s", "slide", [7, 10], [8, 10]);
  d.sign(0, 7, 10, "s", 4, "MARKET", "#207a3a", "#ffffff");
  for (const x of [1, 3, 11, 13]) d.vehicle(0, x, 12, false);
  d.at(0, "G", [6, 12]).box(0, 0, 15, 15, 15, ".").box(0, 6, 15, 9, 15, "#");
  return d.block(
    "supermarket",
    "structure",
    ["light", "dense"],
    ["nest", "den", "haven", "rescue"],
  );
}

/** Blocks used only as a chosen target, never as filler. */
export const LANDMARKS: Record<"hospital" | "store", string> = {
  hospital: "hospital",
  store: "supermarket",
};

// ---------------------------------------------------------------------------

const CODE: BlockData[] = [
  hospital(),
  supermarket(),
  shop(),
  carpark(),
  tower("tower", 5, false),
  tower("tower-tall", 6, false),
  tower("hotel", 6, true),
  tenement("tenement", 4, false),
  tenement("tenement-b", 3, true),
  storage(),
  court(),
  bar(),
  warehouse(),
  containers(),
  tanks(),
  works(),
  scrapyard(),
  timber(),
  coldstore(),
  units(),
];

const drawn = new Map(BLOCKS.map(([, b]) => [b.id, b]));
/** Every block the generator can place. */
export const BANK: BlockData[] = [...CODE.filter((b) => !drawn.has(b.id)), ...drawn.values()];

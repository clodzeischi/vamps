// Drafting map blocks in code (docs/design/block-design.md): a first draft of a
// block is quicker to lay out room by room in a few calls than to paint, and
// variants come from options and mirroring. `npm run draft -- <terrain>` writes
// each draft to src/data/blocks/<id>.json through the format's own writer and
// prints the editor's checks; from then on the JSON is the block (the editor
// opens and saves it), and the runner won't overwrite one that's been changed
// since without --force.
import {
  edgeIndex,
  newBlock,
  type BlockData,
  type BlockMeta,
  type NodeRole,
  type Side,
} from "../../src/tactical/map/blocks";
import { furnitureSize, VEHICLE_LENGTH, type VehicleKind } from "../../src/tactical/map/map";

export type S = Side;
const D: Record<S, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
/** -0 to 0 (a mirrored or turned direction). */
const z0 = (v: number) => v || 0;

export class Draft {
  b: BlockData;
  /** Per level, a room number per tile (0: none): rooms of the same floor still get a wall between them. */
  private rooms: number[][];
  private next = 1;

  constructor(meta: BlockMeta, w: number, h: number, below: number, above: number, ground: string) {
    this.b = newBlock(meta, w, h, below, above);
    this.b.lv[below]!.floor.fill(ground);
    this.rooms = this.b.lv.map(() => Array<number>(w * h).fill(0));
  }
  private get w() {
    return this.b.w;
  }

  /** Ground or open floor (no room of its own). */
  fl(z: number, x0: number, y0: number, x1: number, y1: number, f: string) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        this.b.lv[z]!.floor[y * this.w + x] = f;
        this.rooms[z]![y * this.w + x] = 0;
      }
    return this;
  }
  /** A room: walled from its neighbours, even where they have the same floor. */
  room(z: number, x0: number, y0: number, x1: number, y1: number, f: string) {
    const id = this.next++;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        this.b.lv[z]!.floor[y * this.w + x] = f;
        this.rooms[z]![y * this.w + x] = id;
      }
    return this;
  }
  /** One-tile props ("high:tree", "low:crate"; "" clears). */
  ob(z: number, o: string, ...pts: [number, number][]) {
    for (const [x, y] of pts) this.b.lv[z]!.obj[y * this.w + x] = o;
    return this;
  }
  /** An edge exception on a side of each tile: door, garage, slide, window, glass, rail, open, wall. */
  edge(z: number, s: S, kind: string, ...pts: [number, number][]) {
    for (const [x, y] of pts) {
      const e = edgeIndex(this.w, x, y, D[s][0], D[s][1]);
      this.b.lv[z]![e.list][e.i] = kind;
    }
    return this;
  }
  /** A piece (tactical/map/pieces.ts) with its corner at (x, y), its front toward `face`. */
  piece(kind: string, x: number, y: number, z: number, face: S) {
    const [len, depth] = furnitureSize(kind);
    const [dx, dy] = D[face];
    const [w, h] = dy ? [len, depth] : [depth, len];
    this.b.furniture.push({ x, y, z, w, h, kind, dx, dy });
    return this;
  }
  /** A vehicle from its corner, long along x or y, its front toward + or − along that axis. */
  car(
    kind: VehicleKind,
    x: number,
    y: number,
    z: number,
    along: "x" | "y",
    front: 1 | -1,
    under = "dirt",
  ) {
    const len = VEHICLE_LENGTH[kind];
    this.b.vehicles.push({
      x,
      y,
      z,
      w: along === "x" ? len : 2,
      h: along === "x" ? 2 : len,
      kind,
      front,
      under: under as never,
      paint: -1,
    });
    return this;
  }
  /** An indoor flight (1 × 2) from its corner, going up toward `face`: its foot the tile behind, its head the tile past it, a level up. */
  flight(z: number, x: number, y: number, face: S) {
    const [dx, dy] = D[face];
    this.b.flights.push({ x, y, z, w: dy ? 1 : 2, h: dy ? 2 : 1, kind: "indoor", dx, dy });
    return this;
  }
  /** A lamp: on the wall on side `wall` of the tile (over a door), else a street lamp. */
  lamp(x: number, y: number, z: number, wall?: S) {
    this.b.lights.push({ x, y, z, ...(wall ? { wall: D[wall] } : {}) });
    return this;
  }
  ceiling(x: number, y: number, z: number) {
    this.b.lights.push({ x, y, z, ceiling: true });
    return this;
  }
  node(role: NodeRole, ...pts: [number, number, number][]) {
    for (const [x, y, z] of pts) this.b.nodes.push({ x, y, z, role });
    return this;
  }
  /** A run of one-tile props along a row, but for the gaps. */
  row(z: number, o: string, y: number, x0: number, x1: number, gaps: number[] = []) {
    for (let x = x0; x <= x1; x++) if (!gaps.includes(x)) this.ob(z, o, [x, y]);
    return this;
  }
  col(z: number, o: string, x: number, y0: number, y1: number, gaps: number[] = []) {
    for (let y = y0; y <= y1; y++) if (!gaps.includes(y)) this.ob(z, o, [x, y]);
    return this;
  }

  /** Mirrors the whole block left to right (a variant; never one with signs, which would read backwards). */
  mirror() {
    const { w } = this.b;
    const flipRows = (list: string[], width: number) => {
      const out: string[] = [];
      for (let i = 0; i < list.length; i += width) out.push(...list.slice(i, i + width).reverse());
      return out;
    };
    for (const L of this.b.lv) {
      L.floor = flipRows(L.floor, w);
      L.obj = flipRows(L.obj, w);
      L.ew = flipRows(L.ew, w + 1);
      L.ns = flipRows(L.ns, w);
    }
    this.rooms = this.rooms.map((r) => flipRows(r.map(String), w).map(Number));
    for (const f of this.b.furniture) Object.assign(f, { x: w - f.x - f.w, dx: z0(-f.dx) });
    for (const v of this.b.vehicles)
      Object.assign(v, { x: w - v.x - v.w, front: v.w > v.h ? -v.front : v.front });
    for (const f of this.b.flights) Object.assign(f, { x: w - f.x - f.w, dx: z0(-f.dx) });
    for (const l of this.b.lights) {
      l.x = w - 1 - l.x;
      if (l.wall) l.wall = [z0(-l.wall[0]), l.wall[1]];
      if (l.dir) l.dir = [z0(-l.dir[0]), l.dir[1]];
    }
    for (const n of this.b.nodes) n.x = w - 1 - n.x;
    for (const d of this.b.decor) Object.assign(d, { x: w - d.x, dx: z0(-d.dx) });
    const swap: Record<S, S> = { n: "n", s: "s", e: "w", w: "e" };
    this.b.entrances = (["n", "e", "s", "w"] as S[]).filter((k) =>
      this.b.entrances.includes(swap[k]),
    );
    return this;
  }

  /** The block: walls put between rooms of the same floor where nothing else is on the edge. */
  done(): BlockData {
    const { w, h } = this.b;
    this.b.lv.forEach((L, z) => {
      const R = this.rooms[z]!;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
          ] as const) {
            const nx = x + dx,
              ny = y + dy;
            if (nx >= w || ny >= h) continue;
            const a = R[y * w + x]!,
              c = R[ny * w + nx]!;
            if (!a || !c || a === c || L.floor[y * w + x] !== L.floor[ny * w + nx]) continue;
            const e = edgeIndex(w, x, y, dx, dy);
            if (!L[e.list][e.i]) L[e.list][e.i] = "wall";
          }
    });
    return this.b;
  }
}

export const meta = (
  id: string,
  name: string,
  terrains: BlockMeta["terrains"],
  type: BlockMeta["type"],
  entrances: S[],
  targets: BlockMeta["targets"],
  notes: string,
  variantOf?: string,
): BlockMeta => ({
  id,
  name,
  notes,
  terrains,
  type,
  entrances,
  targets,
  wallSet: [],
  ...(variantOf ? { variantOf } : {}),
});

/** Drafts by id. */
export type Drafts = Record<string, () => BlockData>;

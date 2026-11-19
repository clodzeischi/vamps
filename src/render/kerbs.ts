// Town kerbs (the look only; the rules see flat tiles). Roads sit KERB below
// the pavement, with a kerbstone along every edge where they meet, and the
// corners of the blocks on a junction rounded (radius KERB_R): the two tiles
// either side of the corner are cut by the curve, the corner tile itself
// mostly road.
import * as THREE from "three";
import { skinAt, T, tileAt, type BattleMap } from "../tactical/map";
import { KERB, KERB_R, KERB_W, SLAB, TILE } from "./scale";

/** A rounded corner: the block's corner point (metres, x and z) and the way out to the road (±1, ±1). */
export interface KerbCorner { x: number; z: number; sx: number; sz: number }
/** A straight kerbstone: its middle (metres), which way it runs, its length. */
export interface KerbRun { x: number; z: number; along: "x" | "z"; len: number }

export interface KerbPlan {
  /** Ground tiles whose surface is at road height (index y·w + x). */
  low: Uint8Array;
  /** Ground tiles under a rounded corner: their floor is drawn as road, the corner's pieces on top. */
  cut: Uint8Array;
  corners: KerbCorner[];
  runs: KerbRun[];
}

/** The kerbs of a map: none outside towns. */
export function kerbPlan(m: BattleMap, vehicleUnder: (x: number, y: number) => string | null): KerbPlan {
  const n = m.w * m.h, g = m.ground;
  const low = new Uint8Array(n), cut = new Uint8Array(n);
  const corners: KerbCorner[] = [], runs: KerbRun[] = [];
  if (m.setting !== "urban") return { low, cut, corners, runs };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  const road = (x: number, y: number) => inside(x, y) && (vehicleUnder(x, y) ?? skinAt(m, x, y, g)) === "road";
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (road(x, y)) low[y * m.w + x] = 1;
  // Rounded corners: a block's corner tile with road beside it both ways and
  // diagonally, and bare floor in the 2 × 2 tiles in from it.
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (road(x, y)) continue;
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          if (!road(x + sx, y) || !road(x, y + sy) || !road(x + sx, y + sy)) continue;
          const square = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => ({ x: x - i! * sx, y: y - j! * sy }));
          if (!square.every((p) => inside(p.x, p.y) && !road(p.x, p.y) && tileAt(m, p.x, p.y, g) === T.FLOOR)) continue;
          for (const p of square) cut[p.y * m.w + p.x] = 1;
          // The corner tile's middle is out past the curve: at road height.
          low[y * m.w + x] = 1;
          corners.push({ x: (x + (sx > 0 ? 1 : 0)) * TILE, z: (y + (sy > 0 ? 1 : 0)) * TILE, sx, sz: sy });
        }
    }
  // Straight kerbstones: on the pavement side of every edge between road and
  // not, except round a rounded corner (its curve has its own).
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (road(x, y) || cut[y * m.w + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!road(x + dx, y + dy) || cut[(y + dy) * m.w + x + dx]) continue;
        if (dx) runs.push({ x: (x + 0.5 + dx * 0.5) * TILE - dx * (KERB_W / 2), z: (y + 0.5) * TILE, along: "z", len: TILE });
        else runs.push({ x: (x + 0.5) * TILE, z: (y + 0.5 + dy * 0.5) * TILE - dy * (KERB_W / 2), along: "x", len: TILE });
      }
    }
  return { low, cut, corners, runs };
}

/** The road's surface, from a level's base: KERB under the pavement's. */
export const roadTop = (base: number) => base + SLAB - KERB;
/** A kerbstone stands proud of the pavement by this. */
const PROUD = 0.012;

/**
 * A rounded corner's two pieces, extruded up from the road: the pavement
 * (a quarter disc in from the curve) and the kerbstone round it.
 */
export function cornerGeometry(c: KerbCorner, base: number): { pavement: THREE.BufferGeometry; kerb: THREE.BufferGeometry } {
  const R = KERB_R, r = KERB_R - KERB_W, steps = 18;
  // Local (u, v): metres in from the corner point along each axis; the curve's centre is (R, R).
  const at = (u: number, v: number) => new THREE.Vector2(c.x - c.sx * u, -(c.z - c.sz * v));
  const arc = (rad: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * (Math.PI / 2);
    return at(R - rad * Math.cos(a), R - rad * Math.sin(a));
  });
  const pave = new THREE.Shape([at(R, R), ...arc(r)]);
  const kerb = new THREE.Shape([...arc(R), ...arc(r).reverse()]);
  const bottom = roadTop(base) - 0.02;
  const make = (shape: THREE.Shape, top: number) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bottom, 0);
    return geo;
  };
  return { pavement: make(pave, base + SLAB), kerb: make(kerb, base + SLAB + PROUD) };
}

/** A straight kerbstone as a box: middle, size (metres). */
export function runBox(k: KerbRun, base: number) {
  const bottom = roadTop(base) - 0.02, top = base + SLAB + PROUD;
  return {
    x: k.x, y: (bottom + top) / 2, z: k.z,
    sx: k.along === "x" ? k.len : KERB_W, sy: top - bottom, sz: k.along === "z" ? k.len : KERB_W,
  };
}

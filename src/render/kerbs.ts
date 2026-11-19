// Town kerbs (the look only; the rules see flat tiles). Roads and car parks
// sit KERB below the pavement, with a kerbstone along every edge where they
// meet (a car park's driveway crosses the pavement at road height), and the
// corners of the blocks on a junction rounded (radius KERB_R): the pavement
// tiles round the corner are cut by the curve, the corner tile itself mostly
// road. Grass or cobbles in the lot's corner round the same centre (LOT_R),
// so the pavement keeps its width; a building's corner stays square.
import * as THREE from "three";
import { isTown, skinAt, T, tileAt, type BattleMap } from "../tactical/map";
import { KERB, KERB_R, KERB_W, LOT_R, SLAB, TILE } from "./scale";
import type { Skin } from "../tactical/map";

/**
 * A rounded corner: the block's corner point (metres, x and z), the way out
 * to the road (±1, ±1), and the lot's corner tile's surface when it's rounded
 * too (grass or cobbles; null: square, a building or something standing there).
 */
export interface KerbCorner { x: number; z: number; sx: number; sz: number; lot: Skin | null }

/** Ground at road height: roads, and car parks (their driveways cross the pavement as a dropped kerb). */
const LOW_SKINS: ReadonlySet<Skin> = new Set<Skin>(["road", "tarmac"]);
/** Lot surfaces whose corner follows the kerb's curve. */
const ROUND_LOTS: ReadonlySet<Skin> = new Set<Skin>(["grass", "stone"]);
/** A straight kerbstone: its middle (metres), which way it runs, its length. */
export interface KerbRun { x: number; z: number; along: "x" | "z"; len: number }

export interface KerbPlan {
  /** Ground tiles whose surface is at road height (index y·w + x). */
  low: Uint8Array;
  /** Ground tiles under a rounded corner: their floor is drawn as road, the corner's pieces on top. */
  cut: Uint8Array;
  /** Lot corner tiles rounded with the kerb: no floor box, the corner's pieces instead. */
  lotCut: Uint8Array;
  corners: KerbCorner[];
  runs: KerbRun[];
}

/** The kerbs of a map: none outside towns. */
export function kerbPlan(m: BattleMap, vehicleUnder: (x: number, y: number) => string | null): KerbPlan {
  const n = m.w * m.h, g = m.ground;
  const low = new Uint8Array(n), cut = new Uint8Array(n), lotCut = new Uint8Array(n);
  const corners: KerbCorner[] = [], runs: KerbRun[] = [];
  if (!isTown(m.setting)) return { low, cut, lotCut, corners, runs };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h;
  const under = (x: number, y: number) => (inside(x, y) ? vehicleUnder(x, y) ?? skinAt(m, x, y, g) : null);
  const road = (x: number, y: number) => under(x, y) === "road";
  // Road height: the road, and car parks with their driveways (a dropped kerb onto the road).
  const isLow = (x: number, y: number) => LOW_SKINS.has(under(x, y) as Skin);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (isLow(x, y)) low[y * m.w + x] = 1;
  // Rounded corners: a block's corner tile with road beside it both ways and
  // diagonally, and bare floor in the pavement's 3 × 3 tiles in from it (the
  // ring two tiles wide; the ninth, in the middle of the curve, is the lot's).
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (road(x, y)) continue;
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          if (!road(x + sx, y) || !road(x, y + sy) || !road(x + sx, y + sy)) continue;
          const ring: { x: number; y: number }[] = [];
          for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (i < 2 || j < 2) ring.push({ x: x - i * sx, y: y - j * sy });
          if (!ring.every((p) => inside(p.x, p.y) && !isLow(p.x, p.y) && tileAt(m, p.x, p.y, g) === T.FLOOR)) continue;
          for (const p of ring) cut[p.y * m.w + p.x] = 1;
          // The corner tile's middle is out past the curve: at road height.
          low[y * m.w + x] = 1;
          const lx = x - 2 * sx, ly = y - 2 * sy;
          const lotSkin = skinAt(m, lx, ly, g);
          const round = inside(lx, ly) && tileAt(m, lx, ly, g) === T.FLOOR && ROUND_LOTS.has(lotSkin) && vehicleUnder(lx, ly) === null;
          if (round) lotCut[ly * m.w + lx] = 1;
          corners.push({ x: (x + (sx > 0 ? 1 : 0)) * TILE, z: (y + (sy > 0 ? 1 : 0)) * TILE, sx, sz: sy, lot: round ? lotSkin : null });
        }
    }
  // Straight kerbstones: on the pavement side of every edge between road and
  // not, except round a rounded corner (its curve has its own).
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (isLow(x, y) || cut[y * m.w + x]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!isLow(x + dx, y + dy) || cut[(y + dy) * m.w + x + dx]) continue;
        if (dx) runs.push({ x: (x + 0.5 + dx * 0.5) * TILE - dx * (KERB_W / 2), z: (y + 0.5) * TILE, along: "z", len: TILE });
        else runs.push({ x: (x + 0.5) * TILE, z: (y + 0.5 + dy * 0.5) * TILE - dy * (KERB_W / 2), along: "x", len: TILE });
      }
    }
  return { low, cut, lotCut, corners, runs };
}

/** The road's surface, from a level's base: KERB under the pavement's. */
export const roadTop = (base: number) => base + SLAB - KERB;
/** A kerbstone stands proud of the pavement by this. */
const PROUD = 0.012;

/**
 * A rounded corner's pieces, extruded up from the road: the kerbstone on the
 * curve, the pavement in from it, and, when the lot's corner is rounded too,
 * the lot's surface (a quarter disc round the same centre). Otherwise the
 * pavement stops square at the lot's corner tile.
 */
export function cornerGeometry(c: KerbCorner, base: number): { pavement: THREE.BufferGeometry; kerb: THREE.BufferGeometry; lot: THREE.BufferGeometry | null } {
  const R = KERB_R, r = KERB_R - KERB_W, steps = 24;
  // Local (u, v): metres in from the corner point along each axis; the curve's centre is (R, R).
  const at = (u: number, v: number) => new THREE.Vector2(c.x - c.sx * u, -(c.z - c.sz * v));
  const arc = (rad: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * (Math.PI / 2);
    return at(R - rad * Math.cos(a), R - rad * Math.sin(a));
  });
  const kerb = new THREE.Shape([...arc(R), ...arc(r).reverse()]);
  // The lot's corner tile is the last of the 3 × 3, from 2 tiles in to R.
  const inner = c.lot ? arc(LOT_R) : [at(R - TILE, R), at(R - TILE, R - TILE), at(R, R - TILE)];
  const pave = new THREE.Shape([...inner, ...arc(r).reverse()]);
  const bottom = roadTop(base) - 0.02;
  const make = (shape: THREE.Shape, top: number) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, bottom, 0);
    return geo;
  };
  return {
    pavement: make(pave, base + SLAB),
    kerb: make(kerb, base + SLAB + PROUD),
    lot: c.lot ? make(new THREE.Shape([at(R, R), ...arc(LOT_R)]), base + SLAB) : null,
  };
}

/** A straight kerbstone as a box: middle, size (metres). */
export function runBox(k: KerbRun, base: number) {
  const bottom = roadTop(base) - 0.02, top = base + SLAB + PROUD;
  return {
    x: k.x, y: (bottom + top) / 2, z: k.z,
    sx: k.along === "x" ? k.len : KERB_W, sy: top - bottom, sz: k.along === "z" ? k.len : KERB_W,
  };
}

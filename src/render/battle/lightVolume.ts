// Baked lamp light for the battlescape: a 3D grid of light over the whole map
// (a light volume), worked out once when the map loads. Each cell holds the
// light reaching it from every lamp in range, with a ray traced through the
// map's walls (windows and doorways let it through), floors (stairwells let
// it through), props and tree canopies. Materials read it in the shader at
// each surface (nudged off the surface along its normal), so walls, floors and
// moving units are all lit, and lamps cast shadows (the shader side is
// shaders/lamps.ts). The level never changes
// (no destructible terrain), so this is baked, not drawn per frame; fire adds
// its own light when it starts.
import * as THREE from "three";
import { E, edgeAt, glassDoor, skinAt, T, tileAt, type BattleMap } from "../../tactical/map/map";
import {
  DOOR_LINTEL,
  HIGH,
  LEVEL_H,
  lowProp,
  SILL,
  SLAB,
  TILE,
  TREE,
  VEHICLE_H,
  WINDOW_LINTEL,
} from "./scale";

/** Cells: a quarter of a tile across, a tenth of a level high. */
const PER_TILE = 4,
  PER_LEVEL = 10;
const CELL = TILE / PER_TILE,
  CELL_Y = LEVEL_H / PER_LEVEL;

export interface PointLight {
  x: number;
  y: number;
  z: number;
  colour: THREE.Color;
  /** Brightness (light on a surface 1 m away, before the falloff to its range). */
  power: number;
  /** Metres; nothing beyond. */
  range: number;
}

/** The volume's size in cells and its light (RGB, linear). */
export interface Volume {
  nx: number;
  ny: number;
  nz: number;
  rgb: Float32Array;
}

export function emptyVolume(m: BattleMap): Volume {
  const nx = m.w * PER_TILE,
    nz = m.h * PER_TILE,
    ny = m.levels * PER_LEVEL;
  return { nx, ny, nz, rgb: new Float32Array(nx * ny * nz * 3) };
}

// ---------------------------------------------------------------------------
// Occlusion: does a straight line reach the light?

/** Where along a ray (t from 0 to 1) it is inside a box, or null. */
function hitBox(
  o: number[],
  d: number[],
  lo: number[],
  hi: number[],
  t0: number,
  t1: number,
): boolean {
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]!) < 1e-9) {
      if (o[a]! < lo[a]! || o[a]! > hi[a]!) return false;
      continue;
    }
    let ta = (lo[a]! - o[a]!) / d[a]!,
      tb = (hi[a]! - o[a]!) / d[a]!;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** Something solid in tile (cx, cy) on the stretch of ray from t0 to t1: a floor slab, a whole-tile wall, a prop. */
function cellBlocks(
  m: BattleMap,
  cx: number,
  cy: number,
  o: number[],
  d: number[],
  t0: number,
  t1: number,
): boolean {
  const ya = o[1]! + d[1]! * t0,
    yb = o[1]! + d[1]! * t1;
  const lo = Math.min(ya, yb),
    hi = Math.max(ya, yb);
  const n0 = Math.max(0, Math.floor(lo / LEVEL_H)),
    n1 = Math.min(m.levels - 1, Math.floor(hi / LEVEL_H));
  const x0 = cx * TILE,
    z0 = cy * TILE,
    mx = x0 + TILE / 2,
    mz = z0 + TILE / 2;
  const box = (s: number, y0: number, y1: number) =>
    hitBox(o, d, [mx - s / 2, y0, mz - s / 2], [mx + s / 2, y1, mz + s / 2], t0, t1);
  for (let n = n0; n <= n1; n++) {
    const base = n * LEVEL_H;
    const t = tileAt(m, cx, cy, n);
    // The floor slab (none over a stairwell).
    if (t !== T.VOID && tileAt(m, cx, cy, n - 1) !== T.STAIRS && lo <= base + SLAB && hi >= base)
      return true;
    if (t === T.WALL && box(TILE, base, base + LEVEL_H)) return true;
    if (t === T.LOW) {
      const p = lowProp(skinAt(m, cx, cy, n));
      if (box(p.s, base, base + SLAB + p.h)) return true;
    } else if (t === T.HIGH) {
      if (skinAt(m, cx, cy, n) === "truck") {
        if (box(TILE, base, base + SLAB + VEHICLE_H.truck)) return true;
      } else if (skinAt(m, cx, cy, n) === "tree") {
        if (box(TILE, base + SLAB + TREE.canopyY0, base + SLAB + TREE.canopyY1)) return true;
        if (box(TREE.trunk, base, base + SLAB + TREE.trunkH)) return true;
      } else if (box(HIGH.s, base, base + SLAB + HIGH.h)) return true;
    }
  }
  return false;
}

/** The edge between (cx, cy) and its neighbour (dx, dy), crossed at height y: wall, or the solid parts of a window or doorway. */
function edgeBlocks(
  m: BattleMap,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  y: number,
): boolean {
  const n = Math.floor(y / LEVEL_H);
  if (n < 0 || n >= m.levels) return false;
  const h = y - n * LEVEL_H;
  const k = edgeAt(m, cx, cy, n, dx, dy);
  if (k === E.WALL || (k === E.SHUT && !glassDoor(m, cx, cy, n, dx, dy))) return h >= SLAB; // a closed door shuts light out like the wall (not a glass one)
  if (k === E.SHUT) return h > LEVEL_H - DOOR_LINTEL;
  if (k === E.WINDOW || k === E.SILL) return h < SLAB + SILL || h > LEVEL_H - WINDOW_LINTEL;
  if (k === E.DOOR) return h > LEVEL_H - DOOR_LINTEL;
  return false;
}

/** A clear line from p to the light at l (world metres), walked tile by tile. */
export function clear(m: BattleMap, p: number[], l: number[]): boolean {
  const d = [l[0]! - p[0]!, l[1]! - p[1]!, l[2]! - p[2]!];
  const u0 = p[0]! / TILE,
    v0 = p[2]! / TILE,
    du = d[0]! / TILE,
    dv = d[2]! / TILE;
  let cx = Math.floor(u0),
    cy = Math.floor(v0);
  const sx = du > 0 ? 1 : -1,
    sy = dv > 0 ? 1 : -1;
  const tdx = du !== 0 ? Math.abs(1 / du) : Infinity,
    tdy = dv !== 0 ? Math.abs(1 / dv) : Infinity;
  let tmx = du !== 0 ? (du > 0 ? cx + 1 - u0 : u0 - cx) * tdx : Infinity;
  let tmy = dv !== 0 ? (dv > 0 ? cy + 1 - v0 : v0 - cy) * tdy : Infinity;
  let t0 = 0;
  for (let guard = 0; guard < 256; guard++) {
    const t1 = Math.min(tmx, tmy, 1);
    if (cellBlocks(m, cx, cy, p, d, t0, t1)) return false;
    if (t1 >= 1) return true;
    const y = p[1]! + d[1]! * t1;
    if (tmx < tmy) {
      if (edgeBlocks(m, cx, cy, sx, 0, y)) return false;
      cx += sx;
      t0 = tmx;
      tmx += tdx;
    } else {
      if (edgeBlocks(m, cx, cy, 0, sy, y)) return false;
      cy += sy;
      t0 = tmy;
      tmy += tdy;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Baking

/** Adds one light to the volume: every cell in range with a clear line to it. */
export function addLight(m: BattleMap, v: Volume, L: PointLight) {
  const r = L.range;
  const ix0 = Math.max(0, Math.floor((L.x - r) / CELL)),
    ix1 = Math.min(v.nx - 1, Math.floor((L.x + r) / CELL));
  const iz0 = Math.max(0, Math.floor((L.z - r) / CELL)),
    iz1 = Math.min(v.nz - 1, Math.floor((L.z + r) / CELL));
  const iy0 = Math.max(0, Math.floor((L.y - r) / CELL_Y)),
    iy1 = Math.min(v.ny - 1, Math.floor((L.y + r) / CELL_Y));
  const l = [L.x, L.y, L.z];
  const p = [0, 0, 0];
  const { r: cr, g: cg, b: cb } = L.colour;
  for (let iy = iy0; iy <= iy1; iy++) {
    p[1] = (iy + 0.5) * CELL_Y;
    for (let iz = iz0; iz <= iz1; iz++) {
      p[2] = (iz + 0.5) * CELL;
      for (let ix = ix0; ix <= ix1; ix++) {
        p[0] = (ix + 0.5) * CELL;
        const dd = (p[0] - L.x) ** 2 + (p[1] - L.y) ** 2 + (p[2] - L.z) ** 2;
        if (dd >= r * r || !clear(m, p, l)) continue;
        // Inverse square, eased to nothing at the range (as Unreal and Frostbite do it).
        const f = 1 - (dd * dd) / (r * r * r * r);
        // Capped, so what nearly touches a lamp (a tree's crown) doesn't blaze.
        const a = Math.min(2, (L.power * f * f) / (dd + 1));
        const i = ((iy * v.nz + iz) * v.nx + ix) * 3;
        v.rgb[i] = v.rgb[i]! + cr * a;
        v.rgb[i + 1] = v.rgb[i + 1]! + cg * a;
        v.rgb[i + 2] = v.rgb[i + 2]! + cb * a;
      }
    }
  }
}

/** The volume as a texture (half floats, filtered); x across, then z, then up. */
export function volumeTexture(v: Volume, into?: THREE.Data3DTexture): THREE.Data3DTexture {
  const n = v.nx * v.ny * v.nz;
  const data =
    into && (into.image.data as Uint16Array).length === n * 4
      ? (into.image.data as Uint16Array)
      : new Uint16Array(n * 4);
  const one = THREE.DataUtils.toHalfFloat(1);
  for (let i = 0; i < n; i++) {
    data[i * 4] = THREE.DataUtils.toHalfFloat(v.rgb[i * 3]!);
    data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(v.rgb[i * 3 + 1]!);
    data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(v.rgb[i * 3 + 2]!);
    data[i * 4 + 3] = one;
  }
  if (into && into.image.data === data) {
    into.needsUpdate = true;
    return into;
  }
  // Texture axes: width along world x, height along world z, depth up.
  const tex = new THREE.Data3DTexture(data, v.nx, v.nz, v.ny);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.HalfFloatType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.ClampToEdgeWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

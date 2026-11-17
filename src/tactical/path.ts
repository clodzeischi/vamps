// Any-angle movement (docs/WEB_PORT.md 3.11): a unit walks straight from
// point to point wherever nothing stands between them, instead of zigzagging
// across tile centres. Theta* in battle.ts asks `walkLine` whether a straight
// walk is clear; `cellsAlong` lists the tiles such a walk passes over (for
// overwatch and pick-ups); `chaikin` rounds the corners of a path for drawing.
import { edgeOpen, type BattleMap, type Pt3 } from "./map";

/** Half the width of the corridor a straight walk needs (a unit isn't a point). */
export const CLEARANCE = 0.3;

/**
 * Walks a ray across the grid from (x0, y0) to (x1, y1) on level z, cell by
 * cell. `ok` is asked about every cell entered, and every edge crossed must
 * be open. Through a corner, both ways round it must be clear.
 */
function traverse(m: BattleMap, z: number, x0: number, y0: number, x1: number, y1: number, ok: (x: number, y: number) => boolean): boolean {
  let cx = Math.floor(x0), cy = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  if (!ok(cx, cy)) return false;
  const dx = x1 - x0, dy = y1 - y0;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
  let tx = dx ? (sx > 0 ? cx + 1 - x0 : x0 - cx) * tdx : Infinity;
  let ty = dy ? (sy > 0 ? cy + 1 - y0 : y0 - cy) * tdy : Infinity;
  const step = (x: number, y: number, ddx: number, ddy: number) => edgeOpen(m, x, y, z, ddx, ddy) && ok(x + ddx, y + ddy);
  for (let guard = Math.abs(ex - cx) + Math.abs(ey - cy) + 2; (cx !== ex || cy !== ey) && guard > 0; guard--) {
    if (Math.abs(tx - ty) < 1e-9) {
      if (!(step(cx, cy, sx, 0) && step(cx + sx, cy, 0, sy)) || !(step(cx, cy, 0, sy) && step(cx, cy + sy, sx, 0))) return false;
      cx += sx;
      cy += sy;
      tx += tdx;
      ty += tdy;
    } else if (tx < ty) {
      if (!step(cx, cy, sx, 0)) return false;
      cx += sx;
      tx += tdx;
    } else {
      if (!step(cx, cy, 0, sy)) return false;
      cy += sy;
      ty += tdy;
    }
  }
  return cx === ex && cy === ey;
}

/**
 * Can a unit walk straight from tile a to tile b (same level)? The middle
 * line and two lines either side of it (the unit's width) must cross only
 * tiles `ok` allows and open edges.
 */
export function walkLine(m: BattleMap, a: Pt3, b: Pt3, ok: (x: number, y: number) => boolean): boolean {
  if (a.z !== b.z) return false;
  const ax = a.x + 0.5, ay = a.y + 0.5, bx = b.x + 0.5, by = b.y + 0.5;
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1e-9) return true;
  const nx = (-(by - ay) / len) * CLEARANCE, ny = ((bx - ax) / len) * CLEARANCE;
  return traverse(m, a.z, ax, ay, bx, by, ok)
    && traverse(m, a.z, ax + nx, ay + ny, bx + nx, by + ny, ok)
    && traverse(m, a.z, ax - nx, ay - ny, bx - nx, by - ny, ok);
}

/** The tiles a straight walk from a to b enters, in order (b last; a not included). */
export function cellsAlong(a: Pt3, b: Pt3): Pt3[] {
  if (a.z !== b.z) return [{ ...b }];
  const out: Pt3[] = [];
  const x0 = a.x + 0.5, y0 = a.y + 0.5, x1 = b.x + 0.5, y1 = b.y + 0.5;
  let cx = a.x, cy = a.y;
  const dx = x1 - x0, dy = y1 - y0;
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx ? Math.abs(1 / dx) : Infinity, tdy = dy ? Math.abs(1 / dy) : Infinity;
  let tx = dx ? 0.5 * tdx : Infinity, ty = dy ? 0.5 * tdy : Infinity;
  for (let guard = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + 2; (cx !== b.x || cy !== b.y) && guard > 0; guard--) {
    if (Math.abs(tx - ty) < 1e-9) {
      cx += sx;
      cy += sy;
      tx += tdx;
      ty += tdy;
    } else if (tx < ty) {
      cx += sx;
      tx += tdx;
    } else {
      cy += sy;
      ty += tdy;
    }
    out.push({ x: cx, y: cy, z: a.z });
  }
  return out;
}

/** Length of a straight walk in tiles (a level change counts as its step cost, given by the caller). */
export const flat = (a: Pt3, b: Pt3) => Math.hypot(a.x - b.x, a.y - b.y);

export interface V3 { x: number; y: number; z: number }

/**
 * Chaikin's corner cutting: each pass replaces every corner with two points
 * a quarter of the way along its segments. Cuts are capped at `maxCut`, so a
 * long straight leg only has its ends rounded, never its middle pulled off
 * line (that could cut through a wall). The ends of the path stay put.
 */
export function chaikin(pts: V3[], passes = 3, maxCut = 0.45): V3[] {
  let out = pts;
  for (let k = 0; k < passes && out.length > 2; k++) {
    const next: V3[] = [out[0]!];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i]!, b = out[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const f = len > 0 ? Math.min(0.25, maxCut / len) : 0.25;
      const q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f };
      const r = { x: a.x + (b.x - a.x) * (1 - f), y: a.y + (b.y - a.y) * (1 - f), z: a.z + (b.z - a.z) * (1 - f) };
      if (i > 0) next.push(q);
      if (i < out.length - 2) next.push(r);
    }
    next.push(out.at(-1)!);
    out = next;
  }
  return out;
}

/** Chaikin on a closed loop (an outline): every corner rounded, no ends. */
export function chaikinLoop(pts: V3[], passes = 2): V3[] {
  let out = pts;
  for (let k = 0; k < passes && out.length > 2; k++) {
    const next: V3[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i]!, b = out[(i + 1) % out.length]!;
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    out = next;
  }
  return out;
}

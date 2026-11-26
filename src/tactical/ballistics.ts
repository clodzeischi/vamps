// Ballistic shots (docs/design/tactical.md, "Shooting"). There is no hit
// chance: a weapon has a base accuracy, the shooter's Combat and Insight
// tighten or widen it, and together they make a cone. Each round leaves the
// muzzle in a random direction inside that cone (a normal spread, σ the
// cone's angle) and flies on until it meets something: a wall, a sill, a
// prop, a floor, or a figure, friend or foe. Glass and windows it goes
// through break. What the player sees is the cone's CEP: the circle round the
// aim point that half the rounds land in.
//
// The AI still needs a number to weigh shots by, so `estimate` gives a rough
// trigonometric one: the share of a normal spread that falls on the target's
// exposed width and height at that distance. It ignores what's in the way.
//
// Space here is metres, the renderer's frame: x east, y up, z south (map y).
import {
  CHEST,
  FIGURE,
  LEVEL_H,
  LOW_STOPS,
  SHOULDER,
  SILL,
  SLAB,
  TILE,
  WINDOW_LINTEL,
  DOOR_LINTEL,
} from "./map/geometry";
import { E, edgeAt, inBounds, T, tileAt, skinAt, type BattleMap, type Pt3 } from "./map/map";
import { COVER_FULL, COVER_HALF } from "./map/map";
import { coverAgainst, coverAround, WEAPONS, type Crossing, type WeaponId } from "./rules";

/** A point in metres (x east, y up, z south). */
export interface M3 {
  x: number;
  y: number;
  z: number;
}

/** A figure a round can hit: where it stands and how big it is. */
export interface Figure extends Pt3 {
  id: string;
  h: number;
  r: number;
}

/** A tile point at this height above its floor, in metres. */
export const toWorld = (p: Pt3, h: number): M3 => ({
  x: (p.x + 0.5) * TILE,
  y: p.z * LEVEL_H + SLAB + h,
  z: (p.y + 0.5) * TILE,
});

/** Does a figure on this tile crouch (agents and thralls beside low cover, as drawn)? */
const crouches = (m: BattleMap, p: Pt3, kind: string) =>
  (kind === "agent" || kind === "thrall") && coverAround(m, p).some((c) => c === COVER_HALF);

/** A standing figure's height. */
const standingHeight = (kind: string) => (kind === "vampire" ? FIGURE.vampire : FIGURE.human);

/** A figure's height where it stands (crouched beside low cover). */
export const figureHeight = (m: BattleMap, p: Pt3, kind: string) =>
  standingHeight(kind) * (crouches(m, p, kind) ? FIGURE.crouch : 1);

// ---------------------------------------------------------------------------
// The cone

/** What shapes a shot: the aimed or burst mode, reaction fire, a shot from concealment. */
export type ShotMode = "snap" | "aimed" | "burst";
/** The cone grows or shrinks by these. */
const SPREAD_MODS = { aimed: 0.55, snap: 1, burst: 1.3, reaction: 1.5, concealed: 0.85 };

/**
 * A shooter's skill, 0 to 100: mostly Combat (an agent's aim is 50 +
 * Combat/2), some Insight (reading the target, the moment to fire).
 * Enemies have no Insight; their aim stands in for Combat.
 */
export function skill(s: { aim: number; insight?: number }): number {
  const combat = Math.max(0, Math.min(100, (s.aim - 50) * 2));
  return 0.7 * combat + 0.3 * Math.max(0, Math.min(100, s.insight ?? 0));
}

/** The skill's effect on the weapon's cone: from ×1.4 (no skill) to ×0.6 (a master). */
const skillFactor = (s: { aim: number; insight?: number }) => 1.4 - (0.8 * skill(s)) / 100;

/**
 * The cone's σ in radians: the weapon's base accuracy, by the shooter's
 * skill and the shot's circumstances.
 */
export function spread(
  s: { aim: number; insight?: number; weapon: WeaponId },
  mode: ShotMode = "snap",
  reaction = false,
  concealed = false,
): number {
  const w = WEAPONS[s.weapon];
  let k = skillFactor(s) * SPREAD_MODS[mode];
  if (reaction) k *= SPREAD_MODS.reaction;
  if (concealed && !reaction) k *= SPREAD_MODS.concealed;
  return (w.spread * k * Math.PI) / 180;
}

/** CEP: half the rounds land within this angle of the aim (a circular normal spread). */
const CEP_K = 1.1774;
/** The CEP's radius at a distance (metres). */
export const cepRadius = (sigma: number, dist: number) => dist * Math.tan(sigma * CEP_K);

// ---------------------------------------------------------------------------
// Aiming

/** Where a shooter's gun is, standing (a figure rises over low cover to fire). */
export const muzzle = (from: Pt3, kind: string): M3 =>
  toWorld(from, standingHeight(kind) * SHOULDER);

/** Roughly how high the cover facing a shooter stands (metres; 0: none). */
function coverTop(m: BattleMap, t: Pt3, from: Pt3): number {
  const c = coverAgainst(m, t, from).cover;
  return c === COVER_HALF ? 1.0 : c === COVER_FULL ? LEVEL_H : 0;
}

/**
 * Where a shot at a figure aims: the middle of what shows over its cover (its
 * chest when nothing's in front of it).
 */
export function aimPoint(m: BattleMap, t: Pt3, kind: string, from: Pt3): M3 {
  const h = figureHeight(m, t, kind);
  const top = coverTop(m, t, from);
  const y = top > 0 && top < h ? (top + h) / 2 : h * CHEST;
  return toWorld(t, y);
}

/** Where a forced shot at a tile aims: chest height of someone standing there. */
export const pointAim = (p: Pt3): M3 => toWorld(p, FIGURE.human * CHEST);

// ---------------------------------------------------------------------------
// The estimate (for the AI)

/** erf, to 1.5e-7 (Abramowitz and Stegun 7.1.26). */
function erf(x: number): number {
  const s = Math.sign(x),
    a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

/**
 * Roughly what share of rounds land on a figure: a normal spread of σ at
 * that distance over the figure's exposed width and height (what shows over
 * the cover facing the shooter; a sliver round full cover). A shotgun's
 * pellets each have their own chance; this is the chance at least one hits.
 */
export function estimate(
  m: BattleMap,
  sigma: number,
  weapon: WeaponId,
  from: Pt3,
  t: Pt3,
  kind: string,
): number {
  const w = WEAPONS[weapon];
  const a = muzzle(from, "agent"),
    b = toWorld(t, 1);
  const dist = Math.max(0.5, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  const h = figureHeight(m, t, kind);
  const top = coverTop(m, t, from);
  const exposed = top >= LEVEL_H ? 0.35 : Math.max(0.15, h - top);
  const width = 2 * FIGURE.radius;
  const one = (sig: number) => {
    const sd = Math.max(1e-6, dist * Math.tan(sig)) * Math.SQRT2;
    return erf(width / 2 / sd) * erf(exposed / 2 / sd);
  };
  if (!w.pellets) return one(sigma);
  const p = one(Math.hypot(sigma, ((w.pelletSpread ?? 0) * Math.PI) / 180));
  return 1 - (1 - p) ** w.pellets;
}

// ---------------------------------------------------------------------------
// One round

/** Where a round ended, what (if anyone) it hit, and the panes it broke on the way. */
interface Impact {
  at: M3;
  unit: string | null;
  panes: Crossing[];
}

/** Two normal deviates from a uniform source (Box–Muller). */
export function normals(next: () => number): [number, number] {
  const u = Math.max(1e-12, next()),
    v = next();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

/** A direction from `a` toward `b`, turned by small angles across (right) and up. */
export function deviate(a: M3, b: M3, across: number, up: number): M3 {
  let dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  ((dx /= len), (dy /= len), (dz /= len));
  // Right: d × up(0,1,0) = (-dz, 0, dx); then up' = right × d.
  let rx = -dz,
    rz = dx;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) ((rx = 1), (rz = 0));
  else ((rx /= rl), (rz /= rl));
  const ux = -rz * dy,
    uy = rz * dx - rx * dz,
    uz = rx * dy;
  const ta = Math.tan(across),
    tu = Math.tan(up);
  const ox = dx + rx * ta + ux * tu,
    oy = dy + uy * tu,
    oz = dz + rz * ta + uz * tu;
  const ol = Math.hypot(ox, oy, oz);
  return { x: ox / ol, y: oy / ol, z: oz / ol };
}

/** How far a round is followed (metres): it leaves the map or hits something long before. */
const RANGE = 80;
const STEP = 0.08;

/**
 * Follows a round from `a` along `dir` until it hits something. Glass and
 * whole windows it passes through are listed (they break); `skip` is the
 * shooter.
 */
export function trace(m: BattleMap, a: M3, dir: M3, figures: Figure[], skip: string): Impact {
  const panes: Crossing[] = [];
  const level = (y: number) => Math.floor(y / LEVEL_H);
  let px = Math.floor(a.x / TILE),
    py = Math.floor(a.z / TILE);
  const here = (t: number): M3 => ({ x: a.x + dir.x * t, y: a.y + dir.y * t, z: a.z + dir.z * t });
  /** Can the round cross from (x, y) one step (dx, dy) at height h within level z? Notes the glass it breaks. */
  const cross = (
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    h: number,
    broke: Crossing[],
  ): boolean => {
    const k = edgeAt(m, x, y, z, dx, dy);
    if (k === E.WALL || k === E.SHUT) return false;
    if (k === E.WINDOW || k === E.SILL) {
      if (h < SILL || h > LEVEL_H - SLAB - WINDOW_LINTEL) return false;
      if (k === E.WINDOW) broke.push({ x, y, z, dx, dy });
    } else if (k === E.GLASS) broke.push({ x, y, z, dx, dy });
    else if (k === E.RAIL && h < SILL)
      return false; // a railing stops what's low; over it is open
    else if (k === E.DOOR && h > LEVEL_H - SLAB - DOOR_LINTEL) return false;
    return true;
  };
  const stop = (t: number, unit: string | null = null): Impact => ({ at: here(t), unit, panes });
  for (let t = STEP; t <= RANGE; t += STEP) {
    const p = here(t);
    if (p.y < 0) return stop(t);
    const x = Math.floor(p.x / TILE),
      y = Math.floor(p.z / TILE),
      z = level(p.y);
    if (!inBounds(m, x, y, Math.max(0, Math.min(m.levels - 1, z))) || z >= m.levels + 1)
      return stop(t);
    const h = p.y - z * LEVEL_H - SLAB;
    // Walls, windows and doorways on the edges crossed since the last step.
    if (x !== px || y !== py) {
      if (x !== px && y !== py) {
        // Through a corner: whichever way round is open.
        const sx = x - px,
          sy = y - py,
          viaX: Crossing[] = [],
          viaY: Crossing[] = [];
        const okX = cross(px, py, z, sx, 0, h, viaX) && cross(x, py, z, 0, sy, h, viaX);
        const okY = cross(px, py, z, 0, sy, h, viaY) && cross(px, y, z, sx, 0, h, viaY);
        if (!okX && !okY) return stop(t);
        panes.push(...(okX ? viaX : viaY));
      } else if (!cross(px, py, z, x - px, y - py, h, panes)) return stop(t);
      px = x;
      py = y;
    }
    if (z < 0 || z >= m.levels) continue;
    const tile = tileAt(m, x, y, z);
    // A floor or a ceiling: the slab of a level that has a floor here (not a stairwell's).
    if (h < 0 && tile !== T.VOID && tileAt(m, x, y, z - 1) !== T.STAIRS) return stop(t);
    if (tile === T.VOID && z < m.ground) return stop(t); // solid earth below ground
    if (tile === T.WALL || tile === T.HIGH) return stop(t);
    if (tile === T.LOW && h < LOW_STOPS(skinAt(m, x, y, z))) return stop(t);
    // A figure.
    for (const f of figures) {
      if (f.id === skip || f.z !== z || h < 0 || h > f.h) continue;
      const fx = (f.x + 0.5) * TILE,
        fz = (f.y + 0.5) * TILE;
      if ((p.x - fx) ** 2 + (p.z - fz) ** 2 <= f.r * f.r) return stop(t, f.id);
    }
  }
  return stop(RANGE);
}

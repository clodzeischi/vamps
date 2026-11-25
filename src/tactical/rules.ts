// The tactical rules (docs/design/tactical.md): weapons, line of sight and
// directional cover. Plain functions over a map and positions, so the AI can
// ask "what if I stood there?". Shots themselves are ballistic
// (tactical/ballistics.ts): there's no hit chance.
import { canStep, COVER_FULL, COVER_HALF, edgeAt, EDGE_INFO, tileAt, TILE_INFO, T, type BattleMap, type Pt3 } from "./map";

export type WeaponId = "pistol" | "pistol-sd" | "smg" | "rifle" | "rifle-sd" | "shotgun" | "shotgun-semi" | "m249" | "m240b" | "m110" | "rpg" | "knife" | "claws";

interface WeaponDef {
  id: WeaponId;
  name: string;
  damage: [number, number];
  /**
   * Base accuracy: the cone's σ in degrees for an average shooter's snap
   * shot (tactical/ballistics.ts spread). Smaller is better.
   */
  spread: number;
  /** A shotgun: this many pellets, sharing the damage, each scattered a further `pelletSpread` degrees (σ). */
  pellets?: number;
  pelletSpread?: number;
  crit: number;
  /** Rounds before a reload (0: never reloads). */
  clip: number;
  melee: boolean;
  /** Rounds in a burst (0: no burst fire). */
  burst: number;
  /** Bursts only, no snap or aimed fire (machine guns). Reaction fire is still a single round. */
  burstOnly?: boolean;
  /**
   * An explosive round (a rocket): it flies like any other and goes off where
   * it stops, hurting everyone within `radius` tiles that the blast reaches
   * (not through walls): the damage in full at the centre, less further out.
   */
  blast?: { radius: number };
  /** Quiet: no one hears it, and a target that drops doesn't give a concealed team away. */
  suppressed?: boolean;
}

/**
 * Damage is in the same units as HP, and an agent's HP is their Vitality
 * (30–50 for a recruit). A rifle's 18–30 takes two hits to drop most agents;
 * a critical (×1.5) can do it in one. Every HP, damage and armour figure in
 * the battle is on this scale (×6 from the first draft's).
 */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { id: "pistol", name: "Pistol", damage: [12, 24], spread: 2.2, crit: 5, clip: 6, melee: false, burst: 0 },
  "pistol-sd": { id: "pistol-sd", name: "Suppressed pistol", damage: [10, 22], spread: 2.5, crit: 5, clip: 6, melee: false, burst: 0, suppressed: true },
  smg: { id: "smg", name: "SMG", damage: [12, 24], spread: 2.6, crit: 5, clip: 12, melee: false, burst: 3 },
  rifle: { id: "rifle", name: "Rifle", damage: [18, 30], spread: 1.1, crit: 10, clip: 8, melee: false, burst: 3 },
  "rifle-sd": { id: "rifle-sd", name: "Suppressed rifle", damage: [16, 28], spread: 1.3, crit: 10, clip: 8, melee: false, burst: 3, suppressed: true },
  shotgun: { id: "shotgun", name: "Pump shotgun", damage: [24, 36], spread: 1.6, pellets: 8, pelletSpread: 5, crit: 20, clip: 3, melee: false, burst: 0 },
  "shotgun-semi": { id: "shotgun-semi", name: "Semi-auto shotgun", damage: [22, 34], spread: 1.7, pellets: 8, pelletSpread: 5, crit: 20, clip: 6, melee: false, burst: 0 },
  m249: { id: "m249", name: "M249", damage: [18, 28], spread: 1.9, crit: 10, clip: 30, melee: false, burst: 6, burstOnly: true },
  m240b: { id: "m240b", name: "M240B", damage: [22, 34], spread: 2.1, crit: 10, clip: 28, melee: false, burst: 7, burstOnly: true },
  rpg: { id: "rpg", name: "Rocket launcher", damage: [30, 50], spread: 1.4, crit: 0, clip: 1, melee: false, burst: 0, blast: { radius: 2 } },
  m110: { id: "m110", name: "M110", damage: [26, 38], spread: 0.7, crit: 25, clip: 10, melee: false, burst: 0 },
  knife: { id: "knife", name: "Knife", damage: [6, 18], spread: 0, crit: 10, clip: 0, melee: true, burst: 0 },
  claws: { id: "claws", name: "Claws", damage: [18, 30], spread: 0, crit: 15, clip: 0, melee: true, burst: 0 },
};

/** How far anyone sees by day, or anything lit at night. */
export const SIGHT = 16;
/** In the dark below ground, where no moon reaches, how far a human sees what isn't lit. */
export const DARK_SIGHT = 9;
/** At night above ground, the same: from 7 tiles at new moon to 11 at full (`moon`: the lit share). */
export const nightSight = (moon: number) => Math.round(7 + 4 * moon);
/** Vampires see in the dark. */
export const VAMPIRE_SIGHT = 20;
/** How much each kind of cover is worth to the AI when it weighs a spot (a heuristic, not a rule). */
export const COVER_PENALTY = { [COVER_HALF]: 20, [COVER_FULL]: 40 } as Record<number, number>;
/** A round that hits a target with cover, none of it facing the shooter (flanked): this much more crit. */
export const FLANK_CRIT = 40;
/** A level's height in tiles, for distances and sight lines. */
const LEVEL_TILES = 1.5;

export const distance = (a: Pt3, b: Pt3) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * LEVEL_TILES);

/** Height of the eyes (and the target's chest) within a level, in level units. */
const EYE = 0.6;

/** Does a wall stand on the edge crossed going from cell (x0, y0) to the 4-neighbour (x1, y1)? */
const opaqueEdge = (m: BattleMap, x0: number, y0: number, x1: number, y1: number, z: number) => EDGE_INFO[edgeAt(m, x0, y0, z, x1 - x0, y1 - y0)].opaque;

/**
 * Whether there's a clear line between two tiles' occupants: nothing opaque
 * on the way (walls on the edges, whole-tile walls, trees; windows and low
 * cover don't block it), and no floor or ceiling crossed where one exists.
 * Passing exactly through a corner, the line is blocked only if both ways
 * round it are.
 */
export function lineOfSight(m: BattleMap, a: Pt3, b: Pt3): boolean {
  return trace(m, a, b);
}

/** An edge a line crosses: from tile (x, y) on level z one step (dx, dy). */
export interface Crossing { x: number; y: number; z: number; dx: number; dy: number }

/** lineOfSight's walk. */
function trace(m: BattleMap, a: Pt3, b: Pt3): boolean {
  const ax = a.x + 0.5, ay = a.y + 0.5, az = a.z + EYE;
  const bx = b.x + 0.5, by = b.y + 0.5, bz = b.z + EYE;
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay, (bz - az) * LEVEL_TILES) * 5) + 1;
  let level = a.z;
  let cx = a.x, cy = a.y;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = ax + (bx - ax) * t, py = ay + (by - ay) * t, pz = az + (bz - az) * t;
    const x = Math.floor(px), y = Math.floor(py), z = Math.floor(pz);
    // Edges crossed on the way from the last cell to this one, on the level the line is at.
    if (x !== cx || y !== cy) {
      const lz = Math.min(level, z);
      if (x !== cx && y !== cy) {
        const viaX = opaqueEdge(m, cx, cy, x, cy, lz) || opaqueEdge(m, x, cy, x, y, lz);
        const viaY = opaqueEdge(m, cx, cy, cx, y, lz) || opaqueEdge(m, cx, y, x, y, lz);
        if (viaX && viaY) return false;
      } else if (opaqueEdge(m, cx, cy, x, y, lz)) return false;
      cx = x;
      cy = y;
    }
    if (i === steps) break;
    if (z !== level) {
      // Crossing between levels: blocked by the floor of the upper one, unless it's a stairwell.
      const upper = Math.max(z, level);
      const slab = tileAt(m, x, y, upper) !== T.VOID && tileAt(m, x, y, upper - 1) !== T.STAIRS;
      if (slab) return false;
      level = z;
    }
    if ((x === a.x && y === a.y && z === a.z) || (x === b.x && y === b.y && z === b.z)) continue;
    if (TILE_INFO[tileAt(m, x, y, z)].opaque) return false;
  }
  return true;
}

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/**
 * A lean: a unit behind full cover (a wall, a tree, a truck) on side `cover`
 * leans out one step to `side`, round the cover's end, to look, shoot or
 * throw. Only where the cover ends: the tile leant into must not have the
 * same full cover on that side, and the step must be open.
 */
interface Lean {
  at: Pt3;
  cover: readonly [number, number];
  side: readonly [number, number];
}

export function leans(m: BattleMap, p: Pt3): Lean[] {
  const around = coverAround(m, p);
  const out: Lean[] = [];
  DIRS4.forEach(([dx, dy], i) => {
    if (around[i] !== COVER_FULL) return;
    for (const [sx, sy] of [[dy, -dx], [-dy, dx]] as const) {
      if (!canStep(m, p.x, p.y, p.z, sx, sy)) continue;
      const at = { x: p.x + sx, y: p.y + sy, z: p.z };
      if (coverAround(m, at)[i]! >= COVER_FULL) continue; // the cover goes on: no end to lean round
      out.push({ at, cover: [dx, dy], side: [sx, sy] });
    }
  });
  return out;
}

/**
 * Where a unit at `a` sees `b` from: `a` itself if the line is clear, else
 * the lean round cover facing `b` with a clear line (the one nearer `b` if
 * both sides have one), else null. Range is the caller's to check.
 */
export function sightPoint(m: BattleMap, a: Pt3, b: Pt3): Pt3 | null {
  if (lineOfSight(m, a, b)) return a;
  let best: Pt3 | null = null, bestD = Infinity;
  for (const l of leans(m, a)) {
    if ((b.x - a.x) * l.cover[0] + (b.y - a.y) * l.cover[1] <= 0) continue; // only round the cover between
    if (!lineOfSight(m, l.at, b)) continue;
    const d = distance(l.at, b);
    if (d < bestD) (best = l.at), (bestD = d);
  }
  return best;
}

/** Within `sight` (measured from where the unit stands) and seen, directly or leaning out. */
export const canSee = (m: BattleMap, a: Pt3, b: Pt3, sight = SIGHT) => distance(a, b) <= sight && sightPoint(m, a, b) !== null;

/** The cover a tile has from each side (index matches DIRS4): the edge between, or the tile beyond, whichever gives more. */
export function coverAround(m: BattleMap, p: Pt3): number[] {
  return DIRS4.map(([dx, dy]) => Math.max(EDGE_INFO[edgeAt(m, p.x, p.y, p.z, dx, dy)].cover, TILE_INFO[tileAt(m, p.x + dx, p.y + dy, p.z)].cover));
}

/**
 * Cover the target has against a shooter: the best piece of cover on a side
 * facing the shooter. Flanked: it has cover, but none of it faces the shooter.
 */
export function coverAgainst(m: BattleMap, target: Pt3, from: Pt3): { cover: number; flanked: boolean } {
  const vx = from.x - target.x, vy = from.y - target.y;
  const len = Math.hypot(vx, vy);
  const around = coverAround(m, target);
  const any = around.some((c) => c > 0);
  if (len < 0.01) return { cover: 0, flanked: false };
  let best = 0;
  DIRS4.forEach(([dx, dy], i) => {
    // The cover faces the shooter if the shooter is ahead of it, within about 70° of straight on.
    if (around[i]! > best && (vx * dx + vy * dy) / len >= 0.34) best = around[i]!;
  });
  return { cover: best, flanked: any && best === 0 };
}

/** A shot's worth to the AI (tactical/ballistics.ts estimate): the share of rounds that land, and the crit. */
export interface ShotOdds {
  /** Percent of rounds that land, roughly (not shown to the player). */
  chance: number;
  crit: number;
  flanked: boolean;
  inRange: boolean;
}

/** Within arm's reach: one step away on the same level, with no wall, window or prop between (no reaching round a corner either). */
export function adjacent(m: BattleMap, a: Pt3, b: Pt3): boolean {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (a.z !== b.z || Math.abs(dx) > 1 || Math.abs(dy) > 1 || (!dx && !dy)) return false;
  return canStep(m, a.x, a.y, a.z, dx, dy);
}

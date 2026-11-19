// The tactical rules (docs/WEB_PORT.md 3.11): weapons, line of sight,
// directional cover and the hit chance. Plain functions over a map and
// positions, so the AI can ask "what if I stood there?".
import { COVER_FULL, COVER_HALF, edgeAt, EDGE_INFO, tileAt, TILE_INFO, T, type BattleMap, type Pt3 } from "./map";

export type WeaponId = "pistol" | "pistol-sd" | "smg" | "rifle" | "rifle-sd" | "shotgun" | "knife" | "claws";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  damage: [number, number];
  /** No range penalty from `near` to `far` tiles; outside, so much a tile. */
  near: number;
  far: number;
  nearPenalty: number;
  farPenalty: number;
  /** Extra aim within 2 tiles. */
  close: number;
  crit: number;
  /** Rounds before a reload (0: never reloads). */
  clip: number;
  melee: boolean;
  /** Rounds in a burst (0: no burst fire). */
  burst: number;
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
  pistol: { id: "pistol", name: "Pistol", damage: [12, 24], near: 0, far: 7, nearPenalty: 0, farPenalty: 4, close: 5, crit: 5, clip: 6, melee: false, burst: 0 },
  "pistol-sd": { id: "pistol-sd", name: "Suppressed pistol", damage: [10, 22], near: 0, far: 7, nearPenalty: 0, farPenalty: 4, close: 5, crit: 5, clip: 6, melee: false, burst: 0, suppressed: true },
  smg: { id: "smg", name: "SMG", damage: [12, 24], near: 0, far: 9, nearPenalty: 0, farPenalty: 5, close: 10, crit: 5, clip: 12, melee: false, burst: 3 },
  rifle: { id: "rifle", name: "Rifle", damage: [18, 30], near: 2, far: 13, nearPenalty: 5, farPenalty: 3, close: 0, crit: 10, clip: 8, melee: false, burst: 3 },
  "rifle-sd": { id: "rifle-sd", name: "Suppressed rifle", damage: [16, 28], near: 2, far: 12, nearPenalty: 5, farPenalty: 3, close: 0, crit: 10, clip: 8, melee: false, burst: 3, suppressed: true },
  shotgun: { id: "shotgun", name: "Shotgun", damage: [24, 36], near: 0, far: 4, nearPenalty: 0, farPenalty: 7, close: 15, crit: 20, clip: 3, melee: false, burst: 0 },
  knife: { id: "knife", name: "Knife", damage: [6, 18], near: 0, far: 1.5, nearPenalty: 0, farPenalty: 100, close: 0, crit: 10, clip: 0, melee: true, burst: 0 },
  claws: { id: "claws", name: "Claws", damage: [18, 30], near: 0, far: 1.5, nearPenalty: 0, farPenalty: 100, close: 0, crit: 15, clip: 0, melee: true, burst: 0 },
};

/** How far anyone sees by day, or anything lit at night. */
export const SIGHT = 16;
/** At night, how far a human sees what isn't lit. */
export const NIGHT_SIGHT = 9;
/** Vampires see in the dark. */
export const VAMPIRE_SIGHT = 20;
/** Penalties and bonuses in the hit chance. */
export const COVER_PENALTY = { [COVER_HALF]: 20, [COVER_FULL]: 40 } as Record<number, number>;
export const HEIGHT_BONUS = 10;
export const REACTION_PENALTY = 15;
export const FLANK_CRIT = 40;
/** A level's height in tiles, for distances and sight lines. */
export const LEVEL_TILES = 1.5;

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

export const canSee = (m: BattleMap, a: Pt3, b: Pt3, sight = SIGHT) => distance(a, b) <= sight && lineOfSight(m, a, b);

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

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

export interface Shooter extends Pt3 {
  aim: number;
  weapon: WeaponId;
}
export interface Target extends Pt3 {
  /** A bonus to dodge (none yet). */
  defence?: number;
}

export interface Modifier {
  label: string;
  value: number;
}

export interface ShotOdds {
  chance: number;
  crit: number;
  /** Why: aim, range, cover, height. */
  why: Modifier[];
  flanked: boolean;
  inRange: boolean;
}

export function rangeModifier(w: WeaponDef, d: number): number {
  if (d < w.near) return -Math.round((w.near - d) * w.nearPenalty);
  if (d > w.far) return -Math.round((d - w.far) * w.farPenalty);
  return d <= 2 ? w.close : 0;
}

/** The chance to hit (and crit) a target from where the shooter stands. Assumes it can see the target. */
export function shotOdds(m: BattleMap, s: Shooter, t: Target, reaction = false, extra: Modifier[] = [], critBonus = 0): ShotOdds {
  const w = WEAPONS[s.weapon];
  const d = distance(s, t);
  const why: Modifier[] = [{ label: "Aim", value: s.aim }, ...extra];
  let crit = w.crit + critBonus;
  let flanked = false;
  if (w.melee) {
    const inRange = d <= w.far && s.z === t.z;
    return { chance: inRange ? clamp(why.reduce((a, x) => a + x.value, 0)) : 0, crit, why, flanked: false, inRange };
  }
  const r = rangeModifier(w, d);
  if (r) why.push({ label: r > 0 ? "Close range" : "Range", value: r });
  const c = coverAgainst(m, t, s);
  if (c.cover) why.push({ label: c.cover === COVER_FULL ? "Full cover" : "Half cover", value: -COVER_PENALTY[c.cover]! });
  if (c.flanked) {
    flanked = true;
    crit += FLANK_CRIT;
  }
  if (t.defence) why.push({ label: "Defence", value: -t.defence });
  if (s.z > t.z) why.push({ label: "Height", value: HEIGHT_BONUS });
  if (reaction) {
    why.push({ label: "Reaction shot", value: -REACTION_PENALTY });
    crit = 0;
  }
  const raw = why.reduce((a, x) => a + x.value, 0);
  return { chance: clamp(raw), crit: Math.max(0, Math.min(100, crit)), why, flanked, inRange: d <= SIGHT };
}

const clamp = (v: number) => Math.max(5, Math.min(95, Math.round(v)));

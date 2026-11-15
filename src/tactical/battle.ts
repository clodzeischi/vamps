// A battle (docs/WEB_PORT.md 3.11): units on a map, two actions a turn, the
// player's side then the enemy's. Every command returns the events it caused
// (moves, shots, deaths) for the view to play back; the state is already
// final when it returns.
import { RECRUIT_STAT_RANGES } from "../data/agents";
import { rng, type Rng } from "../sim/rng";
import { idx, inBounds, neighbours, T, tileAt, walkable, type BattleMap, type Pt3 } from "./map";
import { canSee, distance, shotOdds, WEAPONS, type ShotOdds, type WeaponId } from "./rules";
import { enemyTurn } from "./ai";

export type UnitKind = "agent" | "thrall" | "vampire" | "civilian";
export type Side = "agent" | "enemy" | "neutral";

export interface Unit extends Pt3 {
  id: string;
  kind: UnitKind;
  side: Side;
  name: string;
  hp: number;
  maxHp: number;
  aim: number;
  /** Tiles one action's move covers (a dash: twice). */
  mobility: number;
  /** Taken off every hit. */
  armour: number;
  weapon: WeaponId;
  ammo: number;
  /** Actions left this turn (0–2). */
  ap: number;
  overwatch: boolean;
  hunkered: boolean;
  alive: boolean;
  evacuated: boolean;
  /** Enemies: has it noticed the team? */
  alerted: boolean;
  /** Enemies that start together and wake together. */
  pod: number;
  /** Radians; 0 faces +x. */
  facing: number;
}

export type BattleResult = "won" | "lost" | "aborted";

export type BattleEvent =
  | { kind: "move"; unit: string; path: Pt3[]; seen: boolean }
  | { kind: "shot"; unit: string; target: string; hit: boolean; crit: boolean; damage: number; chance: number; reaction: boolean; melee: boolean; seen: boolean }
  | { kind: "death"; unit: string }
  | { kind: "status"; unit: string; text: string; seen: boolean }
  | { kind: "turn"; side: Side; turn: number }
  | { kind: "end"; result: BattleResult };

export interface Battle {
  map: BattleMap;
  units: Unit[];
  turn: number;
  side: "agent" | "enemy";
  rng: number;
  result: BattleResult | null;
}

// ---------------------------------------------------------------------------
// Setting up

const AGENT_NAMES = ["Br. Tomasz", "Sr. Ines", "Fr. Malik", "Sr. Kateri", "Br. Anselm", "Sr. Miriam", "Fr. Diego", "Br. Kofi"];

/** Groups spawns standing near each other into pods. */
function pods(points: Pt3[]): number[] {
  const out = points.map(() => -1);
  let next = 0;
  points.forEach((_, i) => {
    if (out[i]! >= 0) return;
    out[i] = next;
    const stack = [i];
    while (stack.length) {
      const j = stack.pop()!;
      points.forEach((q, k) => {
        if (out[k]! < 0 && distance(points[j]!, q) <= 6) {
          out[k] = next;
          stack.push(k);
        }
      });
    }
    next++;
  });
  return out;
}

/** A skirmish: four agents at the landing zone against the map's spawns. */
export function newSkirmish(map: BattleMap, seed: number): Battle {
  const r = rng({ rng: seed ^ 0x5bd1e995 });
  const units: Unit[] = [];
  const weapons: WeaponId[] = ["rifle", "rifle", "shotgun", "pistol"];
  const stat = (k: keyof typeof RECRUIT_STAT_RANGES) => r.int(...RECRUIT_STAT_RANGES[k]);
  weapons.forEach((weapon, i) => {
    const p = map.lz[[4, 0, 2, 6][i]!]!;
    const combat = stat("combat"), vitality = stat("vitality");
    const hp = 3 + Math.round(vitality / 10);
    units.push(unit({ id: `a${i}`, kind: "agent", side: "agent", name: AGENT_NAMES[(seed + i) % AGENT_NAMES.length]!, ...p, hp, maxHp: hp, aim: 40 + Math.round(combat / 2), mobility: 7, armour: 1, weapon, alerted: true }));
  });
  const enemies = map.spawns.filter((s) => s.side !== "civilian");
  const pod = pods(enemies);
  enemies.forEach((s, i) => {
    const vampire = s.side === "vampire";
    const weapon: WeaponId = vampire ? "claws" : r.pick<WeaponId>(["pistol", "pistol", "rifle", "shotgun"]);
    const hp = vampire ? 10 : r.int(4, 5);
    units.push(unit({ id: `e${i}`, kind: vampire ? "vampire" : "thrall", side: "enemy", name: vampire ? "Vampire" : "Thrall", x: s.x, y: s.y, z: s.z, hp, maxHp: hp, aim: vampire ? 75 : 55, mobility: vampire ? 9 : 6, armour: 0, weapon, pod: pod[i]!, facing: r.real(0, Math.PI * 2) }));
  });
  map.spawns.filter((s) => s.side === "civilian").forEach((s, i) => {
    units.push(unit({ id: `c${i}`, kind: "civilian", side: "neutral", name: "Civilian", x: s.x, y: s.y, z: s.z, hp: 3, maxHp: 3, aim: 0, mobility: 5, armour: 0, weapon: "pistol", ammo: 0 }));
  });
  return { map, units, turn: 1, side: "agent", rng: r.int(1, 2 ** 31), result: null };
}

function unit(u: Partial<Unit> & Pick<Unit, "id" | "kind" | "side" | "name" | "x" | "y" | "z" | "hp" | "maxHp" | "aim" | "mobility" | "armour" | "weapon">): Unit {
  return { ammo: WEAPONS[u.weapon].clip, ap: 2, overwatch: false, hunkered: false, alive: true, evacuated: false, alerted: false, pod: -1, facing: 0, ...u };
}

// ---------------------------------------------------------------------------
// Queries

export const battleRng = (b: Battle): Rng => rng(b);
export const unitById = (b: Battle, id: string) => b.units.find((u) => u.id === id);
export const onMap = (u: Unit) => u.alive && !u.evacuated;
export const agents = (b: Battle) => b.units.filter((u) => u.side === "agent" && onMap(u));
export const enemies = (b: Battle) => b.units.filter((u) => u.side === "enemy" && onMap(u));
export const unitAt = (b: Battle, p: Pt3) => b.units.find((u) => onMap(u) && u.x === p.x && u.y === p.y && u.z === p.z);
export const hostile = (a: Unit, c: Unit) => a.side !== "neutral" && c.side !== "neutral" && a.side !== c.side;

/** Enemies any agent can see (what the player is shown). */
export function seenByAgents(b: Battle, p: Pt3): boolean {
  return agents(b).some((a) => canSee(b.map, a, p));
}

/** Units of the other side this unit can see. */
export const visibleFoes = (b: Battle, u: Unit, from: Pt3 = u) => b.units.filter((o) => onMap(o) && hostile(u, o) && canSee(b.map, from, o));

/** Odds of `u` shooting `t`, from where `u` stands (or `from`). */
export function oddsAgainst(b: Battle, u: Unit, t: Unit, from: Pt3 = u, reaction = false): ShotOdds {
  return shotOdds(b.map, { ...from, aim: u.aim, weapon: u.weapon }, t, reaction);
}

// ---------------------------------------------------------------------------
// Movement

export interface Reach {
  /** Movement cost to each reached tile index. */
  cost: Map<number, number>;
  prev: Map<number, number>;
}

const stepCost = (a: Pt3, b: Pt3) => (a.z !== b.z ? 2 : a.x !== b.x && a.y !== b.y ? 1.5 : 1);

/** Where a unit can walk within `budget` (Dijkstra; friends can be walked past, not stood on). */
export function reach(b: Battle, u: Unit, budget = u.mobility * Math.min(2, u.ap)): Reach {
  const m = b.map;
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const start = idx(m, u.x, u.y, u.z);
  cost.set(start, 0);
  const blocked = new Set<number>();
  for (const o of b.units) if (onMap(o) && o !== u && (hostile(u, o) || o.side === "neutral")) blocked.add(idx(m, o.x, o.y, o.z));
  const open: [number, number][] = [[0, start]];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]![0] < open[bi]![0]) bi = i;
    const [c, i] = open.splice(bi, 1)[0]!;
    if (c > (cost.get(i) ?? Infinity)) continue;
    const p = fromIdx(m, i);
    for (const n of neighbours(m, p)) {
      const j = idx(m, n.x, n.y, n.z);
      if (blocked.has(j)) continue;
      const nc = c + stepCost(p, n);
      if (nc > budget || nc >= (cost.get(j) ?? Infinity)) continue;
      cost.set(j, nc);
      prev.set(j, i);
      open.push([nc, j]);
    }
  }
  return { cost, prev };
}

export function fromIdx(m: BattleMap, i: number): Pt3 {
  const x = i % m.w;
  const y = Math.floor(i / m.w) % m.h;
  const z = Math.floor(i / (m.w * m.h));
  return { x, y, z };
}

export function pathTo(b: Battle, r: Reach, to: Pt3): Pt3[] | null {
  const m = b.map;
  let i = idx(m, to.x, to.y, to.z);
  if (!r.cost.has(i)) return null;
  const out: Pt3[] = [];
  while (r.prev.has(i)) {
    out.unshift(fromIdx(m, i));
    i = r.prev.get(i)!;
  }
  return out;
}

/** Actions a move of this cost takes, or 0 if the unit can't make it. */
export function moveActions(u: Unit, cost: number): number {
  if (cost <= u.mobility && u.ap >= 1) return 1;
  if (cost <= u.mobility * 2 && u.ap >= 2) return 2;
  return 0;
}

/** Can a unit end a move here (walkable, nobody standing there)? */
export const canStand = (b: Battle, p: Pt3) => inBounds(b.map, p.x, p.y, p.z) && walkable(b.map, p.x, p.y, p.z) && !unitAt(b, p);

const face = (u: Unit, to: Pt3) => {
  if (to.x !== u.x || to.y !== u.y) u.facing = Math.atan2(to.y - u.y, to.x - u.x);
};

/**
 * Walks a unit along a path, tile by tile. Overwatch fires at it as it
 * comes into view; a hit can stop it dead. Enemies who see an agent wake up.
 */
export function walk(b: Battle, u: Unit, path: Pt3[]): BattleEvent[] {
  const events: BattleEvent[] = [];
  let seg: Pt3[] = [];
  const seen = (p: Pt3) => u.side === "agent" || seenByAgents(b, p);
  let segSeen = seen(u);
  const flush = () => {
    if (seg.length) events.push({ kind: "move", unit: u.id, path: seg, seen: segSeen });
    seg = [];
    segSeen = seen(u);
  };
  for (const p of path) {
    face(u, p);
    u.x = p.x;
    u.y = p.y;
    u.z = p.z;
    seg.push({ ...p });
    if (seen(p)) segSeen = true;
    // Overwatch from the other side.
    for (const w of b.units) {
      if (!onMap(w) || !w.overwatch || !hostile(w, u) || !canSee(b.map, w, u)) continue;
      flush();
      w.overwatch = false;
      events.push(...fire(b, w, u, true));
      if (!u.alive) return events;
    }
    if (u.side === "agent") events.push(...wakeWhoSees(b, u));
  }
  flush();
  return events;
}

/** Enemies who can see this agent notice it, and so does the rest of their pod. */
function wakeWhoSees(b: Battle, a: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b)) if (!e.alerted && canSee(b.map, e, a)) events.push(...alertPod(b, e.pod));
  return events;
}

export function alertPod(b: Battle, pod: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b))
    if (!e.alerted && e.pod === pod) {
      e.alerted = true;
      events.push({ kind: "status", unit: e.id, text: "Alerted", seen: seenByAgents(b, e) });
    }
  return events;
}

// ---------------------------------------------------------------------------
// Fire

/** One attack: roll to hit, then damage (a crit adds half), less armour. */
export function fire(b: Battle, s: Unit, t: Unit, reaction = false): BattleEvent[] {
  const r = battleRng(b);
  const w = WEAPONS[s.weapon];
  const odds = oddsAgainst(b, s, t, s, reaction);
  face(s, t);
  if (w.clip) s.ammo = Math.max(0, s.ammo - 1);
  const hit = r.next() * 100 < odds.chance;
  const crit = hit && r.next() * 100 < odds.crit;
  let damage = 0;
  if (hit) {
    damage = r.int(w.damage[0], w.damage[1]);
    if (crit) damage = Math.ceil(damage * 1.5);
    damage = Math.max(1, damage - t.armour);
    t.hp = Math.max(0, t.hp - damage);
  }
  const seen = s.side === "agent" || t.side === "agent" || seenByAgents(b, s);
  const events: BattleEvent[] = [{ kind: "shot", unit: s.id, target: t.id, hit, crit, damage, chance: odds.chance, reaction, melee: w.melee, seen }];
  if (t.hp <= 0) {
    t.alive = false;
    t.overwatch = false;
    events.push({ kind: "death", unit: t.id });
  }
  // Gunfire wakes everyone near; being shot at wakes the target's pod.
  if (t.side === "enemy") events.push(...alertPod(b, t.pod));
  if (!w.melee) for (const e of enemies(b)) if (!e.alerted && distance(e, s) <= 12) events.push(...alertPod(b, e.pod));
  events.push(...checkEnd(b));
  return events;
}

// ---------------------------------------------------------------------------
// Commands (the player's, and the AI's)

export type CommandError = string;

export function commandMove(b: Battle, u: Unit, to: Pt3): BattleEvent[] | CommandError {
  if (b.result) return "The battle is over";
  if (!canStand(b, to)) return "Can't stand there";
  const r = reach(b, u);
  const cost = r.cost.get(idx(b.map, to.x, to.y, to.z));
  if (cost === undefined) return "Out of reach";
  const n = moveActions(u, cost);
  if (!n) return "Out of reach";
  const path = pathTo(b, r, to)!;
  u.ap -= n;
  u.hunkered = false;
  return walk(b, u, path);
}

export function commandShoot(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  if (b.result) return "The battle is over";
  if (u.ap < 1) return "No actions left";
  if (WEAPONS[u.weapon].clip && u.ammo <= 0) return "Out of ammunition: reload";
  if (!canSee(b.map, u, t)) return "No line of sight";
  const odds = oddsAgainst(b, u, t);
  if (!odds.inRange || odds.chance <= 0) return "Out of range";
  u.ap = 0;
  u.hunkered = false;
  return fire(b, u, t);
}

export function commandOverwatch(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  if (WEAPONS[u.weapon].clip && u.ammo <= 0) return "Out of ammunition: reload";
  u.ap = 0;
  u.overwatch = true;
  return [{ kind: "status", unit: u.id, text: "Overwatch", seen: u.side === "agent" || seenByAgents(b, u) }];
}

export function commandHunker(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  u.ap = 0;
  u.hunkered = true;
  return [{ kind: "status", unit: u.id, text: "Hunkered down", seen: u.side === "agent" || seenByAgents(b, u) }];
}

export function commandReload(b: Battle, u: Unit): BattleEvent[] | CommandError {
  const w = WEAPONS[u.weapon];
  if (!w.clip) return "Nothing to reload";
  if (u.ammo >= w.clip) return "Already loaded";
  if (u.ap < 1) return "No actions left";
  u.ap -= 1;
  u.ammo = w.clip;
  return [{ kind: "status", unit: u.id, text: "Reloaded", seen: u.side === "agent" || seenByAgents(b, u) }];
}

export const onLandingZone = (b: Battle, p: Pt3) => b.map.lz.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);

export function commandEvacuate(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (!onLandingZone(b, u)) return "Get to the landing zone first";
  if (u.ap < 1) return "No actions left";
  u.ap = 0;
  u.evacuated = true;
  return [{ kind: "status", unit: u.id, text: "Evacuated", seen: true }, ...checkEnd(b)];
}

/** Won when every enemy is down; lost when every agent is; aborted when the survivors have all left. */
export function checkEnd(b: Battle): BattleEvent[] {
  if (b.result) return [];
  const live = b.units.filter((u) => u.side === "agent" && u.alive);
  if (!enemies(b).length) b.result = "won";
  else if (!live.length) b.result = "lost";
  else if (live.every((u) => u.evacuated)) b.result = "aborted";
  return b.result ? [{ kind: "end", result: b.result }] : [];
}

/** The player is done: the enemy moves, then a new turn begins. */
export function endTurn(b: Battle): BattleEvent[] {
  if (b.result) return [];
  const events: BattleEvent[] = [];
  b.side = "enemy";
  for (const e of enemies(b)) {
    e.ap = 2;
    e.overwatch = false;
    e.hunkered = false;
  }
  events.push({ kind: "turn", side: "enemy", turn: b.turn });
  events.push(...enemyTurn(b));
  if (b.result) return events;
  b.side = "agent";
  b.turn++;
  for (const a of agents(b)) {
    a.ap = 2;
    a.overwatch = false;
    a.hunkered = false;
  }
  events.push({ kind: "turn", side: "agent", turn: b.turn });
  return events;
}

/** Under a roof or a floor (the view cuts away to the unit's level). */
export const isIndoors = (b: Battle, p: Pt3) => tileAt(b.map, p.x, p.y, p.z + 1) !== T.VOID;


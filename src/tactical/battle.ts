// A battle (docs/WEB_PORT.md 3.11): units on a map, two actions a turn, the
// player's side then the enemy's. Every command returns the events it caused
// (moves, shots, deaths) for the view to play back; the state is already
// final when it returns.
//
// Vampires are not soldiers with more HP: bullets and blades only put them
// into torpor, from which they rise in a couple of turns unless an agent
// finishes them (a stake, or the haemolytic agent) or fire or the sun reaches
// them. Some dominate: their will against an agent's Faith. They climb, and
// see in the dark. Quiet teams start concealed.
import { RECRUIT_STAT_RANGES } from "../data/agents";
import { rng, type Rng } from "../sim/rng";
import { idx, inBounds, indoors, isLit, neighbours, T, tileAt, walkable, type BattleMap, type Pt3 } from "./map";
import {
  canSee, distance, lineOfSight, NIGHT_SIGHT, shotOdds, SIGHT, VAMPIRE_SIGHT, WEAPONS,
  type Modifier, type ShotOdds, type WeaponId,
} from "./rules";
import { enemyTurn } from "./ai";
import { traitsOf, type BloodlineTraits } from "./traits";
import { ELDERS } from "../data/people";

export type UnitKind = "agent" | "thrall" | "vampire" | "civilian" | "helicopter" | "hostage";
export type Side = "agent" | "enemy" | "neutral";

export interface Unit extends Pt3 {
  id: string;
  kind: UnitKind;
  side: Side;
  name: string;
  hp: number;
  maxHp: number;
  aim: number;
  /** Agents: nerve against domination. */
  faith: number;
  /** Agents: how close an enemy must come to spot them while concealed. */
  tradecraft: number;
  /** Agents: a sharper eye for a weak spot (crits). */
  insight: number;
  /** Vampires: the force of their domination (0: they can't). */
  will: number;
  /** Tiles one action's move covers (a dash: twice). */
  mobility: number;
  /** Taken off every hit (not fire). */
  armour: number;
  weapon: WeaponId;
  ammo: number;
  incendiaries: number;
  /** Actions left this turn (0–2). */
  ap: number;
  overwatch: boolean;
  hunkered: boolean;
  alive: boolean;
  evacuated: boolean;
  /** Vampires: turns until it rises from torpor (0: up and about). */
  torpor: number;
  /** Agents: under a vampire's will; loses its next turn. */
  dominated: boolean;
  /** Vampires: has tried domination this battle. */
  dominatedOnce: boolean;
  /** Jade Court: can't be seen beyond a few tiles until it strikes. */
  hidden: boolean;
  /** Vampires: taken in torpor, bound and carried off the map (a captive). */
  captured: boolean;
  /** A lair's eldest. */
  elder: boolean;
  /** Agents: down at 0 HP, turns left before bleeding out (0: not bleeding). */
  bleeding: number;
  /** Agents: down, but stabilized: out of the fight, and will live if the team wins or carries on. */
  stable: boolean;
  /** Agents: carrying a crate of what the bloodline kept (loot). */
  carrying: boolean;
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
  | { kind: "throw"; unit: string; at: Pt3; tiles: Pt3[] }
  | { kind: "burn"; unit: string; damage: number; why: "fire" | "sun"; seen: boolean }
  | { kind: "torpor"; unit: string; seen: boolean }
  | { kind: "death"; unit: string; text?: string }
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
  night: boolean;
  /** The team hasn't been seen yet. */
  concealed: boolean;
  bloodline: string;
  /** Burning tiles: index → turns left. */
  fire: Record<number, number>;
  /** Research: damage to vampires (UV rounds), and how much worse they hit (pheromone blockers). */
  mods: { vampireDamage: number; vampireAim: number };
  /** What the bloodline kept here: crates to carry out (a helicopter lifts the lot). */
  loot: Loot[];
}

export interface Loot extends Pt3 {
  id: string;
  /** The agent carrying it, if any. */
  by: string | null;
}

/** An agent brought from the campaign (tactical/campaign.ts), in place of a skirmish's random one. */
export interface SquadMember {
  id: string;
  name: string;
  aim: number;
  hp: number;
  maxHp: number;
  faith: number;
  tradecraft: number;
  insight: number;
  weapon: WeaponId;
  armour: number;
  incendiaries: number;
}

export interface SkirmishOptions {
  bloodline: string;
  night: boolean;
  kit: "civilian" | "plainclothes" | "tactical";
  arrival: "helicopter" | "jet";
  /** The campaign's agents (else four random ones). */
  squad?: SquadMember[];
  mods?: Battle["mods"];
  /** Crates of loot in the hideout. */
  loot?: number;
  /** A rescue: someone held near the vampires, to free and get out. */
  hostage?: boolean;
}

export const DEFAULT_OPTIONS: SkirmishOptions = { bloodline: "carcassonne", night: true, kit: "tactical", arrival: "helicopter" };

/** Turns a vampire lies in torpor (one less for the Huaca Line). */
export const TORPOR_TURNS = { night: 2, day: 3 };
/** Health a vampire rises with. */
export const RISE_HEALTH = 0.4;
/** A vampire's will, before its line's bonus. */
export const VAMPIRE_WILL = 55;
/** Aim for a shot from concealment. */
export const AMBUSH_BONUS = 15;
/** Incendiary: range in tiles, burn damage (a vampire takes double), turns the ground burns. */
export const INCENDIARY = { range: 10, damage: [2, 3] as const, turns: 2 };
/** Sun damage to a vampire caught outdoors by day, at the start of its turn. */
export const SUN_DAMAGE = 3;
/** A vampire (claws in rules.ts). Tuned against the auto-combat (tactical/calibrate.test.ts). */
export const VAMPIRE = { hp: 8, aim: 65 };

/** A lair's eldest: tougher, surer, stronger-willed, and it dominates every turn it can't claw. */
export const ELDER = { hp: 20, aim: 85, will: 20, armour: 1 };

/** Jade Court: seen only within this many tiles until it strikes. */
export const HIDDEN_RANGE = 5;

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
export function newSkirmish(map: BattleMap, seed: number, opts: SkirmishOptions = DEFAULT_OPTIONS): Battle {
  const r = rng({ rng: seed ^ 0x5bd1e995 });
  const tr = traitsOf(opts.bloodline);
  const units: Unit[] = [];
  const mods = opts.mods ?? { vampireDamage: 1, vampireAim: 0 };
  const stat = (k: keyof typeof RECRUIT_STAT_RANGES) => r.int(...RECRUIT_STAT_RANGES[k]);
  const squad: SquadMember[] = opts.squad ?? loadout(opts.kit).map((weapon, i) => {
    const vitality = stat("vitality");
    const hp = 3 + Math.round(vitality / 10);
    return {
      id: `a${i}`, name: AGENT_NAMES[(seed + i) % AGENT_NAMES.length]!, aim: 40 + Math.round(stat("combat") / 2), hp, maxHp: hp,
      faith: stat("faith"), tradecraft: stat("tradecraft"), insight: stat("insight"), weapon,
      armour: opts.kit === "tactical" ? 1 : 0, incendiaries: opts.kit === "tactical" ? 1 : 0,
    };
  });
  // The team lines up on the landing zone, centre first (a big team spills round it).
  const spots = [4, 0, 2, 6, 8, 1, 3, 5, 7].map((i) => map.lz[i]!).filter(Boolean);
  squad.forEach((a, i) => {
    const p = spots[i] ?? nearFree(map, spots[0]!, units);
    units.push(unit({ ...a, kind: "agent", side: "agent", ...p, mobility: 7, alerted: true }));
  });
  const enemyUnits = map.spawns.filter((s) => s.side !== "civilian");
  const pod = pods(enemyUnits);
  enemyUnits.forEach((s, i) => {
    const vampire = s.side === "vampire";
    const elder = vampire && !!s.elder;
    const weapon: WeaponId = vampire ? "claws" : r.pick<WeaponId>(["pistol", "pistol", "rifle", "shotgun"]);
    const hp = elder ? ELDER.hp : vampire ? VAMPIRE.hp : r.int(4, 5) + tr.thrallHp;
    units.push(unit({
      id: `e${i}`, kind: vampire ? "vampire" : "thrall", side: "enemy",
      name: elder ? (ELDERS[opts.bloodline]?.short ?? "The Eldest") : vampire ? "Vampire" : "Thrall",
      x: s.x, y: s.y, z: s.z, hp, maxHp: hp,
      aim: (elder ? ELDER.aim : vampire ? VAMPIRE.aim : 55) - (vampire ? mods.vampireAim : 0),
      will: vampire ? VAMPIRE_WILL + tr.will + (elder ? ELDER.will : 0) : 0, mobility: vampire ? 9 : 6, armour: elder ? ELDER.armour : 0, weapon, pod: pod[i]!,
      facing: r.real(0, Math.PI * 2), hidden: tr.hidden, elder,
    }));
  });
  // The prisoner, held near the vampires; the loot, in the rooms round them.
  const lair = enemyUnits.filter((s) => s.side === "vampire")[0] ?? enemyUnits[0];
  const taken = (p: Pt3) => units.some((u) => u.x === p.x && u.y === p.y && u.z === p.z) || map.spawns.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);
  const near = (n: number): Pt3[] => {
    const out: Pt3[] = [];
    if (!lair) return out;
    for (let d = 1; d <= 6 && out.length < n; d++)
      for (let dy = -d; dy <= d && out.length < n; dy++)
        for (let dx = -d; dx <= d && out.length < n; dx++) {
          const p = { x: lair.x + dx, y: lair.y + dy, z: lair.z };
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d || tileAt(map, p.x, p.y, p.z) !== T.FLOOR || taken(p) || out.some((q) => q.x === p.x && q.y === p.y)) continue;
          if (r.chance(0.5)) out.push(p);
        }
    return out;
  };
  if (opts.hostage) {
    const p = near(1)[0];
    if (p) units.push(unit({ id: "h0", kind: "hostage", side: "neutral", name: "The prisoner", ...p, hp: 3, maxHp: 3, aim: 30, mobility: 6, armour: 0, weapon: "knife" }));
  }
  const loot: Loot[] = near(opts.loot ?? 0).map((p, i) => ({ id: `l${i}`, ...p, by: null }));
  // A helicopter sets down beside the landing zone, and waits there for the team.
  if (opts.arrival === "helicopter") {
    const p = besideLz(map, units);
    if (p) units.push(unit({ id: "craft", kind: "helicopter", side: "agent", name: "The helicopter", ...p, hp: 14, maxHp: 14, aim: 0, mobility: 0, armour: 1, weapon: "knife", ap: 0, alerted: true }));
  }
  map.spawns.filter((s) => s.side === "civilian").forEach((s, i) => {
    units.push(unit({ id: `c${i}`, kind: "civilian", side: "neutral", name: "Civilian", x: s.x, y: s.y, z: s.z, hp: 3, maxHp: 3, aim: 0, mobility: 5, armour: 0, weapon: "pistol", ammo: 0 }));
  });
  return {
    map, units, turn: 1, side: "agent", rng: r.int(1, 2 ** 31), result: null, night: opts.night, bloodline: opts.bloodline, fire: {}, mods, loot,
    // A helicopter overhead or a squad in tactical kit gives the game away at once.
    concealed: opts.kit !== "tactical" && opts.arrival === "jet",
  };
}

/** What each kit carries into a fight (data/kit.ts): knives, pistols, or rifles with a shotgun. */
export function loadout(kit: SkirmishOptions["kit"], n = 4): WeaponId[] {
  const set: WeaponId[] = kit === "tactical" ? ["rifle", "rifle", "shotgun", "rifle"] : kit === "plainclothes" ? ["pistol"] : ["knife"];
  return Array.from({ length: n }, (_, i) => set[i % set.length]!);
}

/** Open ground just off the landing zone, for the helicopter. */
function besideLz(map: BattleMap, units: Unit[]): Pt3 | null {
  const c = map.lz[4] ?? map.lz[0]!;
  for (let d = 2; d < 6; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const q = { x: c.x + dx, y: c.y + dy, z: c.z };
        if (tileAt(map, q.x, q.y, q.z) === T.FLOOR && tileAt(map, q.x, q.y, q.z + 1) === T.VOID && !units.some((u) => u.x === q.x && u.y === q.y && u.z === q.z)) return q;
      }
  return null;
}

/** A free walkable tile near `p` (for a squad bigger than the landing zone). */
function nearFree(map: BattleMap, p: Pt3, units: Unit[]): Pt3 {
  for (let d = 1; d < 8; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        const q = { x: p.x + dx, y: p.y + dy, z: p.z };
        if (walkable(map, q.x, q.y, q.z) && !units.some((u) => u.x === q.x && u.y === q.y && u.z === q.z)) return q;
      }
  return p;
}

type UnitInit = Partial<Unit> & Pick<Unit, "id" | "kind" | "side" | "name" | "x" | "y" | "z" | "hp" | "maxHp" | "aim" | "mobility" | "armour" | "weapon">;

function unit(u: UnitInit): Unit {
  return {
    ammo: WEAPONS[u.weapon].clip, ap: 2, overwatch: false, hunkered: false, alive: true, evacuated: false, alerted: false, pod: -1, facing: 0,
    faith: 50, tradecraft: 0, insight: 0, will: 0, incendiaries: 0, torpor: 0, dominated: false, dominatedOnce: false, hidden: false, captured: false, carrying: false, elder: false, bleeding: 0, stable: false, ...u,
  };
}

// ---------------------------------------------------------------------------
// Queries

export const battleRng = (b: Battle): Rng => rng(b);
export const traits = (b: Battle): BloodlineTraits => traitsOf(b.bloodline);
export const unitById = (b: Battle, id: string) => b.units.find((u) => u.id === id);
/** On the map: alive (or in torpor) and not evacuated. */
export const onMap = (u: Unit) => u.alive && !u.evacuated && !u.captured;
/** Down: an agent bleeding out or stabilized on the ground. */
export const isDown = (u: Unit) => u.bleeding > 0 || u.stable;
/** On the map and able to act. */
export const active = (u: Unit) => onMap(u) && u.torpor === 0 && !isDown(u);
/** Our people on the map: the agents, and a prisoner once freed (not the helicopter). */
export const agents = (b: Battle) => b.units.filter((u) => u.side === "agent" && u.kind !== "helicopter" && active(u));
/** The helicopter on its pad, if it's there and still flies. */
export const craft = (b: Battle) => b.units.find((u) => u.kind === "helicopter" && u.alive);
/** Every enemy still to deal with, including vampires in torpor. */
export const enemies = (b: Battle) => b.units.filter((u) => u.side === "enemy" && onMap(u));
export const unitAt = (b: Battle, p: Pt3) => b.units.find((u) => onMap(u) && u.x === p.x && u.y === p.y && u.z === p.z);
export const hostile = (a: Unit, c: Unit) => a.side !== "neutral" && c.side !== "neutral" && a.side !== c.side;
export const tileIndex = (b: Battle, p: Pt3) => idx(b.map, p.x, p.y, p.z);
export const burning = (b: Battle, p: Pt3) => (b.fire[tileIndex(b, p)] ?? 0) > 0;

/** How far `viewer` sees toward `p`: at night humans see only what's lit from afar; vampires see in the dark. */
export function sightRange(b: Battle, viewer: Pt3 & { kind: UnitKind }, p: Pt3): number {
  // Below ground it's always night.
  if (!b.night && p.z >= b.map.ground) return SIGHT;
  if (viewer.kind === "vampire") return VAMPIRE_SIGHT;
  return isLit(b.map, p) || burning(b, p) ? SIGHT : NIGHT_SIGHT;
}

/** Whether `viewer` sees `p` (and the unit there, if it's hiding). */
export function sees(b: Battle, viewer: Pt3 & { kind: UnitKind }, p: Pt3, target?: Unit): boolean {
  if (target?.hidden && distance(viewer, p) > HIDDEN_RANGE) return false;
  return canSee(b.map, viewer, p, sightRange(b, viewer, p));
}

/** What the player is shown: anything an agent sees. */
export function seenByAgents(b: Battle, p: Pt3, target?: Unit): boolean {
  return agents(b).some((a) => sees(b, a, p, target));
}

/** Units of the other side this unit can see and shoot (not bodies in torpor). */
export const visibleFoes = (b: Battle, u: Unit, from: Pt3 = u) =>
  b.units.filter((o) => active(o) && hostile(u, o) && sees(b, { ...from, kind: u.kind }, o, o));

/** Bodies in torpor next to this unit, to finish. */
export const bodiesInReach = (b: Battle, u: Unit) =>
  b.units.filter((o) => onMap(o) && o.torpor > 0 && o.z === u.z && distance(o, u) <= 1.5);

/** Odds of `u` shooting `t`, from where `u` stands (or `from`). */
export function oddsAgainst(b: Battle, u: Unit, t: Unit, from: Pt3 = u, reaction = false): ShotOdds {
  const extra: Modifier[] = u.side === "agent" && b.concealed && !reaction ? [{ label: "From concealment", value: AMBUSH_BONUS }] : [];
  const crit = u.side === "agent" ? Math.max(0, Math.round((u.insight - 30) / 5)) : 0;
  return shotOdds(b.map, { ...from, aim: u.aim, weapon: u.weapon }, t, reaction, extra, crit);
}

/** While concealed, how close an enemy must be to spot this agent (Tradecraft shrinks it). */
export const detectRadius = (a: Unit) => Math.max(2, Math.min(6, Math.round(8 - a.tradecraft / 10)));

/** Does this enemy notice this agent? */
export function detects(b: Battle, e: Unit, a: Unit): boolean {
  if (!active(e) || !sees(b, e, a)) return false;
  return !b.concealed || distance(e, a) <= detectRadius(a);
}

// ---------------------------------------------------------------------------
// Movement

export interface Reach {
  /** Movement cost to each reached tile index. */
  cost: Map<number, number>;
  prev: Map<number, number>;
}

const stepCost = (a: Pt3, b: Pt3) =>
  a.z !== b.z ? (a.x !== b.x || a.y !== b.y ? 3 : 2) : a.x !== b.x && a.y !== b.y ? 1.5 : 1;

/** May this unit step onto this tile? Enemies keep out of fire; vampires keep out of the sun. */
function allowed(b: Battle, u: Unit, p: Pt3): boolean {
  if (u.side === "enemy" && burning(b, p)) return false;
  if (u.kind === "vampire" && !b.night && !traits(b).sunproof && !indoors(b.map, p)) return false;
  return true;
}

/** Where a unit can walk within `budget` (Dijkstra; friends can be walked past, not stood on; vampires climb). */
export function reach(b: Battle, u: Unit, budget = u.mobility * Math.min(2, u.ap)): Reach {
  const m = b.map;
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const start = idx(m, u.x, u.y, u.z);
  cost.set(start, 0);
  const blocked = new Set<number>();
  for (const o of b.units) if (onMap(o) && o !== u && (hostile(u, o) || o.side === "neutral" || o.torpor > 0)) blocked.add(idx(m, o.x, o.y, o.z));
  const climb = u.kind === "vampire";
  const open = new Heap();
  open.push(0, start);
  while (open.size) {
    const [c, i] = open.pop();
    if (c > (cost.get(i) ?? Infinity)) continue;
    const p = fromIdx(m, i);
    for (const n of neighbours(m, p, climb)) {
      const j = idx(m, n.x, n.y, n.z);
      if (blocked.has(j) || !allowed(b, u, n)) continue;
      const nc = c + stepCost(p, n);
      if (nc > budget || nc >= (cost.get(j) ?? Infinity)) continue;
      cost.set(j, nc);
      prev.set(j, i);
      open.push(nc, j);
    }
  }
  return { cost, prev };
}

/** A binary min-heap of (cost, tile index), for Dijkstra on the bigger maps. */
class Heap {
  private readonly k: number[] = [];
  private readonly v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const { k, v } = this;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= key) break;
      k[i] = k[p]!;
      v[i] = v[p]!;
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): [number, number] {
    const { k, v } = this;
    const top: [number, number] = [k[0]!, v[0]!];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        let mk = lk;
        if (l < k.length && k[l]! < mk) (m = l), (mk = k[l]!);
        if (r < k.length && k[r]! < mk) m = r;
        if (m === i) break;
        k[i] = k[m]!;
        v[i] = v[m]!;
        i = m;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
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

/** The cost of walking a path from `from`. */
export function pathCost(from: Pt3, path: Pt3[]): number {
  let c = 0, prev = from;
  for (const p of path) {
    c += stepCost(prev, p);
    prev = p;
  }
  return c;
}

/** Actions a move of this cost takes, or 0 if the unit can't make it. */
export function moveActions(u: Unit, cost: number): number {
  if (cost <= u.mobility && u.ap >= 1) return 1;
  if (cost <= u.mobility * 2 && u.ap >= 2) return 2;
  return 0;
}

/** Can a unit end a move here (walkable, nobody standing or lying there)? */
export const canStand = (b: Battle, p: Pt3) => inBounds(b.map, p.x, p.y, p.z) && walkable(b.map, p.x, p.y, p.z) && !unitAt(b, p);

const face = (u: Unit, to: Pt3) => {
  if (to.x !== u.x || to.y !== u.y) u.facing = Math.atan2(to.y - u.y, to.x - u.x);
};

/**
 * Walks a unit along a path, tile by tile. Overwatch fires at it as it
 * comes into view; a hit can stop it dead. Enemies who spot an agent wake up.
 */
export function walk(b: Battle, u: Unit, path: Pt3[]): BattleEvent[] {
  const events: BattleEvent[] = [];
  let seg: Pt3[] = [];
  const seen = (p: Pt3) => u.side === "agent" || seenByAgents(b, p, u);
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
      if (!active(w) || !w.overwatch || !hostile(w, u) || !sees(b, w, u, u)) continue;
      flush();
      w.overwatch = false;
      events.push(...attack(b, w, u, true));
      if (!active(u)) return events;
    }
    if (u.side === "agent") events.push(...wakeWhoSpots(b, u));
    // An agent with free hands picks up a crate on the way.
    if (u.kind === "agent" && !u.carrying) {
      const crate = b.loot.find((l) => !l.by && l.x === p.x && l.y === p.y && l.z === p.z);
      if (crate) {
        flush();
        crate.by = u.id;
        u.carrying = true;
        events.push({ kind: "status", unit: u.id, text: "Picked up a crate", seen: true });
      }
    }
  }
  flush();
  return events;
}

/** Enemies who spot this agent notice it (breaking concealment), and so does the rest of their pod. */
function wakeWhoSpots(b: Battle, a: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b)) {
    if (e.alerted || !detects(b, e, a)) continue;
    events.push(...reveal(b, a), ...alertPod(b, e.pod));
  }
  return events;
}

/** The team is seen: concealment is over. */
export function reveal(b: Battle, by?: Unit): BattleEvent[] {
  if (!b.concealed) return [];
  b.concealed = false;
  return [{ kind: "status", unit: by?.id ?? agents(b)[0]?.id ?? "", text: "Spotted!", seen: true }];
}

export function alertPod(b: Battle, pod: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b))
    if (!e.alerted && e.pod === pod) {
      e.alerted = true;
      events.push({ kind: "status", unit: e.id, text: "Alerted", seen: seenByAgents(b, e, e) });
    }
  return events;
}

/** Gunfire and fire wake every pod within earshot. */
function noise(b: Battle, at: Pt3): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b)) if (!e.alerted && distance(e, at) <= 12) events.push(...alertPod(b, e.pod));
  return events;
}

// ---------------------------------------------------------------------------
// Harm

/** Turns an agent bleeds before dying, unless stabilized. */
export const BLEED_TURNS = 3;
/** Damage past 0 that kills outright (as does a critical hit). */
export const OVERKILL = 3;

/** Bullets and claws take a unit to 0: an agent goes down (or dies, to a crit or a heavy blow); others die; a vampire falls into torpor. */
function downed(b: Battle, t: Unit, crit = false, overkill = 0): BattleEvent[] {
  t.overwatch = false;
  t.hunkered = false;
  if (t.kind === "agent" && !crit && overkill < OVERKILL) {
    t.bleeding = BLEED_TURNS;
    t.ap = 0;
    dropLoot(b, t);
    return [{ kind: "torpor", unit: t.id, seen: true }, { kind: "status", unit: t.id, text: "Down, bleeding", seen: true }];
  }
  if (t.kind === "vampire") {
    t.torpor = Math.max(1, (b.night ? TORPOR_TURNS.night : TORPOR_TURNS.day) - traits(b).riseSooner);
    t.ap = 0;
    return [{ kind: "torpor", unit: t.id, seen: t.side === "agent" || seenByAgents(b, t) }];
  }
  t.alive = false;
  dropLoot(b, t);
  return [{ kind: "death", unit: t.id, ...(t.kind === "helicopter" ? { text: "Shot down" } : {}) }];
}

/** A carrier falls: the crate lies where they fell. */
function dropLoot(b: Battle, u: Unit) {
  if (!u.carrying) return;
  u.carrying = false;
  for (const l of b.loot) if (l.by === u.id) Object.assign(l, { by: null, x: u.x, y: u.y, z: u.z });
}

/** Fire or sun: no armour, double to a vampire, and it finishes one for good. */
function burn(b: Battle, t: Unit, why: "fire" | "sun"): BattleEvent[] {
  const r = battleRng(b);
  const vampire = t.kind === "vampire";
  const seen = t.side === "agent" || seenByAgents(b, t);
  if (t.torpor > 0) {
    t.alive = false;
    return [{ kind: "death", unit: t.id, text: why === "fire" ? "Burned" : "Ash" }];
  }
  let damage = why === "sun" ? Math.max(1, Math.round(SUN_DAMAGE * traits(b).sun)) : r.int(...INCENDIARY.damage) * (vampire ? 2 : 1);
  damage = Math.min(damage, t.hp);
  t.hp -= damage;
  const events: BattleEvent[] = [{ kind: "burn", unit: t.id, damage, why, seen }];
  if (t.hp <= 0) {
    t.alive = false;
    dropLoot(b, t);
    events.push({ kind: "death", unit: t.id, text: vampire ? "Ash" : t.kind === "helicopter" ? "Burning" : undefined });
  }
  return events;
}

/** One attack: roll to hit, then damage (a crit adds half), less armour. */
export function attack(b: Battle, s: Unit, t: Unit, reaction = false): BattleEvent[] {
  const r = battleRng(b);
  const w = WEAPONS[s.weapon];
  const odds = oddsAgainst(b, s, t, s, reaction);
  face(s, t);
  if (w.clip) s.ammo = Math.max(0, s.ammo - 1);
  const hit = r.next() * 100 < odds.chance;
  const crit = hit && r.next() * 100 < odds.crit;
  let damage = 0;
  let overkill = 0;
  if (hit) {
    damage = r.int(w.damage[0], w.damage[1]);
    if (crit) damage = Math.ceil(damage * 1.5);
    if (t.kind === "vampire" && s.side === "agent") damage = Math.round(damage * b.mods.vampireDamage);
    damage = Math.max(1, damage - t.armour);
    overkill = Math.max(0, damage - t.hp);
    damage = Math.min(t.hp, damage);
    t.hp -= damage;
  }
  const seen = s.side === "agent" || t.side === "agent" || seenByAgents(b, s, s);
  s.hidden = false; // striking gives a Jade killer away
  const events: BattleEvent[] = [{ kind: "shot", unit: s.id, target: t.id, hit, crit, damage, chance: odds.chance, reaction, melee: w.melee, seen }];
  if (t.hp <= 0) events.push(...downed(b, t, crit, overkill));
  if (s.side === "agent") events.push(...reveal(b, s));
  // Being attacked wakes the target's pod; gunfire wakes those near.
  if (t.side === "enemy") events.push(...alertPod(b, t.pod));
  if (!w.melee) events.push(...noise(b, s));
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
  if (t.torpor > 0) return "It's down: finish it before it rises";
  if (WEAPONS[u.weapon].clip && u.ammo <= 0) return "Out of ammunition: reload";
  if (!sees(b, u, t, t)) return "Can't see it";
  const odds = oddsAgainst(b, u, t);
  if (!odds.inRange || odds.chance <= 0) return "Out of range";
  u.ap = 0;
  u.hunkered = false;
  return attack(b, u, t);
}

/** A stake, or the haemolytic agent: a vampire in torpor next to the agent is finished. Quiet. */
export function commandFinish(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  if (t.torpor <= 0) return "Not in torpor";
  if (!bodiesInReach(b, u).includes(t)) return "Get next to it first";
  u.ap -= 1;
  t.alive = false;
  face(u, t);
  return [{ kind: "death", unit: t.id, text: "Finished" }, ...checkEnd(b)];
}

/** The prisoner, next to this agent and still bound. */
export const prisonerInReach = (b: Battle, u: Unit) =>
  b.units.find((o) => o.kind === "hostage" && o.side === "neutral" && onMap(o) && o.z === u.z && distance(o, u) <= 1.5);

/** Cut the prisoner loose: from the next turn they move with the team, and must get out alive. One action. */
export function commandFree(b: Battle, u: Unit, h: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  if (prisonerInReach(b, u) !== h) return "Get next to them first";
  u.ap -= 1;
  h.side = "agent";
  h.ap = 0;
  h.alerted = true;
  return [{ kind: "status", unit: h.id, text: "Freed", seen: true }];
}

/** A downed agent next to this one, bleeding. */
export const bleederInReach = (b: Battle, u: Unit) =>
  b.units.find((o) => o.kind === "agent" && o.alive && o.bleeding > 0 && o.z === u.z && distance(o, u) <= 1.5);

/** Field dressing: the bleeding stops. Still down, but alive. One action. */
export function commandStabilize(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  if (bleederInReach(b, u) !== t) return "Get next to them first";
  u.ap -= 1;
  t.bleeding = 0;
  t.stable = true;
  return [{ kind: "status", unit: t.id, text: "Stabilized", seen: true }];
}

/** Bind a vampire in torpor and carry it off: a captive, if a base has a cell for it. One action. */
export function commandCapture(b: Battle, u: Unit, t: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  if (t.torpor <= 0) return "Not in torpor";
  if (!bodiesInReach(b, u).includes(t)) return "Get next to it first";
  u.ap -= 1;
  t.captured = true;
  face(u, t);
  return [{ kind: "status", unit: t.id, text: "Taken alive", seen: true }, ...checkEnd(b)];
}

/** The tiles an incendiary at `p` sets alight: it and the eight round it, where there's ground to burn. */
export function blastTiles(b: Battle, p: Pt3): Pt3[] {
  const out: Pt3[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z };
      const t = tileAt(b.map, q.x, q.y, q.z);
      if (t !== T.VOID && t !== T.WALL && lineOfSight(b.map, p, q)) out.push(q);
    }
  return out;
}

export function throwBlocker(b: Battle, u: Unit, p: Pt3): string | null {
  if (u.incendiaries <= 0) return "No incendiaries left";
  if (u.ap < 1) return "No actions left";
  if (tileAt(b.map, p.x, p.y, p.z) === T.VOID || tileAt(b.map, p.x, p.y, p.z) === T.WALL) return "Nothing to burn there";
  if (distance(u, p) > INCENDIARY.range) return "Too far to throw";
  if (!lineOfSight(b.map, u, p)) return "No clear throw";
  return null;
}

export function commandIncendiary(b: Battle, u: Unit, p: Pt3): BattleEvent[] | CommandError {
  const blocker = throwBlocker(b, u, p);
  if (blocker) return blocker;
  u.ap = 0;
  u.incendiaries--;
  face(u, p);
  const tiles = blastTiles(b, p);
  for (const q of tiles) b.fire[tileIndex(b, q)] = INCENDIARY.turns;
  const events: BattleEvent[] = [{ kind: "throw", unit: u.id, at: p, tiles }];
  for (const q of tiles) {
    const v = unitAt(b, q);
    if (v) events.push(...burn(b, v, "fire"));
  }
  events.push(...reveal(b, u), ...noise(b, p));
  for (const v of tiles.map((q) => unitAt(b, q))) if (v?.side === "enemy") events.push(...alertPod(b, v.pod));
  events.push(...checkEnd(b));
  return events;
}

export function commandOverwatch(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  if (WEAPONS[u.weapon].clip && u.ammo <= 0) return "Out of ammunition: reload";
  u.ap = 0;
  u.overwatch = true;
  return [{ kind: "status", unit: u.id, text: "Overwatch", seen: u.side === "agent" || seenByAgents(b, u, u) }];
}

export function commandHunker(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (u.ap < 1) return "No actions left";
  u.ap = 0;
  u.hunkered = true;
  return [{ kind: "status", unit: u.id, text: "Hunkered down", seen: u.side === "agent" || seenByAgents(b, u, u) }];
}

export function commandReload(b: Battle, u: Unit): BattleEvent[] | CommandError {
  const w = WEAPONS[u.weapon];
  if (!w.clip) return "Nothing to reload";
  if (u.ammo >= w.clip) return "Already loaded";
  if (u.ap < 1) return "No actions left";
  u.ap -= 1;
  u.ammo = w.clip;
  return [{ kind: "status", unit: u.id, text: "Reloaded", seen: u.side === "agent" || seenByAgents(b, u, u) }];
}

export const onLandingZone = (b: Battle, p: Pt3) => b.map.lz.some((q) => q.x === p.x && q.y === p.y && q.z === p.z);

export function commandEvacuate(b: Battle, u: Unit): BattleEvent[] | CommandError {
  if (!onLandingZone(b, u)) return "Get to the landing zone first";
  if (u.ap < 1) return "No actions left";
  u.ap = 0;
  u.evacuated = true;
  return [{ kind: "status", unit: u.id, text: "Evacuated", seen: true }, ...checkEnd(b)];
}

/** Won when every enemy is gone (a body in torpor still counts); lost when every agent is; aborted when the survivors have all left. */
export function checkEnd(b: Battle): BattleEvent[] {
  if (b.result) return [];
  const live = b.units.filter((u) => u.kind === "agent" && u.alive && !isDown(u));
  if (!enemies(b).length) b.result = "won";
  else if (!live.length) b.result = "lost";
  else if (live.every((u) => u.evacuated)) b.result = "aborted";
  return b.result ? [{ kind: "end", result: b.result }] : [];
}

/** The start of a side's turn: fire burns whoever stands in it; the sun finds vampires outdoors; torpor wears off. */
function startOfTurn(b: Battle, side: "agent" | "enemy"): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const u of b.units.filter((x) => x.side === side && onMap(x))) {
    if (burning(b, u)) events.push(...burn(b, u, "fire"));
    if (!onMap(u)) continue;
    if (u.kind === "vampire" && !b.night && !indoors(b.map, u)) events.push(...burn(b, u, "sun"));
    if (!onMap(u)) continue;
    if (u.bleeding > 0 && --u.bleeding === 0) {
      u.alive = false;
      events.push({ kind: "death", unit: u.id, text: "Bled out" });
      continue;
    }
    if (u.torpor > 0 && --u.torpor === 0) {
      u.hp = Math.max(1, Math.ceil(u.maxHp * RISE_HEALTH));
      u.alerted = true;
      events.push({ kind: "status", unit: u.id, text: "Rises!", seen: seenByAgents(b, u) });
    }
  }
  if (side === "agent")
    for (const [i, n] of Object.entries(b.fire)) {
      if (n <= 1) delete b.fire[+i];
      else b.fire[+i] = n - 1;
    }
  events.push(...checkEnd(b));
  return events;
}

/** The player is done: the enemy moves, then a new turn begins. */
export function endTurn(b: Battle): BattleEvent[] {
  if (b.result) return [];
  const events: BattleEvent[] = [];
  b.side = "enemy";
  events.push({ kind: "turn", side: "enemy", turn: b.turn });
  for (const e of enemies(b)) {
    e.ap = e.torpor ? 0 : 2;
    e.overwatch = false;
    e.hunkered = false;
  }
  events.push(...startOfTurn(b, "enemy"));
  if (!b.result) events.push(...enemyTurn(b));
  if (b.result) return events;
  b.side = "agent";
  b.turn++;
  events.push({ kind: "turn", side: "agent", turn: b.turn });
  for (const a of agents(b)) {
    a.ap = 2;
    a.overwatch = false;
    a.hunkered = false;
  }
  events.push(...startOfTurn(b, "agent"));
  // A dominated agent stands slack-jawed through this turn.
  for (const a of agents(b))
    if (a.dominated) {
      a.dominated = false;
      a.ap = 0;
      events.push({ kind: "status", unit: a.id, text: "Dominated: loses the turn", seen: true });
    }
  return events;
}

/** Under a roof or a floor (the view cuts away to the unit's level). */
export const isIndoors = (b: Battle, p: Pt3) => indoors(b.map, p);

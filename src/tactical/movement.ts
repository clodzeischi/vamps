// Movement: where a unit can reach for its TU, paths, walking, and being spotted on the way.
import {
  idx,
  inBounds,
  indoors,
  neighbours,
  shutBetween,
  walkable,
  type BattleMap,
  type Pt3,
} from "./map/map";
import { cellsAlong, flat, walkLine } from "./map/path";
import { distance, WEAPONS } from "./rules";
import {
  type Battle,
  type Unit,
  burning,
  traits,
  onMap,
  TU_PER_TILE,
  SNEAK,
  TU_COST,
  unitAt,
  type BattleEvent,
  enemies,
  active,
  seenByAgents,
  hostile,
  sees,
  attackCost,
  detects,
  agents,
} from "./battle";
import { openDoor } from "./doors";
import { attack } from "./harm";

export interface Reach {
  /** TU to reach each tile index. */
  cost: Map<number, number>;
  /** Where the straight leg into each tile starts (any-angle: not always a neighbour). */
  prev: Map<number, number>;
}

/**
 * A step between neighbours, in tiles: 1 straight, 1.5 diagonal; 2 up or down
 * a stair tile, 3 a climb; a flight of stairs (foot to head, 3 or more tiles
 * apart) its length and one more.
 */
const stepCost = (a: Pt3, b: Pt3) => {
  if (a.z === b.z) return a.x !== b.x && a.y !== b.y ? 1.5 : 1;
  const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  return d === 0 ? 2 : d >= 3 ? d + 1 : 3;
};

/** May this unit step onto this tile? Enemies keep out of fire; vampires keep out of the sun. */
function allowed(b: Battle, u: Unit, p: Pt3): boolean {
  if (u.side === "enemy" && burning(b, p)) return false;
  if (u.kind === "vampire" && b.uv?.[idx(b.map, p.x, p.y, p.z)]) return false;
  if (u.kind === "vampire" && !b.night && !traits(b).sunproof && !indoors(b.map, p)) return false;
  return true;
}

/**
 * Where a unit can walk within `budget` TU: Theta*, a Dijkstra flood whose
 * legs run straight from a tile's parent wherever the walk is clear, so
 * costs are the distance really walked, not a zigzag across tile centres.
 * Every other unit on the map blocks its tile, friend or foe; vampires climb. `anyAngle` off
 * gives the plain grid flood (cheaper, for the AI's long-range plans).
 */
export function reach(b: Battle, u: Unit, budget = u.tu, anyAngle = true): Reach {
  const m = b.map;
  const cost = new Map<number, number>();
  const prev = new Map<number, number>();
  const start = idx(m, u.x, u.y, u.z);
  cost.set(start, 0);
  const blocked = new Set<number>();
  for (const o of b.units) if (onMap(o) && o !== u) blocked.add(idx(m, o.x, o.y, o.z));
  const climb = u.kind === "vampire";
  const tile = TU_PER_TILE * (u.sneak ? SNEAK.move : 1);
  // May a straight walk pass over a tile? Asked many times of each, so remembered (0: not asked yet, 1: no, 2: yes).
  const asked = new Uint8Array(m.w * m.h * m.levels);
  const clear = Array.from({ length: m.levels }, (_, z) => (x: number, y: number) => {
    if (!inBounds(m, x, y, z)) return false;
    const i = idx(m, x, y, z);
    return (
      (asked[i] ||=
        walkable(m, x, y, z) && !blocked.has(i) && allowed(b, u, { x, y, z }) ? 2 : 1) === 2
    );
  });
  const open = new Heap();
  open.push(0, start);
  while (open.size) {
    const [c, i] = open.pop();
    if (c > (cost.get(i) ?? Infinity)) continue;
    const p = fromIdx(m, i);
    const pi = prev.get(i);
    const par = pi === undefined ? null : fromIdx(m, pi);
    for (const n of neighbours(m, p, climb)) {
      const j = idx(m, n.x, n.y, n.z);
      if (blocked.has(j) || !allowed(b, u, n)) continue;
      // Straight from the parent, if the walk is clear and on one level; else via this tile.
      let from = i,
        nc = c + stepCost(p, n) * tile + (shutBetween(m, p, n) ? TU_COST.door : 0);
      const known = (cost.get(j) ?? Infinity) - 1e-9;
      if (anyAngle && par && par.z === p.z && n.z === p.z) {
        const via = cost.get(pi!)! + flat(par, n) * tile;
        // (The walk itself is the dear part: only looked at when it would matter.)
        if (via <= nc && via <= budget + 1e-6 && via < known && walkLine(m, par, n, clear[n.z]!))
          ((from = pi!), (nc = via));
      }
      if (nc > budget + 1e-6 || nc >= known) continue;
      cost.set(j, nc);
      prev.set(j, from);
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
    const lk = k.pop()!,
      lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        let mk = lk;
        if (l < k.length && k[l]! < mk) ((m = l), (mk = k[l]!));
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

/** The way to a tile: the corner points of its straight legs (not the start), or null if out of reach. */
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

/** TU a reached tile costs (rounded up: what a move there takes), or undefined out of reach. */
export const tuTo = (b: Battle, r: Reach, p: Pt3): number | undefined => {
  const c = r.cost.get(idx(b.map, p.x, p.y, p.z));
  return c === undefined ? undefined : Math.ceil(c - 1e-6);
};

/** Every tile a walk along these legs enters, in order, each marked if it's a corner of the path. */
function tilesAlong(from: Pt3, path: Pt3[]): { p: Pt3; corner: boolean }[] {
  const out: { p: Pt3; corner: boolean }[] = [];
  let prev = from;
  for (const q of path) {
    const cells = cellsAlong(prev, q);
    cells.forEach((c, k) => out.push({ p: c, corner: k === cells.length - 1 }));
    prev = q;
  }
  return out;
}

/** The TU a path costs from `from` (straight legs by distance; stairs and climbs by their step). */
function pathCost(from: Pt3, path: Pt3[]): number {
  let c = 0,
    prev = from;
  for (const p of path) {
    c += (p.z === prev.z ? flat(prev, p) : stepCost(prev, p)) * TU_PER_TILE;
    prev = p;
  }
  return c;
}

/** Can a unit end a move here (walkable, nobody standing or lying there)? */
export const canStand = (b: Battle, p: Pt3) =>
  inBounds(b.map, p.x, p.y, p.z) && walkable(b.map, p.x, p.y, p.z) && !unitAt(b, p);

export const face = (u: Unit, to: Pt3) => {
  if (to.x !== u.x || to.y !== u.y) u.facing = Math.atan2(to.y - u.y, to.x - u.x);
};

/**
 * Walks a unit along a path (straight legs), tile by tile. Reaction fire comes
 * at it as it comes into view, while the watcher has the TU for a snap shot
 * (once per watcher per move); a hit can stop it dead. Enemies who spot an
 * agent wake up. An agent who sees an enemy the team hadn't seen stops on
 * that tile; given `charged` (the TU the whole move was paid), the TU of the
 * rest of the way come back.
 */
export function walk(b: Battle, u: Unit, path: Pt3[], charged?: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  const start: Pt3 = { x: u.x, y: u.y, z: u.z };
  const walked: Pt3[] = [];
  const known =
    u.side === "agent"
      ? new Set(
          enemies(b)
            .filter((e) => active(e) && seenByAgents(b, e, e))
            .map((e) => e.id),
        )
      : null;
  let seg: Pt3[] = [];
  const seen = (p: Pt3) => u.side === "agent" || seenByAgents(b, p, u);
  let segSeen = seen(u);
  const flush = () => {
    if (seg.length) events.push({ kind: "move", unit: u.id, path: seg, seen: segSeen });
    seg = [];
    segSeen = seen(u);
  };
  const fired = new Set<string>();
  let at: Pt3 = start,
    shown: Pt3 = start,
    doors = 0;
  const same = (a: Pt3, c: Pt3) => a.x === c.x && a.y === c.y && a.z === c.z;
  for (const { p, corner } of tilesAlong(u, path)) {
    // A closed door on the way: walk up to it, open it, go on.
    if (shutBetween(b.map, at, p)) {
      const last = seg.at(-1) ?? shown;
      if (!same(last, at)) (seg.push({ ...at }), walked.push({ ...at }));
      shown = seg.at(-1) ?? shown;
      flush();
      events.push(...openDoor(b, u, { ...at, dx: p.x - at.x, dy: p.y - at.y }));
      doors++;
    }
    at = p;
    face(u, p);
    u.x = p.x;
    u.y = p.y;
    u.z = p.z;
    if (corner) (seg.push({ ...p }), walked.push({ ...p }));
    if (seen(p)) segSeen = true;
    // Reaction fire from the other side.
    for (const w of b.units) {
      if (fired.has(w.id) || !active(w) || !w.overwatch || !hostile(w, u) || !sees(b, w, u, u))
        continue;
      if (WEAPONS[w.weapon].clip && w.ammo <= 0) continue;
      if (!corner) seg.push({ ...p });
      shown = p;
      flush();
      fired.add(w.id);
      w.tu -= attackCost(w);
      if (w.tu < attackCost(w)) w.overwatch = false;
      events.push(...attack(b, w, u, true));
      if (!active(u)) return events;
    }
    if (u.side === "agent") events.push(...wakeWhoSpots(b, u));
    // An agent with free hands picks up a crate on the way.
    if (u.kind === "agent" && !u.carrying) {
      const crate = b.loot.find((l) => !l.by && l.x === p.x && l.y === p.y && l.z === p.z);
      if (crate) {
        if (!corner) seg.push({ ...p });
        shown = p;
        flush();
        crate.by = u.id;
        u.carrying = true;
        events.push({ kind: "status", unit: u.id, text: "Picked up a crate", seen: true });
      }
    }
    // Contact: an enemy comes into the team's view. Stop here.
    const spotted =
      known && enemies(b).find((e) => active(e) && !known.has(e.id) && seenByAgents(b, e, e));
    if (spotted && (p.x !== path.at(-1)!.x || p.y !== path.at(-1)!.y || p.z !== path.at(-1)!.z)) {
      const moves = events.filter(
        (e): e is Extract<BattleEvent, { kind: "move" }> => e.kind === "move",
      );
      const last = seg.at(-1) ?? moves.at(-1)?.path.at(-1);
      if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z) seg.push({ ...p });
      walked.push({ ...p });
      flush();
      if (charged !== undefined) {
        const used = Math.ceil(
          pathCost(start, walked) * (u.sneak ? SNEAK.move : 1) + doors * TU_COST.door - 1e-6,
        );
        u.tu += Math.max(0, charged - used);
      }
      events.push({ kind: "status", unit: u.id, text: "Contact", seen: true });
      return events;
    }
  }
  flush();
  return events;
}

/** Enemies who spot this agent notice it (breaking concealment), and so does the rest of their pod. */
export function wakeWhoSpots(b: Battle, a: Unit): BattleEvent[] {
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
export function noise(b: Battle, at: Pt3): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b))
    if (!e.alerted && distance(e, at) <= 12) events.push(...alertPod(b, e.pod));
  return events;
}

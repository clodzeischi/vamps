// The enemy's turn (docs/WEB_PORT.md 3.11). Crude, readable rules:
// * Asleep: an enemy that hasn't noticed the team stays put, unless it can
//   see an agent now (then its whole pod wakes).
// * A thrall with a gun: if it sees an agent, it moves to the spot nearby
//   that best mixes a good shot with good cover, then shoots (or watches,
//   if no shot is worth taking). If it sees nobody, it closes in.
// * A vampire: claws. If an agent is in reach, it closes and strikes;
//   otherwise it runs at the nearest one.
import { idx, type Pt3 } from "./map";
import {
  agents, alertPod, canStand, enemies, fire, fromIdx, oddsAgainst, onMap, pathTo, reach, seenByAgents, walk, visibleFoes,
  type Battle, type BattleEvent, type Unit,
} from "./battle";
import { canSee, coverAgainst, COVER_PENALTY, distance, WEAPONS } from "./rules";

/** The whole enemy side acts, unit by unit. */
export function enemyTurn(b: Battle): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b)) {
    if (b.result) break;
    if (!onMap(e)) continue;
    if (!e.alerted) {
      if (agents(b).some((a) => canSee(b.map, e, a))) events.push(...alertPod(b, e.pod));
      continue;
    }
    events.push(...act(b, e));
  }
  return events;
}

function act(b: Battle, e: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  const w = WEAPONS[e.weapon];
  for (let guard = 0; e.ap > 0 && onMap(e) && !b.result && guard < 4; guard++) {
    if (w.melee) {
      events.push(...melee(b, e));
      break;
    }
    if (w.clip && e.ammo <= 0) {
      e.ap -= 1;
      e.ammo = w.clip;
      events.push({ kind: "status", unit: e.id, text: "Reloaded", seen: seenByAgents(b, e) });
      continue;
    }
    const foes = visibleFoes(b, e);
    if (foes.length) {
      // First action: is there a better place to shoot from?
      if (e.ap >= 2) {
        const here = score(b, e, e);
        const best = bestSpot(b, e);
        if (best && best.score > here + 10) {
          e.ap -= 1;
          events.push(...walk(b, e, best.path));
          continue;
        }
      }
      const target = bestTarget(b, e, e);
      if (target && target.chance >= 15) {
        e.ap = 0;
        events.push(...fire(b, e, target.unit));
      } else {
        e.ap = 0;
        e.overwatch = true;
        events.push({ kind: "status", unit: e.id, text: "Overwatch", seen: seenByAgents(b, e) });
      }
      continue;
    }
    // Nobody in sight: close in on the nearest agent, a move at a time.
    const step = approach(b, e, e.mobility);
    if (!step) {
      e.ap = 0;
      break;
    }
    e.ap -= 1;
    events.push(...walk(b, e, step));
  }
  return events;
}

/** The best target from a spot: the highest chance to hit. */
function bestTarget(b: Battle, e: Unit, from: Pt3): { unit: Unit; chance: number } | null {
  let best: { unit: Unit; chance: number } | null = null;
  for (const a of agents(b)) {
    if (!canSee(b.map, from, a)) continue;
    const o = oddsAgainst(b, e, a, from);
    const value = o.chance + (o.flanked ? 15 : 0);
    if (!best || value > best.chance) best = { unit: a, chance: o.chance };
  }
  return best;
}

/** How good a spot is: the best shot from it, plus the cover it gives against every agent who can see it. */
function score(b: Battle, e: Unit, p: Pt3): number {
  let shot = 0;
  let exposure = 0;
  let seen = 0;
  for (const a of agents(b)) {
    if (!canSee(b.map, a, p)) continue;
    seen++;
    const c = coverAgainst(b.map, p, a);
    exposure += c.flanked || !c.cover ? 30 : 30 - COVER_PENALTY[c.cover]! * 0.6;
    shot = Math.max(shot, oddsAgainst(b, e, a, p).chance);
  }
  if (!seen) return 0;
  return shot - exposure;
}

function bestSpot(b: Battle, e: Unit): { path: Pt3[]; score: number } | null {
  const r = reach(b, e, e.mobility);
  let best: { i: number; score: number } | null = null;
  for (const [i] of r.cost) {
    const p = fromIdx(b.map, i);
    if (!canStand(b, p) && !(p.x === e.x && p.y === e.y && p.z === e.z)) continue;
    const s = score(b, e, p);
    if (!best || s > best.score) best = { i, score: s };
  }
  if (!best) return null;
  const path = pathTo(b, r, fromIdx(b.map, best.i));
  return path && path.length ? { path, score: best.score } : null;
}

/**
 * A path toward the nearest agent, as far as `budget` allows: the walk is
 * planned over the whole map, then cut where the budget runs out.
 */
function approach(b: Battle, e: Unit, budget: number): Pt3[] | null {
  return approachTo(b, e, agents(b), budget);
}

/** A path toward the nearest of `goals`, as far as `budget` allows (exported for test bots). */
export function approachTo(b: Battle, e: Unit, goals: Pt3[], budget: number): Pt3[] | null {
  if (!goals.length) return null;
  const full = reach(b, e, 999);
  // The cheapest free tile beside a goal, on its level; failing that, the one nearest a goal as the crow flies.
  let goal: { i: number; d: number } | null = null;
  let fallback: { i: number; d: number } | null = null;
  for (const [i, c] of full.cost) {
    const p = fromIdx(b.map, i);
    if (!canStand(b, p) && !(p.x === e.x && p.y === e.y && p.z === e.z)) continue;
    const near = Math.min(...goals.map((a) => distance(a, p)));
    if (near <= 1.5 && (!goal || c < goal.d)) goal = { i, d: c };
    if (!fallback || near < fallback.d) fallback = { i, d: near };
  }
  goal ??= fallback;
  if (!goal) return null;
  const path = pathTo(b, full, fromIdx(b.map, goal.i)) ?? [];
  const cut: Pt3[] = [];
  let spent = 0;
  let prev: Pt3 = e;
  for (const p of path) {
    const c = prev.z !== p.z ? 2 : prev.x !== p.x && prev.y !== p.y ? 1.5 : 1;
    if (spent + c > budget) break;
    spent += c;
    cut.push(p);
    prev = p;
  }
  // Don't stop on someone.
  while (cut.length && !canStand(b, cut.at(-1)!)) cut.pop();
  return cut.length ? cut : null;
}

/** Claws: reach an agent and strike, or run at the nearest. */
function melee(b: Battle, e: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  const r = reach(b, e, e.mobility * Math.max(0, e.ap - 1));
  // A free tile next to an agent, cheapest first.
  let best: { p: Pt3; a: Unit; cost: number } | null = null;
  for (const a of agents(b)) {
    if (distance(a, e) <= 1.5 && a.z === e.z) {
      best = { p: e, a, cost: 0 };
      break;
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const p = { x: a.x + dx, y: a.y + dy, z: a.z };
        if (!dx && !dy) continue;
        const c = r.cost.get(idx(b.map, p.x, p.y, p.z));
        if (c === undefined || !canStand(b, p)) continue;
        if (!best || c < best.cost) best = { p, a, cost: c };
      }
  }
  if (best && e.ap >= 1) {
    if (best.cost > 0) {
      const path = pathTo(b, r, best.p)!;
      e.ap -= 1;
      events.push(...walk(b, e, path));
      if (!onMap(e) || !onMap(best.a)) return events;
    }
    e.ap = 0;
    events.push(...fire(b, e, best.a));
    return events;
  }
  const step = approach(b, e, e.mobility * e.ap);
  e.ap = 0;
  if (step) events.push(...walk(b, e, step));
  return events;
}

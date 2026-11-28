// The enemy's turn (docs/design/tactical.md). Crude, readable rules:
// * Asleep: an enemy that hasn't noticed the team stays put, unless it spots
//   an agent now (then its whole pod wakes, and concealment is over).
// * A thrall with a gun: if it sees an agent, it moves to the spot nearby
//   that best mixes a good shot with good cover, then shoots (or watches,
//   if no shot is worth taking). If it sees nobody, it closes in.
// * A vampire: claws. If an agent is in reach, it closes and strikes. If not,
//   and it hasn't yet, it tries to dominate one it can see. Otherwise it runs
//   (and climbs) at the nearest. By day it keeps out of the sun.
import type { Pt3 } from "./map/map";
import {
  active,
  agents,
  attackCost,
  battleRng,
  detects,
  enemies,
  oddsAgainst,
  sees,
  seenByAgents,
  visibleFoes,
  tuCost,
  TU_COST,
  TU_PER_TILE,
  type Battle,
  type BattleEvent,
  type Unit,
  asleep,
  weak,
  notice,
  isFeral,
} from "./battle";
import { alertPod, canStand, fromIdx, pathTo, reach, reveal, walk, tuTo } from "./movement";
import { attack, burst } from "./harm";
import { ITEMS } from "../data/equipment";
import { adjacent, coverAgainst, COVER_PENALTY, distance, WEAPONS } from "./rules";

/** How far a vampire's will reaches. */
const DOMINATE_RANGE = 10;

/** The whole enemy side acts, unit by unit. */
export function enemyTurn(b: Battle): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const e of enemies(b)) {
    if (b.result) break;
    if (!active(e)) continue;
    if (asleep(b, e)) continue; // by day, a circadian-locked house sleeps
    if (!e.alerted) {
      events.push(...unaware(b, e));
      continue;
    }
    events.push(...act(b, e));
  }
  return events;
}

/** Turns before enemies who've heard the team (helicopter, tactical kit) go looking. */
const SEARCH_FROM_TURN = 4;

/**
 * An enemy that hasn't noticed the team: it notices an agent it can spot.
 * Otherwise it patrols a few tiles; and once the team has been heard and a
 * few turns have passed, it goes looking.
 */
function unaware(b: Battle, e: Unit): BattleEvent[] {
  const spot = () => agents(b).find((a) => detects(b, e, a));
  const spotted = spot();
  if (spotted) return [...reveal(b, spotted), ...alertPod(b, e.pod)];
  if (e.post) return []; // a guard stays put
  let path: Pt3[] | null = null;
  if (!b.concealed && b.turn >= SEARCH_FROM_TURN)
    path = approach(b, e, Math.floor(e.tu / 2))?.path ?? null;
  else if (battleRng(b).chance(0.4)) {
    const r = reach(b, e, 3 * TU_PER_TILE);
    const spots = [...r.cost.keys()].map((i) => fromIdx(b.map, i)).filter((p) => canStand(b, p));
    if (spots.length) path = pathTo(b, r, spots[Math.floor(battleRng(b).next() * spots.length)]!);
  }
  if (!path?.length) return [];
  e.tu = 0;
  const events = walk(b, e, path);
  const now = active(e) && !e.alerted ? spot() : undefined;
  if (now) events.push(...reveal(b, now), ...alertPod(b, e.pod));
  return events;
}

/**
 * A thrall's turn, in TU. Reload when empty. With an agent in sight: move
 * first to a clearly better spot (keeping the time for a shot), then fire
 * snap shots while the TU last and the chance is worth it; else hold the
 * rest for reaction fire (as agents do). With nobody in sight: close in,
 * keeping a snap shot back, and watch.
 */
function act(b: Battle, e: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  const w = WEAPONS[e.weapon];
  if (w.melee) return vampire(b, e);
  // A machine gun fires bursts only.
  const snap = w.burstOnly ? tuCost(e, "burst") : attackCost(e);
  let moved = false;
  for (let guard = 0; e.tu > 0 && active(e) && !b.result && guard < 6; guard++) {
    if (w.clip && e.ammo <= 0) {
      if (e.tu < TU_COST.reload) break;
      e.tu -= TU_COST.reload;
      e.ammo = w.clip;
      events.push({ kind: "status", unit: e.id, text: "Reloaded", seen: seenByAgents(b, e, e) });
      continue;
    }
    const foes = visibleFoes(b, e).filter((f) => f.kind !== "hostage" || f.side === "agent");
    if (foes.length) {
      // Is there a better place to shoot from, within the time that leaves a shot? (A guard holds its post.)
      if (!moved && !e.post && e.tu >= snap * 2) {
        moved = true;
        const here = score(b, e, e);
        const best = bestSpot(b, e, e.tu - snap);
        if (best && best.score > here + 10) {
          e.tu -= best.cost;
          events.push(...walk(b, e, best.path));
          continue;
        }
      }
      const target = bestTarget(b, e, e);
      if (target && target.chance >= 15 && e.tu >= snap) {
        e.tu -= snap;
        events.push(...(w.burstOnly ? burst(b, e, target.unit) : attack(b, e, target.unit)));
        continue;
      }
      if (e.tu >= snap) e.overwatch = true;
      break;
    }
    // Nobody in sight: close in on the nearest agent, keeping a shot back (a guard waits).
    if (moved || e.post || e.tu < snap + TU_PER_TILE) {
      if (e.tu >= snap) e.overwatch = true;
      break;
    }
    moved = true;
    const step = approach(b, e, e.tu - snap);
    if (!step) break;
    e.tu -= step.cost;
    events.push(...walk(b, e, step.path));
  }
  return events;
}

/** The best target from a spot: the highest chance to hit. */
function bestTarget(b: Battle, e: Unit, from: Pt3): { unit: Unit; chance: number } | null {
  let best: { unit: Unit; chance: number; value: number } | null = null;
  for (const a of agents(b)) {
    if (!sees(b, { ...from, kind: e.kind, gear: e.gear, weapon: e.weapon }, a, a)) continue;
    const o = oddsAgainst(b, e, a, from);
    const value = o.chance + (o.flanked ? 15 : 0);
    if (!best || value > best.value) best = { unit: a, chance: o.chance, value };
  }
  return best;
}

/** How good a spot is: the best shot from it, less how exposed it is to every agent who can see it. */
function score(b: Battle, e: Unit, p: Pt3): number {
  let shot = 0;
  let exposure = 0;
  let seen = 0;
  for (const a of agents(b)) {
    if (!sees(b, a, p)) continue;
    seen++;
    const c = coverAgainst(b.map, p, a);
    exposure += c.flanked || !c.cover ? 30 : 30 - COVER_PENALTY[c.cover]! * 0.6;
    if (sees(b, { ...p, kind: e.kind, gear: e.gear, weapon: e.weapon }, a))
      shot = Math.max(shot, oddsAgainst(b, e, a, p).chance);
  }
  if (!seen) return 0;
  return shot - exposure;
}

function bestSpot(
  b: Battle,
  e: Unit,
  budget: number,
): { path: Pt3[]; score: number; cost: number } | null {
  const r = reach(b, e, budget);
  let best: { i: number; score: number } | null = null;
  for (const [i] of r.cost) {
    const p = fromIdx(b.map, i);
    if (!canStand(b, p) && !(p.x === e.x && p.y === e.y && p.z === e.z)) continue;
    const s = score(b, e, p);
    if (!best || s > best.score) best = { i, score: s };
  }
  if (!best) return null;
  const to = fromIdx(b.map, best.i);
  const path = pathTo(b, r, to);
  return path && path.length ? { path, score: best.score, cost: tuTo(b, r, to)! } : null;
}

function approach(b: Battle, e: Unit, budget: number): { path: Pt3[]; cost: number } | null {
  return approachTo(b, e, agents(b), budget);
}

/**
 * A move toward the nearest of `goals`, as far as `budget` TU allow
 * (exported for test bots): the way is planned on the grid across the whole
 * map, then walked as far along it as an any-angle move within the budget
 * reaches.
 */
export function approachTo(
  b: Battle,
  e: Unit,
  goals: Pt3[],
  budget: number,
): { path: Pt3[]; cost: number } | null {
  if (!goals.length || budget <= 0) return null;
  const full = reach(b, e, 9999, false);
  // The cheapest free tile beside a goal, on its level; failing that, the one nearest a goal as the crow flies.
  let goal: { i: number; d: number } | null = null;
  let fallback: { i: number; d: number } | null = null;
  for (const [i, c] of full.cost) {
    const p = fromIdx(b.map, i);
    if (!canStand(b, p) && !(p.x === e.x && p.y === e.y && p.z === e.z)) continue;
    const near = Math.min(...goals.map((a) => distance(a, p)));
    if (goals.some((a) => adjacent(b.map, p, a)) && (!goal || c < goal.d)) goal = { i, d: c };
    if (!fallback || near < fallback.d) fallback = { i, d: near };
  }
  goal ??= fallback;
  if (!goal) return null;
  const way = pathTo(b, full, fromIdx(b.map, goal.i)) ?? [];
  // The farthest tile along the way that a move this turn reaches, and that's free to stand on.
  const near = reach(b, e, budget);
  for (let k = way.length - 1; k >= 0; k--) {
    const p = way[k]!;
    const c = tuTo(b, near, p);
    if (c === undefined || c > budget || !canStand(b, p)) continue;
    const path = pathTo(b, near, p);
    return path?.length ? { path, cost: c } : null;
  }
  return null;
}

/** The odds a vampire's will overcomes an agent's Faith: will + d40 against Faith + d40. */
export function dominateChance(will: number, faith: number): number {
  let wins = 0;
  for (let a = 1; a <= 40; a++) for (let f = 1; f <= 40; f++) if (will + a > faith + f) wins++;
  return wins / 1600;
}

/** A vampire's turn: claws if it can reach someone (blows while the TU last); domination if not; else close in. */
function vampire(b: Battle, e: Unit): BattleEvent[] {
  const events: BattleEvent[] = [];
  const blow = tuCost(e, "melee");
  const r = reach(b, e, e.tu - blow);
  // A free tile next to an agent, cheapest first.
  let best: { p: Pt3; a: Unit; cost: number } | null = null;
  // They learn to keep off the Lantern suit: anyone else first.
  const lantern = (a: Unit) => !!(a.gear.armour && ITEMS[a.gear.armour].lantern);
  const marks = [...agents(b)].sort((x, y) => +lantern(x) - +lantern(y));
  const clean = marks.some((a) => !lantern(a));
  for (const a of marks) {
    if (best && lantern(a) && clean) break;
    if (adjacent(b.map, e, a)) {
      best = { p: e, a, cost: 0 };
      break;
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const p = { x: a.x + dx, y: a.y + dy, z: a.z };
        if (!dx && !dy) continue;
        const c = tuTo(b, r, p);
        if (c === undefined || !canStand(b, p) || !adjacent(b.map, p, a)) continue;
        // A guard strikes only from beside its post.
        if (
          e.post &&
          (p.z !== e.post.z || Math.max(Math.abs(p.x - e.post.x), Math.abs(p.y - e.post.y)) > 1)
        )
          continue;
        if (!best || c < best.cost) best = { p, a, cost: c };
      }
  }
  if (best && e.tu >= best.cost + blow) {
    if (best.cost > 0) {
      const path = pathTo(b, r, best.p)!;
      e.tu -= best.cost;
      events.push(...walk(b, e, path));
      if (!active(e) || !active(best.a)) return events;
    }
    while (e.tu >= blow && active(e) && active(best.a) && !b.result) {
      e.tu -= blow;
      events.push(...attack(b, e, best.a));
    }
    return events;
  }
  // Nobody to claw: bend a mind instead, once a battle, the weakest-willed it can see. It takes the rest of the turn.
  if (e.will > 0 && !isFeral(e) && (!e.dominatedOnce || e.elder) && e.tu >= tuCost(e, "aimed")) {
    const marks = agents(b).filter(
      (a) => !a.dominated && distance(a, e) <= DOMINATE_RANGE && sees(b, e, a),
    );
    const mark = marks.sort((x, y) => x.faith - y.faith)[0];
    if (mark) {
      e.dominatedOnce = true;
      e.tu = 0;
      e.hidden = false;
      // Pheromone blockers break a one-compound house's hold outright.
      if (b.mods.blockers && weak(b, "one-compound"))
        return [
          { kind: "status", unit: mark.id, text: "Resists the will", seen: true },
          ...notice(b, "one-compound", e, "Its will breaks on the blockers"),
        ];
      const will = Math.max(0, e.will - (b.mods.will ?? 0));
      const won = battleRng(b).next() < dominateChance(will, mark.faith);
      if (won) {
        mark.dominated = true;
        mark.overwatch = false;
      }
      return [
        {
          kind: "status",
          unit: mark.id,
          text: won ? "Dominated!" : "Resists the will",
          seen: true,
        },
      ];
    }
  }
  if (e.post) return events; // a guard doesn't go hunting
  const step = approach(b, e, e.tu);
  e.tu = 0;
  if (step) events.push(...walk(b, e, step.path));
  return events;
}

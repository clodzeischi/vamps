// A player bot for the battlescape (tests and balance; docs/WEB_PORT.md 3.11
// T5). It plays like a careful beginner:
// * finish a vampire in torpor in reach; else reload when empty;
// * shoot the best target if the chance is decent (30%+), or if it's the
//   last action;
// * otherwise move: to the reachable spot that best mixes a shot at
//   someone with cover against everyone who can see it, or, with nobody in
//   sight, a step along the way to the nearest enemy (bodies first).
// It doesn't throw incendiaries, overwatch, flank on purpose or use
// concealment, so a thoughtful player should do better.
import { approachTo } from "./ai";
import {
  agents, bleederInReach, bodiesInReach, commandFinish, commandStabilize, commandMove, commandShoot, endTurn, enemies, fromIdx, oddsAgainst, reach, sees, unitAt, visibleFoes,
  type Battle, type BattleResult, type Unit,
} from "./battle";
import type { Pt3 } from "./map";
import { coverAgainst, COVER_PENALTY, WEAPONS } from "./rules";

/** How good a spot is for an agent: the best shot from it, less how exposed it is. */
function spotValue(b: Battle, a: Unit, p: Pt3): number | null {
  let shot = 0;
  let exposure = 0;
  let any = false;
  for (const e of enemies(b)) {
    if (e.torpor) continue;
    if (sees(b, e, p)) {
      const c = coverAgainst(b.map, p, e);
      exposure += c.flanked || !c.cover ? 25 : 25 - COVER_PENALTY[c.cover]! * 0.5;
    }
    if (sees(b, { ...p, kind: a.kind }, e, e)) {
      any = true;
      shot = Math.max(shot, oddsAgainst(b, a, e, p).chance);
    }
  }
  return any ? shot - exposure : null;
}

export function botTurn(b: Battle) {
  for (const a of agents(b)) {
    for (let k = 0; k < 3 && a.ap > 0 && !b.result; k++) {
      const hurt = bleederInReach(b, a);
      if (hurt) {
        commandStabilize(b, a, hurt);
        continue;
      }
      const body = bodiesInReach(b, a)[0];
      if (body) {
        commandFinish(b, a, body);
        continue;
      }
      if (WEAPONS[a.weapon].clip && a.ammo <= 0) {
        a.ammo = WEAPONS[a.weapon].clip;
        a.ap -= 1;
        continue;
      }
      const foes = visibleFoes(b, a).filter((f) => f.side === "enemy");
      const best = foes.sort((x, y) => oddsAgainst(b, a, y).chance - oddsAgainst(b, a, x).chance)[0];
      const chance = best ? oddsAgainst(b, a, best).chance : 0;
      if (best && (chance >= 45 || (a.ap === 1 && chance >= 20))) {
        commandShoot(b, a, best);
        break;
      }
      // Move: a better firing position near by, or closer.
      const r = reach(b, a, a.mobility);
      let spot: Pt3 | null = null;
      let value = best ? (spotValue(b, a, a) ?? -Infinity) + 5 : -Infinity;
      for (const [i] of r.cost) {
        const p = fromIdx(b.map, i);
        if (unitAt(b, p)) continue;
        const v = spotValue(b, a, p);
        if (v !== null && v > value) (value = v), (spot = p);
      }
      if (!spot) {
        if (best) {
          commandShoot(b, a, best);
          break;
        }
        const down = enemies(b).filter((e) => e.torpor > 0);
        spot = approachTo(b, a, down.length ? down : enemies(b), a.mobility)?.at(-1) ?? null;
      }
      if (!spot || typeof commandMove(b, a, spot) === "string") break;
    }
  }
}

/** Plays a battle to its end (or `maxTurns`). */
export function playOut(b: Battle, maxTurns = 40): BattleResult | null {
  for (let t = 0; t < maxTurns && !b.result; t++) {
    botTurn(b);
    if (!b.result) endTurn(b);
  }
  return b.result;
}

// Turns: the end of a side's turn, the start of the next, and whether the battle is over.
import { indoors } from "./map/map";
import { enemyTurn } from "./ai";
import {
  type Battle,
  type BattleEvent,
  isDown,
  enemies,
  onMap,
  burning,
  RISE_HEALTH,
  seenByAgents,
  agents,
  daze,
  unstoppable,
  AGNES_HEAL,
} from "./battle";
import { burn, dropLoot } from "./harm";
import { holdForReactions } from "./commands";

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
      dropLoot(b, u);
      events.push({ kind: "death", unit: u.id, text: "Bled out" });
      continue;
    }
    if (unstoppable(u) && u.torpor === 0 && u.hp < u.maxHp)
      u.hp = Math.min(u.maxHp, u.hp + AGNES_HEAL);
    if (u.torpor > 0 && --u.torpor === 0) {
      if (u.doomed && !unstoppable(u)) {
        // Its blood won't clot, or its repair is stalled: it never wakes.
        u.alive = false;
        events.push({ kind: "death", unit: u.id, text: "Never rises" });
        continue;
      }
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
  holdForReactions(b);
  b.side = "enemy";
  events.push({ kind: "turn", side: "enemy", turn: b.turn });
  for (const e of enemies(b)) {
    e.tu = e.torpor ? 0 : e.maxTu;
    e.overwatch = false;
    if (!e.torpor) events.push(...daze(b, e));
  }
  events.push(...startOfTurn(b, "enemy"));
  if (!b.result) events.push(...enemyTurn(b));
  if (b.result) return events;
  b.side = "agent";
  b.turn++;
  events.push({ kind: "turn", side: "agent", turn: b.turn });
  for (const a of agents(b)) {
    a.tu = a.maxTu;
    a.overwatch = false;
  }
  events.push(...startOfTurn(b, "agent"));
  // A dominated agent stands slack-jawed through this turn (half of it, with Discernment of spirits).
  for (const a of agents(b))
    if (a.dominated) {
      a.dominated = false;
      a.tu = b.mods.discern ? Math.floor(a.tu / 2) : 0;
      events.push({
        kind: "status",
        unit: a.id,
        text: b.mods.discern ? "Dominated: loses half the turn" : "Dominated: loses the turn",
        seen: true,
      });
    }
  return events;
}

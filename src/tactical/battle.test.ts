import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type BattleMap, type Pt3 } from "./map";
import { generateMap } from "./mapgen";
import { coverAgainst, lineOfSight, shotOdds } from "./rules";
import {
  agents, commandMove, commandOverwatch, commandShoot, endTurn, enemies, newSkirmish, oddsAgainst, reach, visibleFoes,
  type Battle,
} from "./battle";
import { idx } from "./map";
import { approachTo } from "./ai";

/** An open 16 × 16 floor, one level (two with `upper`). */
function field(upper = false): BattleMap {
  const m = emptyMap(16, 16, upper ? 2 : 1, 0, "urban", 1);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.lz = [{ x: 0, y: 0, z: 0 }];
  return m;
}

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

describe("tactical rules", () => {
  it("sight: walls block it, windows and low cover don't, floors do", () => {
    const m = field(true);
    expect(lineOfSight(m, P(1, 5), P(10, 5))).toBe(true);
    setTile(m, 5, 5, 0, T.WALL, "brick");
    expect(lineOfSight(m, P(1, 5), P(10, 5))).toBe(false);
    setTile(m, 5, 5, 0, T.WINDOW, "none");
    expect(lineOfSight(m, P(1, 5), P(10, 5))).toBe(true);
    setTile(m, 5, 5, 0, T.LOW, "crate");
    expect(lineOfSight(m, P(1, 5), P(10, 5))).toBe(true);
    // A roof over the target: someone up there can't see through it, someone at the edge can see down.
    for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) setTile(m, x, y, 1, T.FLOOR, "roof");
    expect(lineOfSight(m, P(12, 12, 1), P(12, 14, 0))).toBe(false);
    expect(lineOfSight(m, P(8, 8, 1), P(2, 2, 0))).toBe(true);
  });

  it("cover only counts on the side facing the shooter", () => {
    const m = field();
    setTile(m, 6, 5, 0, T.LOW, "crate"); // east of the target at (5, 5)
    expect(coverAgainst(m, P(5, 5), P(12, 5))).toEqual({ cover: 1, flanked: false });
    expect(coverAgainst(m, P(5, 5), P(12, 8))).toEqual({ cover: 1, flanked: false });
    expect(coverAgainst(m, P(5, 5), P(0, 5))).toEqual({ cover: 0, flanked: true });
    expect(coverAgainst(m, P(5, 5), P(5, 12))).toEqual({ cover: 0, flanked: true });
    setTile(m, 6, 5, 0, T.WALL, "brick");
    expect(coverAgainst(m, P(5, 5), P(12, 5)).cover).toBe(2);
  });

  it("hit chance: aim, less cover, less range; flanking raises the crit", () => {
    const m = field();
    const open = shotOdds(m, { ...P(1, 5), aim: 65, weapon: "rifle" }, P(9, 5));
    expect(open.chance).toBe(65);
    setTile(m, 8, 5, 0, T.LOW, "crate");
    const half = shotOdds(m, { ...P(1, 5), aim: 65, weapon: "rifle" }, P(9, 5));
    expect(half.chance).toBe(45);
    expect(half.why.map((w) => w.label)).toContain("Half cover");
    const flank = shotOdds(m, { ...P(14, 5), aim: 65, weapon: "rifle" }, P(9, 5));
    expect(flank.flanked).toBe(true);
    expect(flank.crit).toBeGreaterThan(open.crit);
    // A shotgun across the map is a waste.
    expect(shotOdds(m, { ...P(1, 1), aim: 65, weapon: "shotgun" }, P(14, 14)).chance).toBeLessThan(10);
  });
});

/** A battle on a hand-made map: agents and enemies where we put them. */
function duel(m: BattleMap, agentsAt: Pt3[], enemiesAt: Pt3[]): Battle {
  m.spawns = enemiesAt.map((p) => ({ ...p, side: "thrall" as const }));
  m.lz = Array.from({ length: 9 }, (_, i) => agentsAt[i % agentsAt.length]!);
  const b = newSkirmish(m, 3);
  // newSkirmish places four agents on the landing zone; keep one per spot asked for.
  b.units = b.units.filter((u, i) => u.side !== "agent" || i < agentsAt.length);
  agentsAt.forEach((p, i) => Object.assign(b.units[i]!, p));
  for (const e of enemies(b)) Object.assign(e, { weapon: "rifle", ammo: 4, hp: 5, maxHp: 5 });
  return b;
}

describe("battle", () => {
  it("moves cost an action within mobility, two for a dash, and walls are walked round", () => {
    const m = field();
    for (let y = 0; y < 15; y++) setTile(m, 6, y, 0, T.WALL, "brick");
    const b = duel(m, [P(4, 4)], [P(14, 14)]);
    const a = agents(b)[0]!;
    const r = reach(b, a);
    expect(r.cost.has(idx(m, 8, 4, 0))).toBe(false); // round the wall is more than 14
    expect(r.cost.get(idx(m, 4, 10, 0))).toBe(6);
    expect(commandMove(b, a, P(4, 10))).not.toBeTypeOf("string");
    expect(a.ap).toBe(1);
    expect(commandMove(b, a, P(4, 13))).not.toBeTypeOf("string");
    expect(a.ap).toBe(0);
    expect(commandMove(b, a, P(4, 14))).toBe("Out of reach");
  });

  it("overwatch fires at a unit moving in sight", () => {
    const m = field();
    const b = duel(m, [P(2, 8)], [P(14, 8)]);
    const [a] = agents(b);
    const e = enemies(b)[0]!;
    commandOverwatch(b, a!);
    e.alerted = true;
    e.ap = 2;
    // Move the enemy itself: the agent's overwatch takes its shot.
    const ev = commandMove(b, e, P(12, 8));
    expect(Array.isArray(ev)).toBe(true);
    const shots = (ev as { kind: string; reaction?: boolean }[]).filter((x) => x.kind === "shot");
    expect(shots).toHaveLength(1);
    expect(shots[0]!.reaction).toBe(true);
    expect(a!.overwatch).toBe(false);
  });

  it("shooting costs the turn, and needs sight", () => {
    const m = field();
    setTile(m, 8, 8, 0, T.WALL, "brick");
    const b = duel(m, [P(2, 8)], [P(12, 8)]);
    const a = agents(b)[0]!;
    const e = enemies(b)[0]!;
    expect(commandShoot(b, a, e)).toBe("No line of sight");
    a.y = 10;
    expect(visibleFoes(b, a)).toContain(e);
    expect(Array.isArray(commandShoot(b, a, e))).toBe(true);
    expect(a.ap).toBe(0);
  });

  /** A blunt player: shoot the best visible target, else walk at the nearest enemy. */
  function botTurn(b: Battle) {
    for (const a of agents(b)) {
      for (let k = 0; k < 2 && a.ap > 0 && !b.result; k++) {
        const foes = visibleFoes(b, a).filter((f) => f.side === "enemy");
        if (a.ammo <= 0) {
          a.ammo = 4;
          a.ap -= 1;
          continue;
        }
        if (foes.length) {
          const t = foes.sort((x, y) => oddsAgainst(b, a, y).chance - oddsAgainst(b, a, x).chance)[0]!;
          if (oddsAgainst(b, a, t).chance >= 30 || a.ap === 1) {
            commandShoot(b, a, t);
            break;
          }
        }
        const path = approachTo(b, a, enemies(b), a.mobility);
        const best = path?.at(-1);
        if (!best || typeof commandMove(b, a, best) === "string") break;
      }
    }
  }

  it("whole battles play out to an end, on generated maps", () => {
    const tally = { won: 0, lost: 0, aborted: 0, stuck: 0 };
    for (let seed = 1; seed <= 24; seed++) {
      const map = generateMap({ setting: seed % 2 ? "urban" : "rural", size: "nest", seed, thralls: 3, vampires: 1, civilians: 1 });
      const b = newSkirmish(map, seed);
      for (let t = 0; t < 40 && !b.result; t++) {
        botTurn(b);
        if (!b.result) endTurn(b);
      }
      if (b.result) tally[b.result]++;
      else tally.stuck++;
      for (const u of b.units) expect(u.hp).toBeGreaterThanOrEqual(0);
    }
    console.log("bot battles", tally);
    expect(tally.won + tally.lost).toBeGreaterThan(18);
  });
});

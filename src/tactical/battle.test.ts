import { describe, expect, it } from "vitest";
import { E, emptyMap, setEdge, setTile, T, type BattleMap, type Pt3 } from "./map";
import { generateMap } from "./mapgen";
import { coverAgainst, leans, lineOfSight, shotOdds, sightPoint } from "./rules";
import {
  agents, aimFrom, attackCost, commandIncendiary, commandMove, commandOpenDoor, doorsInReach, leanFor, TU_COST, TU_PER_TILE, DEFAULT_OPTIONS, holdForReactions, commandShoot, endTurn, enemies, newSkirmish, pathTo, reach, shotCost, tuTo, visibleFoes,
  type Battle,
} from "./battle";
import { chaikin } from "./path";
import { coverAround } from "./rules";
import { edgeAt, idx } from "./map";
import { botTurn } from "./bot";

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

  it("thin walls on the edges: walls block sight and give full cover; windows let sight through, half cover; doorways are open", () => {
    const m = field();
    // A wall along the edge between x = 5 and x = 6, rows 2 to 8, with a window at row 4 and a doorway at row 6.
    for (let y = 2; y <= 8; y++) setEdge(m, 5, y, 0, 1, 0, y === 4 ? E.WINDOW : y === 6 ? E.DOOR : E.WALL);
    expect(lineOfSight(m, P(2, 3), P(10, 3))).toBe(false);
    expect(lineOfSight(m, P(2, 4), P(10, 4))).toBe(true);
    expect(lineOfSight(m, P(2, 6), P(10, 6))).toBe(true);
    // The tiles either side keep their floor: the wall takes no room.
    expect(coverAround(m, P(5, 3))[0]).toBe(2);
    expect(coverAround(m, P(6, 3))[1]).toBe(2);
    expect(coverAround(m, P(5, 4))[0]).toBe(1);
    expect(coverAround(m, P(5, 6))[0]).toBe(0);
    expect(coverAgainst(m, P(6, 3), P(1, 1)).cover).toBe(2);
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

  it("point blank is near certain, even for a rifle", () => {
    const m = field();
    const pb = shotOdds(m, { ...P(4, 5), aim: 62, weapon: "rifle" }, P(5, 5));
    expect(pb.chance).toBe(87);
    expect(pb.why.map((w) => w.label)).toContain("Point blank");
    expect(shotOdds(m, { ...P(2, 5), aim: 62, weapon: "pistol" }, P(5, 5)).chance).toBe(72);
  });
});

/** A battle on a hand-made map: agents and enemies where we put them. */
function duel(m: BattleMap, agentsAt: Pt3[], enemiesAt: Pt3[]): Battle {
  m.spawns = enemiesAt.map((p) => ({ ...p, side: "thrall" as const }));
  m.lz = Array.from({ length: 9 }, (_, i) => agentsAt[i % agentsAt.length]!);
  const b = newSkirmish(m, 3, { ...DEFAULT_OPTIONS, night: false });
  // newSkirmish places four agents on the landing zone; keep one per spot asked for.
  b.units = b.units.filter((u, i) => u.side !== "agent" || i < agentsAt.length);
  agentsAt.forEach((p, i) => Object.assign(b.units[i]!, p));
  for (const e of enemies(b)) Object.assign(e, { weapon: "rifle", ammo: 4, hp: 30, maxHp: 30 });
  return b;
}

describe("battle", () => {
  it("moves cost TU by the distance walked, and walls (on the edges) are walked round", () => {
    const m = field();
    for (let y = 0; y < 15; y++) setEdge(m, 6, y, 0, 1, 0, E.WALL);
    const b = duel(m, [P(4, 4)], [P(14, 14)]);
    const a = agents(b)[0]!;
    a.maxTu = a.tu = 60;
    const r = reach(b, a);
    expect(r.cost.has(idx(m, 8, 4, 0))).toBe(false); // round the wall is more than 15 tiles
    expect(r.cost.has(idx(m, 6, 4, 0))).toBe(true); // the tile against the wall is still floor
    expect(tuTo(b, r, P(4, 10))).toBe(24);
    expect(commandMove(b, a, P(4, 10))).not.toBeTypeOf("string");
    expect(a.tu).toBe(36);
    expect(commandMove(b, a, P(4, 13))).not.toBeTypeOf("string");
    expect(a.tu).toBe(24);
    expect(commandMove(b, a, P(14, 13))).toBe("Out of reach");
  });

  it("any-angle paths: straight where nothing's in the way, round corners where something is", () => {
    const m = field();
    const b = duel(m, [P(2, 2)], [P(15, 15)]);
    const a = agents(b)[0]!;
    a.maxTu = a.tu = 80;
    let r = reach(b, a);
    // A knight's-move line costs its length, not a zigzag.
    expect(tuTo(b, r, P(6, 4))).toBe(Math.ceil(Math.hypot(4, 2) * 4));
    expect(pathTo(b, r, P(6, 4))).toEqual([P(6, 4)]);
    // A wall in the way: the path bends round its end.
    for (let y = 0; y <= 5; y++) setEdge(m, 4, y, 0, 1, 0, E.WALL);
    r = reach(b, a);
    const path = pathTo(b, r, P(8, 2))!;
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(P(8, 2));
    expect(path.some((p) => p.y >= 6)).toBe(true);
    // Chaikin rounds the corners and keeps the ends.
    const pts = [P(0, 0), P(4, 0), P(4, 4)];
    const smooth = chaikin(pts);
    expect(smooth[0]).toEqual(P(0, 0));
    expect(smooth.at(-1)).toEqual(P(4, 4));
    expect(smooth.length).toBeGreaterThan(pts.length);
    expect(smooth.some((p) => p.x === 4 && p.y === 0)).toBe(false);
  });

  it("an agent left with TU and rounds at the end of the turn reacts to a unit moving in sight", () => {
    const m = field();
    const b = duel(m, [P(2, 8)], [P(14, 8)]);
    const [a] = agents(b);
    const e = enemies(b)[0]!;
    holdForReactions(b);
    expect(a!.overwatch).toBe(true);
    const before = a!.tu;
    e.alerted = true;
    e.tu = e.maxTu;
    // Move the enemy itself: the agent's overwatch takes its shot.
    const ev = commandMove(b, e, P(12, 8));
    expect(Array.isArray(ev)).toBe(true);
    const shots = (ev as { kind: string; reaction?: boolean }[]).filter((x) => x.kind === "shot");
    expect(shots).toHaveLength(1);
    expect(shots[0]!.reaction).toBe(true);
    // The shot came out of the TU held back.
    expect(a!.tu).toBe(before - attackCost(a!));
  });

  it("a snap shot costs a share of the TU, an aimed one more; both need sight", () => {
    const m = field();
    setTile(m, 8, 8, 0, T.WALL, "brick");
    const b = duel(m, [P(2, 8)], [P(12, 8)]);
    const a = agents(b)[0]!;
    const e = enemies(b)[0]!;
    expect(commandShoot(b, a, e)).toBe("Can't see it");
    a.y = 10;
    expect(visibleFoes(b, a)).toContain(e);
    const tu = a.tu;
    expect(Array.isArray(commandShoot(b, a, e))).toBe(true);
    expect(a.tu).toBe(tu - shotCost(a));
    expect(shotCost(a, "aimed")).toBeGreaterThan(shotCost(a));
  });

  it("leaning: behind full cover at its end, a unit looks, shoots and throws round it; not along a wall that goes on", () => {
    const m = field();
    setTile(m, 5, 5, 0, T.HIGH, "tree"); // a tree east of the agent at (4, 5)
    expect(leans(m, P(4, 5)).map((l) => l.at)).toEqual([P(4, 4), P(4, 6)]);
    // Straight behind the tree: blocked direct, seen leaning out (one side only, though both would do).
    expect(lineOfSight(m, P(4, 5), P(10, 5))).toBe(false);
    expect(sightPoint(m, P(4, 5), P(10, 5))).toEqual(P(4, 4));
    // Off to one side: from the side that sees it.
    expect(sightPoint(m, P(4, 5), P(10, 9))).toEqual(P(4, 6));
    // Nothing leans round cover that isn't between: behind the agent is seen directly.
    expect(sightPoint(m, P(4, 5), P(0, 5))).toEqual(P(4, 5));
    const b = duel(m, [P(4, 5)], [P(10, 5)]);
    const a = agents(b)[0]!;
    const e = enemies(b)[0]!;
    expect(visibleFoes(b, a)).toContain(e);
    expect(leanFor(b, a, e)).toEqual(P(4, 4));
    const ev = commandShoot(b, a, e);
    expect(Array.isArray(ev) && ev.find((x) => x.kind === "shot")).toMatchObject({ lean: P(4, 4) });
    // A throw leans out too.
    a.tu = a.maxTu;
    a.gear.stowed.push({ item: "incendiary", in: "pocket0", x: 0, y: 0 });
    const thrown = commandIncendiary(b, a, P(10, 5));
    expect(Array.isArray(thrown) && thrown[0]).toMatchObject({ kind: "throw", lean: P(4, 4) });
    // Blows don't lean.
    a.weapon = "knife";
    expect(aimFrom(b, a, e)).toEqual(P(4, 5));
    // A wall that runs on (edges x = 4|5, the whole column): nothing to lean round.
    const w = field();
    for (let y = 0; y < 16; y++) setEdge(w, 4, y, 0, 1, 0, E.WALL);
    expect(leans(w, P(4, 5))).toEqual([]);
    expect(sightPoint(w, P(4, 5), P(10, 5))).toBeNull();
    // Its end: the agent at the last tile of a wall (rows 0–5) leans out past it.
    const end = field();
    for (let y = 0; y <= 5; y++) setEdge(end, 4, y, 0, 1, 0, E.WALL);
    expect(leans(end, P(4, 5)).map((l) => l.at)).toEqual([P(4, 6)]);
    expect(sightPoint(end, P(4, 5), P(10, 4))).toEqual(P(4, 6));
  });

  it("closed doors: block sight, cost TU to walk through (opening them for good), open from beside them", () => {
    const m = field();
    // A wall along x = 5|6 the whole height of the map, a closed door at row 5.
    for (let y = 0; y < 16; y++) setEdge(m, 5, y, 0, 1, 0, y === 5 ? E.SHUT : E.WALL);
    const b = duel(m, [P(5, 5)], [P(9, 5)]);
    const a = agents(b)[0]!;
    const e = enemies(b)[0]!;
    expect(visibleFoes(b, a)).not.toContain(e);
    // The walk through costs a step plus the door.
    const r = reach(b, a);
    expect(tuTo(b, r, P(6, 5))).toBe(TU_PER_TILE + TU_COST.door);
    // Posted up beside it (on the next tile along the wall), the door is in reach; two tiles off, it isn't.
    a.y = 4;
    expect(doorsInReach(b, a)).toEqual([{ x: 5, y: 5, z: 0, dx: 1, dy: 0 }]);
    a.y = 3;
    expect(doorsInReach(b, a)).toEqual([]);
    expect(commandOpenDoor(b, a, { x: 5, y: 5, z: 0, dx: 1, dy: 0 })).toBe("No closed door within reach");
    a.y = 4;
    const tu = a.tu;
    const ev = commandOpenDoor(b, a, { x: 6, y: 5, z: 0, dx: -1, dy: 0 });
    expect(Array.isArray(ev) && ev[0]).toMatchObject({ kind: "door", at: { x: 5, y: 5, z: 0, dx: 1, dy: 0 } });
    expect(a.tu).toBe(tu - TU_COST.door);
    expect(edgeAt(m, 5, 5, 0, 1, 0)).toBe(E.DOOR);
    expect(doorsInReach(b, a)).toEqual([]);
    // Open: seen through from in front of it, and the walk through is a plain step.
    a.y = 5;
    expect(visibleFoes(b, a)).toContain(e);
    expect(tuTo(b, reach(b, a), P(6, 5))).toBe(TU_PER_TILE);
    // Walking through a closed door opens it on the way: up to it, open, on; the enemy behind it stops the walk (contact).
    setEdge(m, 5, 5, 0, 1, 0, E.SHUT);
    a.x = 3;
    a.tu = a.maxTu;
    const walked = commandMove(b, a, P(8, 5));
    if (!Array.isArray(walked)) throw new Error(walked);
    expect(walked.map((x) => x.kind).slice(0, 2)).toEqual(["move", "door"]);
    expect(walked[0]).toMatchObject({ path: [P(5, 5)] });
    expect(walked.at(-1)).toMatchObject({ kind: "status", text: "Contact" });
    expect(edgeAt(m, 5, 5, 0, 1, 0)).toBe(E.DOOR);
  });

  it("glass: seen and shot through, no cover, not walked through; a shot shatters it", () => {
    const m = field();
    for (let y = 0; y < 16; y++) setEdge(m, 5, y, 0, 1, 0, E.GLASS);
    const b = duel(m, [P(2, 5)], [P(9, 5)]);
    const a = agents(b)[0]!;
    const e = enemies(b)[0]!;
    expect(visibleFoes(b, a)).toContain(e);
    expect(coverAround(m, P(5, 5))[0]).toBe(0);
    expect(tuTo(b, reach(b, a), P(6, 5))).toBeUndefined(); // no way through
    const ev = commandShoot(b, a, e);
    expect(Array.isArray(ev) && ev.find((x) => x.kind === "glass")).toMatchObject({ panes: [{ x: 5, y: 5, z: 0, dx: 1, dy: 0 }] });
    expect(edgeAt(m, 5, 5, 0, 1, 0)).toBe(E.NONE);
    expect(edgeAt(m, 5, 4, 0, 1, 0)).toBe(E.GLASS);
  });

  it("windows: a shot through one breaks the glass and leaves the sill (still half cover); shards fly from the shooter", () => {
    const m = field();
    for (let y = 0; y < 16; y++) setEdge(m, 5, y, 0, 1, 0, y === 5 ? E.WINDOW : E.WALL, "brick");
    const b = duel(m, [P(2, 5)], [P(9, 5)]);
    const a = agents(b)[0]!;
    const e = enemies(b)[0]!;
    const ev = commandShoot(b, a, e);
    expect(Array.isArray(ev) && ev.find((x) => x.kind === "glass")).toMatchObject({ panes: [{ x: 5, y: 5, z: 0, dx: 1, dy: 0 }], from: P(2, 5) });
    expect(edgeAt(m, 5, 5, 0, 1, 0)).toBe(E.SILL);
    expect(coverAround(m, P(6, 5))[1]).toBe(1);
    expect(lineOfSight(m, P(2, 5), P(9, 5))).toBe(true);
    // A sill doesn't break again.
    a.tu = a.maxTu;
    const again = commandShoot(b, a, e);
    expect(Array.isArray(again) && again.some((x) => x.kind === "glass")).toBe(false);
  });

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
  }, 30_000); // 24 whole battles: ~1.6 s here, past the 5 s default on CI runners

  it("battles play out on the tall sites too: an apartment block (landing on the roof) and a works yard", () => {
    const tally = { won: 0, lost: 0, aborted: 0, stuck: 0 };
    for (let seed = 1; seed <= 8; seed++) {
      const map = generateMap({ setting: seed % 2 ? "apartments" : "industrial", size: "nest", seed, thralls: 3, vampires: 1, civilians: 1 });
      const b = newSkirmish(map, seed, { ...DEFAULT_OPTIONS, arrival: "helicopter" });
      expect(b.units.filter((u) => u.kind === "agent").every((u) => u.z === map.airLz![0]!.z)).toBe(true);
      for (let t = 0; t < 40 && !b.result; t++) {
        botTurn(b);
        if (!b.result) endTurn(b);
      }
      if (b.result) tally[b.result]++;
      else tally.stuck++;
    }
    console.log("tall-site bot battles", tally);
    expect(tally.won + tally.lost).toBeGreaterThan(4);
  }, 30_000);

  it("a lair battle plays out, and fast enough", () => {
    const t0 = Date.now();
    let ended = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const map = generateMap({ setting: seed === 3 ? "montsegur" : "lair", size: "lair", seed, thralls: 14, vampires: 6 });
      const b = newSkirmish(map, seed, { ...DEFAULT_OPTIONS, bloodline: seed === 3 ? "carcassonne" : "jade" });
      expect(b.units.some((u) => u.elder)).toBe(true);
      for (let t = 0; t < 50 && !b.result; t++) {
        botTurn(b);
        if (!b.result) endTurn(b);
      }
      if (b.result) ended++;
    }
    expect(ended).toBeGreaterThanOrEqual(2);
    expect(Date.now() - t0).toBeLessThan(20000);
  }, 30_000); // its own budget is 20 s; ~1.5 s here, past the 5 s default on CI runners
});

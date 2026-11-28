import { describe, expect, it } from "vitest";
import {
  cepRadius,
  deviate,
  estimate,
  muzzle,
  pelletCone,
  pointAim,
  spread,
  toWorld,
  trace,
  type Figure,
} from "./ballistics";
import { E, edgeAt, emptyMap, setEdge, setTile, T, type BattleMap, type Pt3 } from "./map/map";
import { agents, DEFAULT_OPTIONS, enemies, type Battle } from "./battle";
import { commandShoot, commandShootAt, forceBlocker } from "./commands";
import { newSkirmish } from "./setup";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function field(): BattleMap {
  const m = emptyMap(20, 20, 2, 0, "urban", 1);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.lz = [P(0, 0)];
  return m;
}

const fig = (id: string, p: Pt3, h = 1.78): Figure => ({ id, ...p, h, r: 0.3 });
/** A round straight at a tile's chest height. */
const straight = (m: BattleMap, from: Pt3, to: Pt3, figs: Figure[]) => {
  const a = muzzle(from, "agent");
  return trace(m, a, deviate(a, pointAim(to), 0, 0), figs, "me");
};

describe("ballistics", () => {
  it("the cone: the weapon's base accuracy, tightened by skill and an aimed shot, widened by a burst or reaction fire", () => {
    const novice = { aim: 50, insight: 0, weapon: "rifle" as const };
    const master = { aim: 100, insight: 100, weapon: "rifle" as const };
    expect(spread(master)).toBeLessThan(spread(novice));
    expect(spread(novice, "aimed")).toBeLessThan(spread(novice));
    expect(spread(novice, "burst")).toBeGreaterThan(spread(novice));
    expect(spread(novice, "snap", true)).toBeGreaterThan(spread(novice));
    expect(spread({ ...novice, weapon: "pistol" })).toBeGreaterThan(spread(novice));
    // The CEP grows with distance.
    const s = spread(novice);
    expect(cepRadius(s, 20)).toBeCloseTo(2 * cepRadius(s, 10), 6);
  });

  it("the AI's estimate: nearer is surer, cover hides most of a figure, a shotgun is for close work", () => {
    const m = field();
    const s = spread({ aim: 70, insight: 40, weapon: "rifle" });
    const near = estimate(m, s, "rifle", P(5, 5), P(9, 5), "thrall");
    const far = estimate(m, s, "rifle", P(1, 5), P(16, 5), "thrall");
    expect(near).toBeGreaterThan(far);
    setTile(m, 15, 5, 0, T.LOW, "crate");
    expect(estimate(m, s, "rifle", P(1, 5), P(16, 5), "thrall")).toBeLessThan(far / 2);
    const sg = spread({ aim: 70, insight: 40, weapon: "shotgun" });
    expect(estimate(m, sg, "shotgun", P(5, 10), P(7, 10), "thrall")).toBeGreaterThan(0.9);
    expect(estimate(m, sg, "shotgun", P(1, 10), P(18, 10), "thrall")).toBeLessThan(
      estimate(m, sg, "shotgun", P(5, 10), P(7, 10), "thrall") / 2,
    );
  });

  it("a round says what it struck, for the view's effects: a unit, a surface's skin and its face, or nothing", () => {
    const m = field();
    expect(straight(m, P(2, 5), P(12, 5), [fig("t", P(12, 5))]).struck).toBe("unit");
    // A brick wall across the line: its skin, the face toward the shooter (−x).
    setEdge(m, 7, 5, 0, 1, 0, E.WALL, "brick");
    const wall = straight(m, P(2, 5), P(12, 5), []);
    expect(wall.struck).toBe("brick");
    expect(wall.n).toEqual({ x: -1, y: 0, z: 0 });
    setEdge(m, 7, 5, 0, 1, 0, E.NONE);
    // A shut door is wood.
    setEdge(m, 7, 5, 0, 1, 0, E.SHUT, "plaster");
    expect(straight(m, P(2, 5), P(12, 5), []).struck).toBe("wood");
    setEdge(m, 7, 5, 0, 1, 0, E.NONE);
    // Off the map: nothing.
    expect(straight(m, P(2, 5), P(19, 5), []).struck).toBeNull();
    // Into the floor: the floor's skin, facing up.
    const a = muzzle(P(2, 5), "agent");
    const down = trace(m, a, deviate(a, toWorld(P(6, 5), 0), 0, 0), [], "me");
    expect(down.struck).toBe("pavement");
    expect(down.n).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("a round flies until it meets something: a figure, the first one in the way, a wall, the low cover it's fired into", () => {
    const m = field();
    expect(straight(m, P(2, 5), P(12, 5), [fig("t", P(12, 5))]).unit).toBe("t");
    // A friend in the way takes it.
    expect(straight(m, P(2, 5), P(12, 5), [fig("t", P(12, 5)), fig("friend", P(6, 5))]).unit).toBe(
      "friend",
    );
    // A wall stops it short.
    setEdge(m, 7, 5, 0, 1, 0, E.WALL);
    const walled = straight(m, P(2, 5), P(12, 5), [fig("t", P(12, 5))]);
    expect(walled.unit).toBeNull();
    expect(walled.at.x).toBeLessThan(8 * 1.5 + 0.1);
    setEdge(m, 7, 5, 0, 1, 0, E.NONE);
    // A crate: a round at the target's knees hits the crate; one at its chest flies over.
    setTile(m, 9, 5, 0, T.LOW, "crate");
    const a = muzzle(P(2, 5), "agent");
    expect(
      trace(m, a, deviate(a, toWorld(P(12, 5), 0.3), 0, 0), [fig("t", P(12, 5))], "me").unit,
    ).toBeNull();
    expect(
      trace(m, a, deviate(a, toWorld(P(12, 5), 1.3), 0, 0), [fig("t", P(12, 5))], "me").unit,
    ).toBe("t");
  });

  it("glass and windows: a round goes through and they're listed to break; a window's sill and the wall over it stop it", () => {
    const m = field();
    setEdge(m, 6, 5, 0, 1, 0, E.GLASS);
    const through = straight(m, P(2, 5), P(12, 5), [fig("t", P(12, 5))]);
    expect(through.unit).toBe("t");
    expect(through.panes).toEqual([{ x: 6, y: 5, z: 0, dx: 1, dy: 0 }]);
    setEdge(m, 6, 5, 0, 1, 0, E.WINDOW);
    expect(straight(m, P(2, 5), P(12, 5), [fig("t", P(12, 5))]).panes).toHaveLength(1);
    const a = muzzle(P(2, 5), "agent");
    expect(trace(m, a, deviate(a, toWorld(P(12, 5), 0.2), 0, 0), [], "me").panes).toHaveLength(0); // into the wall below the sill
  });
});

function duel(m: BattleMap, agentsAt: Pt3[], enemiesAt: Pt3[], seed = 3): Battle {
  m.spawns = enemiesAt.map((p) => ({ ...p, side: "thrall" as const }));
  m.lz = Array.from({ length: 9 }, (_, i) => agentsAt[i % agentsAt.length]!);
  const b = newSkirmish(m, seed, { ...DEFAULT_OPTIONS, night: false });
  b.units = b.units.filter((u, i) => u.side !== "agent" || i < agentsAt.length);
  agentsAt.forEach((p, i) => Object.assign(b.units[i]!, p));
  for (const e of enemies(b)) Object.assign(e, { hp: 500, maxHp: 500, weapon: "pistol" });
  for (const a of agents(b)) Object.assign(a, { hp: 500, maxHp: 500 });
  return b;
}

describe("shots in battle", () => {
  it("friendly fire: shoot past a teammate's shoulder and sometimes it's them who's hit", () => {
    let friendly = 0,
      foe = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = duel(field(), [P(2, 5), P(5, 5)], [P(14, 5)], seed);
      const [a, mate] = agents(b);
      a!.weapon = "pistol";
      a!.ammo = 6;
      a!.tu = a!.maxTu;
      const ev = commandShoot(b, a!, enemies(b)[0]!);
      if (!Array.isArray(ev)) throw new Error(ev);
      const shot = ev.find((e) => e.kind === "shot");
      if (shot?.kind !== "shot") throw new Error("no shot");
      if (shot.hits.some((h) => h.unit === mate!.id)) friendly++;
      if (shot.hits.some((h) => h.unit === enemies(b)[0]!.id)) foe++;
    }
    expect(friendly).toBeGreaterThan(5);
    expect(foe).toBeLessThan(25);
  });

  it("force fire: at a spot, through the glass in front of it (which breaks); not at your own feet", () => {
    const m = field();
    for (let y = 0; y < 20; y++) setEdge(m, 8, y, 0, 1, 0, E.GLASS);
    const b = duel(m, [P(4, 5)], [P(15, 15)]);
    const a = agents(b)[0]!;
    a.weapon = "rifle";
    a.ammo = 8;
    a.mode = "aimed";
    expect(forceBlocker(b, a, P(4, 5))).toBe("Not at your own feet");
    const ev = commandShootAt(b, a, P(12, 5), "aimed");
    if (!Array.isArray(ev)) throw new Error(ev);
    expect(ev[0]).toMatchObject({ kind: "shot", target: undefined });
    expect(ev.some((e) => e.kind === "glass")).toBe(true);
    expect(edgeAt(m, 8, 5, 0, 1, 0)).toBe(E.NONE);
  });

  it("a shotgun's pellets can take two enemies, one just behind and beside the other", () => {
    let both = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = duel(field(), [P(3, 5)], [P(8, 5), P(9, 6)], seed);
      const a = agents(b)[0]!;
      Object.assign(a, { weapon: "shotgun", ammo: 3, tu: a.maxTu });
      const ev = commandShoot(b, a, enemies(b)[0]!);
      if (!Array.isArray(ev)) throw new Error(ev);
      const shot = ev.find((e) => e.kind === "shot");
      if (shot?.kind === "shot" && shot.hits.length >= 2) both++;
    }
    expect(both).toBeGreaterThan(3);
  });

  it("a shotgun is brutal close in and weak far off: each pellet does its damage, and the CEP is the pellets'", () => {
    const blast = (to: Pt3) => {
      let total = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const b = duel(field(), [P(3, 5)], [to], seed);
        const a = agents(b)[0]!;
        Object.assign(a, { weapon: "shotgun", ammo: 3, tu: a.maxTu, aim: 60 });
        const ev = commandShoot(b, a, enemies(b)[0]!);
        if (!Array.isArray(ev)) throw new Error(ev);
        for (const e of ev)
          if (e.kind === "shot") total += e.hits.reduce((s, h) => s + h.damage, 0);
      }
      return total / 30;
    };
    const close = blast(P(4, 5)),
      far = blast(P(11, 5));
    expect(close).toBeGreaterThan(45); // a thrall (24–30) dropped, a vampire (48) nearly
    expect(far).toBeLessThan(close / 3);
    // The CEP drawn is the pellets' spread, much wider than the shot's own.
    const sigma = spread({ aim: 60, weapon: "shotgun" });
    expect(cepRadius(pelletCone("shotgun", sigma), 10)).toBeGreaterThan(2 * cepRadius(sigma, 10));
    expect(pelletCone("rifle", sigma)).toBe(sigma);
  });
});

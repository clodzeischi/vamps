import { describe, expect, it } from "vitest";
import { E, emptyMap, idx, setEdge, setTile, T, type BattleMap, type Pt3 } from "./map";
import { generateMap } from "./mapgen";
import { dominateChance } from "./ai";
import {
  agents, commandFinish, commandIncendiary, commandMove, commandShoot, DEFAULT_OPTIONS, detectRadius, endTurn, enemies, newSkirmish, oddsAgainst,
  reach, sees, TORPOR_TURNS, type Battle, type SkirmishOptions,
} from "./battle";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

/** An open 20 × 20 floor (with an empty level above for roofs). */
function field(): BattleMap {
  const m = emptyMap(20, 20, 2, 0, "urban", 1);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  return m;
}

function setup(m: BattleMap, agentAt: Pt3[], foes: { p: Pt3; side: "thrall" | "vampire" }[], opts: Partial<SkirmishOptions> = {}): Battle {
  m.spawns = foes.map((f) => ({ ...f.p, side: f.side }));
  m.lz = Array.from({ length: 9 }, () => agentAt[0]!);
  const b = newSkirmish(m, 5, { ...DEFAULT_OPTIONS, night: false, ...opts });
  b.units = b.units.filter((u) => u.side !== "agent" || +u.id.slice(1) < agentAt.length);
  agentAt.forEach((p, i) => Object.assign(b.units[i]!, p, { aim: 200 }));
  return b;
}

describe("vampires", () => {
  it("an agent who sees a new enemy stops there and keeps the TU of the rest of the way", () => {
    const m = field();
    // A wall on the edge between x = 10 and 11, from y = 4 down, hides the thrall at (14, 14) from the west.
    for (let y = 4; y < 20; y++) setEdge(m, 10, y, 0, 1, 0, E.WALL);
    const b = setup(m, [P(4, 3)], [{ p: P(14, 14), side: "thrall" }]);
    const a = agents(b)[0]!;
    a.tu = 80;
    const ev = commandMove(b, a, P(16, 3)) as { kind: string; text?: string }[];
    expect(ev.some((e) => e.text === "Contact")).toBe(true);
    expect(a.x).toBeGreaterThan(9);
    expect(a.x).toBeLessThan(16);
    expect(a.tu).toBe(80 - (a.x - 4) * 4);
  });

  it("can't claw through a wall, and units block each other's paths", () => {
    const m = field();
    for (let y = 0; y < 20; y++) setEdge(m, 5, y, 0, 1, 0, E.WALL);
    const b = setup(m, [P(5, 5), P(4, 6)], [{ p: P(6, 5), side: "vampire" }], { night: true });
    const [a, friend] = agents(b);
    const v = enemies(b)[0]!;
    expect(oddsAgainst(b, v, a!).inRange).toBe(false);
    expect(oddsAgainst(b, v, a!).chance).toBe(0);
    // A friend's tile is as closed to a move as a foe's.
    const r = reach(b, a!);
    expect(r.cost.has(idx(m, friend!.x, friend!.y, 0))).toBe(false);
  });

  it("fall into torpor under bullets, rise unless finished, and are finished with the haemolytic agent", () => {
    // At night: by day, the sun would burn a body lying in the open to ash.
    const b = setup(field(), [P(2, 5)], [{ p: P(6, 5), side: "vampire" }], { night: true });
    const a = agents(b)[0]!;
    const v = enemies(b)[0]!;
    v.hp = 1;
    const ev = commandShoot(b, a, v) as { kind: string }[];
    expect(ev.map((e) => e.kind)).toContain("torpor");
    expect(v.torpor).toBe(TORPOR_TURNS.night);
    expect(v.alive).toBe(true);
    expect(b.result).toBeNull(); // a body in torpor still counts
    a.tu = a.maxTu;
    expect(commandShoot(b, a, v)).toMatch(/finish/);
    // Left alone, it gets up.
    for (let i = 0; i < TORPOR_TURNS.night; i++) endTurn(b);
    expect(v.torpor).toBe(0);
    expect(v.hp).toBeGreaterThan(0);
  });

  it("are finished by an agent standing over them", () => {
    const b = setup(field(), [P(5, 5)], [{ p: P(6, 5), side: "vampire" }, { p: P(18, 18), side: "thrall" }]);
    const a = agents(b)[0]!;
    const v = enemies(b)[0]!;
    v.hp = 0;
    v.torpor = 2;
    expect(commandFinish(b, a, v)).not.toBeTypeOf("string");
    expect(v.alive).toBe(false);
    expect(b.concealed).toBe(false); // (tactical kit: never concealed)
  });

  it("burn: fire turns a body in torpor to ash", () => {
    const b = setup(field(), [P(2, 5)], [{ p: P(8, 5), side: "vampire" }, { p: P(18, 18), side: "thrall" }]);
    const a = agents(b)[0]!;
    const v = enemies(b)[0]!;
    v.hp = 0;
    v.torpor = 2;
    expect(commandIncendiary(b, a, P(8, 5))).not.toBeTypeOf("string");
    expect(v.alive).toBe(false);
    expect(Object.keys(b.fire)).toHaveLength(9);
  });

  it("climb onto a roof over the parapet; thralls take the stairs or nothing", () => {
    const m = field();
    // A one-storey block, 6 × 6, with a roof and parapet on level 1 and no way up inside.
    for (let y = 8; y < 14; y++)
      for (let x = 8; x < 14; x++) {
        const rim = x === 8 || y === 8 || x === 13 || y === 13;
        setTile(m, x, y, 0, rim ? T.WALL : T.FLOOR, "brick");
        setTile(m, x, y, 1, rim ? T.LOW : T.FLOOR, rim ? "parapet" : "roof");
      }
    const b = setup(m, [P(1, 1)], [{ p: P(10, 7), side: "vampire" }, { p: P(11, 7), side: "thrall" }], { night: true });
    const [v, th] = enemies(b);
    const roof = idx(m, 10, 9, 1);
    expect(reach(b, v!, 999).cost.has(roof)).toBe(true);
    expect(reach(b, th!, 999).cost.has(roof)).toBe(false);
  });

  it("climb thin walls: up the face and over the parapet, in at an upper window, and out again", () => {
    const m = emptyMap(20, 20, 3, 0, "urban", 1);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
    // A two-storey block, 6 × 6, walled on its edges; a window on the upper floor; a roof with a parapet; no stairs.
    for (let y = 8; y < 14; y++)
      for (let x = 8; x < 14; x++) {
        setTile(m, x, y, 1, T.FLOOR, "indoor");
        const rim = x === 8 || y === 8 || x === 13 || y === 13;
        setTile(m, x, y, 2, rim ? T.LOW : T.FLOOR, rim ? "parapet" : "roof");
      }
    for (const z of [0, 1])
      for (let k = 8; k < 14; k++) {
        setEdge(m, k, 8, z, 0, -1, E.WALL);
        setEdge(m, k, 13, z, 0, 1, E.WALL);
        setEdge(m, 8, k, z, -1, 0, E.WALL);
        setEdge(m, 13, k, z, 1, 0, E.WALL);
      }
    setEdge(m, 10, 8, 1, 0, -1, E.WINDOW);
    const b = setup(m, [P(1, 1)], [{ p: P(10, 7), side: "vampire" }, { p: P(11, 7), side: "thrall" }], { night: true });
    const [v, th] = enemies(b);
    // Not through the wall on foot.
    expect(reach(b, th!, 999).cost.has(idx(m, 10, 10, 0))).toBe(false);
    // In at the window to the upper floor (the floor over the ground storey is solid there).
    const vr = reach(b, v!, 999);
    expect(vr.cost.has(idx(m, 10, 8, 1))).toBe(true);
    expect(reach(b, th!, 999).cost.has(idx(m, 10, 8, 1))).toBe(false);
    // And out again: from inside, down to the street.
    Object.assign(v!, P(10, 9, 1));
    expect(reach(b, v!, 999).cost.has(idx(m, 10, 7, 0))).toBe(true);
  });

  it("keep out of the sun by day, and burn in it", () => {
    const m = field();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setTile(m, x, y, 1, T.FLOOR, "roof"); // a shelter over 0..3
    const b = setup(m, [P(15, 15)], [{ p: P(1, 1), side: "vampire" }, { p: P(10, 1), side: "vampire" }]);
    const [inside, outside] = enemies(b);
    expect(reach(b, inside!, 999).cost.has(idx(m, 6, 1, 0))).toBe(false);
    const hp = outside!.hp;
    endTurn(b);
    expect(outside!.hp).toBeLessThan(hp);
  });

  it("dominate: the odds turn on will against Faith, and a dominated agent loses the turn", () => {
    expect(dominateChance(55, 40)).toBeGreaterThan(dominateChance(55, 70));
    expect(dominateChance(70, 55)).toBeGreaterThan(dominateChance(55, 55));
    const b = setup(field(), [P(2, 2)], [{ p: P(15, 15), side: "vampire" }]);
    const a = agents(b)[0]!;
    a.dominated = true;
    endTurn(b);
    expect(a.tu).toBe(0);
    expect(a.dominated).toBe(false);
  });
});

describe("night and concealment", () => {
  it("at night we see 9 tiles, or 16 to anything lit; vampires see in the dark", () => {
    const m = field();
    const b = setup(m, [P(1, 10)], [{ p: P(13, 10), side: "vampire" }], { night: true });
    const a = agents(b)[0]!;
    const v = enemies(b)[0]!;
    expect(sees(b, a, v)).toBe(false);
    expect(sees(b, v, a)).toBe(true);
    m.lights.push(P(13, 11));
    expect(sees(b, a, v)).toBe(true);
  });

  it("a quiet team starts concealed; spotted only up close; the first shot gets the ambush bonus and gives it away", () => {
    const quiet = { kit: "plainclothes" as const, arrival: "jet" as const };
    expect(setup(field(), [P(1, 1)], [{ p: P(15, 15), side: "thrall" }], { kit: "plainclothes", arrival: "helicopter" }).concealed).toBe(false);
    const b = setup(field(), [P(2, 10)], [{ p: P(12, 10), side: "thrall" }], quiet);
    expect(b.concealed).toBe(true);
    const a = agents(b)[0]!;
    a.tradecraft = 55;
    const e = enemies(b)[0]!;
    // Walk to within sight but outside the spotting radius: still unseen.
    commandMove(b, a, P(5, 10));
    expect(detectRadius(a)).toBeLessThan(7);
    expect(b.concealed).toBe(true);
    expect(e.alerted).toBe(false);
    expect(oddsAgainst(b, a, e).why.map((w) => w.label)).toContain("From concealment");
    commandShoot(b, a, e);
    expect(b.concealed).toBe(false);
  });
});

describe("whole battles, every way", () => {
  it("end, by night and day, quiet or loud, against every line", () => {
    const lines = ["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"];
    let ended = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const opts: SkirmishOptions = { bloodline: lines[seed % 6]!, night: seed % 2 === 0, kit: seed % 3 ? "tactical" : "plainclothes", arrival: seed % 4 ? "helicopter" : "jet" };
      const map = generateMap({ setting: seed % 2 ? "urban" : "rural", size: "den", seed, thralls: 4, vampires: 2 });
      const b = newSkirmish(map, seed, opts);
      // A passive player: everyone stands still with no time left. The enemy must come and finish it.
      for (let t = 0; t < 60 && !b.result; t++) {
        for (const a of agents(b)) a.tu = 0;
        endTurn(b);
      }
      if (b.result) ended++;
    }
    // By day the vampires won't leave the hideout, so a passive team can outlast them; most still end.
    expect(ended).toBeGreaterThanOrEqual(6);
  });
});

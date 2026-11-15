import { describe, expect, it } from "vitest";
import { emptyMap, idx, setTile, T, type BattleMap, type Pt3 } from "./map";
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
  it("fall into torpor under bullets, rise unless finished, and are finished with a stake", () => {
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
    a.ap = 2;
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
    expect(reach(b, v!, 99).cost.has(roof)).toBe(true);
    expect(reach(b, th!, 99).cost.has(roof)).toBe(false);
  });

  it("keep out of the sun by day, and burn in it", () => {
    const m = field();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) setTile(m, x, y, 1, T.FLOOR, "roof"); // a shelter over 0..3
    const b = setup(m, [P(15, 15)], [{ p: P(1, 1), side: "vampire" }, { p: P(10, 1), side: "vampire" }]);
    const [inside, outside] = enemies(b);
    expect(reach(b, inside!, 99).cost.has(idx(m, 6, 1, 0))).toBe(false);
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
    expect(a.ap).toBe(0);
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
      // A passive player: everyone hunkers. The enemy must come and finish it.
      for (let t = 0; t < 60 && !b.result; t++) {
        for (const a of agents(b)) a.hunkered = true, (a.ap = 0);
        endTurn(b);
      }
      if (b.result) ended++;
    }
    // By day the vampires won't leave the hideout, so a passive team can outlast them; most still end.
    expect(ended).toBeGreaterThanOrEqual(6);
  });
});

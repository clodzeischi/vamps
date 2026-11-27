// A house's strain on the battlescape (docs/design/research.md, "The houses' weaknesses").
import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type BattleMap, type Pt3 } from "./map/map";
import { agents, DEFAULT_OPTIONS, SILVER, TORPOR_TURNS, type Battle } from "./battle";
import type { WeaknessId } from "../data/strains";
import { burn, downed, wound } from "./harm";
import { alertPod, noise } from "./movement";
import { newSkirmish } from "./setup";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function field(): BattleMap {
  const m = emptyMap(12, 12, 2, 0, "urban", 1);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  return m;
}

function setup(silver = 1, weaknesses: WeaknessId[] = [], night = true): Battle {
  const m = field();
  m.spawns = [{ ...P(6, 3), side: "vampire" }];
  m.lz = Array.from({ length: 9 }, () => P(3, 3));
  const b = newSkirmish(m, 5, {
    ...DEFAULT_OPTIONS,
    night,
    bloodline: "sahel",
    strain: { silver, weaknesses },
  });
  b.units = b.units.filter((u) => u.side !== "agent" || u.id === "a0");
  Object.assign(b.units[0]!, P(3, 3));
  const v = foe(b);
  v.hp = v.maxHp = 1000;
  v.armour = 0;
  return b;
}
const foe = (b: Battle) => b.units.find((u) => u.kind === "vampire")!;

describe("a house's strain in battle", () => {
  it("multiplies silver by the house's roll, and the team notices a big one", () => {
    const hit = (m: number) => {
      const b = setup(m);
      const a = agents(b)[0]!;
      a.weapon = "pistol";
      a.round = "silver";
      const r = wound(b, a, foe(b), 40, false);
      return { damage: r.hit.damage, noticed: b.noticed ?? [] };
    };
    expect(hit(1).damage).toBe(Math.round(40 * SILVER.vampire));
    expect(hit(1.5)).toEqual({
      damage: Math.round(40 * SILVER.vampire * 1.5),
      noticed: ["silver"],
    });
    expect(hit(1.1).noticed).toEqual([]); // nothing remarkable
  });

  it("thin skin: fire does half as much again", () => {
    const burnt = (w: WeaknessId[]) => {
      const b = setup(1, w);
      burn(b, foe(b), "fire");
      return { lost: 1000 - foe(b).hp, noticed: b.noticed ?? [] };
    };
    const plain = burnt([]);
    const straw = burnt(["thin-skin"]);
    expect(straw.lost).toBe(Math.round(plain.lost * 1.5));
    expect(straw.noticed).toEqual(["thin-skin"]);
  });

  it("cold torpor: two turns longer", () => {
    const b = setup(1, ["cold-torpor"]);
    downed(b, foe(b));
    expect(foe(b).torpor).toBe(TORPOR_TURNS.night + 2);
    expect(b.noticed).toEqual(["cold-torpor"]);
  });

  it("circadian lock: by day they sleep through gunfire for two turns; a hit wakes them", () => {
    const b = setup(1, ["circadian"], false);
    const v = foe(b);
    noise(b, P(6, 4));
    expect(v.alerted).toBe(false);
    expect(b.noticed).toEqual(["circadian"]);
    b.turn = 3;
    noise(b, P(6, 4));
    expect(v.alerted).toBe(true);
    const c = setup(1, ["circadian"], false);
    const a = agents(c)[0]!;
    wound(c, a, foe(c), 5, false);
    expect(foe(c).alerted).toBe(true);
    const d = setup(1, ["circadian"], true); // at night they're awake
    alertPod(d, foe(d).pod);
    expect(foe(d).alerted).toBe(true);
  });
});

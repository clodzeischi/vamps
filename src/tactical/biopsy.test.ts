// Tissue samples and silver rounds on the battlescape (docs/design/research.md).
import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type BattleMap, type Pt3 } from "./map/map";
import { agents, DEFAULT_OPTIONS, SILVER, TU_COST, type Battle } from "./battle";
import { biopsyBlocker, commandBiopsy, commandFinish, commandReload, kitUses } from "./commands";
import { burn } from "./harm";
import { newSkirmish } from "./setup";
import { countOf } from "../sim/people/inventory";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function field(): BattleMap {
  const m = emptyMap(12, 12, 2, 0, "urban", 1);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  return m;
}

/** One agent at (3, 3) with a biopsy kit in a pocket, a vampire at (4, 3) of the Huaca Line. */
function setup(): Battle {
  const m = field();
  m.spawns = [{ ...P(4, 3), side: "vampire" }];
  m.lz = Array.from({ length: 9 }, () => P(3, 3));
  const b = newSkirmish(m, 5, { ...DEFAULT_OPTIONS, night: false, bloodline: "huaca" });
  b.units = b.units.filter((u) => u.side !== "agent" || u.id === "a0");
  Object.assign(b.units[0]!, P(3, 3));
  const a = agents(b)[0]!;
  a.gear.stowed = [{ item: "biopsy-kit", in: "pocket0", x: 0, y: 0 }];
  a.tu = 80;
  return b;
}
const foe = (b: Battle) => b.units.find((u) => u.kind === "vampire")!;

describe("the biopsy kit", () => {
  it("takes a sample from a vampire in torpor, once, into the pack", () => {
    const b = setup();
    const [a, v] = [agents(b)[0]!, foe(b)];
    expect(biopsyBlocker(b, a, v)).toBe("Get next to it first"); // up and about
    v.torpor = 2;
    expect(commandBiopsy(b, a, v)).not.toBeTypeOf("string");
    expect(a.tu).toBe(80 - TU_COST.biopsy);
    expect(countOf(a.gear, "sample-vampire-huaca")).toBe(1);
    expect(kitUses(a.gear.stowed.find((x) => x.item === "biopsy-kit")!)).toBe(3);
    expect(biopsyBlocker(b, a, v)).toBe("Already sampled");
  });

  it("samples a finished body, an elder as an elder, but nothing burnt", () => {
    const b = setup();
    const [a, v] = [agents(b)[0]!, foe(b)];
    v.torpor = 2;
    v.elder = true;
    expect(commandFinish(b, a, v)).not.toBeTypeOf("string");
    expect(commandBiopsy(b, a, v)).not.toBeTypeOf("string");
    expect(countOf(a.gear, "sample-elder-huaca")).toBe(1);
    const c = setup();
    const w = foe(c);
    w.torpor = 2;
    burn(c, w, "fire");
    expect(biopsyBlocker(c, agents(c)[0]!, w)).toBe("Burnt: nothing left to sample");
  });

  it("runs out after four samples", () => {
    const b = setup();
    const [a, v] = [agents(b)[0]!, foe(b)];
    a.gear.stowed[0]!.ammo = 0;
    v.torpor = 2;
    expect(biopsyBlocker(b, a, v)).toBe("The biopsy kit is empty");
    a.gear.stowed = [];
    expect(biopsyBlocker(b, a, v)).toBe("No biopsy kit");
  });
});

describe("silver rounds", () => {
  it("load into the gun their ordinary magazine fits, and hurt vampires more and people less", () => {
    const b = setup();
    const a = agents(b)[0]!;
    a.gear.weapon = "pistol";
    a.weapon = "pistol";
    a.ammo = 0;
    a.gear.stowed = [{ item: "mag-pistol-silver", in: "pocket0", x: 0, y: 0 }];
    expect(commandReload(b, a)).not.toBeTypeOf("string");
    expect(a.silver).toBe(true);
    expect(SILVER.vampire).toBeGreaterThan(1);
    expect(SILVER.human).toBeLessThan(1);
  });
});

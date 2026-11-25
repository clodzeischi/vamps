import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type BattleMap, type Pt3 } from "./map";
import { agents, commandEvacuate, commandFree, commandMove, DEFAULT_OPTIONS, newSkirmish, prisonerInReach, type SkirmishOptions } from "./battle";
import { battleOutcome, lootShare } from "./campaign";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function field(): BattleMap {
  const m = emptyMap(20, 20, 2, 0, "urban", 1);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.lz = [];
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m.lz.push(P(x, y));
  m.spawns = [{ ...P(15, 15), side: "vampire" }, { ...P(16, 16), side: "thrall" }];
  return m;
}

const make = (o: Partial<SkirmishOptions>) => newSkirmish(field(), 4, { ...DEFAULT_OPTIONS, night: false, ...o });

describe("objectives", () => {
  it("a helicopter drops the team and leaves: nothing of it on the map", () => {
    const b = make({ arrival: "helicopter" });
    expect(b.airlift).toBe(true);
    expect(b.units.filter((u) => u.side === "agent").every((u) => u.kind === "agent")).toBe(true);
    expect(make({ arrival: "jet" }).airlift).toBe(false);
  });

  it("loot: picked up by walking over it; a helicopter lifts the lot, otherwise only what's carried out", () => {
    const b = make({ arrival: "jet", loot: 2 });
    expect(b.loot).toHaveLength(2);
    const a = agents(b)[0]!;
    const crate = b.loot[0]!;
    a.x = crate.x - 1; a.y = crate.y; a.z = crate.z; a.tu = 200;
    // Make room: walk onto the crate.
    expect(commandMove(b, a, P(crate.x, crate.y, crate.z))).not.toBeTypeOf("string");
    expect(a.carrying).toBe(true);
    expect(crate.by).toBe(a.id);
    b.result = "won";
    expect(lootShare(b)).toBe(0.5);
    const heli = make({ arrival: "helicopter", loot: 2 });
    heli.result = "won";
    expect(lootShare(heli)).toBe(1);
    heli.result = "aborted";
    expect(lootShare(heli)).toBe(0);
    // A carrier who dies drops it.
    a.alive = false;
    expect(lootShare(b)).toBe(0);
  });

  it("a rescue: free the prisoner, who then moves with the team and must get out", () => {
    const b = make({ arrival: "jet", hostage: true });
    const h = b.units.find((u) => u.kind === "hostage")!;
    expect(h.side).toBe("neutral");
    const a = agents(b)[0]!;
    Object.assign(a, { x: h.x - 1, y: h.y, z: h.z });
    if (prisonerInReach(b, a) !== h) Object.assign(a, { x: h.x, y: h.y - 1 });
    expect(prisonerInReach(b, a)).toBe(h);
    expect(commandFree(b, a, h)).not.toBeTypeOf("string");
    expect(h.side).toBe("agent");
    expect(agents(b)).toContain(h);
    expect(battleOutcome(b).hostage).toBe("lost"); // not out yet
    Object.assign(h, b.map.lz[0], { tu: 20 });
    commandEvacuate(b, h);
    expect(battleOutcome(b).hostage).toBe("saved");
  });
});

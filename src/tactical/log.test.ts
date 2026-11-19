import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type Pt3 } from "./map";
import { DEFAULT_OPTIONS, newSkirmish, type Battle } from "./battle";
import { logLine } from "./log";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function battle(): Battle {
  const m = emptyMap(20, 20, 2, 0, "urban", 1);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.lz = [P(1, 1), P(2, 1), P(1, 2), P(2, 2)];
  m.spawns = [{ ...P(6, 6), side: "thrall" }];
  return newSkirmish(m, 3, { ...DEFAULT_OPTIONS, night: false, arrival: "jet" });
}

describe("battle log", () => {
  it("names agents, and calls the nameless 'a thrall'", () => {
    const b = battle();
    const a = b.units.find((u) => u.kind === "agent")!;
    const t = b.units.find((u) => u.kind === "thrall")!;
    const hit = logLine(b, { kind: "shot", unit: a.id, target: t.id, hit: true, crit: false, damage: 3, chance: 62, reaction: false, melee: false, seen: true });
    expect(hit).toEqual({ text: `${a.name} fires at a thrall (62%): hit, 3 damage`, tone: "good" });
    const back = logLine(b, { kind: "shot", unit: t.id, target: a.id, hit: true, crit: true, damage: 5, chance: 40, reaction: true, melee: false, seen: true });
    expect(back).toEqual({ text: `Reaction fire: a thrall fires at ${a.name} (40%): critical hit, 5 damage`, tone: "bad" });
  });

  it("keeps the fog: unseen events and moves aren't logged", () => {
    const b = battle();
    const t = b.units.find((u) => u.kind === "thrall")!;
    expect(logLine(b, { kind: "status", unit: t.id, text: "Alerted", seen: false })).toBeNull();
    expect(logLine(b, { kind: "burn", unit: t.id, damage: 2, why: "fire", seen: false })).toBeNull();
    expect(logLine(b, { kind: "move", unit: t.id, path: [], seen: true })).toBeNull();
  });
});

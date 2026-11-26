import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type Pt3 } from "./map/map";
import { DEFAULT_OPTIONS, type Battle } from "./battle";
import { newSkirmish } from "./setup";
import { logLine } from "./log";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

function battle(): Battle {
  const m = emptyMap(20, 20, 2, 0, "urban", 1);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.lz = [P(1, 1), P(2, 1), P(1, 2), P(2, 2)];
  m.spawns = [{ ...P(6, 6), side: "thrall" }];
  return newSkirmish(m, 3, { ...DEFAULT_OPTIONS, night: false, arrival: "jet" });
}

describe("battle log", () => {
  it("names agents, and calls the nameless 'a thrall'", () => {
    const b = battle();
    const a = b.units.find((u) => u.kind === "agent")!;
    const t = b.units.find((u) => u.kind === "thrall")!;
    const o = { x: 0, y: 0, z: 0 };
    const shot = {
      weapon: "pistol" as const,
      from: o,
      aim: o,
      rays: [o],
      melee: false,
      seen: true,
    };
    const hit = logLine(b, {
      kind: "shot",
      unit: a.id,
      target: t.id,
      hits: [{ unit: t.id, damage: 3, crit: false }],
      reaction: false,
      ...shot,
    });
    expect(hit).toEqual({ text: `${a.name} fires at a thrall: hit, 3 damage`, tone: "good" });
    const back = logLine(b, {
      kind: "shot",
      unit: t.id,
      target: a.id,
      hits: [{ unit: a.id, damage: 5, crit: true }],
      reaction: true,
      ...shot,
    });
    expect(back).toEqual({
      text: `Reaction fire: a thrall fires at ${a.name}: hit (critical), 5 damage`,
      tone: "bad",
    });
    // A round into one of ours: friendly fire, however good the shooter's intent.
    const other = b.units.filter((u) => u.kind === "agent")[1]!;
    const stray = logLine(b, {
      kind: "shot",
      unit: a.id,
      target: t.id,
      hits: [{ unit: other.id, damage: 4, crit: false }],
      reaction: false,
      ...shot,
    });
    expect(stray).toEqual({
      text: `${a.name} fires at a thrall: hits ${other.name}, 4 damage`,
      tone: "bad",
    });
    const missed = logLine(b, { kind: "shot", unit: a.id, hits: [], reaction: false, ...shot });
    expect(missed).toEqual({ text: `${a.name} fires at a spot: no one hit`, tone: "neutral" });
  });

  it("keeps the fog: unseen events and moves aren't logged", () => {
    const b = battle();
    const t = b.units.find((u) => u.kind === "thrall")!;
    expect(logLine(b, { kind: "status", unit: t.id, text: "Alerted", seen: false })).toBeNull();
    expect(
      logLine(b, { kind: "burn", unit: t.id, damage: 2, why: "fire", seen: false }),
    ).toBeNull();
    expect(logLine(b, { kind: "move", unit: t.id, path: [], seen: true })).toBeNull();
  });
});

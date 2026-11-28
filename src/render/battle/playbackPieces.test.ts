import { describe, expect, it } from "vitest";
import { emptyMap, setTile, T, type Pt3 } from "../../tactical/map/map";
import { agents, DEFAULT_OPTIONS, enemies } from "../../tactical/battle";
import { commandShoot } from "../../tactical/commands";
import { newSkirmish } from "../../tactical/setup";
import { playbackPieces } from "./playbackPieces";

const P = (x: number, y: number, z = 0): Pt3 => ({ x, y, z });

/** One agent against one thrall on open ground. */
function duel(weapon: "m240b" | "m249" | "rifle") {
  const m = emptyMap(20, 20, 2, 0, "urban", 1);
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) setTile(m, x, y, 0, T.FLOOR, "pavement");
  m.spawns = [{ ...P(8, 5), side: "thrall" }];
  m.lz = [P(3, 5)];
  const b = newSkirmish(m, 4, { ...DEFAULT_OPTIONS, night: false });
  b.units = b.units.filter((u, i) => u.side !== "agent" || i === 0);
  const a = agents(b)[0]!;
  Object.assign(a, { ...P(3, 5), weapon, ammo: 30, tu: a.maxTu, aim: 80 });
  return { b, a, t: enemies(b)[0]! };
}

describe("playback pieces", () => {
  it("a burst plays as one piece: every round and what each did, so it fires at its rate, not round by round", () => {
    for (const [weapon, rounds] of [
      ["m240b", 6],
      ["m249", 6],
      ["rifle", 3],
    ] as const) {
      const { b, a, t } = duel(weapon);
      const ev = commandShoot(b, a, t, "burst");
      if (!Array.isArray(ev)) throw new Error(ev);
      const pieces = playbackPieces(ev);
      expect(pieces[0]!.filter((e) => e.kind === "shot")).toHaveLength(rounds);
      // Nothing of the shot's left over for a later piece.
      expect(pieces.slice(1).some((p) => p[0]!.kind === "shot")).toBe(false);
    }
  });

  it("anything else plays alone", () => {
    const ev = [
      { kind: "turn", side: "enemy", turn: 1 },
      { kind: "end", result: "won" },
    ] as const;
    expect(playbackPieces([...ev])).toHaveLength(2);
  });
});

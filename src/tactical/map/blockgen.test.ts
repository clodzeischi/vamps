import { describe, expect, it } from "vitest";
import { ascii, blockMap, type Layout } from "./blockgen";
import { BANK } from "./blockbank";
import { compile, type Terrain } from "./blocks";
import { generateMap } from "./mapgen";
import { flightEnds, idx, reachable, skinAt, walkable, type Setting } from "./map";

declare const process: { env: Record<string, string | undefined> };

describe("block bank (proof of concept)", () => {
  it("every block: all its floors reachable from its front, every flight with both ends standable", () => {
    const bad: string[] = [];
    for (const b of BANK) {
      const m = compile(b);
      const g = b.below;
      // From the front row: the tile that reaches most (a hedge may close off a corner of a verge).
      const fronts = Array.from({ length: m.w }, (_, x) => ({ x, y: m.h - 1, z: g })).filter((p) =>
        walkable(m, p.x, p.y, p.z),
      );
      if (!fronts.length) {
        bad.push(`${b.id}: no way in from the front`);
        continue;
      }
      const count = (a: Uint8Array) => a.reduce((n, v) => n + v, 0);
      const seen = fronts
        .map((p) => reachable(m, p))
        .reduce((a, b) => (count(b) > count(a) ? b : a));
      const lost: string[] = [];
      for (let z = 0; z < m.levels; z++)
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++) {
            if (!walkable(m, x, y, z) || seen[idx(m, x, y, z)]) continue;
            // Roofs with no stair up are out of reach by design.
            if (skinAt(m, x, y, z) === "roof") continue;
            lost.push(`${x},${y},${z}`);
          }
      if (lost.length) bad.push(`${b.id}: ${lost.length} cut off, ${lost.slice(0, 6).join(" ")}`);
      for (const f of m.flights ?? [])
        for (const e of flightEnds(f)) {
          if (!walkable(m, e.foot.x, e.foot.y, e.foot.z))
            bad.push(`${b.id}: foot ${JSON.stringify(e.foot)}`);
          if (!walkable(m, e.head.x, e.head.y, e.head.z))
            bad.push(`${b.id}: head ${JSON.stringify(e.head)}`);
        }
    }
    expect(bad).toEqual([]);
  });
});

const SETTINGS: [Setting, Terrain][] = [
  ["urban", "light"],
  ["rural", "rural"],
  ["apartments", "dense"],
  ["industrial", "industrial"],
];

describe("block maps (proof of concept)", () => {
  it("every terrain, square and long: connected, spawns reachable", { timeout: 60000 }, () => {
    for (const [setting] of SETTINGS)
      for (const layout of ["square", "long"] as const)
        for (let seed = 1; seed <= 4; seed++) {
          const m = generateMap({ setting, size: "nest", seed, thralls: 4, vampires: 2, layout });
          const seen = reachable(m, m.lz[0]!);
          for (const s of m.spawns)
            expect(seen[idx(m, s.x, s.y, s.z)], `${setting} ${layout} ${seed}`).toBe(1);
          expect(m.spawns.filter((s) => s.side === "vampire")).toHaveLength(2);
        }
  });

  it("report", { timeout: 300000 }, () => {
    const n = Number(process.env.BLOCKGEN_REPORT ?? 0);
    if (!n) return;
    const rows: string[] = [];
    for (const [, terrain] of SETTINGS)
      for (const layout of ["square", "long"] as Layout[])
        for (let seed = 1; seed <= n; seed++) {
          const bm = blockMap({ seed, terrain, layout, size: 5 });
          const s = bm.score;
          rows.push(
            `${terrain.padEnd(10)} ${layout.padEnd(6)} seed ${String(seed).padStart(2)}  score ${s.total.toFixed(0).padStart(4)}  len ${s.length}  street fast/quiet ${s.fastStreet}/${s.quietStreet}  bare ${s.bareRun}  sight ${s.sightline}  road ${(s.roadShare * 100).toFixed(0)}%  crosses ${s.crossesRoad ? "y" : "n"}  overlook ${s.overlooks}  height ${s.height}  blocks ${s.variety}`,
          );
          if (seed <= Number(process.env.BLOCKGEN_ASCII ?? 0)) rows.push(ascii(bm), "");
        }
    console.log(rows.join("\n"));
  });
});

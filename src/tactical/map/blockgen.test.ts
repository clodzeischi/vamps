import { describe, expect, it } from "vitest";
import { ascii, blockMap } from "./blockgen";
import { generateMap } from "./mapgen";
import { idx, reachable } from "./map";

declare const process: { env: Record<string, string | undefined> };

describe("block maps (proof of concept)", () => {
  it("every seed gives a connected map with its spawns reachable", { timeout: 30000 }, () => {
    for (let seed = 1; seed <= 12; seed++)
      for (const size of ["nest", "den", "haven"] as const) {
        const m = generateMap({
          setting: "urban",
          size,
          seed,
          thralls: 4,
          vampires: 2,
          blocks: true,
        });
        const seen = reachable(m, m.lz[0]!);
        for (const s of m.spawns) expect(seen[idx(m, s.x, s.y, s.z)], `${size} ${seed}`).toBe(1);
        expect(m.spawns.filter((s) => s.side === "vampire")).toHaveLength(2);
      }
  });

  it("report", { timeout: 120000 }, () => {
    if (!process.env.BLOCKGEN_REPORT) return;
    const rows: string[] = [];
    for (let seed = 1; seed <= Number(process.env.BLOCKGEN_REPORT); seed++) {
      const bm = blockMap(seed, seed % 3 === 0 ? 5 : 4, seed % 2 ? "nest" : "den");
      const s = bm.score;
      rows.push(
        `seed ${seed}  ${bm.plan.N}x${bm.plan.N}  score ${s.total.toFixed(0)}  routes ${s.routes}  len ${s.length}  bare ${s.bareRun}  sight ${s.sightline}  road ${(s.roadShare * 100).toFixed(0)}%  crosses ${s.crossesRoad}  street fast/quiet ${s.fastStreet}/${s.quietStreet}  overlook ${s.overlooks}  blocks ${s.variety}`,
      );
      if (seed <= Number(process.env.BLOCKGEN_ASCII ?? 0)) rows.push(ascii(bm), "");
    }
    console.log(rows.join("\n"));
  });
});

import { describe, expect, it } from "vitest";
import { E, idx, reachable, skinAt, T, unreachableTiles, walkable } from "./map";
import { generateMap, mapDims, mapSize, type MapRequest } from "./mapgen";

const req = (
  setting: MapRequest["setting"],
  seed: number,
  size: MapRequest["size"] = "den",
): MapRequest => ({ setting, size, seed, thralls: 4, vampires: 2, civilians: 2 });

describe("map generator", () => {
  it("is deterministic", () => {
    const a = generateMap(req("urban", 42)),
      b = generateMap(req("urban", 42));
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.spawns).toEqual(b.spawns);
    expect(Array.from(generateMap(req("urban", 43)).tiles)).not.toEqual(Array.from(a.tiles));
  });

  for (const setting of ["urban", "rural", "apartments", "industrial"] as const)
    it(`makes connected ${setting} maps with clear landing zones and every enemy placed`, () => {
      let withStairs = 0;
      for (let seed = 1; seed <= 18; seed++) {
        const size = (["nest", "den", "haven"] as const)[seed % 3]!;
        const m = generateMap(req(setting, seed, size));
        expect(m.w).toBe(mapSize(setting, size));
        // Every tile reachable but flat roofs with no stair up.
        expect(unreachableTiles(m).filter((p) => skinAt(m, p.x, p.y, p.z) !== "roof")).toEqual([]);
        // Two ways in: the street (by road) and the landing ground (by helicopter).
        for (const lz of [m.lz, m.airLz!]) {
          expect(lz).toHaveLength(9);
          for (const p of lz) expect(walkable(m, p.x, p.y, p.z)).toBe(true);
        }
        expect(m.spawns.filter((s) => s.side === "thrall")).toHaveLength(4);
        expect(m.spawns.filter((s) => s.side === "vampire")).toHaveLength(2);
        const seen = reachable(m, m.lz[0]!);
        for (const s of m.spawns) expect(seen[idx(m, s.x, s.y, s.z)]).toBe(1);
        for (const p of m.airLz!) expect(seen[idx(m, p.x, p.y, p.z)]).toBe(1);
        // Real places: buildings with stairs, cover to hide behind; walls thin, on the edges, with doorways.
        let low = 0,
          walls = 0,
          doors = 0,
          wallTiles = 0;
        for (const t of m.tiles)
          ((low += +(t === T.LOW)),
            (wallTiles += +(t === T.WALL || t === T.DOOR || t === T.WINDOW)));
        for (const e of [...m.ew, ...m.ns])
          ((walls += +(e === E.WALL)), (doors += +(e === E.DOOR || e === E.SHUT)));
        if (m.flights?.length) withStairs++;
        expect(low).toBeGreaterThan(10);
        expect(walls).toBeGreaterThan(30);
        expect(doors).toBeGreaterThan(1);
        expect(wallTiles).toBe(0);
      }
      // Height on most maps (a works may be all one storey).
      expect(withStairs).toBeGreaterThan(9);
    }, 60_000);

  it("makes a rescue's long map: in at the south end, the hideout at the north", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const m = generateMap({ ...req("urban", seed, "nest"), layout: "long" });
      expect({ w: m.w, h: m.h }).toEqual(mapDims("urban", "nest", "long"));
      const v = m.spawns.filter((s) => s.side === "vampire");
      for (const s of v) expect(s.y).toBeLessThan(m.h / 2);
      expect(m.airLz![0]!.y).toBeGreaterThan(m.h / 2);
    }
  });

  it("raises a landmark as the hideout: a hospital or a supermarket with its sign", () => {
    for (const [landmark, text] of [
      ["hospital", "HOSPITAL"],
      ["store", "MARKET"],
    ] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const m = generateMap({ ...req("urban", seed), landmark });
        const sign = m.signs.find((s) => s.text === text);
        expect(sign, `${landmark} ${seed}`).toBeDefined();
        // The vampires inside it, within a block of its sign.
        for (const s of m.spawns.filter((s) => s.side === "vampire"))
          expect(Math.hypot(s.x - sign!.x, s.y - sign!.y)).toBeLessThan(20);
      }
  });

  it("passes winter through to the map (the look only)", () => {
    const a = generateMap({ ...req("urban", 9), winter: true }),
      b = generateMap(req("urban", 9));
    expect(a.winter).toBe(true);
    expect(b.winter).toBe(false);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
  });

  it("passes rain through to the map (the look only; never with snow)", () => {
    const a = generateMap({ ...req("urban", 9), rain: true }),
      b = generateMap(req("urban", 9));
    expect(a.rain).toBe(true);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(generateMap({ ...req("urban", 9), rain: true, winter: true }).rain).toBe(false);
  });

  it("puts the vampires in the basement when asked for one", () => {
    for (const setting of ["urban", "rural", "industrial"] as const)
      for (let seed = 1; seed <= 4; seed++) {
        const m = generateMap({ ...req(setting, seed), basement: true });
        expect(m.ground).toBe(1);
        const v = m.spawns.filter((s) => s.side === "vampire");
        expect(
          v.every((s) => s.z === 0),
          `${setting} ${seed}`,
        ).toBe(true);
      }
  });

  for (const setting of ["lair", "montsegur"] as const)
    it(`makes ${setting} maps: three levels down, every tile reachable, the eldest in the crypt`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const m = generateMap({ setting, size: "lair", seed, thralls: 14, vampires: 6 });
        expect(unreachableTiles(m)).toEqual([]);
        expect(m.ground).toBe(2);
        const elders = m.spawns.filter((s) => s.elder);
        expect(elders).toHaveLength(1);
        expect(elders[0]!.z).toBe(0);
        expect(m.spawns.filter((s) => s.side === "vampire")).toHaveLength(6);
        expect(m.spawns.filter((s) => s.side === "thrall").length).toBeGreaterThanOrEqual(12);
        const seen = reachable(m, m.lz[0]!);
        for (const s of m.spawns) expect(seen[idx(m, s.x, s.y, s.z)]).toBe(1);
        // Lit below: braziers in the catacombs and the crypt.
        expect(m.lights.some((l) => l.z === 0)).toBe(true);
      }
    });
  it("doors mostly start closed; shopfronts are glass", () => {
    let shut = 0,
      open = 0,
      glass = 0;
    for (let seed = 1; seed <= 6; seed++)
      for (const setting of ["urban", "apartments"] as const) {
        const m = generateMap(req(setting, seed, "haven"));
        for (const e of [...m.ew, ...m.ns])
          ((shut += +(e === E.SHUT)), (open += +(e === E.DOOR)), (glass += +(e === E.GLASS)));
      }
    expect(shut).toBeGreaterThan(open * 2);
    expect(open).toBeGreaterThan(0);
    expect(glass).toBeGreaterThan(0);
  });
});

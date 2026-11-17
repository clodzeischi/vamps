import { describe, expect, it } from "vitest";
import { E, idx, reachable, T, tileAt, unreachableTiles, walkable } from "./map";
import { generateMap, MAP_SIZE, type MapRequest } from "./mapgen";

const req = (setting: MapRequest["setting"], seed: number, size: MapRequest["size"] = "den"): MapRequest => ({ setting, size, seed, thralls: 4, vampires: 2, civilians: 2 });

describe("map generator", () => {
  it("is deterministic", () => {
    const a = generateMap(req("urban", 42)), b = generateMap(req("urban", 42));
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.spawns).toEqual(b.spawns);
    expect(Array.from(generateMap(req("urban", 43)).tiles)).not.toEqual(Array.from(a.tiles));
  });

  for (const setting of ["urban", "rural"] as const)
    it(`makes connected ${setting} maps with a clear landing zone and every enemy placed`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const size = (["nest", "den", "haven"] as const)[seed % 3]!;
        const m = generateMap(req(setting, seed, size));
        expect(m.w).toBe(MAP_SIZE[size]);
        expect(unreachableTiles(m)).toEqual([]);
        expect(m.lz).toHaveLength(9);
        for (const p of m.lz) expect(walkable(m, p.x, p.y, p.z)).toBe(true);
        expect(m.spawns.filter((s) => s.side === "thrall")).toHaveLength(4);
        expect(m.spawns.filter((s) => s.side === "vampire")).toHaveLength(2);
        const seen = reachable(m, m.lz[0]!);
        for (const s of m.spawns) expect(seen[idx(m, s.x, s.y, s.z)]).toBe(1);
        // Real places: buildings with stairs, cover to hide behind; walls thin, on the edges, with doorways.
        let stairs = 0, low = 0, walls = 0, doors = 0, wallTiles = 0;
        for (const t of m.tiles) stairs += +(t === T.STAIRS), low += +(t === T.LOW), wallTiles += +(t === T.WALL || t === T.DOOR || t === T.WINDOW);
        for (const e of [...m.ew, ...m.ns]) walls += +(e === E.WALL), doors += +(e === E.DOOR);
        expect(stairs).toBeGreaterThan(0);
        expect(low).toBeGreaterThan(10);
        expect(walls).toBeGreaterThan(30);
        expect(doors).toBeGreaterThan(1);
        expect(wallTiles).toBe(0);
      }
    });

  it("puts the vampires in the basement when there is one", () => {
    const m = generateMap({ ...req("urban", 7), basement: true });
    expect(m.ground).toBe(1);
    const v = m.spawns.filter((s) => s.side === "vampire");
    expect(v.every((s) => s.z === 0)).toBe(true);
    // The way down: stairs in the basement under a walkable ground tile.
    let way = false;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (tileAt(m, x, y, 0) === T.STAIRS && walkable(m, x, y, 1)) way = true;
    expect(way).toBe(true);
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
});

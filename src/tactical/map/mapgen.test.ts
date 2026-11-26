import { describe, expect, it } from "vitest";
import {
  E,
  edgeAt,
  idx,
  reachable,
  skinAt,
  T,
  tileAt,
  unreachableTiles,
  VEHICLE_LENGTH,
  walkable,
} from "./map";
import { generateMap, mapSize, type MapRequest } from "./mapgen";
import { APARTMENT_STOREYS } from "./sites";

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
    it(`makes connected ${setting} maps with a clear landing zone and every enemy placed`, () => {
      for (let seed = 1; seed <= 60; seed++) {
        const size = (["nest", "den", "haven"] as const)[seed % 3]!;
        const m = generateMap(req(setting, seed, size));
        expect(m.w).toBe(mapSize(setting, size));
        expect(unreachableTiles(m)).toEqual([]);
        expect(m.lz).toHaveLength(9);
        for (const p of m.lz) expect(walkable(m, p.x, p.y, p.z)).toBe(true);
        expect(m.spawns.filter((s) => s.side === "thrall")).toHaveLength(4);
        expect(m.spawns.filter((s) => s.side === "vampire")).toHaveLength(2);
        const seen = reachable(m, m.lz[0]!);
        for (const s of m.spawns) expect(seen[idx(m, s.x, s.y, s.z)]).toBe(1);
        // Real places: buildings with stairs, cover to hide behind; walls thin, on the edges, with doorways.
        let stairs = 0,
          low = 0,
          walls = 0,
          doors = 0,
          wallTiles = 0;
        for (const t of m.tiles)
          ((stairs += +(t === T.STAIRS)),
            (low += +(t === T.LOW)),
            (wallTiles += +(t === T.WALL || t === T.DOOR || t === T.WINDOW)));
        for (const e of [...m.ew, ...m.ns])
          ((walls += +(e === E.WALL)), (doors += +(e === E.DOOR || e === E.SHUT)));
        expect(stairs).toBeGreaterThan(0);
        expect(low).toBeGreaterThan(10);
        expect(walls).toBeGreaterThan(30);
        expect(doors).toBeGreaterThan(1);
        expect(wallTiles).toBe(0);
      }
    }, 30_000); // 60 maps: ~1.3 s here (apartments), past the 5 s default on CI runners

  it("parks whole vehicles (two across, their length long) on 8-wide town roads", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const m = generateMap(req("urban", seed, "haven"));
      expect(m.vehicles.length).toBeGreaterThan(4);
      for (const v of m.vehicles) {
        expect([v.w, v.h].sort()).toEqual([2, VEHICLE_LENGTH[v.kind]].sort());
        for (let dy = 0; dy < v.h; dy++)
          for (let dx = 0; dx < v.w; dx++) {
            expect(tileAt(m, v.x + dx, v.y + dy, v.z)).toBe(v.kind === "truck" ? T.HIGH : T.LOW);
            expect(skinAt(m, v.x + dx, v.y + dy, v.z)).toBe(v.kind === "truck" ? "truck" : "car");
          }
      }
      // Some row of the map crosses a road 8 tiles wide.
      let widest = 0;
      for (let y = 0; y < m.h; y++) {
        let run = 0;
        for (let x = 0; x < m.w; x++) {
          const road =
            skinAt(m, x, y, m.ground) === "road" ||
            m.vehicles.some(
              (v) => v.under === "road" && x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h,
            );
          run = road ? run + 1 : 0;
          if (run <= 8) widest = Math.max(widest, run);
        }
      }
      expect(widest).toBe(8);
    }
  });

  it("lays towns out logically: car parks open onto a road, doors onto paving, lamps evenly spaced", () => {
    let carParks = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const m = generateMap(req("urban", seed, (["nest", "den", "haven"] as const)[seed % 3]));
      const g = m.ground;
      const under = (x: number, y: number) =>
        m.vehicles.find((v) => x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h)?.under ??
        skinAt(m, x, y, g);
      const N = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const;
      // Every car park (tarmac, joined up) touches a road: its driveway.
      const seen = new Uint8Array(m.w * m.h);
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          if (seen[y * m.w + x] || under(x, y) !== "tarmac") continue;
          carParks++;
          let road = false;
          const q = [[x, y]];
          seen[y * m.w + x] = 1;
          while (q.length) {
            const [cx, cy] = q.pop()!;
            for (const [dx, dy] of N) {
              const nx = cx! + dx,
                ny = cy! + dy;
              if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
              const k = under(nx, ny);
              if (k === "road") road = true;
              if (k === "tarmac" && !seen[ny * m.w + nx])
                ((seen[ny * m.w + nx] = 1), q.push([nx, ny]));
            }
          }
          expect(road).toBe(true);
        }
      // A door out of a building opens onto paving, never straight onto grass.
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++)
          for (const [dx, dy] of N) {
            if (skinAt(m, x, y, g) !== "indoor" || skinAt(m, x + dx, y + dy, g) === "indoor")
              continue;
            if (edgeAt(m, x, y, g, dx, dy) !== E.DOOR) continue;
            expect(["pavement", "stone", "tarmac"]).toContain(under(x + dx, y + dy));
          }
      // Street lamps along one kerb are never bunched (spaced 8, a step aside at most).
      const street = m.lights.filter(
        (l) => l.z === g && N.some(([dx, dy]) => under(l.x + dx, l.y + dy) === "road"),
      );
      expect(street.length).toBeGreaterThan(3);
      for (const a of street)
        for (const b of street)
          if (a !== b && (a.x === b.x || a.y === b.y))
            expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(6);
    }
    expect(carParks).toBeGreaterThan(3);
  });

  it("builds an apartment block floor on floor, with the helicopter's landing on its roof", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const size = (["nest", "den", "haven"] as const)[seed % 3]!;
      const m = generateMap(req("apartments", seed, size));
      expect(m.levels - m.ground - 1).toBe(APARTMENT_STOREYS[size]);
      const roof = m.levels - 1;
      expect(m.airLz).toHaveLength(9);
      for (const p of m.airLz!)
        (expect(p.z).toBe(roof), expect(walkable(m, p.x, p.y, p.z)).toBe(true));
      // The roof is reached from the street, by the stairs.
      expect(reachable(m, m.lz[0]!)[idx(m, m.airLz![4]!.x, m.airLz![4]!.y, roof)]).toBe(1);
      // Enemies on more than one floor.
      expect(
        new Set(m.spawns.filter((s) => s.side === "thrall").map((s) => s.z)).size,
      ).toBeGreaterThan(1);
    }
  });

  it("puts the blood bank under the warehouse: fridges and beds below, racking in the hall", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const m = generateMap(req("industrial", seed));
      expect(m.ground).toBe(1);
      const count = (z: number, skin: string) => {
        let n = 0;
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++) n += +(skinAt(m, x, y, z) === skin);
        return n;
      };
      expect(count(0, "fridge")).toBeGreaterThan(3);
      expect(count(0, "bed")).toBeGreaterThan(1);
      expect(count(1, "rack")).toBeGreaterThan(20);
      expect(m.spawns.filter((s) => s.side === "vampire").every((s) => s.z === 0)).toBe(true);
      expect(m.airLz?.every((p) => p.z === m.ground)).toBe(true);
    }
  });

  it("finds a hospital a lot deep enough for its lobby (seeds that once crashed)", () => {
    for (const [size, seed] of [
      ["den", 115],
      ["haven", 324],
    ] as const) {
      const m = generateMap({
        setting: "urban",
        size,
        seed,
        thralls: 5,
        vampires: 2,
        civilians: 2,
        landmark: "hospital",
      });
      expect(m.signs.some((s) => s.text === "+ HOSPITAL")).toBe(true);
    }
  });

  it("raises a landmark as the hideout: a hospital or a supermarket with its sign", () => {
    for (const landmark of ["hospital", "store"] as const)
      for (let seed = 1; seed <= 8; seed++) {
        const m = generateMap({ ...req("urban", seed), landmark });
        const text = landmark === "hospital" ? "+ HOSPITAL" : "SUPERMARKET";
        const sign = m.signs.find((s) => s.text === text);
        expect(sign).toBeDefined();
        const v = m.spawns.find((s) => s.side === "vampire")!;
        // The vampires are in (or under) it: within its footprint, near its sign.
        expect(Math.hypot(v.x - sign!.x, v.y - sign!.y)).toBeLessThan(16);
        if (landmark === "hospital")
          expect(m.vehicles.some((x) => x.kind === "ambulance")).toBe(true);
        let props = 0;
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++)
            props += +(skinAt(m, x, y, m.ground) === (landmark === "hospital" ? "bed" : "shelf"));
        if (landmark === "store") expect(props).toBeGreaterThanOrEqual(3);
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

  it("furnishes flats: whole pieces on LOW tiles, open floor in front", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const m = generateMap(req("apartments", seed));
      const kinds = new Set(m.furniture.map((f) => f.kind));
      expect([...kinds].sort()).toEqual(["bed", "sofa", "tv"]);
      for (const f of m.furniture) {
        expect([f.w, f.h].sort()).toEqual(f.kind === "bed" ? [2, 2] : [1, 2]);
        for (let y = f.y; y < f.y + f.h; y++)
          for (let x = f.x; x < f.x + f.w; x++) {
            expect(tileAt(m, x, y, f.z)).toBe(T.LOW);
            expect(skinAt(m, x, y, f.z)).toBe(f.kind);
          }
        // The front row: someone can stand there.
        const front: [number, number][] = [];
        for (let y = f.y; y < f.y + f.h; y++)
          for (let x = f.x; x < f.x + f.w; x++) {
            const fx = x + f.dx,
              fy = y + f.dy;
            if (fx < f.x || fy < f.y || fx >= f.x + f.w || fy >= f.y + f.h) front.push([fx, fy]);
          }
        expect(front.some(([x, y]) => walkable(m, x, y, f.z))).toBe(true);
      }
    }
  });

  it("stacks an apartment block's windows alike on every upper floor", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const m = generateMap(req("apartments", seed));
      const facade = (z: number) => {
        const out: number[] = [];
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++)
            for (const [dx, dy] of [
              [1, 0],
              [0, 1],
            ] as const) {
              const e = edgeAt(m, x, y, z, dx, dy);
              out.push(e === E.WINDOW ? 1 : 0);
            }
        return out;
      };
      const floors = APARTMENT_STOREYS.den;
      const first = facade(m.ground + 1);
      expect(first.filter((v) => v).length).toBeGreaterThan(10);
      for (let i = 2; i < floors - 2; i++) expect(facade(m.ground + i)).toEqual(first);
    }
  });

  it("puts the vampires in the basement when there is one", () => {
    const m = generateMap({ ...req("urban", 7), basement: true });
    expect(m.ground).toBe(1);
    const v = m.spawns.filter((s) => s.side === "vampire");
    expect(v.every((s) => s.z === 0)).toBe(true);
    // The way down: stairs in the basement under a walkable ground tile.
    let way = false;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        if (tileAt(m, x, y, 0) === T.STAIRS && walkable(m, x, y, 1)) way = true;
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
  it("doors mostly start closed; shopfronts and luxury penthouses are glass", () => {
    let shut = 0,
      open = 0,
      shopGlass = 0,
      highGlass = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const town = generateMap(req("urban", seed, "haven"));
      for (const e of [...town.ew, ...town.ns])
        ((shut += +(e === E.SHUT)), (open += +(e === E.DOOR)), (shopGlass += +(e === E.GLASS)));
      const flats = generateMap(req("apartments", seed));
      const top = flats.levels - 2; // the top storey (the roof is above it)
      for (let y = 0; y < flats.h; y++)
        for (let x = 0; x < flats.w; x++)
          highGlass += +(
            edgeAt(flats, x, y, top, 1, 0) === E.GLASS || edgeAt(flats, x, y, top, 0, 1) === E.GLASS
          );
    }
    expect(shut).toBeGreaterThan(open * 2);
    expect(open).toBeGreaterThan(0);
    expect(shopGlass).toBeGreaterThan(0);
    expect(highGlass).toBeGreaterThan(0);
  });
});

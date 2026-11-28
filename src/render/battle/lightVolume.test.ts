import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { E, emptyMap, setEdge, setTile, T } from "../../tactical/map/map";
import { generateMap } from "../../tactical/map/mapgen";
import { addLight, clear, emptyVolume } from "./lightVolume";
import { LEVEL_H, SLAB, TILE, wc } from "./scale";

/** Two levels of open floor, 6 × 6. */
function room() {
  const m = emptyMap(6, 6, 2, 0, "urban", 1);
  for (let z = 0; z < 2; z++)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) setTile(m, x, y, z, T.FLOOR, "indoor");
  return m;
}
/** A point over tile (x, y), h metres above level z's floor. */
const at = (x: number, y: number, z: number, h: number) => [wc(x), z * LEVEL_H + SLAB + h, wc(y)];

describe("light volume occlusion", () => {
  it("open floor: clear", () => {
    expect(clear(room(), at(0, 0, 0, 0.3), at(5, 3, 0, 2))).toBe(true);
  });

  it("a wall blocks; a window lets light through between sill and lintel; a doorway under its lintel", () => {
    for (const [kind, low, high] of [
      [E.WALL, false, false],
      [E.WINDOW, false, true],
      [E.DOOR, true, true],
    ] as const) {
      const m = room();
      for (let y = 0; y < 6; y++) setEdge(m, 2, y, 0, 1, 0, kind, "brick");
      // Low (0.4 m, under a sill) and at chest height (1.5 m) on both sides.
      expect(clear(m, at(1, 2, 0, 0.4), at(4, 2, 0, 0.4))).toBe(low);
      expect(clear(m, at(1, 2, 0, 1.5), at(4, 2, 0, 1.5))).toBe(high);
    }
  });

  it("a floor blocks light from the level below, except up a stairwell", () => {
    const m = room();
    expect(clear(m, at(2, 2, 1, 0.3), at(2, 2, 0, 1.5))).toBe(false);
    setTile(m, 2, 2, 0, T.STAIRS, "wood");
    expect(clear(m, at(2, 2, 1, 0.3), at(2, 2, 0, 1.5))).toBe(true);
  });

  it("props cast shadows up to their height", () => {
    const m = room();
    setTile(m, 2, 2, 0, T.LOW, "crate");
    expect(clear(m, at(1, 2, 0, 0.3), at(3, 2, 0, 0.3))).toBe(false);
    expect(clear(m, at(1, 2, 0, 1.5), at(3, 2, 0, 1.5))).toBe(true);
    setTile(m, 2, 2, 0, T.HIGH, "pillar");
    expect(clear(m, at(1, 2, 0, 1.5), at(3, 2, 0, 1.5))).toBe(false);
  });

  it("bakes a big map's lamps: lit near a lamp and dark far off", { timeout: 60000 }, () => {
    const m = generateMap({ setting: "urban", size: "haven", seed: 7, thralls: 0, vampires: 0 });
    const v = emptyVolume(m);
    const t0 = performance.now();
    for (const l of m.lights)
      addLight(m, v, {
        x: wc(l.x),
        y: l.z * LEVEL_H + SLAB + 3.6,
        z: wc(l.y),
        colour: new THREE.Color(1, 1, 1),
        power: 22,
        range: 5 * TILE,
      });
    const ms = performance.now() - t0;
    // The cell just above the floor under the first street lamp (every light is baked as one here).
    const l = m.lights.find((q) => !q.ceiling)!;
    const cell = (wx: number, wz: number, wy: number) =>
      ((Math.floor(wy / (LEVEL_H / 10)) * v.nz + Math.floor(wz / (TILE / 4))) * v.nx +
        Math.floor(wx / (TILE / 4))) *
      3;
    expect(v.rgb[cell(wc(l.x), wc(l.y), l.z * LEVEL_H + SLAB + 0.2)]!).toBeGreaterThan(0.5);
    console.log(
      `baked ${m.lights.length} lamps on ${m.w}×${m.h}×${m.levels} in ${ms.toFixed(0)} ms`,
    );
  });
});

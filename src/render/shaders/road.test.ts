import { describe, expect, it } from "vitest";
import { emptyMap } from "../../tactical/map";
import { ROAD, roadMap } from "./road";

describe("road map", () => {
  it("tells strips from junctions, with their start, width, and junctions close by", () => {
    // A 3-wide road down x = 5..7 crossing a 3-wide road along y = 8..10, on a 16 × 16 map.
    const m = emptyMap(16, 16, 1, 0, "urban", 1);
    const road = (x: number, y: number) => (x >= 5 && x <= 7) || (y >= 8 && y <= 10);
    const tex = roadMap(m, (x, y) => (road(x, y) ? "road" : null));
    const d = tex.image.data as Uint8Array;
    const at = (x: number, y: number) => Array.from(d.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4));
    expect(at(6, 2)).toEqual([ROAD.alongZ, 5, 3, 0]);
    expect(at(2, 9)).toEqual([ROAD.alongX, 8, 3, 0]);
    expect(at(6, 9)[0]).toBe(ROAD.junction);
    // Next to the junction (ahead): a zebra; two before it: the stop line.
    expect(at(6, 7)[3]).toBe(2);
    expect(at(6, 6)[3]).toBe(8);
    expect(at(6, 11)[3]).toBe(1);
    expect(at(0, 0)[0]).toBe(ROAD.none);
  });
});

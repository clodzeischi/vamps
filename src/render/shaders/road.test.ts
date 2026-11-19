import { describe, expect, it } from "vitest";
import { emptyMap } from "../../tactical/map";
import { ROAD, roadMap } from "./road";

describe("road map", () => {
  it("tells strips from junctions, with their start, width, and junctions close by", () => {
    // An 8-wide road down x = 10..17 crossing an 8-wide road along y = 20..27, on a 40 × 40 map.
    const m = emptyMap(40, 40, 1, 0, "urban", 1);
    const road = (x: number, y: number) => (x >= 10 && x <= 17) || (y >= 20 && y <= 27);
    const tex = roadMap(m, (x, y) => (road(x, y) ? "road" : null));
    const d = tex.image.data as Uint8Array;
    const at = (x: number, y: number) => Array.from(d.slice((y * 40 + x) * 4, (y * 40 + x) * 4 + 4));
    expect(at(12, 2)).toEqual([ROAD.alongZ, 10, 8, 0]);
    expect(at(2, 22)).toEqual([ROAD.alongX, 20, 8, 0]);
    expect(at(12, 22)[0]).toBe(ROAD.junction);
    // Before the junction (ahead): the crossing's two tiles (the outer one FAR), then the stop line.
    expect(at(12, 19)[3]).toBe(2);
    expect(at(12, 18)[3]).toBe(2 | 16);
    expect(at(12, 17)[3]).toBe(8);
    // After it (behind).
    expect(at(12, 28)[3]).toBe(1);
    expect(at(12, 29)[3]).toBe(1 | 16);
    expect(at(12, 30)[3]).toBe(4);
    expect(at(0, 0)[0]).toBe(ROAD.none);
  });
});

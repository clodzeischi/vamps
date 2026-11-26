import { describe, expect, it } from "vitest";
import { subsolarPoint, moonPhase } from "./time";

describe("subsolarPoint", () => {
  it("is over the Tropic of Cancer near Greenwich at noon on the June solstice", () => {
    const p = subsolarPoint(Date.UTC(2027, 5, 21, 12, 0));
    expect(p.lat).toBeCloseTo(23.4, 0);
    expect(Math.abs(p.lon)).toBeLessThan(2);
  });
  it("is in the southern hemisphere in December and moves west through the day", () => {
    const morning = subsolarPoint(Date.UTC(2027, 11, 21, 6, 0));
    expect(morning.lat).toBeLessThan(-23);
    expect(morning.lon).toBeGreaterThan(85);
    expect(morning.lon).toBeLessThan(95);
  });
});

describe("the moon", () => {
  it("is new, full and new again when the real one is", () => {
    expect(moonPhase(Date.UTC(2027, 0, 7, 20)).lit).toBeLessThan(0.03);
    expect(moonPhase(Date.UTC(2027, 0, 22, 12)).lit).toBeGreaterThan(0.97);
    expect(moonPhase(Date.UTC(2027, 0, 22, 12)).name).toBe("Full moon");
    expect(moonPhase(Date.UTC(2027, 0, 14, 12)).name).toBe("First quarter");
  });
});

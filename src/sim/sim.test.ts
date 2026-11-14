import { describe, expect, it } from "vitest";
import { REGIONS } from "../data/regions";
import { BLOODLINES } from "../data/bloodlines";
import { deserialize, serialize, SaveError } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { build, buildBlocker, coveredRegions } from "./commands";
import { runningCostMultiplier } from "./economy";
import type { GameState } from "./state";
import { DAY } from "./time";

/** Runs the clock for `days`, dismissing every event like a player clicking OK. */
function play(s: GameState, days: number) {
  const end = s.time + days * DAY;
  let guard = 0;
  while (s.time < end && !s.gameOver && guard++ < 100_000) {
    advance(s, end - s.time);
    while (s.events.length) dismissEvent(s);
  }
}

describe("data", () => {
  it("every region has cities and every bloodline home region exists", () => {
    const ids = new Set(REGIONS.map((r) => r.id));
    for (const r of REGIONS) expect(r.cities.length, r.id).toBeGreaterThan(0);
    for (const b of BLOODLINES) for (const h of b.homeRegions) expect(ids.has(h), `${b.id}: ${h}`).toBe(true);
  });
});

describe("new campaign", () => {
  it("starts with Padua and one SIGINT station in Europe outside Italy", () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = newCampaign("inquisitor", seed);
      expect(s.installations.map((i) => i.kind).sort()).toEqual(["base", "sigint"]);
      const sigint = s.installations.find((i) => i.kind === "sigint")!;
      const region = REGIONS.find((r) => r.id === sigint.regionId)!;
      expect(region.group).toBe("Europe");
      expect(region.id).not.toBe("italy");
      expect(coveredRegions(s).has(region.id)).toBe(true);
    }
  });
});

describe("clock", () => {
  it("runs a year without breaking invariants", () => {
    const s = newCampaign("inquisitor", 7);
    play(s, 365);
    expect(s.monthIndex).toBe(12);
    expect(Number.isFinite(s.funds)).toBe(true);
    for (const r of Object.values(s.regions)) {
      expect(r.support).toBeGreaterThanOrEqual(-5);
      expect(r.support).toBeLessThanOrEqual(5);
    }
    expect(s.lastReport).not.toBeNull();
  });

  it("stops when an event is posted and resumes after it is dismissed", () => {
    const s = newCampaign("inquisitor", 3);
    const advanced = advance(s, 60 * DAY);
    expect(s.events.length).toBe(1); // stopped on the first event
    expect(advanced).toBeLessThanOrEqual(60 * DAY);
    expect(advance(s, DAY)).toBe(0); // paused while the event is pending
    dismissEvent(s);
    expect(advance(s, 1000)).toBeGreaterThan(0);
  });

  it("is deterministic for a given seed", () => {
    const a = newCampaign("grand", 99), b = newCampaign("grand", 99);
    play(a, 200);
    play(b, 200);
    expect(a).toEqual(b);
  });

  it("erodes support slowly enough to fight back (balance guard)", () => {
    const s = newCampaign("inquisitor", 13);
    const before = Object.values(s.regions).reduce((a, r) => a + r.support, 0) / REGIONS.length;
    play(s, 182);
    const after = Object.values(s.regions).reduce((a, r) => a + r.support, 0) / REGIONS.length;
    expect(before - after).toBeGreaterThan(0.6);
    expect(before - after).toBeLessThan(2.0);
  });
});

describe("support", () => {
  it("scales running costs and evicts after a warning", () => {
    expect(runningCostMultiplier(5)).toBe(0);
    expect(runningCostMultiplier(3.6)).toBe(0.5);
    expect(runningCostMultiplier(1)).toBe(1);
    expect(runningCostMultiplier(0.2)).toBe(1.5);
    expect(runningCostMultiplier(-2)).toBe(2);

    const s = newCampaign("inquisitor", 5);
    const sigint = s.installations.find((i) => i.kind === "sigint")!;
    s.regions[sigint.regionId]!.support = -4.4;
    play(s, 31); // first month end: warning
    expect(s.installations.some((i) => i.id === sigint.id)).toBe(true);
    s.regions[sigint.regionId]!.support = -4.4;
    play(s, 31); // second: evicted
    expect(s.installations.some((i) => i.id === sigint.id)).toBe(false);
  });

  it("losing the last Operational Base ends the game", () => {
    const s = newCampaign("inquisitor", 5);
    for (let m = 0; m < 3 && !s.gameOver; m++) {
      s.regions.italy!.support = -5;
      play(s, 31);
    }
    expect(s.gameOver).toBeTruthy();
  });
});

describe("building", () => {
  it("needs support, money and a free slot", () => {
    const s = newCampaign("inquisitor", 11);
    expect(buildBlocker(s, "base", "italy")).toMatch(/already/);
    s.regions.iberia!.support = 0;
    expect(buildBlocker(s, "sigint", "iberia")).toMatch(/support/);
    s.regions.iberia!.support = 2;
    s.funds = 100;
    expect(buildBlocker(s, "sigint", "iberia")).toMatch(/funds/);
    s.funds = 10_000_000;
    s.installations = s.installations.filter((i) => i.regionId !== "iberia");
    expect(build(s, "sigint", "iberia", { lat: 40.4, lon: -3.7 })).toBeNull();
    expect(s.installations.at(-1)!.name).toBe("SIGINT Station Madrid");
    expect(coveredRegions(s).has("iberia")).toBe(false); // under construction
    play(s, 15);
    expect(coveredRegions(s).has("iberia")).toBe(true);
  });

  it("names Siberian stations after their fixed sites", () => {
    const s = newCampaign("novice", 1);
    s.regions.north_siberia!.support = 2;
    s.regions.south_siberia!.support = 2;
    build(s, "sigint", "north_siberia", { lat: 60, lon: 95 });
    build(s, "sigint", "south_siberia", { lat: 55, lon: 83 });
    expect(s.installations.slice(-2).map((i) => i.name)).toEqual(["SIGINT Station Norilsk", "SIGINT Station Baikal"]);
  });
});

describe("saves", () => {
  it("round-trips a campaign", () => {
    const s = newCampaign("inquisitor", 21);
    play(s, 90);
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });

  it("rejects garbage and damaged saves with a clear error", () => {
    expect(() => deserialize("not json")).toThrow(SaveError);
    expect(() => deserialize('{"format":"other"}')).toThrow(/not a Vamps save/);
    const s = newCampaign("inquisitor", 2);
    const bad = JSON.parse(serialize(s));
    bad.state.installations[0].kind = "death_star";
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/unknown installation/);
    bad.version = 999;
    expect(() => deserialize(JSON.stringify(bad))).toThrow(/newer version/);
  });

  it("fills in regions added after the save was made", () => {
    const s = newCampaign("inquisitor", 2);
    delete s.regions.pacific;
    expect(deserialize(serialize(s)).regions.pacific).toBeDefined();
  });
});

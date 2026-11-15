import { describe, expect, it } from "vitest";
import { neighboursOf, REGIONS, regionById } from "../data/regions";
import defs from "../data/regions.json";
import { BLOODLINES } from "../data/bloodlines";
import { deserialize, serialize, SaveError } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { build, buildBlocker, coveredRegions, detectionChance, nameBlocker, sigintRates, nearestPlace, renameInstallation, suggestName } from "./commands";
import { runningCostMultiplier } from "./economy";
import { hourlyOperations, dailyOperations } from "./operations";
import { generateCandidate, acquireBlocker, acquireAircraft, monthlyPersonnelCost, recruit, recruitBlocker, releaseAircraft, upgradeBase } from "./personnel";
import { AIRCRAFT } from "../data/aircraft";
import { improvementLine, shownLeadKind, STAT_CAP, train } from "./state";
import type { GameState, Installation } from "./state";
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

describe("geography", () => {
  it("puts Crimea in Ukraine's region", () => {
    const states = (id: string) => (defs.regions.find((r) => r.id === id) as { states?: Record<string, string[]> }).states ?? {};
    expect(states("eastern_europe").RUS).toEqual(expect.arrayContaining(["Crimea", "Sevastopol"]));
    expect(states("russia_volga").RUS).not.toContain("Crimea");
  });

  it("uses current city names", () => {
    const names = REGIONS.flatMap((r) => r.cities.map((c) => c.name));
    expect(names).toContain("Kyiv");
    for (const old of ["Kiev", "Odessa", "Lvov", "Kobenhavn", "Rangoon", "Shenyeng"]) expect(names).not.toContain(old);
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
    expect(s.installations.at(-1)!.name).toBe("Station Madrid");
    expect(coveredRegions(s).has("iberia")).toBe(false); // under construction
    play(s, 15);
    expect(coveredRegions(s).has("iberia")).toBe(true);
  });

  it("suggests a name from the nearest city, and takes the player's own", () => {
    const s = newCampaign("novice", 1);
    s.regions.north_siberia!.support = 2;
    s.regions.central_europe!.support = 3;
    s.installations = s.installations.filter((i) => i.regionId !== "central_europe");
    expect(suggestName(s, "sigint", "central_europe", { lat: 47.5, lon: 19.1 })).toBe("Station Budapest");
    expect(suggestName(s, "base", "nile", { lat: 30.0, lon: 31.3 })).toBe("Base Cairo");
    // Smaller towns too, not just the region's big cities.
    expect(nearestPlace("central_europe", { lat: 46.25, lon: 20.15 })).toBe("Szeged");
    expect(nearestPlace("italy", { lat: 45.44, lon: 12.3 })).toBe("Venice");
    // The fixed Siberian station sites count as places.
    expect(suggestName(s, "sigint", "north_siberia", { lat: 69.3, lon: 88.1 })).toBe("Station Norilsk");
    expect(build(s, "sigint", "central_europe", { lat: 47.5, lon: 19.1 }, "  Station Danube ")).toBeNull();
    expect(s.installations.at(-1)!.name).toBe("Station Danube");
    expect(s.installations.at(-1)!.pos).toEqual({ lat: 47.5, lon: 19.1 });
    expect(nameBlocker(s, "station danube")).toMatch(/already/);
    expect(nameBlocker(s, "   ")).toMatch(/name/);
    expect(nameBlocker(s, "x".repeat(40))).toMatch(/32/);
    const id = s.installations.at(-1)!.id;
    expect(renameInstallation(s, id, "Station Budapest")).toBeNull();
    expect(s.installations.at(-1)!.name).toBe("Station Budapest");
    // Taken names get a numeral.
    expect(suggestName(s, "sigint", "central_europe", { lat: 47.5, lon: 19.1 })).toBe("Station Budapest II");
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

describe("personnel", () => {
  it("founds the Order with a team, two aircraft and candidates", () => {
    const s = newCampaign("inquisitor", 4);
    expect(s.agents).toHaveLength(6);
    expect(s.agents.every((a) => a.baseId === "ob-padua")).toBe(true);
    expect(s.aircraft.map((a) => a.name).sort()).toEqual(["CHERUB-1", "SERAPH-1"]);
    expect(s.candidates).toHaveLength(6);
    expect(new Set([...s.agents, ...s.candidates].map((a) => a.name)).size).toBe(12);
  });

  it("recruits up to the quarters limit", () => {
    const s = newCampaign("novice", 4);
    s.funds = 1e9;
    for (let i = 0; i < 12; i++) {
      if (!s.candidates.length) s.candidates.push(generateCandidate(s));
      recruit(s, s.candidates[0]!.id, "ob-padua");
    }
    expect(s.agents).toHaveLength(12);
    expect(recruitBlocker(s, "ob-padua")).toMatch(/quarters/);
  });

  it("needs a free hangar to lease, and hangars take time to build", () => {
    const s = newCampaign("inquisitor", 4);
    s.funds = 1e9;
    expect(acquireBlocker(s, "ob-padua", "helicopter")).toMatch(/hangar/);
    expect(upgradeBase(s, "ob-padua", "hangar")).toBeNull();
    play(s, 11);
    const funds = s.funds;
    expect(acquireAircraft(s, "ob-padua", "helicopter")).toBeNull();
    expect(s.aircraft.at(-1)!.name).toBe("CHERUB-2");
    expect(s.funds).toBe(funds - AIRCRAFT.helicopter.price); // bought outright
  });

  it("owns helicopters (sold for half) and leases jets (handed back for nothing)", () => {
    const s = newCampaign("inquisitor", 4);
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const jetCraft = s.aircraft.find((a) => a.kind === "jet")!;
    expect(monthlyPersonnelCost(s).leases).toBe(AIRCRAFT.helicopter.monthly + AIRCRAFT.jet.monthly);
    let funds = s.funds;
    expect(releaseAircraft(s, heli.id)).toBeNull();
    expect(s.funds).toBe(funds + AIRCRAFT.helicopter.price / 2);
    funds = s.funds;
    expect(releaseAircraft(s, jetCraft.id)).toBeNull();
    expect(s.funds).toBe(funds);
    expect(s.aircraft).toHaveLength(0);
  });

  it("draws recruits from where support and presence are", () => {
    const s = newCampaign("inquisitor", 8);
    for (const id of Object.keys(s.regions)) s.regions[id]!.support = id === "maritime_asia" ? 5 : -1;
    s.installations.push({ ...s.installations[1]!, id: "sigint-x", regionId: "maritime_asia" });
    const cultures = new Set(Array.from({ length: 30 }, () => generateCandidate(s).culture));
    expect([...cultures].every((c) => c === "filipino" || c === "indonesian")).toBe(true);
  });
});

describe("operations and leads", () => {
  it("only surface as leads where SIGINT can hear them", () => {
    const s = newCampaign("inquisitor", 6);
    play(s, 120);
    const heard = sigintRates(s);
    expect(s.leads.every((l) => (heard.get(l.regionId) ?? 0) > 0)).toBe(true);
    expect(s.operations.length).toBeGreaterThan(5);
  });

  it("hears its own region well, neighbours faintly, and stations add up", () => {
    const s = newCampaign("inquisitor", 6);
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    const station = (regionId: string, n: number) =>
      ({ id: `t-${regionId}-${n}`, kind: "sigint", name: "T", regionId, pos: regionById(regionId)!.label, readyAt: 0, evictionWarned: false }) as Installation;
    s.installations.push(station("central_europe", 1));
    let r = sigintRates(s);
    const own = r.get("central_europe")!;
    const near = r.get("eastern_europe")!;
    expect(detectionChance(own)).toBeGreaterThan(0.35);
    expect(near).toBeGreaterThan(0);
    expect(detectionChance(near)).toBeLessThan(0.1);
    expect(r.has("iberia")).toBe(false); // not a neighbour
    expect(neighboursOf("france_benelux")).not.toContain("brazil"); // French Guiana doesn't count
    // Two in the region double it; one next door adds to it.
    s.installations.push(station("central_europe", 2));
    r = sigintRates(s);
    expect(r.get("central_europe")).toBeCloseTo(2 * own);
    s.installations.push(station("eastern_europe", 1));
    r = sigintRates(s);
    expect(r.get("central_europe")).toBeCloseTo(2 * own + near);
    expect(neighboursOf("eastern_europe")).toContain("central_europe");
  });

  it("disguises double agents as volunteer sources", () => {
    const s = newCampaign("inquisitor", 6);
    const sigint = s.installations.find((i) => i.kind === "sigint")!;
    let doubles = 0;
    for (let i = 0; i < 400; i++) {
      s.operations.push({ id: `op-t${i}`, bloodline: "carcassonne", kind: "recruitment", regionId: sigint.regionId, pos: sigint.pos, city: "X", startedAt: s.time, endsAt: s.time + 9 * DAY, leadId: null });
    }
    s.events = [];
    dailyOperations(s);
    for (const l of s.leads) {
      if (l.kind === "double") { doubles++; expect(shownLeadKind(l)).toBe("source"); }
    }
    expect(doubles).toBeGreaterThan(5);
  });

  it("costs more support when a known lead is ignored", () => {
    const run = (withLead: boolean) => {
      const s = newCampaign("inquisitor", 6);
      s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
      s.operations = [{ id: "op-z", bloodline: "carcassonne", kind: "feeding", regionId: "iberia", pos: { lat: 40, lon: -3 }, city: "Madrid", startedAt: s.time, endsAt: s.time + DAY, leadId: withLead ? "lead-gone" : null }];
      const before = s.regions.iberia!.support;
      s.time += 2 * DAY;
      hourlyOperations(s);
      return before - s.regions.iberia!.support;
    };
    expect(run(true)).toBeGreaterThan(run(false) * 2);
  });
});

describe("save migration", () => {
  it("upgrades a version 1 save and founds the Order", () => {
    const s = newCampaign("inquisitor", 30);
    const v1 = JSON.parse(serialize(s));
    v1.version = 1;
    for (const k of ["agents", "candidates", "aircraft", "operations", "leads", "nextOperation"]) delete v1.state[k];
    delete v1.state.installations[0].hangars;
    for (const k of ["labs", "workshops", "containment", "scientists", "engineers", "remains", "captives"]) delete v1.state.installations[0][k];
    delete v1.state.research;
    delete v1.state.engineering;
    const back = deserialize(JSON.stringify(v1));
    expect(back.version).toBe(5);
    expect(back.research).toEqual({ done: [] });
    expect(back.projects).toEqual([]);
    expect(back.installations[0]!.labs).toBe(1);
    expect(back.installations[0]!.scientists).toBe(4);
    expect(back.coverUps).toEqual([]);
    expect(back.media).toEqual({});
    expect(back.missions).toEqual([]);
    expect(back.agents).toHaveLength(6);
    expect(back.aircraft).toHaveLength(2);
    expect(back.installations[0]!.hangars).toBe(2);
  });
});

describe("experience", () => {
  it("raises stats up to the cap and says so", () => {
    const s = newCampaign("inquisitor", 3);
    const a = s.agents[0]!;
    a.stats.tradecraft = STAT_CAP - 1;
    expect(train(a, "tradecraft", 3)).toBe(1);
    expect(a.stats.tradecraft).toBe(STAT_CAP);
    expect(train(a, "tradecraft", 2)).toBe(0);
    const before = a.stats.insight;
    const line = improvementLine(a, { insight: train(a, "insight", 2), tradecraft: 0 });
    expect(a.stats.insight).toBe(before + 2);
    expect(line).toBe(`${a.sister ? "Sr." : "Br."} ${a.name}: Insight +2`);
    expect(improvementLine(a, { combat: 0 })).toBeNull();
  });
});

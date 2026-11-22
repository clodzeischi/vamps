import { describe, expect, it } from "vitest";
import { setStaff } from "./personnel";
import { AGENT_UPKEEP } from "../data/agents";
import { AIRCRAFT } from "../data/aircraft";
import { DIFFICULTIES, type DifficultyId } from "../data/difficulty";
import { INSTALLATIONS } from "../data/installations";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { creditRegion, monthEnd, monthlyIncome, PLEDGE_MAX, regionalContribution, reviewPledges } from "./economy";
import { artifactOffer, dailyMarket, DEMAND_RECOVERY, findArtifact, GOODS, offerFor, returnArtifact, sellArtifact, sellGood, stockOf } from "./market";
import { dailyResearch, startProject } from "./research";
import { DAY } from "./time";

const quiet = (diff: DifficultyId = "inquisitor", seed = 1) => {
  const s = newCampaign(diff, seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15; s.story.insider = s.story.fallWarned = true;
  return s;
};
const padua = (s: ReturnType<typeof quiet>) => s.installations.find((i) => i.kind === "base")!;

/** A working base abroad, at ordinary support: the base, six operators, a helicopter and a station. */
const BASE_PACKAGE = INSTALLATIONS.base.monthlyCost + INSTALLATIONS.sigint.monthlyCost + 6 * AGENT_UPKEEP + AIRCRAFT.helicopter.monthly;

describe("the Act II budget (docs/WEB_PORT.md 3.5)", () => {
  // The hostage years: the stipend's trickle plus the world outside Europe at its starting opinion.
  const generic = (diff: DifficultyId) => {
    const s = quiet(diff);
    s.story.act = 2;
    const { stipend, regional } = monthlyIncome(s);
    return (stipend + regional) / BASE_PACKAGE;
  };
  // At the regions' starting opinion. The bloodlines' pressure wears support down through Act II;
  // in the batch (npm run batch, campaign bot) a player who answers leads ends up near two bases'
  // worth on Novice, 1.4 on Inquisitor and 0.9 on Grand (docs/WEB_PORT.md 5b step 4).
  it("pays for two bases on Novice, one on Inquisitor, and barely one on Grand without trying", () => {
    expect(generic("novice")).toBeGreaterThanOrEqual(2);
    expect(generic("novice")).toBeLessThan(2.4);
    expect(generic("inquisitor")).toBeGreaterThanOrEqual(1.4);
    expect(generic("inquisitor")).toBeLessThan(1.7);
    expect(generic("grand")).toBeGreaterThan(1.25);
    expect(generic("grand")).toBeLessThan(1.5);
    expect(generic("grand")).toBeLessThan(generic("inquisitor"));
  });
});

describe("pledges", () => {
  it("move at the month's review with what we did in the region, within bounds", () => {
    const s = quiet();
    const before = regionalContribution(s, "brazil");
    creditRegion(s, "brazil", 0.2);
    expect(regionalContribution(s, "brazil")).toBe(before); // nothing until the review
    const changes = reviewPledges(s);
    expect(changes).toEqual([{ regionId: "brazil", delta: regionalContribution(s, "brazil") - before }]);
    expect(regionalContribution(s, "brazil")).toBeCloseTo(before * 1.2, -3);
    creditRegion(s, "brazil", 5);
    reviewPledges(s);
    expect(s.regions.brazil!.pledge).toBe(PLEDGE_MAX);
    expect(s.regions.brazil!.credit).toBe(0);
  });
  it("are reported at month end", () => {
    const s = quiet();
    creditRegion(s, "us_northeast", 0.1);
    monthEnd(s);
    expect(s.lastReport!.pledges![0]!.regionId).toBe("us_northeast");
    expect(s.lastReport!.pledges![0]!.delta).toBeGreaterThan(0);
  });
});

describe("the black market", () => {
  it("sells vampire tissue from cold storage: worth more the more we know, at a cost in secrecy and demand", () => {
    const s = quiet();
    const b = padua(s);
    b.remains = 3;
    expect(stockOf(s, "tissue")).toBe(3);
    const raw = offerFor(s, "tissue");
    s.research.done.push("vampire-physiology");
    const known = offerFor(s, "tissue");
    expect(known).toBeGreaterThan(raw * 2);
    const [funds, secrecy] = [s.funds, s.secrecy];
    expect(sellGood(s, "tissue")).toBeNull();
    expect(s.funds - funds).toBe(known);
    expect(s.secrecy).toBeCloseTo(secrecy - GOODS.tissue.secrecy);
    expect(b.remains).toBe(2);
    expect(offerFor(s, "tissue")).toBeLessThan(known); // demand fell
    dailyMarket(s);
    expect(s.market.demand.tissue).toBeCloseTo(1 - GOODS.tissue.drop + DEMAND_RECOVERY);
    expect(s.market.earned).toBe(known);
  });

  it("runs production lines that keep making until stopped or out of money", () => {
    const s = quiet();
    s.research.done.push("haematology");
    const b = padua(s);
    expect(startProject(s, "make-plasma", b.id)).toBeNull();
    const funds = s.funds;
    for (let d = 0; d < 20; d++) dailyResearch(s);
    // Four engineers at 1.5 a day, 45 points a batch: a batch every 8 days, two in 20, the third under way.
    expect(stockOf(s, "plasma")).toBe(2);
    expect(s.projects.some((p) => p.projectId === "make-plasma")).toBe(true);
    expect(funds - s.funds).toBe(2 * 60_000);
    expect(sellGood(s, "plasma")).toBeNull();
    expect(stockOf(s, "plasma")).toBe(1);
  });

  it("finds artifacts in raids: a lair gives up its treasure, which can be sold or handed back", () => {
    const s = quiet();
    const found = findArtifact(s, "huaca", "lair", "brazil", "São Paulo");
    expect(found[0]!.treasure).toBe(true);
    expect(found[0]!.value).toBeGreaterThanOrEqual(1_000_000);
    expect(findArtifact(s, "huaca", "nest", "brazil", "São Paulo")).toEqual([]);
    const a = found[0]!;
    const price = artifactOffer(s, a);
    const funds = s.funds;
    expect(sellArtifact(s, a.id)).toBeNull();
    expect(s.funds - funds).toBe(price);
    // Never the same piece twice.
    for (let i = 0; i < 20; i++) findArtifact(s, "huaca", "haven", "brazil", "São Paulo");
    const names = s.market.found;
    expect(new Set(names).size).toBe(names.length);
    const back = s.market.artifacts[0]!;
    const support = s.regions.brazil!.support;
    expect(returnArtifact(s, back.id)).toBeNull();
    expect(s.regions.brazil!.support).toBeGreaterThan(support);
  });

  // What "good financial acumen" is worth: a workshop of ten engineers on all four lines, selling
  // only while buyers are keen. Net of materials and salaries, a month (docs/WEB_PORT.md 3.5b).
  const wellRun = (diff: DifficultyId) => {
    const s = quiet(diff);
    s.research.done.push("composite-armour", "uv-weaponry", "pheromones", "haematology");
    const b = padua(s);
    setStaff(s, b, "engineer", 10);
    setStaff(s, b, "scientist", 0);
    for (const [id, n] of [["make-plasma", 2], ["make-blockers", 3], ["make-sterilisers", 2], ["make-inserts", 3]] as const)
      expect(startProject(s, id, b.id, n)).toBeNull();
    const start = s.funds;
    const days = 120;
    for (let d = 0; d < days; d++) {
      dailyResearch(s);
      dailyMarket(s);
      for (const id of ["plasma", "blockers", "sterilisers", "inserts"] as const)
        while (stockOf(s, id) > 0 && (s.market.demand[id] ?? 1) >= 0.85) sellGood(s, id);
    }
    return (s.funds - start) / (days / 30) - 10 * 20_000;
  };
  it("pays a well-run workshop about half a base a month, or more", () => {
    const [n, i, g] = (["novice", "inquisitor", "grand"] as const).map(wellRun);
    expect(i).toBeGreaterThan(350_000);
    expect(i).toBeLessThan(700_000);
    expect(n).toBeGreaterThan(i!);
    expect(g).toBeLessThan(i!);
  });

  it("is priced by difficulty", () => {
    const prices = DIFFICULTIES.map((d) => offerFor(quiet(d.id), "tissue"));
    expect(prices[0]).toBeGreaterThan(prices[1]!);
    expect(prices[1]).toBeGreaterThan(prices[2]!);
  });

  it("survives a save", () => {
    const s = quiet();
    s.research.done.push("haematology");
    s.market.stock.plasma = 2;
    s.market.demand.plasma = 0.4;
    findArtifact(s, "jade", "lair", "japan_korea", "Tokyo");
    s.regions.brazil!.pledge = 1.3;
    const t = deserialize(serialize(s));
    expect(t.market).toEqual(s.market);
    expect(t.regions.brazil!.pledge).toBe(1.3);
    // An old save without a market gets an empty one.
    const old = JSON.parse(serialize(s));
    delete old.state.market;
    expect(deserialize(JSON.stringify(old)).market.artifacts).toEqual([]);
  });
});

void DAY;

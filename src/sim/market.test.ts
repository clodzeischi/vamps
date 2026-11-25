import { describe, expect, it } from "vitest";
import { setStaff } from "./personnel";
import { AGENT_UPKEEP } from "../data/agents";
import { AIRCRAFT } from "../data/aircraft";
import { DIFFICULTIES, type DifficultyId } from "../data/difficulty";
import { INSTALLATIONS } from "../data/installations";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { creditRegion, monthEnd, monthlyIncome, PLEDGE_MAX, regionalContribution, reviewPledges } from "./economy";
import {
  artifactOffer, dailyMarket, DEMAND_RECOVERY, findArtifact, fullPrice, GOODS, infoForSale, itemOnSale, itemPrice, LEAK_DAYS, LEAKED_GOOD_PRICE, offerFor, onOrder, orderTotal,
  placeOrder, RESEARCH_PRICE_PER_POINT, researchPrice, researchToSell, returnArtifact, sellArtifact, sellGood, sellItem, sellResearch, sellResearchBlocker, SHIPPING_HOURS,
  stockOf, topicPublic, TUMBLER_FEE,
} from "./market";
import { ITEMS } from "../data/equipment";
import { stockAt } from "./equipment";
import { hourlyTransfers } from "./transfers";
import { dailyResearch, queueJob, startProject } from "./research";
import { projectById } from "../data/research";
import { flatAptitudes } from "./aptitudes";
import { DAY, HOUR } from "./time";

const quiet = (diff: DifficultyId = "inquisitor", seed = 1) => {
  const s = newCampaign(diff, seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15;
  return s;
};
const padua = (s: ReturnType<typeof quiet>) => s.installations.find((i) => i.kind === "base")!;

/** A working base abroad, at ordinary support: the base, six operators, a helicopter and a station. */
const BASE_PACKAGE = INSTALLATIONS.base.monthlyCost + INSTALLATIONS.sigint.monthlyCost + 6 * AGENT_UPKEEP + AIRCRAFT.helicopter.monthly;

describe("the Act II budget (docs/design/economy.md)", () => {
  // The hostage years: the stipend's trickle plus the world outside Europe at its starting opinion.
  const generic = (diff: DifficultyId) => {
    const s = quiet(diff);
    s.story.act = 2;
    const { stipend, regional } = monthlyIncome(s);
    return (stipend + regional) / BASE_PACKAGE;
  };
  // At the regions' starting opinion. The bloodlines' pressure wears support down through Act II;
  // in the batch (npm run batch, campaign bot) a player who answers leads ends up near two bases'
  // worth on Novice, 1.4 on Inquisitor and 0.9 on Grand (docs/design/economy.md).
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

describe("the dark web: goods and artifacts", () => {
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

  it("makes goods to order, into stores", () => {
    const s = quiet();
    s.research.done.push("haematology");
    const b = padua(s);
    setStaff(s, b, "engineer", 4);
    for (const p of s.staff) if (p.role === "engineer") p.aptitudes = flatAptitudes("engineer");
    expect(queueJob(s, "make-plasma", b.id, 5)).toBeNull();
    const funds = s.funds;
    for (let d = 0; d < 20; d++) dailyResearch(s);
    // Four engineers at 1.5 a day, 45 points a batch: a batch every 8 days, two in 20, the third under way.
    expect(stockOf(s, "plasma")).toBe(2);
    expect(s.projects.find((p) => p.projectId === "make-plasma")!.count).toBe(3);
    // Materials as the work is done: two batches and most of a third (a little less as they learn).
    expect(funds - s.funds).toBeGreaterThan(2.5 * 60_000);
    expect(funds - s.funds).toBeLessThanOrEqual(3 * 60_000);
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
  // only while buyers are keen. Net of materials and salaries, a month (docs/design/economy.md).
  const wellRun = (diff: DifficultyId) => {
    const s = quiet(diff);
    s.research.done.push("composite-armour", "uv-weaponry", "pheromones", "haematology");
    const b = padua(s);
    setStaff(s, b, "engineer", 10);
    setStaff(s, b, "scientist", 0);
    const start = s.funds;
    const days = 120;
    for (let d = 0; d < days; d++) {
      // An order for each good whose shelf is nearly empty.
      for (const id of ["make-plasma", "make-blockers", "make-sterilisers", "make-inserts"])
        if (!s.projects.some((a) => a.projectId === id) && stockOf(s, projectById(id)!.product!) < 2) expect(queueJob(s, id, b.id, 2)).toBeNull();
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
  });
});

describe("the dark web", () => {
  it("sells at one price either way, and the tumbler's fee stops buying and selling back from paying", () => {
    const s = quiet();
    const b = padua(s);
    const funds = s.funds;
    const o = { items: { rifle: 2 }, info: [], baseId: b.id };
    expect(orderTotal(s, o)).toEqual({ subtotal: 2 * itemPrice("rifle"), fee: 2 * itemPrice("rifle") * TUMBLER_FEE, total: 2 * itemPrice("rifle") * (1 + TUMBLER_FEE) });
    expect(itemPrice("rifle")).toBe(ITEMS.rifle.cost);
    expect(placeOrder(s, o)).toBeNull();
    s.time += SHIPPING_HOURS * HOUR;
    hourlyTransfers(s);
    expect(sellItem(s, b.id, "rifle", 2)).toBeNull();
    expect(funds - s.funds).toBe(2 * ITEMS.rifle.cost * TUMBLER_FEE);
    expect(sellItem(s, b.id, "knife")).toMatch(/Nobody pays/);
  });

  it("ships equipment in 40 hours to the base chosen; a parcel for a lost base is lost", () => {
    const s = quiet();
    const b = padua(s);
    const before = stockAt(b, "helmet");
    expect(placeOrder(s, { items: { helmet: 3 }, info: [] })).toMatch(/where it ships/);
    expect(placeOrder(s, { items: { helmet: 3 }, info: [], baseId: b.id })).toBeNull();
    expect(onOrder(s, b.id, "helmet")).toBe(3);
    s.time += (SHIPPING_HOURS - 1) * HOUR;
    hourlyTransfers(s);
    expect(stockAt(b, "helmet")).toBe(before);
    s.time += HOUR;
    hourlyTransfers(s);
    expect(stockAt(b, "helmet")).toBe(before + 3);
    expect(onOrder(s, b.id, "helmet")).toBe(0);
    expect(placeOrder(s, { items: {}, info: [] })).toMatch(/empty/);
  });

  it("sells public science as information, known at once and without a base", () => {
    const s = quiet();
    expect(infoForSale(s).map((p) => p.id)).toContain("field-medicine");
    expect(infoForSale(s).map((p) => p.id)).not.toContain("combat-surgery"); // field medicine first
    expect(infoForSale(s).map((p) => p.id)).not.toContain("vampire-physiology"); // ours alone
    const b = padua(s);
    expect(startProject(s, "field-medicine", b.id)).toBeNull();
    const funds = s.funds;
    expect(placeOrder(s, { items: {}, info: ["field-medicine"] })).toBeNull();
    expect(s.research.done).toContain("field-medicine");
    expect(s.projects.some((a) => a.projectId === "field-medicine")).toBe(false); // the lab stops
    expect(funds - s.funds).toBe(researchPrice(s, "field-medicine") * (1 + TUMBLER_FEE));
    expect(infoForSale(s).map((p) => p.id)).toContain("combat-surgery");
    expect(placeOrder(s, { items: {}, info: ["field-medicine"] })).toMatch(/Nobody sells/);
  });

  it("never sells what advances the story or what only we could have made", () => {
    const s = quiet();
    s.funds = 1e9;
    expect(GOODS.tissue.story).toBe(true);
    // An item that needs our own research isn't sold, even once we have the research...
    const def = ITEMS.incendiary as { requires?: string };
    def.requires = "uv-weaponry";
    try {
      expect(itemOnSale(s, "incendiary")).toBe(false);
      s.research.done.push("vampire-physiology", "uv-weaponry");
      expect(itemOnSale(s, "incendiary")).toBe(false);
      expect(placeOrder(s, { items: { incendiary: 1 }, info: [], baseId: padua(s).id })).toMatch(/Nobody sells/);
      // ...until we sell the research and it gets out.
      expect(sellResearch(s, "uv-weaponry")).toBeNull();
      expect(itemOnSale(s, "incendiary")).toBe(false);
      s.time = s.market.sold!["uv-weaponry"]!.publicAt;
      expect(itemOnSale(s, "incendiary")).toBe(true);
      // Something that needs only public science is sold whether we know it or not.
      def.requires = "composite-armour";
      expect(itemOnSale(s, "incendiary")).toBe(true);
    } finally {
      delete def.requires;
    }
  });

  it("buys our research once, at a cost in secrecy; a month or two later it's out, and our goods fetch less", () => {
    const s = quiet();
    expect(sellResearchBlocker(s, "haematology")).toMatch(/don't know/);
    expect(sellResearchBlocker(s, "field-medicine")).toMatch(/Common knowledge/);
    s.research.done.push("vampire-physiology", "haematology");
    expect(researchToSell(s).map((p) => p.id)).toEqual(["vampire-physiology", "haematology"]);
    const before = fullPrice(s, "plasma");
    const [funds, secrecy] = [s.funds, s.secrecy];
    expect(sellResearch(s, "haematology")).toBeNull();
    expect(s.funds - funds).toBe(researchPrice(s, "haematology"));
    expect(researchPrice(s, "haematology")).toBe(180 * RESEARCH_PRICE_PER_POINT);
    expect(s.secrecy).toBeLessThan(secrecy);
    expect(sellResearch(s, "haematology")).toMatch(/Sold already/);
    const sold = s.market.sold!.haematology!;
    expect(sold.publicAt - sold.soldAt).toBeGreaterThanOrEqual(LEAK_DAYS[0] * DAY);
    expect(sold.publicAt - sold.soldAt).toBeLessThanOrEqual(LEAK_DAYS[1] * DAY);
    expect(topicPublic(s, "haematology")).toBe(false);
    expect(fullPrice(s, "plasma")).toBe(before);
    s.time = sold.publicAt;
    dailyMarket(s);
    expect(topicPublic(s, "haematology")).toBe(true);
    expect(s.market.sold!.haematology!.out).toBe(true);
    expect(s.log.some((l) => /haematology data is out/.test(l.text))).toBe(true);
    expect(fullPrice(s, "plasma")).toBe(before * LEAKED_GOOD_PRICE);
    // It survives a save.
    expect(deserialize(serialize(s)).market.sold).toEqual(s.market.sold);
  });

  it("deals with nobody once the Order is exposed", () => {
    const s = quiet();
    s.story.exposed = true;
    expect(placeOrder(s, { items: { rifle: 1 }, info: [], baseId: padua(s).id })).toMatch(/Nobody will deal/);
  });
});

void DAY;

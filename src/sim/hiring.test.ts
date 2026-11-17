// Personnel hiring (2026-11-16): scientists and engineers are named candidates
// in a monthly pool, like agents; the black market trades both ways but never
// sells what advances the story.
import { describe, expect, it } from "vitest";
import { STAFF_CANDIDATES_PER_MONTH } from "../data/installations";
import { ITEMS } from "../data/equipment";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { stockAt } from "./equipment";
import { buyGood, buyGoodBlocker, buyPrice, fullPrice, GOOD_IDS, GOODS, itemSalePrice, sellItem, stockOf } from "./market";
import { hireBlocker, hireStaff, refreshCandidates, staffCandidatesOf, staffOf } from "./personnel";

const quiet = () => {
  const s = newCampaign("inquisitor", 3);
  s.story.fallAt = 8.64e15;
  return s;
};
const padua = (s: ReturnType<typeof quiet>) => s.installations.find((i) => i.kind === "base")!;

describe("hiring scientists and engineers", () => {
  it("offers named candidates each month, and hiring takes the one chosen", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    expect(staffCandidatesOf(s, "scientist")).toHaveLength(STAFF_CANDIDATES_PER_MONTH);
    expect(staffCandidatesOf(s, "engineer")).toHaveLength(STAFF_CANDIDATES_PER_MONTH);
    const pick = staffCandidatesOf(s, "scientist")[2]!;
    expect(hireStaff(s, b.id, "scientist", pick.id)).toBeNull();
    expect(staffOf(s, b.id, "scientist").some((p) => p.name === pick.name)).toBe(true);
    expect(staffCandidatesOf(s, "scientist").some((c) => c.id === pick.id)).toBe(false);
    // An engineer's id can't hire a scientist.
    expect(hireStaff(s, b.id, "scientist", staffCandidatesOf(s, "engineer")[0]!.id)).toMatch(/taken other work/);
  });

  it("runs out until next month", () => {
    const s = quiet();
    const b = padua(s);
    s.staffCandidates = staffCandidatesOf(s, "engineer");
    expect(hireBlocker(s, b.id, "scientist")).toMatch(/No scientists looking/);
    refreshCandidates(s);
    expect(hireBlocker(s, b.id, "scientist")).toBeNull();
  });

  it("gives an older save without a pool this month's candidates", () => {
    const s = quiet();
    delete s.staffCandidates;
    const t = deserialize(serialize(s));
    expect(staffCandidatesOf(t, "scientist")).toHaveLength(STAFF_CANDIDATES_PER_MONTH);
  });
});

describe("the black market, both ways", () => {
  it("never sells what advances the story", () => {
    const s = quiet();
    s.funds = 1e9;
    for (const id of GOOD_IDS) if (GOODS[id].story) expect(buyGoodBlocker(s, id)).toMatch(/has to be taken/);
    expect(GOODS.tissue.story).toBe(true);
  });

  it("sells products at the dealer's price, above what a sale brings", () => {
    const s = quiet();
    s.funds = 1e9;
    expect(buyGoodBlocker(s, "plasma")).toMatch(/Nobody offers/);
    s.research.done.push("haematology");
    expect(buyPrice(s, "plasma")).toBeGreaterThan(fullPrice(s, "plasma"));
    expect(buyGood(s, "plasma")).toBeNull();
    expect(stockOf(s, "plasma")).toBe(1);
  });

  it("buys spare equipment out of an armoury for half its price", () => {
    const s = quiet();
    const b = padua(s);
    const before = stockAt(b, "rifle"), funds = s.funds;
    expect(sellItem(s, b.id, "rifle")).toBeNull();
    expect(stockAt(b, "rifle")).toBe(before - 1);
    expect(s.funds - funds).toBe(itemSalePrice("rifle"));
    expect(itemSalePrice("rifle")).toBe(ITEMS.rifle.cost / 2);
    expect(sellItem(s, b.id, "knife")).toMatch(/Nobody pays/);
  });
});

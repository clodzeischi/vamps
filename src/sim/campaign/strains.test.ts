// The houses' strains: rolled at campaign start, known by rumour, battle and science.
import { describe, expect, it } from "vitest";
import { rollStrains, SILVER_RANGE, WEAKNESS_IDS } from "../../data/strains";
import { rng } from "../core/rng";
import { newCampaign } from "./campaign";
import { strainView, suspect } from "./strains";
import { deserialize, serialize } from "../../save/format";
import { combatMods } from "../base/research";

describe("strains", () => {
  it("roll two weaknesses each, no pair shared, silver in range, one true rumour of three", () => {
    for (let seed = 1; seed < 40; seed++) {
      const all = rollStrains(rng({ rng: seed }));
      const pairs = Object.values(all).map((x) => [...x.weaknesses].sort().join());
      expect(new Set(pairs).size).toBe(6);
      for (const [house, x] of Object.entries(all)) {
        expect(x.weaknesses[0]).not.toBe(x.weaknesses[1]);
        expect(x.weaknesses.every((w) => WEAKNESS_IDS.includes(w))).toBe(true);
        expect(x.silver).toBeGreaterThanOrEqual(house === "huaca" ? 1.15 : SILVER_RANGE[0]);
        expect(x.silver).toBeLessThanOrEqual(SILVER_RANGE[1]);
        expect(new Set(x.rumours).size).toBe(3);
        expect(x.rumours.filter((w) => x.weaknesses.includes(w))).toHaveLength(1);
      }
    }
  });

  it("are the campaign's own: fixed by its seed, saved with it", () => {
    const a = newCampaign("inquisitor", 7);
    expect(newCampaign("inquisitor", 7).bloodlines.huaca!.strain).toEqual(
      a.bloodlines.huaca!.strain,
    );
    expect(deserialize(serialize(a)).bloodlines.jade!.strain).toEqual(a.bloodlines.jade!.strain);
  });

  it("are known by History (rumours), battle (suspected) and Strain (confirmed)", () => {
    const s = newCampaign("inquisitor", 3);
    const x = s.bloodlines.sahel!.strain;
    expect(strainView(s, "sahel")).toMatchObject({
      confirmed: false,
      weaknesses: [],
      rumours: null,
    });
    s.research.done.push("history-sahel");
    expect(strainView(s, "sahel").rumours).toEqual(x.rumours);
    suspect(s, "sahel", x.weaknesses[0]);
    suspect(
      s,
      "sahel",
      WEAKNESS_IDS.find((w) => !x.weaknesses.includes(w))!,
    ); // not its own: not shown
    expect(strainView(s, "sahel").weaknesses).toEqual([
      { id: x.weaknesses[0], known: "suspected" },
    ]);
    s.research.done.push("strain-sahel");
    const v = strainView(s, "sahel");
    expect(v).toMatchObject({ confirmed: true, band: x.band, silver: x.silver });
    expect(v.weaknesses.map((w) => w.known)).toEqual(["confirmed", "confirmed"]);
  });

  it("reach the auto-combat: the house's silver, and thin skin", () => {
    const s = newCampaign("inquisitor", 3);
    const x = s.bloodlines.ashgrove!.strain;
    expect(combatMods(s, "tactical", "ashgrove")).toMatchObject({
      silver: x.silver,
      thinSkin: x.weaknesses.includes("thin-skin"),
    });
  });
});

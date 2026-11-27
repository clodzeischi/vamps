// How well each house eats, and what a starving one fields (docs/design/research.md, "Feeding").
import { describe, expect, it } from "vitest";
import { newCampaign } from "./campaign";
import {
  changeFeeding,
  dailyFeeding,
  FEEDING,
  feedingOf,
  feralShare,
  fieldsFerals,
} from "./feeding";
import { FERAL_LEADS, PRIOR, priorOf } from "../intel/intel";

describe("feeding", () => {
  it("starts at 70, falls when we foil, and drifts back", () => {
    const s = newCampaign("inquisitor", 2);
    expect(feedingOf(s, "huaca")).toBe(FEEDING.start);
    changeFeeding(s, "huaca", -40);
    expect(feedingOf(s, "huaca")).toBe(30);
    for (let i = 0; i < 30; i++) dailyFeeding(s);
    expect(feedingOf(s, "huaca")).toBeGreaterThan(50);
    changeFeeding(s, "huaca", -500);
    expect(feedingOf(s, "huaca")).toBe(0);
  });

  it("half feral below 40, all below 20; a feral house's leads are real more often", () => {
    expect([feralShare(70), feralShare(39), feralShare(19)]).toEqual([0, 0.5, 1]);
    const s = newCampaign("inquisitor", 2);
    expect(priorOf(s, "humint", "jade")).toBe(PRIOR.humint);
    changeFeeding(s, "jade", -35);
    expect(fieldsFerals(s, "jade")).toBe(true);
    expect(priorOf(s, "humint", "jade")).toBeCloseTo(PRIOR.humint + FERAL_LEADS);
  });
});

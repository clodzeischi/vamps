import { describe, expect, it } from "vitest";
import { newCampaign } from "../campaign/campaign";
import { activityShade, ACTIVITY_HALF_LIFE_DAYS, dailyActivity, noteActivity } from "./activity";

describe("assessed activity", () => {
  it("adds up where things are seen and halves in a month", () => {
    const s = newCampaign("inquisitor", 1);
    noteActivity(s, "italy", 2);
    expect(activityShade(s, "italy")).toBeCloseTo(0.5);
    for (let d = 0; d < ACTIVITY_HALF_LIFE_DAYS; d++) dailyActivity(s);
    expect(s.regions.italy!.activity).toBeCloseTo(1, 5);
    for (let d = 0; d < 400; d++) dailyActivity(s);
    expect(s.regions.italy!.activity).toBeUndefined();
  });
});

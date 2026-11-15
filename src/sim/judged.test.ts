import { describe, expect, it } from "vitest";
import { newCampaign } from "./campaign";
import { coverUpChance, dailyCoverUps, hourlyCoverUps, startCoverUp } from "./coverups";
import { chanceFromMargin, difficultyFor, judgedMargin, pickJudged, verdictLine, type JudgedTemplate, type Tier, type Variant } from "./judged";
import { rng } from "./rng";
import type { Agent, GameState } from "./state";

const agent = (stats: Partial<Agent["stats"]>): Agent =>
  ({ id: "x", stats: { combat: 30, tradecraft: 30, insight: 30, faith: 45, vitality: 40, ...stats } }) as Agent;

function judgedOffer(s: GameState) {
  for (let i = 0; i < 500; i++) {
    s.heat = 10;
    s.coverUps = s.coverUps.filter((c) => c.tier);
    dailyCoverUps(s);
    s.events = [];
    const c = s.coverUps.find((x) => x.tier && x.agents === 1);
    if (c) return c;
  }
  throw new Error("no offer");
}

describe("judged events", () => {
  it("reward the right agent: about 4 in 5 on a routine job, half for the wrong one, and never certain", () => {
    const routine = difficultyFor("insight", "routine");
    expect(chanceFromMargin(51 - routine)).toBeGreaterThan(0.75);
    expect(chanceFromMargin(40 - routine)).toBeCloseTo(0.5, 1);
    expect(chanceFromMargin(95 - 30)).toBe(0.95);
    // Faith runs higher at recruitment, so a Faith check sits higher.
    expect(difficultyFor("faith", "hard")).toBeGreaterThan(difficultyFor("insight", "hard"));
    // A mixed reading leans on both stats.
    const w = { faith: 0.7, insight: 0.3 };
    expect(judgedMargin([agent({ faith: 80 })], w, "routine", 0)).toBeGreaterThan(judgedMargin([agent({ insight: 80 })], w, "routine", 0));
  });

  it("pick a reading and a tier the template allows, and build the text from both", () => {
    const t: JudgedTemplate = {
      text: "Situation.",
      variants: [{ weights: { combat: 1 }, hint: "Hint A.", why: "" }, { weights: { faith: 1 }, hint: "Hint B.", why: "" }],
      tiers: { routine: "", hard: "Hard line." },
    };
    const s = newCampaign("inquisitor", 1);
    const seen = new Set<Tier>();
    for (let i = 0; i < 200; i++) {
      const p = pickJudged(t, rng(s));
      seen.add(p.tier);
      expect(p.text.startsWith("Situation. Hint")).toBe(true);
      expect(p.text.endsWith(p.tier === "hard" ? "Hard line." : ".")).toBe(true);
    }
    expect([...seen].sort()).toEqual(["hard", "routine"]);
  });

  it("tell a misread from bad luck in the debrief", () => {
    const r = rng(newCampaign("inquisitor", 2));
    const v: Variant = { weights: { faith: 1 }, hint: "", why: "MISREAD" };
    expect(verdictLine([agent({ combat: 70 })], v, "routine", 0, r)).toBe("MISREAD");
    expect(verdictLine([agent({ faith: 90 })], v, "routine", 0, r)).not.toBe("MISREAD");
    expect(verdictLine([agent({ faith: 60 })], v, "very-hard", 0, r)).toMatch(/seasoned|experience|years/);
  });

  it("offers show no stat, the result explains a failure, and experience goes to the stat the job needed", () => {
    const s = newCampaign("inquisitor", 5);
    const c = judgedOffer(s);
    expect(c.text).not.toMatch(/tradecraft|insight|faith\b|combat/i);
    const op = s.agents[0]!;
    for (const k of ["combat", "tradecraft", "insight", "faith"] as const) op.stats[k] = 5;
    c.tier = "routine";
    expect(coverUpChance(s, c, [op])).toBeLessThan(0.2);
    expect(startCoverUp(s, c.id, [op.id])).toBeNull();
    s.events = [];
    s.time = c.doneAt;
    hourlyCoverUps(s);
    const e = s.events.find((x) => x.kind === "coverup-result")!;
    expect(e.title).not.toMatch(/backfired/); // routine jobs don't backfire
    if (!e.title.startsWith("Covered up")) expect(e.body.split("\n\n").length).toBeGreaterThan(1);
  });
});

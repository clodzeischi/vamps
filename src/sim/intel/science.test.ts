// What science gives the section (docs/design/intelligence.md, section 7; research.md, step 5c).
import { describe, expect, it } from "vitest";
import { newCampaign } from "../campaign/campaign";
import { genealogyLead, priorOf, PRIOR, sectionPace } from "./intel";
import { coverUpChance } from "../campaign/coverups";
import { RESEARCH_EFFECTS } from "../../data/research";
import type { CoverUp } from "../core/state";

const fresh = () => newCampaign("inquisitor", 4);

describe("science for the section", () => {
  it("Chronobiology: SIGINT and OSINT leads are real more often; HUMINT as before", () => {
    const s = fresh();
    s.research.done.push("pattern-analysis");
    expect(priorOf(s, "sigint")).toBeCloseTo(PRIOR.sigint + RESEARCH_EFFECTS.chronobiology);
    expect(priorOf(s, "osint")).toBeCloseTo(PRIOR.osint + RESEARCH_EFFECTS.chronobiology);
    expect(priorOf(s, "humint")).toBe(PRIOR.humint);
  });

  it("Psychophysiology adds to CI; Stable isotopes and the Fournier register to OSINT and HUMINT", () => {
    const s = fresh();
    const before = sectionPace(s);
    const [ci, osint, humint] = [before.on("ci"), before.on("osint"), before.on("humint")];
    s.research.done.push("psychophysiology", "stable-isotopes", "fournier-register");
    const after = sectionPace(s);
    expect(after.on("ci")).toBeCloseTo(ci + RESEARCH_EFFECTS.ci);
    expect(after.on("osint")).toBeCloseTo(osint * 1.1);
    expect(after.on("humint")).toBeCloseTo(humint * 1.1);
    expect(after.on("sigint")).toBeCloseTo(before.on("sigint"));
  });

  it("Trace evidence makes cover-ups likelier", () => {
    const c = { agents: 0 } as CoverUp;
    expect(coverUpChance(c, [], true)).toBeCloseTo(
      coverUpChance(c, []) + RESEARCH_EFFECTS.traceEvidence,
    );
  });

  it("Forensic genetic genealogy: a sample may name a relative, a real HUMINT lead on the house", () => {
    const s = fresh();
    s.operations.push({
      ...s.operations[0]!,
      id: "op-x",
      bloodline: "jade",
      leadId: null,
    } as (typeof s.operations)[number]);
    expect(genealogyLead(s, "jade")).toBeNull(); // not researched
    s.research.done.push("genealogy");
    let lead = null;
    for (let i = 0; i < 40 && !lead; i++) lead = genealogyLead(s, "jade");
    expect(lead).toMatchObject({ via: "humint", opId: "op-x" });
  });
});

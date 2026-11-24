// Personnel hiring (2026-11-16): scientists and engineers are named candidates
// in a monthly pool, like agents.
import { describe, expect, it } from "vitest";
import { STAFF_CANDIDATES_PER_MONTH } from "../data/installations";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { extremeCounts, generateCandidate, hireBlocker, hireStaff, refreshCandidates, staffCandidatesOf, staffOf } from "./personnel";
import { RECRUIT_EXTREME_LIMIT, STARTING_AGENTS } from "../data/agents";

const quiet = () => {
  const s = newCampaign("inquisitor", 3);
  s.story.fallAt = 8.64e15; s.story.insider = s.story.fallWarned = true;
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

describe("recruits", () => {
  it("starts with a small team and a full month of candidates to choose from", () => {
    const s = quiet();
    expect(s.agents).toHaveLength(STARTING_AGENTS);
    expect(s.candidates.length).toBeGreaterThan(0);
  });

  it("never rolls a dud or a prodigy (four or more stats at one end of their ranges)", () => {
    const s = quiet();
    for (let i = 0; i < 2000; i++) {
      const { low, high } = extremeCounts(generateCandidate(s).stats);
      expect(low).toBeLessThan(RECRUIT_EXTREME_LIMIT);
      expect(high).toBeLessThan(RECRUIT_EXTREME_LIMIT);
    }
  });
});

// Hiring: every role (operators, scientists, engineers, analysts) comes from one
// monthly pool of named candidates, rolled the same way, hired and let go alike.
import { describe, expect, it } from "vitest";
import { STAFF_CANDIDATES_PER_MONTH } from "../../data/installations";
import { APTITUDE_EXTREME_LIMIT, APTITUDE_ROLL, ROLES, aptitudeIds } from "../../data/aptitudes";
import { CANDIDATES_PER_MONTH, STARTING_AGENTS, VITALITY_RANGE } from "../../data/agents";
import { newCampaign } from "../campaign/campaign";
import { extremeCounts } from "./aptitudes";
import {
  candidatesOf,
  dismiss,
  generateCandidate,
  hire,
  hireBlocker,
  refreshCandidates,
  staffOf,
} from "./personnel";

const quiet = () => {
  const s = newCampaign("inquisitor", 3);
  s.story.fallAt = 8.64e15;
  return s;
};
const padua = (s: ReturnType<typeof quiet>) => s.installations.find((i) => i.kind === "base")!;

describe("the monthly pool", () => {
  it("offers named candidates for every role, and hiring takes the one chosen", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    expect(candidatesOf(s, "operator")).toHaveLength(CANDIDATES_PER_MONTH);
    for (const role of ["scientist", "engineer", "analyst"] as const)
      expect(candidatesOf(s, role)).toHaveLength(STAFF_CANDIDATES_PER_MONTH);
    const pick = candidatesOf(s, "scientist")[2]!;
    expect(hire(s, b.id, "scientist", pick.id)).toBeNull();
    expect(staffOf(s, b.id, "scientist").some((p) => p.name === pick.name)).toBe(true);
    expect(candidatesOf(s, "scientist").some((c) => c.id === pick.id)).toBe(false);
    // An engineer's id can't hire a scientist.
    expect(hire(s, b.id, "scientist", candidatesOf(s, "engineer")[0]!.id)).toMatch(
      /no longer available/,
    );
    // An operator joins the same way, with their kit and full health.
    const op = candidatesOf(s, "operator")[0]!;
    expect(hire(s, b.id, "operator", op.id)).toBeNull();
    const a = s.agents.find((x) => x.name === op.name)!;
    expect(a).toMatchObject({
      role: "operator",
      aptitudes: op.aptitudes,
      vitality: op.vitality,
      hp: op.vitality,
    });
  });

  it("runs out until next month", () => {
    const s = quiet();
    const b = padua(s);
    s.candidates = candidatesOf(s, "engineer");
    expect(hireBlocker(s, b.id, "scientist")).toMatch(/Nobody left/);
    expect(hireBlocker(s, b.id, "operator")).toMatch(/Nobody left/);
    refreshCandidates(s);
    expect(hireBlocker(s, b.id, "scientist")).toBeNull();
  });

  it("lets anyone go by id: an operator at home, a member of staff who has arrived", () => {
    const s = quiet();
    const b = padua(s);
    const a = s.agents[0]!;
    expect(dismiss(s, a.id)).toBeNull();
    expect(s.agents.includes(a)).toBe(false);
    const p = staffOf(s, b.id, "engineer")[0]!;
    p.arriveAt = s.time + 1;
    expect(dismiss(s, p.id)).toMatch(/on the way/);
    delete p.arriveAt;
    expect(dismiss(s, p.id)).toBeNull();
    expect(dismiss(s, "nobody")).toMatch(/No one/);
  });
});

describe("candidates", () => {
  it("starts with a small team and a full month of candidates to choose from", () => {
    const s = quiet();
    expect(s.agents).toHaveLength(STARTING_AGENTS);
    expect(s.candidates.length).toBeGreaterThan(0);
  });

  it("roll every role's four aptitudes in one range, never a dud or a prodigy; operators add Vitality", () => {
    const s = quiet();
    const [min, max] = APTITUDE_ROLL;
    for (let i = 0; i < 2000; i++) {
      const role = ROLES[i % ROLES.length]!;
      const c = generateCandidate(s, role);
      expect(Object.keys(c.aptitudes).sort()).toEqual([...aptitudeIds(role)].sort());
      for (const v of Object.values(c.aptitudes))
        (expect(v).toBeGreaterThanOrEqual(min), expect(v).toBeLessThanOrEqual(max));
      const { low, high } = extremeCounts(c.aptitudes, role);
      expect(low).toBeLessThan(APTITUDE_EXTREME_LIMIT);
      expect(high).toBeLessThan(APTITUDE_EXTREME_LIMIT);
      if (role === "operator") expect(c.vitality).toBeGreaterThanOrEqual(VITALITY_RANGE[0]);
      else expect(c.vitality).toBeUndefined();
    }
  });
});

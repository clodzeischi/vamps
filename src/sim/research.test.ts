import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "../data/aircraft";
import { STAFF } from "../data/installations";
import { RESEARCH_EFFECTS } from "../data/research";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { sigintRates } from "./commands";
import { fight } from "./combat";
import { monthlyIncome } from "./economy";
import { dismissStaff, hireBlocker, hireStaff, monthlyPersonnelCost, upgradeBase, upgradeBlocker } from "./personnel";
import { cancelProject, combatMods, daysLeft, holdCaptive, projectBlocker, startProject, visibleProjects } from "./research";
import { rng } from "./rng";
import type { GameState } from "./state";
import { DAY } from "./time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  return s;
};
const padua = (s: GameState) => s.installations.find((i) => i.kind === "base")!;

/** Runs days, dismissing events; returns the titles posted. */
function days(s: GameState, n: number): string[] {
  const titles: string[] = [];
  const end = s.time + n * DAY;
  while (s.time < end) {
    if (s.events.length) { titles.push(s.events[0]!.title); dismissEvent(s); continue; }
    advance(s, end - s.time);
  }
  while (s.events.length) { titles.push(s.events[0]!.title); dismissEvent(s); }
  return titles;
}

describe("staff and facilities", () => {
  it("Padua starts with a lab, a workshop and four of each; salaries are paid", () => {
    const s = quiet();
    const b = padua(s);
    expect([b.labs, b.workshops, b.containment, b.scientists, b.engineers]).toEqual([1, 1, 0, 4, 4]);
    expect(monthlyPersonnelCost(s).staff).toBe(8 * STAFF.scientist.salary);
    expect(monthlyIncome(s).staff).toBe(8 * STAFF.scientist.salary);
  });

  it("hires up to the lab's room, and builds labs and containment", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    for (let i = 0; i < 6; i++) expect(hireStaff(s, b.id, "scientist")).toBeNull();
    expect(hireBlocker(s, b.id, "scientist")).toMatch(/No room/);
    expect(dismissStaff(s, b.id, "scientist")).toBeNull();
    expect(b.scientists).toBe(9);
    expect(upgradeBase(s, b.id, "containment")).toBeNull();
    expect(upgradeBase(s, b.id, "containment")).toBeNull();
    expect(upgradeBlocker(s, b.id, "containment")).toMatch(/No room/);
    days(s, 21);
    expect(b.containment).toBe(2);
  });
});

describe("research", () => {
  it("runs a project to completion with the staff on hand, then applies it", () => {
    const s = quiet();
    expect(visibleProjects(s, "research").map((p) => p.id)).not.toContain("uv-weaponry");
    expect(startProject(s, "field-medicine")).toBeNull();
    expect(projectBlocker(s, "composite-armour")).toMatch(/under way/);
    expect(daysLeft(s, { points: 60, kind: "research" } as never, 0)).toBe(15);
    const titles = days(s, 16);
    expect(titles).toContain("Research complete: Field medicine");
    expect(s.research.done).toContain("field-medicine");
    expect(s.research.active).toBeNull();
  });

  it("needs vampire material for physiology, and cancelling loses progress", () => {
    const s = quiet();
    expect(projectBlocker(s, "vampire-physiology")).toMatch(/remains/);
    padua(s).remains = 1;
    expect(startProject(s, "vampire-physiology")).toBeNull();
    days(s, 3);
    expect(s.research.active!.progress).toBeGreaterThan(0);
    expect(cancelProject(s, "research")).toBeNull();
    expect(s.research.active).toBeNull();
  });

  it("interrogating a captive consumes it and raises intel", () => {
    const s = quiet();
    const b = padua(s);
    expect(holdCaptive(s, b, "thrall", "carcassonne", "Milan")).toBe(false); // no containment yet
    b.containment = 1;
    expect(holdCaptive(s, b, "thrall", "carcassonne", "Milan")).toBe(true);
    const before = s.intel.carcassonne ?? 0;
    expect(startProject(s, "interrogate-thrall")).toBeNull();
    days(s, 6);
    expect(b.captives).toHaveLength(0);
    expect(s.intel.carcassonne).toBe(before + RESEARCH_EFFECTS.thrallIntel);
    expect(visibleProjects(s, "research").map((p) => p.id)).toContain("interrogate-thrall"); // repeatable
  });

  it("haematology raises every agent's vitality, and recruits get it too", () => {
    const s = quiet();
    s.research.done.push("vampire-physiology");
    padua(s).scientists = 30;
    padua(s).labs = 3;
    const vit = s.agents.map((a) => a.stats.vitality);
    expect(startProject(s, "haematology")).toBeNull();
    days(s, 7);
    expect(s.agents.map((a) => a.stats.vitality)).toEqual(vit.map((v) => Math.min(95, v + RESEARCH_EFFECTS.vitality)));
  });

  it("survives a save round trip mid-project", () => {
    const s = quiet();
    startProject(s, "signal-analysis");
    days(s, 2);
    const back = deserialize(serialize(s));
    expect(back.research.active?.id).toBe("signal-analysis");
    expect(back.research.active?.progress).toBe(s.research.active!.progress);
  });
});

describe("engineering", () => {
  it("costs materials, and the station retrofit makes SIGINT hear more", () => {
    const s = quiet();
    expect(projectBlocker(s, "station-retrofit")).toMatch(/understood/);
    s.research.done.push("signal-analysis");
    const before = new Map(sigintRates(s));
    const funds = s.funds;
    expect(startProject(s, "station-retrofit")).toBeNull();
    expect(s.funds).toBe(funds - 250_000);
    days(s, 31);
    const after = sigintRates(s);
    for (const [id, r] of before) expect(after.get(id)!).toBeGreaterThan(r);
  });

  it("builds a helicopter into a free hangar, waiting if there is none", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    expect(projectBlocker(s, "build-helicopter")).toMatch(/hangar/);
    b.hangars = 3;
    expect(startProject(s, "build-helicopter")).toBeNull();
    s.aircraft.push({ id: "air-x", kind: "jet", name: "SERAPH-9", baseId: b.id, deployed: false }); // hangar taken meanwhile
    days(s, 52);
    expect(s.engineering.active?.progress).toBe(200); // done, waiting for room
    s.aircraft = s.aircraft.filter((a) => a.id !== "air-x");
    const titles = days(s, 2);
    expect(titles).toContain("Engineering complete: Build a helicopter");
    expect(s.aircraft.filter((a) => a.kind === "helicopter")).toHaveLength(2);
    expect(AIRCRAFT.helicopter.price).toBeGreaterThan(450_000); // cheaper than buying
  });

  it("plate, UV and pheromone research change fights", () => {
    const s = quiet();
    expect(combatMods(s, "tactical")).toEqual({ armour: 0, vampireDamage: 1, vampireHit: 0 });
    s.engineering.done.push("ceramic-plate", "uv-munitions");
    s.research.done.push("pheromones");
    const m = combatMods(s, "tactical");
    expect(m.armour).toBeGreaterThan(0);
    expect(m.vampireDamage).toBeGreaterThan(1);
    expect(combatMods(s, "civilian").armour).toBe(0); // street clothes carry none of it
    // Over many fights, the upgraded team wins more often.
    let base = 0, up = 0;
    for (let i = 0; i < 200; i++) {
      const team = () => s.agents.slice(0, 3).map((a) => ({ ...a, stats: { ...a.stats } }));
      if (fight(rng({ rng: i }), team(), "tactical", { thralls: 3, vampires: 2 }, 0).won) base++;
      if (fight(rng({ rng: i }), team(), "tactical", { thralls: 3, vampires: 2 }, 0, m).won) up++;
    }
    expect(up).toBeGreaterThan(base);
  });
});

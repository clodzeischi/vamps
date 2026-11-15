import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "../data/aircraft";
import { CONTAINMENT_UPKEEP, STAFF } from "../data/installations";
import { projectById, RESEARCH_EFFECTS } from "../data/research";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { sigintRates } from "./commands";
import { fight } from "./combat";
import { monthlyIncome } from "./economy";
import { dismissStaff, hireBlocker, hireStaff, monthlyPersonnelCost, upgradeBase, upgradeBlocker } from "./personnel";
import { cancelProject, combatMods, daysLeft, executeBlocker, executeCaptive, freeStaff, releaseBlocker, releaseCaptive, holdCaptive, projectBlocker, setProjectStaff, stalled, startProject, visibleProjects } from "./research";
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
  it("runs a project at a base with the staff assigned, then applies it", () => {
    const s = quiet();
    const b = padua(s);
    expect(visibleProjects(s, "research").map((p) => p.id)).not.toContain("uv-weaponry");
    expect(startProject(s, "field-medicine", b.id, 2)).toBeNull();
    expect(freeStaff(s, b, "scientist")).toBe(2);
    expect(daysLeft(projectById("field-medicine")!, 0, 2)).toBe(30);
    // Two at once, as staff allow.
    expect(startProject(s, "composite-armour", b.id)).toBeNull(); // takes the 2 free
    expect(freeStaff(s, b, "scientist")).toBe(0);
    expect(projectBlocker(s, "signal-analysis", b.id)).toMatch(/No free scientists/);
    // Move one scientist across: medicine 3, armour 1.
    const [med, arm] = s.projects;
    expect(setProjectStaff(s, arm!.id, 1)).toBeNull();
    expect(setProjectStaff(s, med!.id, 3)).toBeNull();
    expect(setProjectStaff(s, med!.id, 4)).toMatch(/Only 3/);
    expect(dismissStaff(s, b.id, "scientist")).toMatch(/on a project/);
    const titles = days(s, 21);
    expect(titles).toContain("Research complete: Field medicine");
    expect(s.research.done).toContain("field-medicine");
    expect(s.projects.map((a) => a.projectId)).toEqual(["composite-armour"]);
  });

  it("can't run the same one-off project at two bases, nor pool staff across them", () => {
    const s = quiet();
    const b = padua(s);
    const other = { ...b, id: "ob-two", name: "Base Dallas", scientists: 4, engineers: 4, captives: [], remains: 0, upgrades: [] };
    s.installations.push(other);
    expect(startProject(s, "signal-analysis", b.id)).toBeNull();
    expect(projectBlocker(s, "signal-analysis", other.id)).toMatch(/another base/);
    expect(visibleProjects(s, "research").map((p) => p.id)).not.toContain("signal-analysis");
    // A project only takes staff from its own base.
    expect(startProject(s, "field-medicine", other.id, 5)).toMatch(/Only 4 free at Base Dallas/);
    // Remains in Padua can't be studied in Dallas.
    b.remains = 1;
    expect(projectBlocker(s, "vampire-physiology", other.id)).toMatch(/remains/);
    expect(projectBlocker(s, "vampire-physiology", b.id)).toMatch(/No free scientists/);
    expect(cancelProject(s, s.projects[0]!.id)).toBeNull();
    expect(projectBlocker(s, "vampire-physiology", b.id)).toBeNull();
  });

  it("interrogating a captive consumes it, and each captive is questioned once", () => {
    const s = quiet();
    const b = padua(s);
    expect(holdCaptive(s, b, "thrall", "carcassonne", "Milan")).toBe(false); // no containment yet
    b.containment = 1;
    expect(holdCaptive(s, b, "thrall", "carcassonne", "Milan")).toBe(true);
    const before = s.intel.carcassonne ?? 0;
    expect(startProject(s, "interrogate-thrall", b.id, 2)).toBeNull();
    expect(projectBlocker(s, "interrogate-thrall", b.id)).toMatch(/captive thrall/); // already being questioned
    days(s, 31);
    expect(b.captives).toHaveLength(0);
    expect(s.intel.carcassonne).toBe(before + RESEARCH_EFFECTS.thrallIntel);
    expect(visibleProjects(s, "research").map((p) => p.id)).toContain("interrogate-thrall"); // repeatable
  });

  it("containment costs upkeep full or empty; vampires can be destroyed, thralls only released", () => {
    const s = quiet();
    const b = padua(s);
    expect(monthlyPersonnelCost(s).containment).toBe(0);
    b.containment = 2;
    expect(monthlyPersonnelCost(s).containment).toBe(2 * CONTAINMENT_UPKEEP); // nobody held yet
    expect(monthlyIncome(s).containment).toBe(2 * CONTAINMENT_UPKEEP);
    holdCaptive(s, b, "vampire", "carcassonne", "Milan");
    holdCaptive(s, b, "thrall", "carcassonne", "Milan");
    const [vamp, thrall] = b.captives!;
    expect(executeBlocker(s, thrall!.id)).toMatch(/human/);
    expect(releaseBlocker(s, vamp!.id)).toMatch(/never released/);
    expect(startProject(s, "interrogate-vampire", b.id, 1)).toBeNull();
    expect(executeBlocker(s, vamp!.id)).toMatch(/being questioned/);
    expect(cancelProject(s, s.projects[0]!.id)).toBeNull();
    expect(executeCaptive(s, vamp!.id)).toBeNull();
    expect(b.remains).toBe(1); // what's left goes to cold storage
    expect(releaseCaptive(s, thrall!.id)).toBeNull();
    expect(b.captives).toEqual([]);
    expect(monthlyPersonnelCost(s).containment).toBe(2 * CONTAINMENT_UPKEEP); // still paid, empty
  });

  it("haematology raises every agent's vitality, and recruits get it too", () => {
    const s = quiet();
    s.research.done.push("vampire-physiology");
    padua(s).scientists = 30;
    padua(s).labs = 3;
    const vit = s.agents.map((a) => a.stats.vitality);
    expect(startProject(s, "haematology", padua(s).id)).toBeNull();
    days(s, 7);
    expect(s.agents.map((a) => a.stats.vitality)).toEqual(vit.map((v) => Math.min(95, v + RESEARCH_EFFECTS.vitality)));
  });

  it("survives a save round trip mid-project, and drops projects with their base", () => {
    const s = quiet();
    startProject(s, "signal-analysis", padua(s).id);
    days(s, 2);
    const back = deserialize(serialize(s));
    expect(back.projects).toEqual(s.projects);
    s.installations = s.installations.filter((i) => i.kind !== "base");
    expect(deserialize(serialize(s)).projects).toEqual([]);
  });
});

describe("engineering", () => {
  it("costs materials, and the station retrofit makes SIGINT hear more", () => {
    const s = quiet();
    const b = padua(s);
    expect(projectBlocker(s, "station-retrofit", b.id)).toMatch(/understood/);
    s.research.done.push("signal-analysis");
    const before = new Map(sigintRates(s));
    const funds = s.funds;
    expect(startProject(s, "station-retrofit", b.id)).toBeNull();
    expect(s.funds).toBe(funds - 250_000);
    days(s, 31);
    const after = sigintRates(s);
    for (const [id, r] of before) expect(after.get(id)!).toBeGreaterThan(r);
  });

  it("builds helicopters into the base's own free hangars, one per hangar", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    expect(projectBlocker(s, "build-helicopter", b.id)).toMatch(/hangar/);
    b.hangars = 3;
    expect(startProject(s, "build-helicopter", b.id, 2)).toBeNull();
    expect(projectBlocker(s, "build-helicopter", b.id)).toMatch(/hangar/); // that hangar is promised
    b.hangars = 4;
    expect(startProject(s, "build-helicopter", b.id, 2)).toBeNull(); // a second, alongside
    s.aircraft.push({ id: "air-x", kind: "jet", name: "SERAPH-9", baseId: b.id, deployed: false }); // a hangar filled meanwhile
    days(s, 101);
    expect(s.aircraft.filter((a) => a.kind === "helicopter")).toHaveLength(2); // one built, one waiting
    expect(stalled(s.projects[0]!)).toBe(true);
    s.aircraft = s.aircraft.filter((a) => a.id !== "air-x");
    const titles = days(s, 2);
    expect(titles).toContain("Engineering complete: Build a helicopter");
    expect(s.aircraft.filter((a) => a.kind === "helicopter")).toHaveLength(3);
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
    let base = 0, up = 0;
    for (let i = 0; i < 200; i++) {
      const team = () => s.agents.slice(0, 3).map((a) => ({ ...a, stats: { ...a.stats } }));
      if (fight(rng({ rng: i }), team(), "tactical", { thralls: 3, vampires: 2 }, 0).won) base++;
      if (fight(rng({ rng: i }), team(), "tactical", { thralls: 3, vampires: 2 }, 0, m).won) up++;
    }
    expect(up).toBeGreaterThan(base);
  });
});

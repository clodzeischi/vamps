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
import { dismissStaff, setStaff, staffAt, staffOf, staffCandidatesOf, refreshStaffCandidates, hireBlocker, hireStaff, monthlyPersonnelCost, upgradeBase, upgradeBlocker } from "./personnel";
import { cancelProject, combatMods, dailyResearch, daysLeft, executeBlocker, executeCaptive, freeStaff, releaseBlocker, releaseCaptive, holdCaptive, projectBlocker, setProjectStaff, stalled, startProject, visibleProjects } from "./research";
import { rng } from "./rng";
import type { GameState, Installation } from "./state";
import { engineeringQueue, flatAptitudes, leadOf, moveProject, queueDays, rollAptitudes, setLeadEngineer, teamOn, topOfQueue } from "./engineering";
import { APTITUDE_ROLL, type Aptitudes } from "../data/engineers";
import { STATE_VERSION } from "./state";
import { sendByAirline } from "./transfers";
import { DAY } from "./time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15; s.story.insider = s.story.fallWarned = true; // Padua stands
  return s;
};
const padua = (s: GameState) => s.installations.find((i) => i.kind === "base")!;
/** A base with `n` engineers, every aptitude at `v` (50: today's 1.5 points a day each). */
const engineers = (s: GameState, b: Installation, n: number, v = 50) => {
  setStaff(s, b, "engineer", n);
  b.workshops = Math.max(b.workshops ?? 0, Math.ceil(n / 10));
  for (const p of staffOf(s, b.id, "engineer")) p.aptitudes = flatAptitudes(v);
  return staffOf(s, b.id, "engineer");
};

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
  it("Padua starts with a lab, a workshop, four scientists and two engineers; salaries are paid", () => {
    const s = quiet();
    const b = padua(s);
    expect([b.labs, b.workshops, b.containment, staffAt(s, b, "scientist"), staffAt(s, b, "engineer")]).toEqual([1, 1, 0, 4, 2]);
    expect(monthlyPersonnelCost(s).staff).toBe(6 * STAFF.scientist.salary);
    expect(monthlyIncome(s).staff).toBe(6 * STAFF.scientist.salary);
  });

  it("hires up to the lab's room, and builds labs and containment", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    // 4 agents and 6 staff in 16 beds: six more, then quarters are full.
    for (let i = 0; i < 6; i++) expect(hireStaff(s, b.id, "scientist")).toBeNull();
    expect(hireBlocker(s, b.id, "engineer")).toMatch(/no free beds/);
    expect(upgradeBase(s, b.id, "quarters")).toBeNull();
    days(s, 8);
    // 10 scientists now: the lab is full.
    expect(hireBlocker(s, b.id, "scientist")).toMatch(/No room/);
    expect(dismissStaff(s, b.id, "scientist")).toBeNull();
    expect(staffAt(s, b, "scientist")).toBe(9);
    expect(upgradeBase(s, b.id, "containment")).toBeNull();
    expect(upgradeBase(s, b.id, "containment")).toBeNull();
    expect(upgradeBlocker(s, b.id, "containment")).toBeNull(); // the building is the cap now
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
    expect(daysLeft(projectById("field-medicine")!, 0, 2)).toBe(20); // 60 points, two scientists at 1.5 a day
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
    const other = { ...b, id: "ob-two", name: "Base Dallas", captives: [], remains: 0, upgrades: [] };
    s.installations.push(other);
    setStaff(s, other, "scientist", 4);
    setStaff(s, other, "engineer", 4);
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
    expect(holdCaptive(s, b, "thrall", "huaca", "Lima")).toBe(false); // no containment yet
    b.containment = 1;
    expect(holdCaptive(s, b, "thrall", "huaca", "Lima")).toBe(true);
    const before = s.intel.huaca ?? 0;
    expect(startProject(s, "interrogate-thrall", b.id, 2)).toBeNull();
    expect(projectBlocker(s, "interrogate-thrall", b.id)).toMatch(/captive thrall/); // already being questioned
    days(s, 31);
    expect(b.captives).toHaveLength(0);
    expect(s.intel.huaca).toBe(before + RESEARCH_EFFECTS.thrallIntel);
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
    setStaff(s, padua(s), "scientist", 30);
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
  it("draws materials as the work is done, and the station retrofit makes SIGINT hear more", () => {
    const s = quiet();
    const b = padua(s);
    engineers(s, b, 4);
    expect(projectBlocker(s, "station-retrofit", b.id)).toMatch(/understood/);
    s.research.done.push("signal-analysis");
    const before = new Map(sigintRates(s));
    const funds = s.funds;
    expect(startProject(s, "station-retrofit", b.id)).toBeNull();
    expect(s.funds).toBe(funds); // nothing paid up front
    dailyResearch(s);
    expect(funds - s.funds).toBe(Math.round(250_000 * (6 / 120))); // a day's share: 4 engineers at 50, 120 points
    for (let d = 0; d < 20; d++) dailyResearch(s);
    expect(s.engineering.done).toContain("station-retrofit");
    const after = sigintRates(s);
    for (const [id, r] of before) expect(after.get(id)!).toBeGreaterThan(r);
    // All of it, a little less as they got better at it on the way.
    expect(funds - s.funds).toBeLessThanOrEqual(250_000);
    expect(funds - s.funds).toBeGreaterThan(245_000);
  });

  it("builds helicopters into the base's own free hangars, one per hangar, one after another", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    engineers(s, b, 4); // 6 points a day: 34 days a helicopter
    expect(projectBlocker(s, "build-helicopter", b.id)).toMatch(/hangar/);
    b.hangars = 3;
    expect(startProject(s, "build-helicopter", b.id)).toBeNull();
    expect(projectBlocker(s, "build-helicopter", b.id)).toMatch(/hangar/); // that hangar is promised
    b.hangars = 4;
    expect(startProject(s, "build-helicopter", b.id)).toBeNull(); // a second, queued behind it
    s.aircraft.push({ id: "air-x", kind: "jet", name: "SERAPH-9", baseId: b.id, deployed: false }); // a hangar filled meanwhile
    days(s, 30);
    expect(s.projects.map((a) => a.progress > 0)).toEqual([true, false]); // only the top one is worked
    days(s, 40);
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

describe("engineers", () => {
  /** The worked example in docs/design/base.md. */
  const example = () => {
    const s = quiet();
    const b = padua(s);
    const team: [string, Aptitudes][] = [
      ["Ana", { ballistics: 78, avionics: 40, electronics: 32, chemistry: 55 }],
      ["Ben", { ballistics: 50, avionics: 62, electronics: 58, chemistry: 45 }],
      ["Chiara", { ballistics: 45, avionics: 52, electronics: 70, chemistry: 40 }],
      ["Dario", { ballistics: 55, avionics: 48, electronics: 50, chemistry: 66 }],
    ];
    const people = engineers(s, b, 4);
    people.forEach((p, i) => { p.name = team[i]![0]; p.aptitudes = { ...team[i]![1] }; });
    const id = (name: string) => people.find((p) => p.name === name)!.id;
    return { s, b, id };
  };

  it("works the job at the base's summed skill; the lead's aptitudes over 50 multiply the rest", () => {
    const { s, b, id } = example();
    const plate = projectById("ceramic-plate")!, retrofit = projectById("station-retrofit")!, heli = projectById("build-helicopter")!;
    const rate = (p: typeof plate, lead: string | null) => teamOn(s, b, p, lead === null ? null : id(lead)).rate;
    expect(rate(plate, null)).toBeCloseTo(6.84); // ballistics 228 × 1.5 / 50
    expect(rate(plate, "Ana")).toBeCloseTo(9.36); // the others ×1.56, Ana as she is
    expect(rate(plate, "Chiara")).toBeCloseTo(6.29); // a weak lead makes it worse
    expect(rate(retrofit, "Chiara")).toBeCloseTo(7.98);
    expect(rate(retrofit, "Ana")).toBeCloseTo(4.38);
    // Two aptitudes: the all-rounder leads best.
    const best = ["Ana", "Ben", "Chiara", "Dario"].sort((x, y) => rate(heli, y) - rate(heli, x))[0];
    expect(best).toBe("Ben");
    expect(rate(heli, "Ben")).toBeCloseTo(7.05);
    // Naming the lead is what the queue uses.
    expect(setLeadEngineer(s, b.id, id("Ana"))).toBeNull();
    expect(leadOf(s, b)?.name).toBe("Ana");
    expect(teamOn(s, b, plate).rate).toBeCloseTo(9.36);
    expect(setLeadEngineer(s, b.id, null)).toBeNull();
    expect(teamOn(s, b, plate).rate).toBeCloseTo(6.84);
  });

  it("wastes less material with a better team, more with a worse one", () => {
    const s = quiet();
    const b = padua(s);
    const people = engineers(s, b, 4);
    const plate = projectById("ceramic-plate")!;
    expect(teamOn(s, b, plate).waste).toBe(1);
    people[0]!.aptitudes = { ...flatAptitudes(), ballistics: 100 };
    setLeadEngineer(s, b.id, people[0]!.id);
    expect(teamOn(s, b, plate).waste).toBe(0.75); // everyone at 100 on ballistics
    for (const p of people) p.aptitudes = flatAptitudes(30);
    setLeadEngineer(s, b.id, null);
    expect(teamOn(s, b, plate).waste).toBeCloseTo(1.1);
    // And it's what the job costs.
    for (const p of people) p.aptitudes = flatAptitudes(100);
    s.research.done.push("composite-armour");
    const funds = s.funds;
    expect(startProject(s, "ceramic-plate", b.id)).toBeNull();
    for (let d = 0; d < 13; d++) dailyResearch(s); // 150 points at 12 a day
    expect(s.engineering.done).toContain("ceramic-plate");
    expect(funds - s.funds).toBeCloseTo(350_000 * 0.75, -2);
  });

  it("is a queue: the top job is worked, jobs move up and down, lines go to the back after each batch", () => {
    const s = quiet();
    s.funds = 1e9;
    s.research.done.push("composite-armour", "haematology", "signal-analysis");
    const b = padua(s);
    engineers(s, b, 4);
    for (const id of ["make-inserts", "make-plasma", "station-retrofit"]) expect(startProject(s, id, b.id)).toBeNull();
    const ids = () => engineeringQueue(s, b.id).map((a) => a.projectId);
    expect(ids()).toEqual(["make-inserts", "make-plasma", "station-retrofit"]);
    expect(queueDays(s, engineeringQueue(s, b.id)[2]!)).toBe(Math.ceil((25 + 45 + 120) / 6));
    expect(setProjectStaffBlocked(s)).toMatch(/queue/);
    days(s, 5); // inserts (25 points at 6 a day) done: on the shelf, and the line to the back
    expect(s.market.stock.inserts).toBe(1);
    expect(ids()).toEqual(["make-plasma", "station-retrofit", "make-inserts"]);
    const retro = engineeringQueue(s, b.id)[1]!;
    expect(moveProject(s, retro.id, -1)).toBeNull();
    expect(moveProject(s, retro.id, -1)).toMatch(/top/);
    expect(topOfQueue(s, b.id)).toBe(retro);
    days(s, 21);
    expect(s.engineering.done).toContain("station-retrofit");
  });

  it("stops for want of money, says so once, and goes on when there is some", () => {
    const s = quiet();
    const b = padua(s);
    engineers(s, b, 4);
    s.research.done.push("composite-armour");
    expect(startProject(s, "ceramic-plate", b.id)).toBeNull();
    s.funds = 1_000;
    dailyResearch(s);
    dailyResearch(s);
    expect(s.projects[0]!.progress).toBe(0);
    expect(s.log.filter((l) => l.text.includes("No money for the materials"))).toHaveLength(1);
    s.funds = 1e6;
    dailyResearch(s);
    expect(s.projects[0]!.progress).toBeCloseTo(6);
  });

  it("grows the aptitudes a job uses, fast to 75 and slowly to 100", () => {
    const s = quiet();
    s.funds = 1e9;
    s.research.done.push("composite-armour");
    const b = padua(s);
    const [e] = engineers(s, b, 1, 60);
    expect(startProject(s, "make-inserts", b.id)).toBeNull();
    days(s, 30);
    expect(e!.aptitudes!.ballistics).toBeCloseTo(62); // +1 per 15 days
    expect(e!.aptitudes!.chemistry).toBe(60); // unused, unchanged
    e!.aptitudes!.ballistics = 99.99;
    days(s, 5);
    expect(e!.aptitudes!.ballistics).toBe(100);
  });

  it("rolls engineers' aptitudes like an operator's, shows them before hiring, and keeps them on the payroll", () => {
    const s = quiet();
    const r = rng({ rng: 7 });
    for (let i = 0; i < 200; i++) {
      const apt = rollAptitudes(r);
      for (const v of Object.values(apt)) { expect(v).toBeGreaterThanOrEqual(APTITUDE_ROLL[0]); expect(v).toBeLessThanOrEqual(APTITUDE_ROLL[1]); }
    }
    refreshStaffCandidates(s);
    const c = staffCandidatesOf(s, "engineer")[0]!;
    expect(c.aptitudes).toBeDefined();
    expect(staffCandidatesOf(s, "scientist")[0]!.aptitudes).toBeUndefined();
    s.funds = 1e9;
    expect(hireStaff(s, padua(s).id, "engineer", c.id)).toBeNull();
    expect(s.staff.at(-1)!.aptitudes).toEqual(c.aptitudes);
  });

  it("a lead leads where they are: one who leaves stops leading", () => {
    const s = quiet();
    const b = padua(s);
    const other = { ...b, id: "ob-two", name: "Base Dallas", captives: [], remains: 0, upgrades: [], leadEngineer: undefined };
    s.installations.push(other);
    const [ana] = engineers(s, b, 2);
    expect(setLeadEngineer(s, other.id, ana!.id)).toMatch(/Not an engineer at Base Dallas/);
    expect(setLeadEngineer(s, b.id, ana!.id)).toBeNull();
    s.funds = 1e9;
    expect(sendByAirline(s, b.id, other.id, [ana!.id])).toBeNull();
    expect(b.leadEngineer).toBeUndefined();
  });

  it("survives a save, and older saves' engineers get aptitudes and leave their jobs to the queue", () => {
    const s = quiet();
    const b = padua(s);
    const [e] = engineers(s, b, 2, 61);
    setLeadEngineer(s, b.id, e!.id);
    s.research.done.push("composite-armour");
    startProject(s, "ceramic-plate", b.id);
    const back = deserialize(serialize(s));
    expect(padua(back).leadEngineer).toBe(e!.id);
    expect(back.staff.find((p) => p.id === e!.id)!.aptitudes).toEqual(flatAptitudes(61));
    // A version-8 save: no aptitudes, engineers assigned by count.
    const old = JSON.parse(serialize(s));
    old.version = 8;
    old.state.version = 8;
    for (const p of old.state.staff) delete p.aptitudes;
    for (const c of old.state.staffCandidates ?? []) delete c.aptitudes;
    delete old.state.installations.find((i: Installation) => i.kind === "base").leadEngineer;
    old.state.projects[0].staff = 2;
    const up = deserialize(JSON.stringify(old));
    expect(up.version).toBe(STATE_VERSION);
    expect(up.staff.filter((p) => p.role === "engineer").every((p) => p.aptitudes)).toBe(true);
    expect(up.staff.filter((p) => p.role === "scientist").every((p) => !p.aptitudes)).toBe(true);
    expect(up.projects[0]!.staff).toBe(0);
  });
});

const setProjectStaffBlocked = (s: GameState) => setProjectStaff(s, s.projects[0]!.id, 2);

describe("SIGINT centre", () => {
  it("lets a base listen like a station, and the upgrade waits for signal analysis", () => {
    const s = quiet();
    s.funds = 1e8;
    const b = padua(s);
    const before = sigintRates(s).get(b.regionId) ?? 0;
    expect(upgradeBase(s, b.id, "sigint")).toBeNull();
    expect(upgradeBlocker(s, b.id, "sigint")).toBe("Needs Signal analysis.");
    days(s, 11);
    expect(b.sigintCentre).toBe(1);
    const one = sigintRates(s).get(b.regionId)!;
    expect(one).toBeGreaterThan(before);
    s.research.done.push("signal-analysis");
    expect(upgradeBase(s, b.id, "sigint")).toBeNull();
    days(s, 11);
    expect(b.sigintCentre).toBe(2);
    expect(sigintRates(s).get(b.regionId)! - before).toBeCloseTo((one - before) * 1.5);
    expect(upgradeBlocker(s, b.id, "sigint")).toMatch(/No room/);
  });
});

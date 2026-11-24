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
import { cancelProject, combatMods, dailyResearch, queueBlocker, queueJob, queueResearch, researchBlocker, setQuantity, executeBlocker, executeCaptive, releaseBlocker, releaseCaptive, holdCaptive, projectBlocker, runDays, stalled, startProject, visibleProjects } from "./research";
import { rng } from "./rng";
import type { GameState, Installation } from "./state";
import { engineeringQueue, leadOf, moveProject, queueDays, setLeadEngineer, teamOn, topOfQueue } from "./engineering";
import { flatAptitudes, rollAptitudes } from "./aptitudes";
import { leadScientist, researchBlocked, researchQueue, researchTeam, setLeadScientist, topOfResearch } from "./science";
import { APTITUDE_ROLL, type Aptitudes } from "../data/aptitudes";
import { STATE_VERSION } from "./state";
import { sendByAirline } from "./transfers";
import { DAY } from "./time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15; // Padua stands
  return s;
};
const padua = (s: GameState) => s.installations.find((i) => i.kind === "base")!;
/** A base with `n` engineers, every aptitude at `v` (50: today's 1.5 points a day each). */
const engineers = (s: GameState, b: Installation, n: number, v = 50) => {
  setStaff(s, b, "engineer", n);
  b.workshops = Math.max(b.workshops ?? 0, Math.ceil(n / 10));
  for (const p of staffOf(s, b.id, "engineer")) p.aptitudes = flatAptitudes("engineer", v);
  return staffOf(s, b.id, "engineer");
};
/** A base with `n` scientists, every aptitude at `v`. */
const scientistsAt = (s: GameState, b: Installation, n: number, v = 50) => {
  setStaff(s, b, "scientist", n);
  b.labs = Math.max(b.labs ?? 0, Math.ceil(n / 10));
  for (const p of staffOf(s, b.id, "scientist")) p.aptitudes = flatAptitudes("scientist", v);
  return staffOf(s, b.id, "scientist");
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
  it("Padua starts with a lab, a workshop, two scientists, two engineers and two analysts; salaries are paid", () => {
    const s = quiet();
    const b = padua(s);
    expect([b.labs, b.workshops, b.containment, staffAt(s, b, "scientist"), staffAt(s, b, "engineer"), staffAt(s, b, "analyst")]).toEqual([1, 1, 0, 2, 2, 2]);
    expect(monthlyPersonnelCost(s).staff).toBe(6 * STAFF.scientist.salary);
    expect(monthlyIncome(s).staff).toBe(6 * STAFF.scientist.salary);
    expect(staffOf(s, b.id, "analyst").every((p) => p.aptitudes?.ci !== undefined)).toBe(true);
    expect(staffOf(s, b.id, "scientist").every((p) => p.aptitudes?.biology !== undefined && p.aptitudes.ballistics === undefined)).toBe(true);
  });

  it("hires up to the lab's room, and builds labs and containment", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    // 4 agents and 6 staff in 16 beds: six more, then quarters are full.
    for (let i = 0; i < 4; i++) expect(hireStaff(s, b.id, "scientist")).toBeNull();
    for (let i = 0; i < 2; i++) expect(hireStaff(s, b.id, "engineer")).toBeNull();
    expect(hireBlocker(s, b.id, "engineer")).toMatch(/no free beds/);
    expect(upgradeBase(s, b.id, "quarters")).toBeNull();
    days(s, 8);
    // 6 scientists now; the lab holds 10. Analysts need only beds.
    expect(staffAt(s, b, "scientist")).toBe(6);
    expect(hireStaff(s, b.id, "analyst")).toBeNull();
    setStaff(s, b, "scientist", 10);
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
  it("is one queue for the Order: every scientist, at every base, works the top topic", () => {
    const s = quiet();
    const b = padua(s);
    const other = { ...b, id: "ob-two", name: "Base Dallas", captives: [], remains: 0, upgrades: [] };
    s.installations.push(other);
    scientistsAt(s, b, 2);
    scientistsAt(s, other, 2); // 4 at 50: 6 points a day
    expect(visibleProjects(s, "research").map((p) => p.id)).not.toContain("uv-weaponry");
    expect(queueResearch(s, "field-medicine")).toBeNull();
    expect(queueResearch(s, "composite-armour")).toBeNull();
    expect(researchBlocker(s, "field-medicine")).toMatch(/Already in the queue/);
    const [med, arm] = researchQueue(s);
    expect(runDays(s, med!)).toBe(10); // 60 points
    expect(runDays(s, arm!)).toBe(Math.ceil((60 + 100) / 6));
    for (let d = 0; d < 10; d++) dailyResearch(s);
    expect(s.research.done).toContain("field-medicine");
    expect(arm!.progress).toBe(0); // the next starts the day after
    // Reorder: armour first, then signals.
    expect(queueResearch(s, "signal-analysis")).toBeNull();
    const sig = researchQueue(s)[1]!;
    expect(moveProject(s, sig.id, -1)).toBeNull();
    expect(topOfResearch(s)).toBe(sig);
    // Scientists can leave: nobody is tied to a topic.
    expect(dismissStaff(s, b.id, "scientist")).toBeNull();
    expect(researchTeam(s, projectById("signal-analysis")!).scientists).toBe(3);
  });

  it("multiplies everyone else's aptitudes by the lead's over 50, whatever the topic", () => {
    const s = quiet();
    const b = padua(s);
    const [ada, ben, cy] = scientistsAt(s, b, 3);
    ada!.aptitudes = { biology: 80, psychology: 40, physics: 30, humanities: 50 };
    const med = projectById("field-medicine")!; // biology
    const armour = projectById("composite-armour")!; // physics
    expect(researchTeam(s, med, null).rate).toBeCloseTo(1.5 * (80 + 50 + 50) / 50);
    expect(setLeadScientist(s, ada!.id)).toBeNull();
    expect(leadScientist(s)).toBe(ada);
    expect(researchTeam(s, med).rate).toBeCloseTo(1.5 * (80 + 1.6 * 100) / 50); // the others ×1.6
    expect(researchTeam(s, armour).rate).toBeCloseTo(1.5 * (30 + 0.6 * 100) / 50); // forgot to change the lead
    expect(setLeadScientist(s, ben!.id)).toBeNull();
    expect(researchTeam(s, armour).rate).toBeCloseTo(1.5 * (30 + 50 + 50) / 50);
    expect(setLeadScientist(s, "staff-nobody")).toMatch(/Not one of our scientists/);
    // The lead leads from anywhere: sent abroad, they still lead once there.
    const other = { ...b, id: "ob-two", name: "Base Dallas", captives: [], remains: 0, upgrades: [] };
    s.installations.push(other);
    s.funds = 1e9;
    expect(sendByAirline(s, b.id, other.id, [cy!.id])).toBeNull();
    expect(setLeadScientist(s, cy!.id)).toMatch(/transit/);
  });

  it("studies material only at a base with a laboratory and a scientist; the queue skips what it can't work", () => {
    const s = quiet();
    const b = padua(s);
    const other = { ...b, id: "ob-two", name: "Base Dallas", captives: [], remains: 1, upgrades: [], labs: 1 };
    s.installations.push(other);
    scientistsAt(s, b, 2);
    expect(researchBlocker(s, "vampire-physiology")).toMatch(/laboratory and a scientist/); // Dallas has the remains, nobody to study them
    setStaff(s, other, "scientist", 1);
    expect(queueResearch(s, "vampire-physiology")).toBeNull();
    expect(queueResearch(s, "field-medicine")).toBeNull();
    // The scientist in Dallas leaves: physiology waits, medicine goes on.
    expect(dismissStaff(s, other.id, "scientist")).toBeNull();
    const [phys, med] = researchQueue(s);
    expect(researchBlocked(s, phys!)).toMatch(/laboratory and a scientist/);
    expect(topOfResearch(s)).toBe(med);
    dailyResearch(s);
    expect([phys!.progress, med!.progress > 0]).toEqual([0, true]);
    // A captive's questioning names the base that holds it.
    b.containment = 1;
    holdCaptive(s, b, "thrall", "huaca", "Lima");
    expect(researchBlocker(s, "interrogate-thrall")).toMatch(/Choose the base/);
    expect(researchBlocker(s, "interrogate-thrall", other.id)).toMatch(/captive thrall/);
    expect(queueResearch(s, "interrogate-thrall", b.id)).toBeNull();
    expect(researchBlocker(s, "interrogate-thrall", b.id)).toMatch(/captive thrall/); // already being questioned
  });

  it("interrogating a captive consumes it, and each captive is questioned once", () => {
    const s = quiet();
    const b = padua(s);
    expect(holdCaptive(s, b, "thrall", "huaca", "Lima")).toBe(false); // no containment yet
    b.containment = 1;
    expect(holdCaptive(s, b, "thrall", "huaca", "Lima")).toBe(true);
    const before = s.networks.huaca!.clues;
    expect(startProject(s, "interrogate-thrall", b.id)).toBeNull();
    days(s, 31);
    expect(b.captives).toHaveLength(0);
    expect(s.networks.huaca!.clues).toBe(before + RESEARCH_EFFECTS.thrallClues);
    expect(s.networks.huaca!.pages).toBe(1);
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
    expect(startProject(s, "interrogate-vampire", b.id)).toBeNull();
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
    scientistsAt(s, padua(s), 30);
    const vit = s.agents.map((a) => a.stats.vitality);
    expect(startProject(s, "haematology", padua(s).id)).toBeNull();
    days(s, 7);
    expect(s.agents.map((a) => a.stats.vitality)).toEqual(vit.map((v) => Math.min(95, v + RESEARCH_EFFECTS.vitality)));
  });

  it("grows the aptitudes a topic uses", () => {
    const s = quiet();
    const [a] = scientistsAt(s, padua(s), 1, 60);
    expect(queueResearch(s, "composite-armour")).toBeNull(); // physics; 100 points at 1.8 a day
    for (let d = 0; d < 30; d++) dailyResearch(s);
    expect(a!.aptitudes!.physics).toBeCloseTo(62);
    expect(a!.aptitudes!.biology).toBe(60);
  });

  it("survives a save round trip mid-project with its lead, and drops a questioning with its base", () => {
    const s = quiet();
    const [lead] = scientistsAt(s, padua(s), 2);
    setLeadScientist(s, lead!.id);
    queueResearch(s, "signal-analysis");
    days(s, 2);
    const back = deserialize(serialize(s));
    expect(back.projects).toEqual(s.projects);
    expect(back.leadScientist).toBe(lead!.id);
    // An older save: assigned by headcount at a base.
    const old = JSON.parse(serialize(s));
    old.version = old.state.version = 9;
    for (const p of old.state.staff) if (p.role === "scientist") delete p.aptitudes;
    old.state.projects[0].staff = 2;
    old.state.projects[0].baseId = padua(s).id;
    const up = deserialize(JSON.stringify(old));
    expect(up.projects[0]).toMatchObject({ staff: 0, baseId: "" });
    expect(up.staff.every((p) => p.aptitudes)).toBe(true);
    // Questioning goes with its base.
    padua(s).containment = 1;
    holdCaptive(s, padua(s), "thrall", "huaca", "Lima");
    queueResearch(s, "interrogate-thrall", padua(s).id);
    s.installations = s.installations.filter((i) => i.kind !== "base");
    expect(deserialize(serialize(s)).projects.map((a) => a.projectId)).toEqual(["signal-analysis"]);
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
    expect(startProject(s, "build-helicopter", b.id)).toBeNull(); // a second: the order is for two
    expect(s.projects.map((a) => a.count)).toEqual([2]);
    s.aircraft.push({ id: "air-x", kind: "jet", name: "SERAPH-9", baseId: b.id, deployed: false }); // a hangar filled meanwhile
    days(s, 70);
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
    people[0]!.aptitudes = { ...flatAptitudes("engineer"), ballistics: 100 };
    setLeadEngineer(s, b.id, people[0]!.id);
    expect(teamOn(s, b, plate).waste).toBe(0.75); // everyone at 100 on ballistics
    for (const p of people) p.aptitudes = flatAptitudes("engineer", 30);
    setLeadEngineer(s, b.id, null);
    expect(teamOn(s, b, plate).waste).toBeCloseTo(1.1);
    // And it's what the job costs.
    for (const p of people) p.aptitudes = flatAptitudes("engineer", 100);
    s.research.done.push("composite-armour");
    const funds = s.funds;
    expect(startProject(s, "ceramic-plate", b.id)).toBeNull();
    for (let d = 0; d < 13; d++) dailyResearch(s); // 150 points at 12 a day
    expect(s.engineering.done).toContain("ceramic-plate");
    expect(funds - s.funds).toBeCloseTo(350_000 * 0.75, -2);
  });

  it("is a queue of orders: more of the same joins its order, and the next job waits for the whole order", () => {
    const s = quiet();
    s.funds = 1e9;
    s.research.done.push("composite-armour", "signal-analysis");
    const b = padua(s);
    engineers(s, b, 4); // 6 points a day; inserts are 25 points each
    expect(queueJob(s, "make-inserts", b.id, 12)).toBeNull();
    const ids = () => engineeringQueue(s, b.id).map((a) => `${a.projectId}×${a.count ?? 1}`);
    expect(ids()).toEqual(["make-inserts×12"]);
    for (let d = 0; d < 9; d++) dailyResearch(s); // 54 points: two made
    expect(s.market.stock.inserts).toBe(2);
    expect(ids()).toEqual(["make-inserts×10"]);
    expect(queueJob(s, "station-retrofit", b.id)).toBeNull();
    expect(queueJob(s, "make-inserts", b.id)).toBeNull(); // one more joins the order, ahead of the retrofit
    expect(ids()).toEqual(["make-inserts×11", "station-retrofit×1"]);
    expect(queueBlocker(s, "station-retrofit", b.id)).toMatch(/Already/);
    expect(queueBlocker(s, "make-inserts", b.id, 100)).toMatch(/Between 1 and 99/);
    const q = engineeringQueue(s, b.id);
    expect(queueDays(s, q[1]!)).toBe(Math.ceil((11 * 25 - q[0]!.progress) / teamOn(s, b, projectById("make-inserts")!).rate + 120 / teamOn(s, b, projectById("station-retrofit")!).rate));
    for (let d = 0; d < 35; d++) dailyResearch(s);
    expect(s.projects.find((a) => a.projectId === "station-retrofit")!.progress).toBe(0); // still on the inserts
    for (let d = 0; d < 15; d++) dailyResearch(s);
    expect(s.market.stock.inserts).toBe(13);
    expect(ids()).toEqual(["station-retrofit×1"]);
    // Orders can be cut, and jobs reordered.
    expect(queueJob(s, "make-inserts", b.id, 5)).toBeNull();
    const ins = s.projects.find((a) => a.projectId === "make-inserts")!;
    expect(setQuantity(s, ins.id, 2)).toBeNull();
    expect(setQuantity(s, ins.id, 0)).toMatch(/abandon/);
    expect(moveProject(s, ins.id, -1)).toBeNull();
    expect(moveProject(s, ins.id, -1)).toMatch(/top/);
    expect(topOfQueue(s, b.id)).toBe(ins);
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
    expect(queueJob(s, "make-inserts", b.id, 99)).toBeNull();
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
      const apt = rollAptitudes(r, "engineer");
      for (const v of Object.values(apt) as number[]) { expect(v).toBeGreaterThanOrEqual(APTITUDE_ROLL[0]); expect(v).toBeLessThanOrEqual(APTITUDE_ROLL[1]); }
    }
    refreshStaffCandidates(s);
    const c = staffCandidatesOf(s, "engineer")[0]!;
    expect(c.aptitudes).toBeDefined();
    expect(staffCandidatesOf(s, "scientist")[0]!.aptitudes!.biology).toBeDefined(); // their own four
    expect(staffCandidatesOf(s, "scientist")[0]!.aptitudes!.ballistics).toBeUndefined();
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
    expect(back.staff.find((p) => p.id === e!.id)!.aptitudes).toEqual(flatAptitudes("engineer", 61));
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
    expect(up.staff.filter((p) => p.role === "scientist").every((p) => p.aptitudes?.biology !== undefined)).toBe(true);
    expect(up.projects[0]!.staff).toBe(0);
  });
});


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

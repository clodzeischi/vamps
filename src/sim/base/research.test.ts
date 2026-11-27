import { describe, expect, it } from "vitest";
import { setRooms } from "./building";
import { AIRCRAFT, reachOf } from "../../data/aircraft";
import { addStock, stockAt } from "../people/equipment";
import { FACILITIES } from "../../data/installations";
const CONTAINMENT_UPKEEP = FACILITIES.containment.upkeep!;
import { projectById, PROJECTS, RESEARCH_EFFECTS } from "../../data/research";
import { deserialize, serialize } from "../../save/format";
import { newCampaign } from "../campaign/campaign";
import { advance, dismissEvent } from "../core/clock";
import { sigintRates } from "../core/commands";
import { fight } from "../missions/combat";
import { monthlyIncome } from "../economy/economy";
import {
  monthlyPay,
  dismiss,
  facilityCount,
  setStaff,
  staffAt,
  staffOf,
  candidatesOf,
  refreshCandidates,
  hireBlocker,
  hire,
  monthlyPersonnelCost,
  upgradeBase,
  upgradeBlocker,
  setStaffLead,
  staffLead,
  chapelMonth,
} from "../people/personnel";
import { turnChance } from "../intel/turned";
import {
  combatMods,
  dailyResearch,
  queueBlocker,
  queueJob,
  queueResearch,
  researchBlocker,
  setQuantity,
  executeBlocker,
  executeCaptive,
  releaseBlocker,
  releaseCaptive,
  holdCaptive,
  projectBlocker,
  runDays,
  stalled,
  startProject,
  visibleProjects,
  learnTopic,
} from "./research";
import { rng } from "../core/rng";
import type { GameState, Installation } from "../core/state";
import { engineeringQueue, placeProject, queueDays, teamOn, topOfQueue } from "./engineering";
import { flatAptitudes, rollAptitudes } from "../people/aptitudes";
import { researchBlocked, researchQueue, researchTeam, topOfResearch } from "./science";
import { APTITUDE_ROLL, type Aptitudes } from "../../data/aptitudes";
import { sendByAirline } from "./transfers";
import { sectionPace } from "../intel/intel";
import { DAY } from "../core/time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(
    ["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]),
  );
  s.coverUps = [];
  s.story.fallAt = 8.64e15; // Padua stands
  return s;
};
const padua = (s: GameState) => s.installations.find((i) => i.kind === "base")!;
/** A base with `n` engineers, every aptitude at `v` (50: today's 1.5 points a day each). */
const engineers = (s: GameState, b: Installation, n: number, v = 50) => {
  setStaff(s, b, "engineer", n);
  setRooms(b, "workshop", Math.max(facilityCount(b, "workshop"), Math.ceil(n / 10)));
  for (const p of staffOf(s, b.id, "engineer")) p.aptitudes = flatAptitudes("engineer", v);
  return staffOf(s, b.id, "engineer");
};
/** A base with `n` scientists, every aptitude at `v`. */
const scientistsAt = (s: GameState, b: Installation, n: number, v = 50) => {
  setStaff(s, b, "scientist", n);
  setRooms(b, "lab", Math.max(facilityCount(b, "lab"), Math.ceil(n / 10)));
  for (const p of staffOf(s, b.id, "scientist")) p.aptitudes = flatAptitudes("scientist", v);
  return staffOf(s, b.id, "scientist");
};

/** Runs days, dismissing events; returns the titles posted. */
function days(s: GameState, n: number): string[] {
  const titles: string[] = [];
  const end = s.time + n * DAY;
  while (s.time < end) {
    if (s.events.length) {
      titles.push(s.events[0]!.title);
      dismissEvent(s);
      continue;
    }
    advance(s, end - s.time);
  }
  while (s.events.length) {
    titles.push(s.events[0]!.title);
    dismissEvent(s);
  }
  return titles;
}

describe("staff and facilities", () => {
  it("pays everyone by aptitude: $20k a month at 50 in every one, in proportion", () => {
    const at = (n: number) =>
      monthlyPay({
        role: "scientist",
        aptitudes: { biology: n, psychology: n, physics: n, humanities: n },
      });
    expect(at(50)).toBe(20_000);
    expect(at(40)).toBe(16_000);
    expect(at(60)).toBe(24_000);
    expect(
      monthlyPay({
        role: "operator",
        aptitudes: { combat: 70, tradecraft: 50, insight: 50, faith: 30 },
      }),
    ).toBe(20_000);
  });

  it("Padua starts with a lab, a workshop, two scientists, two engineers and two analysts; salaries are paid", () => {
    const s = quiet();
    const b = padua(s);
    expect([
      facilityCount(b, "lab"),
      facilityCount(b, "workshop"),
      facilityCount(b, "containment"),
      staffAt(s, b, "scientist"),
      staffAt(s, b, "engineer"),
      staffAt(s, b, "analyst"),
    ]).toEqual([1, 1, 0, 2, 2, 2]);
    const pay = s.staff.reduce((t, p) => t + monthlyPay(p), 0);
    expect(monthlyPersonnelCost(s).staff).toBe(pay);
    expect(monthlyIncome(s).staff).toBe(pay);
    expect(staffOf(s, b.id, "analyst").every((p) => p.aptitudes?.ci !== undefined)).toBe(true);
    expect(
      staffOf(s, b.id, "scientist").every(
        (p) => p.aptitudes?.biology !== undefined && p.aptitudes.ballistics === undefined,
      ),
    ).toBe(true);
  });

  it("hires up to the lab's room, and builds labs and containment", () => {
    const s = quiet();
    s.funds = 1e9;
    const b = padua(s);
    // 4 agents and 6 staff in 16 beds: six more, then quarters are full.
    for (let i = 0; i < 4; i++) expect(hire(s, b.id, "scientist")).toBeNull();
    for (let i = 0; i < 2; i++) expect(hire(s, b.id, "engineer")).toBeNull();
    expect(hireBlocker(s, b.id, "engineer")).toMatch(/no free beds/);
    expect(upgradeBase(s, b.id, "quarters")).toBeNull();
    days(s, 8);
    // 6 scientists now; the lab holds 10, the fusion centre 10 analysts.
    expect(staffAt(s, b, "scientist")).toBe(6);
    expect(hire(s, b.id, "analyst")).toBeNull();
    setStaff(s, b, "scientist", 10);
    expect(hireBlocker(s, b.id, "scientist")).toMatch(/No room/);
    expect(dismiss(s, staffOf(s, b.id, "scientist").at(-1)!.id)).toBeNull();
    expect(staffAt(s, b, "scientist")).toBe(9);
    expect(upgradeBase(s, b.id, "containment")).toBeNull();
    expect(upgradeBase(s, b.id, "containment")).toBeNull();
    expect(upgradeBlocker(s, b.id, "containment")).toBeNull(); // the building is the cap now
    days(s, 21);
    expect(facilityCount(b, "containment")).toBe(2);
  });
});

describe("research", () => {
  it("every topic reads as a report; a topic only the Church may see is never sold", () => {
    for (const p of PROJECTS) {
      expect(p.proposal && p.outcome && p.findings, p.id).toBeTruthy();
      if (p.classification === "cdf" || p.classification === "opv")
        expect(p.trade && "buyer" in p.trade, p.id).toBeFalsy();
      if (p.kind === "engineering") expect(p.classification, p.id).toBeUndefined();
    }
  });
  it("is one queue for the Order: every scientist, at every base, works the top topic", () => {
    const s = quiet();
    const b = padua(s);
    const other = {
      ...b,
      id: "ob-two",
      name: "Base Dallas",
      captives: [],
      remains: 0,
      upgrades: [],
    };
    s.installations.push(other);
    scientistsAt(s, b, 2);
    scientistsAt(s, other, 2); // 4 at 50: 6 points a day
    expect(visibleProjects(s, "research").map((p) => p.id)).not.toContain("uv-weaponry");
    expect(queueResearch(s, "field-medicine")).toBeNull();
    expect(queueResearch(s, "archives-1")).toBeNull();
    expect(researchBlocker(s, "field-medicine")).toMatch(/Already in the queue/);
    const [med, arm] = researchQueue(s);
    expect(runDays(s, med!)).toBe(10); // 60 points
    expect(runDays(s, arm!)).toBe(Math.ceil((60 + 80) / 6));
    for (let d = 0; d < 10; d++) dailyResearch(s);
    expect(s.research.done).toContain("field-medicine");
    expect(arm!.progress).toBe(0); // the next starts the day after
    // Reorder: signals first, then the archives.
    expect(queueResearch(s, "signal-analysis")).toBeNull();
    const sig = researchQueue(s)[1]!;
    expect(placeProject(s, sig.id, 0)).toBeNull();
    expect(topOfResearch(s)).toBe(sig);
    // Scientists can leave: nobody is tied to a topic.
    expect(dismiss(s, staffOf(s, b.id, "scientist").at(-1)!.id)).toBeNull();
    expect(researchTeam(s, projectById("signal-analysis")!).scientists).toBe(3);
  });

  it("multiplies everyone else's aptitudes by the lead's over 50, whatever the topic", () => {
    const s = quiet();
    const b = padua(s);
    const [ada, ben, cy] = scientistsAt(s, b, 3);
    ada!.aptitudes = { biology: 80, psychology: 40, physics: 30, humanities: 50 };
    const med = projectById("field-medicine")!; // biology
    const armour = projectById("composite-armour")!; // physics
    expect(researchTeam(s, med, null).rate).toBeCloseTo((1.5 * (80 + 50 + 50)) / 50);
    expect(setStaffLead(s, "scientist", ada!.id)).toBeNull();
    expect(staffLead(s, "scientist")).toBe(ada);
    expect(researchTeam(s, med).rate).toBeCloseTo((1.5 * (80 + 1.6 * 100)) / 50); // the others ×1.6
    expect(researchTeam(s, armour).rate).toBeCloseTo((1.5 * (30 + 0.6 * 100)) / 50); // forgot to change the lead
    expect(setStaffLead(s, "scientist", ben!.id)).toBeNull();
    expect(researchTeam(s, armour).rate).toBeCloseTo((1.5 * (30 + 50 + 50)) / 50);
    expect(setStaffLead(s, "scientist", "staff-nobody")).toMatch(/Not one of our scientists/);
    // The lead leads from anywhere: sent abroad, they still lead once there.
    const other = {
      ...b,
      id: "ob-two",
      name: "Base Dallas",
      captives: [],
      remains: 0,
      upgrades: [],
    };
    s.installations.push(other);
    s.funds = 1e9;
    expect(sendByAirline(s, b.id, other.id, [cy!.id])).toBeNull();
    expect(setStaffLead(s, "scientist", cy!.id)).toMatch(/transit/);
  });

  it("studies material only at a base with a laboratory and a scientist; the queue skips what it can't work", () => {
    const s = quiet();
    const b = padua(s);
    const other = {
      ...b,
      id: "ob-two",
      name: "Base Dallas",
      captives: [],
      remains: 1,
      upgrades: [],
      labs: 1,
    };
    s.installations.push(other);
    s.research.done.push("archives-1");
    scientistsAt(s, b, 2);
    expect(researchBlocker(s, "vampire-physiology")).toMatch(/laboratory and a scientist/); // Dallas has the remains, nobody to study them
    setStaff(s, other, "scientist", 1);
    expect(queueResearch(s, "vampire-physiology")).toBeNull();
    expect(queueResearch(s, "field-medicine")).toBeNull();
    // The scientist in Dallas leaves: physiology waits, medicine goes on.
    expect(dismiss(s, staffOf(s, other.id, "scientist").at(-1)!.id)).toBeNull();
    const [phys, med] = researchQueue(s);
    expect(researchBlocked(s, phys!)).toMatch(/laboratory and a scientist/);
    expect(topOfResearch(s)).toBe(med);
    dailyResearch(s);
    expect([phys!.progress, med!.progress > 0]).toEqual([0, true]);
  });

  it("containment costs upkeep full or empty; vampires can be destroyed, thralls only released", () => {
    const s = quiet();
    const b = padua(s);
    expect(monthlyPersonnelCost(s).rooms).toBe(0);
    setRooms(b, "containment", 2);
    expect(monthlyPersonnelCost(s).rooms).toBe(2 * CONTAINMENT_UPKEEP); // nobody held yet
    expect(monthlyIncome(s).rooms).toBe(2 * CONTAINMENT_UPKEEP);
    holdCaptive(s, b, "vampire", "carcassonne", "Milan");
    holdCaptive(s, b, "thrall", "carcassonne", "Milan");
    const [vamp, thrall] = b.captives!;
    expect(executeBlocker(s, thrall!.id)).toMatch(/human/);
    expect(releaseBlocker(s, vamp!.id)).toMatch(/never released/);
    expect(executeCaptive(s, vamp!.id)).toBeNull();
    expect(b.remains).toBe(1); // what's left goes to cold storage
    expect(releaseCaptive(s, thrall!.id)).toBeNull();
    expect(b.captives).toEqual([]);
    expect(monthlyPersonnelCost(s).rooms).toBe(2 * CONTAINMENT_UPKEEP); // still paid, empty
  });

  it("haematology raises every agent's vitality, and recruits get it too", () => {
    const s = quiet();
    s.research.done.push("field-medicine", "vampire-physiology");
    scientistsAt(s, padua(s), 30);
    const vit = s.agents.map((a) => a.vitality);
    expect(startProject(s, "haematology", padua(s).id)).toBeNull();
    days(s, 7);
    expect(s.agents.map((a) => a.vitality)).toEqual(
      vit.map((v) => Math.min(95, v + RESEARCH_EFFECTS.vitality)),
    );
  });

  it("grows the aptitudes a topic uses", () => {
    const s = quiet();
    const [a] = scientistsAt(s, padua(s), 1, 60);
    s.research.done.push("archives-1", "vampire-physiology");
    expect(queueResearch(s, "composite-armour")).toBeNull(); // physics; 100 points at 1.8 a day
    for (let d = 0; d < 30; d++) dailyResearch(s);
    expect(a!.aptitudes!.physics).toBeCloseTo(62);
    expect(a!.aptitudes!.biology).toBe(60);
  });

  it("survives a save round trip mid-project with its lead", () => {
    const s = quiet();
    const [lead] = scientistsAt(s, padua(s), 2);
    setStaffLead(s, "scientist", lead!.id);
    queueResearch(s, "signal-analysis");
    days(s, 2);
    const back = deserialize(serialize(s));
    expect(back.projects).toEqual(s.projects);
    expect(back.leadScientist).toBe(lead!.id);
  });
});

describe("the spine (docs/design/research.md)", () => {
  it("opens with three topics: one for the story, one for combat, one for intelligence", () => {
    const s = quiet();
    expect(
      visibleProjects(s, "research")
        .map((p) => p.id)
        .sort(),
    ).toEqual(["archives-1", "field-medicine", "signal-analysis"]);
    s.research.done.push("archives-1");
    expect(visibleProjects(s, "research").map((p) => p.id)).toEqual(
      expect.arrayContaining(["archives-2", "vampire-physiology"]),
    );
    expect(visibleProjects(s, "engineering").map((p) => p.id)).toContain("make-biopsy-kit");
  });

  it("studies a tissue sample as vampire material", () => {
    const s = quiet();
    const b = padua(s);
    s.research.done.push("archives-1");
    scientistsAt(s, b, 2);
    expect(researchBlocker(s, "vampire-physiology")).toMatch(/tissue sample/);
    addStock(b, "sample-vampire-huaca", 1);
    expect(researchBlocker(s, "vampire-physiology")).toBeNull();
  });

  it("sequences a house's Strain only from a sample of that house", () => {
    const s = quiet();
    const b = padua(s);
    s.research.done.push("archives-1", "vampire-physiology", "vampire-physiology-2");
    scientistsAt(s, b, 2);
    expect(researchBlocker(s, "strain-huaca")).toBe("Not yet understood.");
    s.research.done.push("biocontainment", "provirus");
    setRooms(b, "bsl4", 1);
    expect(researchBlocker(s, "strain-huaca")).toMatch(/The Huaca Line/);
    addStock(b, "sample-vampire-jade", 1);
    addStock(b, "sample-feral-huaca", 1);
    expect(researchBlocker(s, "strain-huaca")).toMatch(/The Huaca Line/); // wrong house; feral
    addStock(b, "sample-elder-huaca", 1);
    expect(researchBlocker(s, "strain-huaca")).toBeNull();
    expect(researchBlocker(s, "history-huaca")).toBe("Not yet understood.");
    s.research.done.push("archives-2", "palaeography");
    setRooms(b, "archive", 1);
    expect(researchBlocker(s, "history-huaca")).toBeNull();
  });

  it("builds the new rooms only once researched, and works their topics only there", () => {
    const s = quiet();
    const b = padua(s);
    s.funds = 1e9;
    scientistsAt(s, b, 2);
    expect(upgradeBlocker(s, b.id, "bsl4")).toBe("Needs Biocontainment.");
    expect(upgradeBlocker(s, b.id, "archive")).toBe("Needs Vatican Digital Archives II.");
    expect(upgradeBlocker(s, b.id, "forensic")).toBe("Needs Forensic pathology.");
    expect(upgradeBlocker(s, b.id, "chapel")).toBe("Needs Pastoral theology.");
    s.research.done.push(
      "archives-1",
      "vampire-physiology",
      "vampire-physiology-2",
      "biocontainment",
    );
    expect(researchBlocker(s, "provirus")).toMatch(/BSL-4 suite and a scientist/);
    expect(upgradeBlocker(s, b.id, "bsl4")).toBeNull();
    setRooms(b, "bsl4", 1);
    expect(upgradeBlocker(s, b.id, "bsl4")).toMatch(/No room for more/); // one a base
    expect(researchBlocker(s, "provirus")).toBeNull();
    // Each pays its upkeep flat, with containment's.
    expect(monthlyPersonnelCost(s).rooms).toBe(FACILITIES.bsl4.upkeep);
    // A Strain's sample must be at the base with the suite.
    s.research.done.push("provirus");
    const other = { ...b, id: "elsewhere", rooms: [], armoury: {} } as Installation;
    s.installations.push(other);
    addStock(other, "sample-vampire-jade", 1);
    expect(researchBlocker(s, "strain-jade")).toMatch(/BSL-4 suite, a laboratory/);
    addStock(b, "sample-vampire-jade", 1);
    expect(researchBlocker(s, "strain-jade")).toBeNull();
  });

  it("the faith topics: the Exercises, thrall dependence, pastoral theology and the chapel", () => {
    const s = quiet();
    const b = padua(s);
    s.research.done.push("archives-1");
    const before = s.agents.map((a) => a.aptitudes.faith);
    expect(learnTopic(s, "spiritual-exercises")).toBeNull();
    expect(s.agents.map((a) => a.aptitudes.faith)).toEqual(
      before.map((f) => Math.min(100, f + RESEARCH_EFFECTS.faith)),
    );
    expect(turnChance(s, 50)).toBeLessThan(
      turnChance({ ...s, research: { ...s.research, done: ["thrall-dependence"] } }, 50),
    );
    s.research.done.push("thrall-dependence", "pastoral-theology");
    setRooms(b, "containment", 1);
    holdCaptive(s, b, "thrall", "carcassonne", "Milan", "italy");
    const support = s.regions.italy!.support;
    expect(releaseCaptive(s, b.captives![0]!.id)).toBeNull();
    expect(s.regions.italy!.support).toBeGreaterThan(support);
    setRooms(b, "chapel", 1);
    const a = s.agents.find((x) => x.baseId === b.id && x.aptitudes.faith < 100)!;
    const f = a.aptitudes.faith;
    chapelMonth(s);
    expect(a.aptitudes.faith).toBe(f + 1);
  });

  it("the spine's end: Lineages from elder samples, the Family Tree from any two, the Root Strain", () => {
    const s = quiet();
    const b = padua(s);
    scientistsAt(s, b, 2);
    setRooms(b, "bsl4", 1);
    s.research.done.push(
      "archives-1",
      "vampire-physiology",
      "vampire-physiology-2",
      "biocontainment",
      "provirus",
    );
    addStock(b, "sample-vampire-jade", 1);
    expect(researchBlocker(s, "lineage-jade")).toMatch(/an elder of The Jade Court/);
    addStock(b, "sample-elder-jade", 1);
    expect(researchBlocker(s, "lineage-jade")).toBeNull();
    expect(researchBlocker(s, "family-tree")).toBe("Not yet understood.");
    s.research.done.push("lineage-jade");
    expect(researchBlocker(s, "family-tree")).toBe("Not yet understood.");
    s.research.done.push("lineage-sahel");
    expect(researchBlocker(s, "family-tree")).toBeNull();
    const before = sectionPace(s).on("osint");
    s.research.done.push("family-tree");
    expect(sectionPace(s).on("osint")).toBeCloseTo(before * 1.05);
    expect(researchBlocker(s, "root-strain")).toMatch(/an elder of The Carcassonne Perfecti/);
    addStock(b, "sample-elder-carcassonne", 1);
    expect(researchBlocker(s, "root-strain")).toBeNull();
  });

  it("makes silencer bolts, four to a sample, only for a sequenced house", () => {
    const s = quiet();
    const b = padua(s);
    s.funds = 1e9;
    engineers(s, b, 10);
    s.research.done.push("antisense");
    expect(queueBlocker(s, "make-silencer-huaca", b.id, 5)).toBe("Not yet understood.");
    s.research.done.push("strain-huaca");
    expect(queueBlocker(s, "make-silencer-huaca", b.id, 5)).toMatch(/tissue sample.*at /);
    addStock(b, "sample-vampire-huaca", 1);
    expect(queueJob(s, "make-silencer-huaca", b.id, 5)).toBeNull();
    days(s, 30);
    // One sample makes four; the fifth waits for another.
    expect(stockAt(b, "silencer-huaca")).toBe(4);
    expect(stockAt(b, "sample-vampire-huaca")).toBe(0);
    addStock(b, "sample-vampire-huaca", 1);
    days(s, 5);
    expect(stockAt(b, "silencer-huaca")).toBe(5);
    expect(b.sampleUse?.["sample:huaca"]).toBeCloseTo(0.75);
  });

  it("makes haem serum, six doses to any tissue sample", () => {
    const s = quiet();
    const b = padua(s);
    s.funds = 1e9;
    engineers(s, b, 10);
    s.research.done.push("tissue-regeneration");
    expect(queueBlocker(s, "make-haem-serum", b.id, 6)).toMatch(/tissue sample at/);
    addStock(b, "sample-feral-jade", 1);
    expect(queueJob(s, "make-haem-serum", b.id, 6)).toBeNull();
    days(s, 20);
    expect(stockAt(b, "haem-serum")).toBe(6);
    expect(stockAt(b, "sample-feral-jade")).toBe(0);
  });

  it("opens the feral branch only with a feral sample", () => {
    const s = quiet();
    const b = padua(s);
    scientistsAt(s, b, 2);
    s.research.done.push("archives-1", "vampire-physiology", "vampire-physiology-2");
    addStock(b, "sample-vampire-huaca", 1);
    expect(researchBlocker(s, "feral-neuropathology")).toMatch(/feral vampire's tissue sample/);
    addStock(b, "sample-feral-huaca", 1);
    expect(researchBlocker(s, "feral-neuropathology")).toBeNull();
  });

  it("makes biopsy kits and silver magazines into the base's armoury", () => {
    const s = quiet();
    const b = padua(s);
    s.funds = 1e9;
    s.research.done.push("archives-1", "vampire-physiology");
    const kits = stockAt(b, "biopsy-kit");
    expect(queueJob(s, "make-biopsy-kit", b.id, 2)).toBeNull();
    expect(queueJob(s, "make-silver-pistol", b.id, 3)).toBeNull();
    days(s, 30);
    expect(stockAt(b, "biopsy-kit")).toBe(kits + 2);
    expect(stockAt(b, "mag-pistol-silver")).toBe(3);
  });

  it("fits fuel tanks to one aircraft at a time, which then reaches further", () => {
    const s = quiet();
    const b = padua(s);
    s.funds = 1e9;
    s.research.done.push("archives-1", "archives-2");
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    expect(reachOf(heli)).toBe(AIRCRAFT.helicopter.reachNm);
    expect(queueJob(s, "helicopter-tanks", b.id)).toBeNull();
    expect(queueBlocker(s, "helicopter-tanks", b.id)).toMatch(/helicopter without fuel tanks/); // promised
    days(s, 60);
    expect(heli.tanks).toBe(true);
    expect(reachOf(heli)).toBe(AIRCRAFT.helicopter.tankReachNm);
    expect(queueBlocker(s, "helicopter-tanks", b.id)).toMatch(/helicopter without fuel tanks/);
    expect(deserialize(serialize(s)).aircraft.find((a) => a.id === heli.id)!.tanks).toBe(true);
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
    s.aircraft.push({ id: "air-x", kind: "jet", name: "SERAPH-9", baseId: b.id }); // a hangar filled meanwhile
    days(s, 70);
    expect(s.aircraft.filter((a) => a.kind === "helicopter")).toHaveLength(2); // one built, one waiting
    expect(stalled(s.projects[0]!)).toBe(true);
    s.aircraft = s.aircraft.filter((a) => a.id !== "air-x");
    const titles = days(s, 2);
    expect(titles).toContain("Engineering complete: Build a helicopter");
    expect(s.aircraft.filter((a) => a.kind === "helicopter")).toHaveLength(3);
    expect(AIRCRAFT.helicopter.price).toBeGreaterThan(450_000); // cheaper than buying
  });

  it("pheromone research changes fights; armour and weapons come from items", () => {
    const s = quiet();
    expect(combatMods(s, "tactical")).toEqual({ vampireHit: 0 });
    s.research.done.push("pheromones");
    const m = combatMods(s, "tactical");
    expect(m.vampireHit).toBeGreaterThan(0);
    let base = 0,
      up = 0;
    for (let i = 0; i < 200; i++) {
      const team = () => s.agents.slice(0, 3).map((a) => ({ ...a, stats: { ...a.aptitudes } }));
      if (fight(rng({ rng: i }), team(), "tactical", { thralls: 3, vampires: 2 }, 0).won) base++;
      if (fight(rng({ rng: i }), team(), "tactical", { thralls: 3, vampires: 2 }, 0, m).won) up++;
    }
    expect(up).toBeGreaterThanOrEqual(base);
  });

  it("makes the researched armour, trauma kits and UV flares into the armoury", () => {
    const s = quiet();
    const b = padua(s);
    s.funds = 1e9;
    s.research.done.push("archives-1", "vampire-physiology", "composite-armour", "field-medicine");
    expect(visibleProjects(s, "research").map((p) => p.id)).toEqual(
      expect.arrayContaining(["bite-weave", "stf"]),
    );
    s.research.done.push("bite-weave", "stf", "boron-carbide", "combat-surgery");
    s.research.done.push("vampire-physiology-2", "uv-weaponry");
    for (const [job, item] of [
      ["make-uhmwpe-vest", "uhmwpe-vest"],
      ["make-stf-vest", "stf-vest"],
      ["make-heavy-plate", "heavy-plate"],
      ["make-trauma-kit", "trauma-kit-adv"],
      ["make-uv-flare", "uv-flare"],
    ] as const) {
      expect(queueJob(s, job, b.id)).toBeNull();
      days(s, 30);
      expect(stockAt(b, item)).toBe(1);
    }
    expect(PROJECTS.some((p) => p.id === "ceramic-plate" || p.id === "uv-munitions")).toBe(false);
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
    people.forEach((p, i) => {
      p.name = team[i]![0];
      p.aptitudes = { ...team[i]![1] };
    });
    const id = (name: string) => people.find((p) => p.name === name)!.id;
    return { s, b, id };
  };

  it("works the job at the base's summed skill; the lead's aptitudes over 50 multiply the rest", () => {
    const { s, b, id } = example();
    const plate = projectById("make-heavy-plate")!,
      retrofit = projectById("station-retrofit")!,
      heli = projectById("build-helicopter")!;
    const rate = (p: typeof plate, lead: string | null) =>
      teamOn(s, b, p, lead === null ? null : id(lead)).rate;
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
    expect(setStaffLead(s, "engineer", id("Ana"), b.id)).toBeNull();
    expect(staffLead(s, "engineer", b)?.name).toBe("Ana");
    expect(teamOn(s, b, plate).rate).toBeCloseTo(9.36);
    expect(setStaffLead(s, "engineer", null, b.id)).toBeNull();
    expect(teamOn(s, b, plate).rate).toBeCloseTo(6.84);
  });

  it("wastes less material with a better team, more with a worse one", () => {
    const s = quiet();
    const b = padua(s);
    const people = engineers(s, b, 4);
    const plate = projectById("make-heavy-plate")!;
    expect(teamOn(s, b, plate).waste).toBe(1);
    people[0]!.aptitudes = { ...flatAptitudes("engineer"), ballistics: 100 };
    setStaffLead(s, "engineer", people[0]!.id, b.id);
    expect(teamOn(s, b, plate).waste).toBe(0.75); // everyone at 100 on ballistics
    for (const p of people) p.aptitudes = flatAptitudes("engineer", 30);
    setStaffLead(s, "engineer", null, b.id);
    expect(teamOn(s, b, plate).waste).toBeCloseTo(1.1);
    // And it's what the job costs.
    for (const p of people) p.aptitudes = flatAptitudes("engineer", 100);
    s.research.done.push("boron-carbide");
    const funds = s.funds;
    expect(startProject(s, "make-heavy-plate", b.id)).toBeNull();
    for (let d = 0; d < 2; d++) dailyResearch(s); // 20 points at 12 a day
    expect(stockAt(b, "heavy-plate")).toBe(1);
    expect(funds - s.funds).toBeCloseTo(14_000 * 0.75, -2);
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
    expect(queueDays(s, q[1]!)).toBe(
      Math.ceil(
        (11 * 25 - q[0]!.progress) / teamOn(s, b, projectById("make-inserts")!).rate +
          120 / teamOn(s, b, projectById("station-retrofit")!).rate,
      ),
    );
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
    // Dragged in the list: to any place, the rest keeping their order.
    const before = engineeringQueue(s, b.id).map((a) => a.id);
    expect(placeProject(s, ins.id, 0)).toBeNull();
    expect(engineeringQueue(s, b.id).map((a) => a.id)).toEqual([
      ins.id,
      ...before.filter((id) => id !== ins.id),
    ]);
    expect(placeProject(s, ins.id, before.length)).toMatch(/Not a place/);
    expect(placeProject(s, ins.id, before.length - 1)).toBeNull();
    expect(engineeringQueue(s, b.id).at(-1)).toBe(ins);
    expect(placeProject(s, ins.id, 0)).toBeNull();
    expect(topOfQueue(s, b.id)).toBe(ins);
  });

  it("stops for want of money, says so once, and goes on when there is some", () => {
    const s = quiet();
    const b = padua(s);
    engineers(s, b, 4);
    s.research.done.push("boron-carbide");
    expect(startProject(s, "make-heavy-plate", b.id)).toBeNull();
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
      for (const v of Object.values(apt) as number[]) {
        expect(v).toBeGreaterThanOrEqual(APTITUDE_ROLL[0]);
        expect(v).toBeLessThanOrEqual(APTITUDE_ROLL[1]);
      }
    }
    refreshCandidates(s);
    const c = candidatesOf(s, "engineer")[0]!;
    expect(c.aptitudes).toBeDefined();
    expect(candidatesOf(s, "scientist")[0]!.aptitudes!.biology).toBeDefined(); // their own four
    expect(candidatesOf(s, "scientist")[0]!.aptitudes!.ballistics).toBeUndefined();
    s.funds = 1e9;
    expect(hire(s, padua(s).id, "engineer", c.id)).toBeNull();
    expect(s.staff.at(-1)!.aptitudes).toEqual(c.aptitudes);
  });

  it("a lead leads where they are: one who leaves stops leading", () => {
    const s = quiet();
    const b = padua(s);
    const other = {
      ...b,
      id: "ob-two",
      name: "Base Dallas",
      captives: [],
      remains: 0,
      upgrades: [],
      leadEngineer: undefined,
    };
    s.installations.push(other);
    const [ana] = engineers(s, b, 2);
    expect(setStaffLead(s, "engineer", ana!.id, other.id)).toMatch(
      /Not an engineer at Base Dallas/,
    );
    expect(setStaffLead(s, "engineer", ana!.id, b.id)).toBeNull();
    s.funds = 1e9;
    expect(sendByAirline(s, b.id, other.id, [ana!.id])).toBeNull();
    expect(b.leadEngineer).toBeUndefined();
  });

  it("survives a save with its lead engineer and their aptitudes", () => {
    const s = quiet();
    const b = padua(s);
    const [e] = engineers(s, b, 2, 61);
    setStaffLead(s, "engineer", e!.id, b.id);
    s.research.done.push("boron-carbide");
    startProject(s, "make-heavy-plate", b.id);
    const back = deserialize(serialize(s));
    expect(padua(back).leadEngineer).toBe(e!.id);
    expect(back.staff.find((p) => p.id === e!.id)!.aptitudes).toEqual(
      flatAptitudes("engineer", 61),
    );
  });
});

describe("SIGINT centre", () => {
  it("lets a base listen like a station, and the upgrade waits for signal analysis", () => {
    const s = quiet();
    s.funds = 1e8;
    const b = padua(s);
    expect(b.sigintCentre).toBe(1); // Padua starts with one, upstairs
    setRooms(b, "sigint", 0);
    b.sigintCentre = 0;
    const before = sigintRates(s).get(b.regionId) ?? 0;
    expect(upgradeBase(s, b.id, "sigint")).toBeNull();
    expect(upgradeBlocker(s, b.id, "sigint")).toBe("Needs Signal processing.");
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

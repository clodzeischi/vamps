import { describe, expect, it } from "vitest";
import { furnish, setRooms } from "./building";
import { isCraftDeployed, isDeployed } from "./state";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { decide, dispatch, dispatchBlocker, dropHaul, finishHaul, recallTeam, haulSeats, joinable, moveHaul, startMission, type DispatchPlan } from "./missions";
import { acquireAircraft, enlist } from "./personnel";
import type { GameState, Installation } from "./state";
import { DAY } from "./time";

const MILAN = { lat: 45.46, lon: 9.19 };

function setup(seed = 1, lifeDays = 12) {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15;
  s.funds = 1e8;
  const padua = s.installations.find((i) => i.kind === "base")!;
  const belgrade: Installation = { id: "ob-belgrade", kind: "base", name: "Base Belgrade", regionId: "balkans", pos: { lat: 44.8, lon: 20.46 },
    readyAt: s.time, evictionWarned: false, hangars: 2, remains: 0, captives: [], upgrades: [] };
  furnish(belgrade, { quarters: 16, containment: 1 });
  s.installations.push(belgrade);
  setRooms(padua, "containment", 1);
  expect(acquireAircraft(s, belgrade.id, "helicopter", true)).toBeNull();
  while (s.agents.length < 6) enlist(s, padua.id, "operator"); // three a side
  for (const a of s.agents.slice(3)) a.baseId = belgrade.id;
  s.sites.push({ id: "site-t", bloodline: "carcassonne", kind: "den", regionId: "italy", city: "Milan", pos: MILAN, revealedAt: s.time, expiresAt: s.time + lifeDays * DAY, thralls: 3, vampires: 2, missionId: null, netId: "net-t" });
  const heliAt = (b: Installation) => s.aircraft.find((a) => a.baseId === b.id && a.kind === "helicopter")!.id;
  const plan = (b: Installation, kit: DispatchPlan["kit"] = "tactical"): DispatchPlan => ({
    target: { kind: "site", id: "site-t" }, baseId: b.id, aircraftId: heliAt(b), kit,
    agentIds: s.agents.filter((a) => a.baseId === b.id).map((a) => a.id),
  });
  return { s, padua, belgrade, plan };
}
/** Runs until an event of `kind` is first (dismissing others), or the days run out. */
function until(s: GameState, kind: string, days = 3) {
  const end = s.time + days * DAY;
  while (s.time < end) {
    if (s.events[0]?.kind === kind) return s.events[0];
    if (s.events.length) { dismissEvent(s); continue; }
    advance(s, end - s.time);
  }
  return s.events[0]?.kind === kind ? s.events[0] : undefined;
}

describe("teams joining a mission (Phoenix Point style)", () => {
  it("lands, waits for the second team, then starts with everyone; each flies home to its own base", () => {
    const { s, padua, belgrade, plan } = setup();
    expect(dispatch(s, plan(padua))).toBeNull();
    expect(dispatchBlocker(s, plan(belgrade, "civilian"))).toMatch(/same kit/);
    expect(dispatch(s, plan(belgrade))).toBeNull();
    const m = s.missions[0]!;
    expect(m.wings).toHaveLength(1);
    // Padua is closer: its team lands first and may wait.
    until(s, "arrival");
    expect(m.baseId).toBe(padua.id);
    expect(m.decision!.options.map((o) => o.id)).toContain("wait");
    expect(decide(s, m.id, "wait")).toBeNull();
    expect(m.waiting).toBe(true);
    // A save while holding keeps everything.
    expect(deserialize(serialize(s)).missions[0]!.wings).toHaveLength(1);
    // The Belgrade team lands: the orders come again, with six on the ground and no "wait".
    until(s, "arrival");
    expect(m.agentIds).toHaveLength(6);
    expect(m.decision!.options.map((o) => o.id)).not.toContain("wait");
    expect(decide(s, m.id, "midday")).toBeNull();
    until(s, "debrief");
    until(s, "never", 2);
    expect(s.missions).toHaveLength(0);
    for (const a of s.aircraft) expect(isCraftDeployed(s, a)).toBe(false);
    expect(s.agents.length + s.fallen.length).toBe(6); // everyone accounted for
    // Belgrade's team went home to Belgrade, unless its helicopter burned (then it rode with Padua's).
    if (s.aircraft.some((a) => a.kind === "helicopter" && a.baseId === belgrade.id))
      expect(s.agents.filter((a) => a.baseId === belgrade.id).length + s.fallen.length).toBeGreaterThanOrEqual(3);
  });

  it("starts with whoever is on the ground; a team still flying turns back", () => {
    const { s, padua, belgrade, plan } = setup(2);
    dispatch(s, plan(padua));
    dispatch(s, plan(belgrade));
    const m = s.missions[0]!;
    until(s, "arrival");
    expect(decide(s, m.id, "midday")).toBeNull();
    // The Belgrade team went home on its own flight, without fighting.
    const back = s.missions.find((x) => x !== m && x.baseId === belgrade.id);
    expect(back?.phase).toBe("returning");
    expect(m.agentIds).toHaveLength(3);
    until(s, "never", 2);
    expect(s.agents.filter((a) => a.baseId === belgrade.id && !isDeployed(s, a))).toHaveLength(3);
  });

  it("a team that lands first takes the lead", () => {
    const { s, padua, belgrade, plan } = setup(3);
    dispatch(s, plan(belgrade)); // farther: it leads on paper, but lands second
    dispatch(s, plan(padua));
    const m = s.missions[0]!;
    expect(m.baseId).toBe(belgrade.id);
    until(s, "arrival");
    expect(m.baseId).toBe(padua.id); // Padua landed first and became the team
    expect(m.wings![0]!.baseId).toBe(belgrade.id);
    expect(m.wings![0]!.landed).toBe(false);
  });

  it("holding on the ground doesn't keep the target: it can still go cold", () => {
    const { s, padua, belgrade, plan } = setup(4, 0.2); // the den moves on in under five hours
    dispatch(s, plan(padua));
    const m = s.missions[0]!;
    m.wings = []; // nobody else is coming, but hold anyway:
    until(s, "arrival");
    m.decision!.options.push({ id: "wait", label: "Wait", detail: "", odds: null });
    expect(decide(s, m.id, "wait")).toBeNull();
    expect(startMission(s, "nope")).toMatch(/not waiting/);
    expect(until(s, "info", 1)?.title).toMatch(/Gone cold/);
    expect(m.phase).toBe("returning");
    void belgrade;
  });

  it("after the fight, the haul can be moved between aircraft before take-off", () => {
    let checked = 0;
    for (let seed = 1; seed <= 12 && !checked; seed++) {
      const { s, padua, belgrade, plan } = setup(seed);
      dispatch(s, plan(padua));
      dispatch(s, plan(belgrade));
      const m = s.missions[0]!;
      until(s, "arrival");
      decide(s, m.id, "wait");
      until(s, "arrival");
      decide(s, m.id, "midday");
      if (!until(s, "haul", 1)) continue; // nothing to carry this time
      expect(m.haul).toBe(true);
      expect(joinable(m)).toBe(false);
      const seats = haulSeats(s, m);
      const withBody = seats.find((x) => (x.a.cargo?.remains ?? 0) > 0);
      const other = seats.find((x) => x !== withBody);
      if (withBody && other && other.room >= 2) {
        const before = other.a.cargo?.remains ?? 0;
        expect(moveHaul(s, m.id, withBody.a.id, other.a.id)).toBeNull();
        expect(other.a.cargo!.remains).toBe(before + 1);
      }
      expect(moveHaul(s, m.id, padua.id, belgrade.id)).toMatch(/two aircraft/);
      expect(finishHaul(s, m.id)).toBeNull();
      expect(s.missions.every((x) => x.phase === "returning")).toBe(true);
      until(s, "never", 2);
      expect(s.aircraft.every((a) => !isCraftDeployed(s, a) && !a.cargo)).toBe(true);
      checked++;
    }
    expect(checked).toBe(1);
  });

  it("turns a team back on its way: alone, or handing the lead to the team behind", () => {
    const { s, padua, belgrade, plan } = setup(5);
    dispatch(s, plan(padua));
    const m = s.missions[0]!;
    expect(recallTeam(s, m.id)).toBeNull();
    expect(m.phase).toBe("returning");
    expect(s.sites[0]!.missionId).toBeNull(); // open for another try
    until(s, "never", 1);
    expect(s.agents.filter((a) => a.baseId === padua.id && !isDeployed(s, a))).toHaveLength(3);
    // Now two teams; recalling the lead hands the mission to Belgrade's.
    dispatch(s, plan(padua));
    dispatch(s, plan(belgrade));
    const m2 = s.missions.find((x) => x.phase === "outbound")!;
    expect(recallTeam(s, m2.id)).toBeNull();
    expect(m2.baseId).toBe(belgrade.id);
    expect(m2.phase).toBe("outbound");
    expect(m2.wings ?? []).toHaveLength(0);
    expect(s.missions.some((x) => x !== m2 && x.baseId === padua.id && x.phase === "returning")).toBe(true);
  });

  it("burns a body or lets a captive go to make room", () => {
    const { s, padua, belgrade, plan } = setup(1);
    dispatch(s, plan(padua));
    dispatch(s, plan(belgrade));
    const m = s.missions[0]!;
    m.haul = true;
    const heli = s.aircraft.find((a) => a.id === m.aircraftId)!;
    heli.cargo = { remains: 2, captives: [{ id: "c1", kind: "thrall", bloodline: "carcassonne", takenAt: s.time, city: "Milan" }] };
    expect(dropHaul(s, m.id, heli.id)).toBeNull();
    expect(heli.cargo.remains).toBe(1);
    expect(dropHaul(s, m.id, heli.id, "c1")).toBeNull();
    expect(heli.cargo.captives).toHaveLength(0);
    expect(dropHaul(s, m.id, heli.id)).toBeNull();
    expect(heli.cargo).toBeUndefined();
  });
});

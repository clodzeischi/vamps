import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { decide, dispatch, dispatchBlocker, startMission, type DispatchPlan } from "./missions";
import { acquireAircraft } from "./personnel";
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
    readyAt: s.time, evictionWarned: false, hangars: 2, quarters: 16, labs: 0, workshops: 0, containment: 1, remains: 0, captives: [], upgrades: [] };
  s.installations.push(belgrade);
  padua.containment = 1;
  expect(acquireAircraft(s, belgrade.id, "helicopter", true)).toBeNull();
  for (const a of s.agents.slice(3)) a.baseId = belgrade.id;
  s.sites.push({ id: "site-t", bloodline: "carcassonne", kind: "den", regionId: "italy", city: "Milan", pos: MILAN, revealedAt: s.time, expiresAt: s.time + lifeDays * DAY, thralls: 3, vampires: 2, missionId: null });
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
    for (const a of s.aircraft) expect(a.deployed).toBe(false);
    expect(s.agents.filter((a) => a.baseId === belgrade.id).length + s.fallen.length).toBeGreaterThanOrEqual(3);
    expect(s.aircraft.find((a) => a.kind === "helicopter" && a.baseId === belgrade.id) ?? s.fallen).toBeTruthy();
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
    expect(s.agents.filter((a) => a.baseId === belgrade.id && !a.deployed)).toHaveLength(3);
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
});

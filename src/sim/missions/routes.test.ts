import { openCase } from "../intel/intel";
import { describe, expect, it } from "vitest";
import { AIRCRAFT } from "../../data/aircraft";
import { newCampaign } from "../campaign/campaign";
import { distanceNm } from "../core/geo";
import { dispatch, dispatchBlocker } from "./dispatch";
import { missionLeg } from "./missions";
import { startReturn } from "./haul";
import { basesInReach } from "../people/personnel";
import { planRoute, REFUEL_HOURS } from "./routes";
import { HOUR } from "../core/time";

const PADUA = { lat: 45.41, lon: 11.88 };
// Lisbon, about 1,000 nm from Padua: out of a helicopter's 900 nm.
const LISBON = { lat: 38.72, lon: -9.14 };
// Barcelona: about halfway.
const BARCELONA = { lat: 41.39, lon: 2.17 };

function withStation() {
  const s = newCampaign("inquisitor", 1);
  s.installations.push({
    id: "fuel-t",
    kind: "fuel",
    name: "Airstrip Barcelona",
    regionId: "iberia",
    pos: BARCELONA,
    readyAt: 0,
    evictionWarned: false,
  });
  return s;
}

describe("refuelling stations", () => {
  it("let a helicopter reach past its range, with a stop on the way", () => {
    expect(distanceNm(PADUA, LISBON)).toBeGreaterThan(AIRCRAFT.helicopter.reachNm);
    const bare = newCampaign("inquisitor", 1);
    expect(planRoute(bare, PADUA, LISBON, "helicopter")).toBeNull();
    const s = withStation();
    const r = planRoute(s, PADUA, LISBON, "helicopter")!;
    expect(r.stops.map((x) => x.id)).toEqual(["fuel-t"]);
    expect(r.hours).toBeCloseTo(r.distance / AIRCRAFT.helicopter.speedKn + REFUEL_HOURS, 5);
    // In reach direct: no stop.
    expect(planRoute(s, PADUA, BARCELONA, "helicopter")!.stops).toHaveLength(0);
  });

  it("route a mission through the stop, out and home, and show it on the globe leg by leg", () => {
    const s = withStation();
    s.leads.push({
      id: "lead-t",
      opId: "op-t",
      kind: "surveillance",
      regionId: "iberia",
      pos: LISBON,
      city: "Lisbon",
      appearedAt: s.time,
      expiresAt: s.time + 400 * HOUR,
      intel: 0.6,
      title: "Test",
      text: "",
      missionId: null,
      caseId: openCase(s, true, 0.75).id,
      via: "sigint",
    });
    s.operations.push({
      id: "op-t",
      bloodline: "carcassonne",
      kind: "feeding",
      regionId: "iberia",
      pos: LISBON,
      city: "Lisbon",
      startedAt: s.time,
      endsAt: s.time + 400 * HOUR,
      leadId: "lead-t",
    });
    expect(basesInReach(s, LISBON).map((b) => b.base.id)).toContain("ob-padua");
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const plan = {
      target: { kind: "lead" as const, id: "lead-t" },
      baseId: "ob-padua",
      aircraftId: heli.id,
      agentIds: [s.agents[0]!.id],
      kit: "plainclothes" as const,
    };
    expect(dispatchBlocker(s, plan)).toBeNull();
    expect(dispatch(s, plan)).toBeNull();
    const m = s.missions.at(-1)!;
    expect(m.legs).toHaveLength(2);
    expect(m.legs![1]!.start - m.legs![0]!.end).toBe(REFUEL_HOURS * HOUR);
    expect(m.legs![1]!.end).toBe(m.arriveAt);
    // While refuelling, the globe shows the next leg, not yet begun.
    expect(missionLeg(m, m.legs![0]!.end + HOUR)).toBe(m.legs![1]);
    startReturn(s, m);
    expect(m.legs).toHaveLength(2);
    expect(m.legs![1]!.to).toEqual(s.installations.find((i) => i.id === "ob-padua")!.pos);
  });

  it("end a mission with nobody left on a hired flight; our own aircraft still comes home empty", () => {
    const s = withStation();
    s.leads.push({
      id: "lead-t",
      opId: "op-t",
      kind: "surveillance",
      regionId: "iberia",
      pos: BARCELONA,
      city: "Barcelona",
      appearedAt: s.time,
      expiresAt: s.time + 400 * HOUR,
      intel: 0.6,
      title: "Test",
      text: "",
      missionId: null,
      caseId: openCase(s, true, 0.75).id,
      via: "sigint",
    });
    s.operations.push({
      id: "op-t",
      bloodline: "carcassonne",
      kind: "feeding",
      regionId: "iberia",
      pos: BARCELONA,
      city: "Barcelona",
      startedAt: s.time,
      endsAt: s.time + 400 * HOUR,
      leadId: "lead-t",
    });
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    expect(
      dispatch(s, {
        target: { kind: "lead", id: "lead-t" },
        baseId: "ob-padua",
        aircraftId: heli.id,
        agentIds: [s.agents[0]!.id],
        kit: "plainclothes",
      }),
    ).toBeNull();
    const own = s.missions.at(-1)!;
    own.agentIds = [];
    startReturn(s, own);
    expect(own.phase).toBe("returning");
    expect(s.missions).toContain(own);
    // The same, but they flew charter: nobody flies home.
    own.aircraftId = "charter";
    startReturn(s, own);
    expect(s.missions).not.toContain(own);
  });
});

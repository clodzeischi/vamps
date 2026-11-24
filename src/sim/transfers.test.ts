import { describe, expect, it } from "vitest";
import { furnish, setRooms } from "./building";
import { isCraftDeployed, isDeployed } from "./state";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { freeCells, occupantsAt, setStaff, staffAt } from "./personnel";
import type { GameState, Installation } from "./state";
import { stockAt } from "./equipment";
import { AIRLINE_FEE, airlineBlocker, courierBlocker, ferry, ferryBlocker, movablePeople, redirectBlocker, redirectFerry, sendByAirline, sendByCourier } from "./transfers";
import { DAY } from "./time";

function setup() {
  const s = newCampaign("inquisitor", 3);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15;
  s.funds = 1e8;
  const padua = s.installations.find((i) => i.kind === "base")!;
  setStaff(s, padua, "scientist", 4); // a full helicopter's worth of people at Padua
  const vienna: Installation = { id: "ob-vienna", kind: "base", name: "Base Vienna", regionId: padua.regionId, pos: { lat: 48.2, lon: 16.4 },
    readyAt: s.time, evictionWarned: false, hangars: 2, remains: 0, captives: [], upgrades: [] };
  furnish(vienna, { quarters: 16, lab: 1 });
  s.installations.push(vienna);
  return { s, padua, vienna };
}
function run(s: GameState, days: number) {
  const end = s.time + days * DAY;
  while (s.time < end) { if (s.events.length) { dismissEvent(s); continue; } advance(s, end - s.time); }
}

describe("transfers", () => {
  it("ferries an aircraft with people aboard; beds move at departure", () => {
    const { s, padua, vienna } = setup();
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const people = movablePeople(s, padua.id);
    const ids = people.filter((x) => x.kind === "agent").slice(0, 3).map((x) => x.p.id);
    const sci = people.find((x) => x.kind === "staff" && x.p.role === "scientist")!.p.id;
    expect(ferryBlocker(s, heli.id, vienna.id, people.slice(0, 9).map((x) => x.p.id))).toBe("Over capacity.");
    expect(ferry(s, heli.id, vienna.id, [...ids, sci])).toBeNull();
    expect(occupantsAt(s, vienna.id)).toBe(4);
    expect(staffAt(s, vienna, "scientist")).toBe(0); // not there yet
    expect(isCraftDeployed(s, heli)).toBe(true);
    expect(ferryBlocker(s, heli.id, padua.id, [])).toBe("The aircraft is away.");
    // Survives a save on the way.
    const back = deserialize(serialize(s));
    expect(back.aircraft.find((a) => a.id === heli.id)!.ferry).toBeTruthy();
    run(s, 1);
    expect(isCraftDeployed(s, heli)).toBe(false);
    expect(heli.ferry).toBeUndefined();
    expect(staffAt(s, vienna, "scientist")).toBe(1);
    expect(s.agents.filter((a) => ids.includes(a.id)).every((a) => a.baseId === vienna.id && !isDeployed(s, a))).toBe(true);
  });

  it("sends people by airline for a fee, and won't overfill beds", () => {
    const { s, padua, vienna } = setup();
    const ids = movablePeople(s, padua.id).filter((x) => x.kind === "agent").slice(0, 2).map((x) => x.p.id);
    const funds = s.funds;
    expect(sendByAirline(s, padua.id, vienna.id, ids)).toBeNull();
    expect(s.funds).toBe(funds - 2 * AIRLINE_FEE);
    setRooms(vienna, "quarters", 0); // no beds left
    const more = movablePeople(s, padua.id).slice(0, 1).map((x) => x.p.id);
    expect(airlineBlocker(s, padua.id, vienna.id, more)).toMatch(/beds/);
    run(s, 2);
    expect(s.agents.filter((a) => ids.includes(a.id)).every((a) => !isDeployed(s, a) && a.baseId === vienna.id)).toBe(true);
  });

  it("carries remains by helicopter only and captives into kept cells, unloading on landing", () => {
    const { s, padua, vienna } = setup();
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const jet = s.aircraft.find((a) => a.kind === "jet")!;
    padua.remains = 3;
    padua.captives = [{ id: "cap-1", kind: "thrall", bloodline: "carcassonne", takenAt: s.time, city: "Milan" }];
    setRooms(vienna, "containment", 1);
    expect(ferryBlocker(s, jet.id, vienna.id, [], { remains: 1, captives: [] })).toMatch(/helicopter/);
    // 3 remains (6) + a captive (2) = 8: full.
    const one = movablePeople(s, padua.id).slice(0, 1).map((x) => x.p.id);
    expect(ferryBlocker(s, heli.id, vienna.id, one, { remains: 3, captives: ["cap-1"] })).toBe("Over capacity.");
    expect(ferry(s, heli.id, vienna.id, [], { remains: 3, captives: ["cap-1"] })).toBeNull();
    expect(padua.remains).toBe(0);
    expect(padua.captives).toHaveLength(0);
    expect(freeCells(vienna, s)).toBe(2); // one of three kept for the captive aboard
    run(s, 1);
    expect(vienna.remains).toBe(3);
    expect(vienna.captives?.map((x) => x.id)).toEqual(["cap-1"]);
    expect(heli.cargo).toBeUndefined();
  });

  it("changes a transfer flight's course in the air; beds move with it", () => {
    const { s, padua, vienna } = setup();
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const ids = movablePeople(s, padua.id).filter((x) => x.kind === "agent").slice(0, 2).map((x) => x.p.id);
    expect(ferry(s, heli.id, vienna.id, ids)).toBeNull();
    s.time += 30 * 60_000;
    expect(redirectBlocker(s, heli.id, vienna.id)).toMatch(/already bound/);
    expect(redirectFerry(s, heli.id, padua.id)).toBeNull(); // back home
    expect(heli.baseId).toBe(padua.id);
    expect(occupantsAt(s, vienna.id)).toBe(0);
    run(s, 1);
    expect(isCraftDeployed(s, heli)).toBe(false);
    expect(s.agents.filter((a) => ids.includes(a.id)).every((a) => a.baseId === padua.id && !isDeployed(s, a))).toBe(true);
  });

  it("carries armoury crates aboard (a quarter seat each), and trauma kits by courier", () => {
    const { s, padua, vienna } = setup();
    const heli = s.aircraft.find((a) => a.kind === "helicopter")!;
    const rifles = stockAt(padua, "rifle");
    // 8 people would fill it; 7 and four crates is exactly full.
    const seven = movablePeople(s, padua.id).slice(0, 7).map((x) => x.p.id);
    expect(ferryBlocker(s, heli.id, vienna.id, seven, { remains: 0, captives: [], items: { rifle: 5 } })).toBe("Over capacity.");
    expect(ferry(s, heli.id, vienna.id, seven, { remains: 0, captives: [], items: { rifle: 4 } })).toBeNull();
    expect(stockAt(padua, "rifle")).toBe(rifles - 4);
    run(s, 1);
    expect(stockAt(vienna, "rifle")).toBe(4);
    // Courier: no weapons; trauma kits yes.
    expect(courierBlocker(s, padua.id, vienna.id, { rifle: 1 })).toMatch(/courier/);
    const kits = stockAt(padua, "medkit");
    expect(sendByCourier(s, padua.id, vienna.id, { medkit: 2 })).toBeNull();
    expect(stockAt(padua, "medkit")).toBe(kits - 2);
    expect(deserialize(serialize(s)).shipments).toHaveLength(1);
    run(s, 3);
    expect(stockAt(vienna, "medkit")).toBe(2);
    expect(s.shipments).toHaveLength(0);
  });
});

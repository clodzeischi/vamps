import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { aliveBloodlines, boldness, destroyBloodline, isDestroyed } from "./bloodlines";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { decide, dispatch, type DispatchPlan } from "./missions";
import { addIntel, type GameState } from "./state";
import { DAY } from "./time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  return s;
};

function until(s: GameState, kind: string, days = 5) {
  const end = s.time + days * DAY;
  while (s.time < end) {
    if (s.events[0]?.kind === kind) return s.events[0];
    if (s.events.length) { dismissEvent(s); continue; }
    advance(s, end - s.time);
  }
  return s.events[0]?.kind === kind ? s.events[0] : undefined;
}

describe("bloodlines", () => {
  it("intel at 100 finds the lair; Montségur for the Perfecti", () => {
    const s = quiet();
    s.intel.carcassonne = 99;
    until(s, "none", 2);
    expect(s.bloodlines.carcassonne!.lairId).toBeNull();
    while ((s.intel.carcassonne ?? 0) < 100) addIntel(s, "carcassonne", 5);
    const e = until(s, "site", 2)!;
    expect(e.title).toMatch(/Montségur/);
    const lair = s.sites.find((x) => x.id === s.bloodlines.carcassonne!.lairId)!;
    expect(lair.kind).toBe("lair");
    expect(deserialize(serialize(s)).bloodlines.carcassonne!.lairId).toBe(lair.id);
  });

  it("a won assault on the lair destroys the bloodline; a failed one leaves it standing", () => {
    for (const [label, strong] of [["strong", true], ["weak", false]] as const) {
      const s = quiet(3);
      s.intel.jade = 100;
      until(s, "site", 2);
      const lair = s.sites.find((x) => x.kind === "lair")!;
      // Fly in from Padua by jet: everyone, veterans or not.
      lair.pos = { lat: 45.5, lon: 12.0 }; // next door, for the test
      for (const a of s.agents) if (strong) Object.assign(a.stats, { combat: 90, faith: 90, vitality: 90 }), (a.hp = 90);
      s.agents.push(...(strong ? s.agents.map((a) => ({ ...a, id: a.id + "b", stats: { ...a.stats } })) : []));
      const jet = s.aircraft.find((a) => a.kind === "jet")!;
      const p: DispatchPlan = { target: { kind: "site", id: lair.id }, baseId: "ob-padua", aircraftId: jet.id, agentIds: s.agents.slice(0, strong ? 12 : 2).map((a) => a.id), kit: strong ? "tactical" : "civilian" };
      expect(dispatch(s, p), label).toBeNull();
      until(s, "arrival");
      decide(s, s.missions[0]!.id, "night");
      const debrief = until(s, "debrief", 3)!;
      if (strong) {
        expect(debrief.title).toMatch(/Success/);
        dismissEvent(s);
        expect(s.events[0]?.kind).toBe("sigil");
        expect(isDestroyed(s, "jade")).toBe(true);
        expect(s.sites.some((x) => x.kind === "lair")).toBe(false);
        expect(aliveBloodlines(s).map((b) => b.id)).not.toContain("jade");
        expect(boldness(s)).toBeGreaterThan(1);
      } else {
        expect(debrief.title).toMatch(/Failure/);
        expect(isDestroyed(s, "jade")).toBe(false);
        expect(s.sites.find((x) => x.id === lair.id)?.missionId).toBeNull(); // still there, open to another try
      }
    }
  });

  it("a destroyed bloodline launches nothing more and its homelands recover a little", () => {
    const s = newCampaign("inquisitor", 5);
    const before = s.regions.brazil!.support;
    destroyBloodline(s, "huaca");
    expect(s.regions.brazil!.support).toBeGreaterThan(before);
    until(s, "none", 30);
    expect(s.operations.some((o) => o.bloodline === "huaca")).toBe(false);
  });
});

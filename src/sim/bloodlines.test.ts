import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { BLOODLINES } from "../data/bloodlines";
import { REGIONS } from "../data/regions";
import { aliveBloodlines, boldness, destroyBloodline, isDestroyed, ownerOf } from "./bloodlines";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { decide, dispatch, type DispatchPlan } from "./missions";
import type { GameState } from "./state";
import { DAY } from "./time";

const quiet = (seed = 1) => {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));
  s.coverUps = [];
  s.story.fallAt = 8.64e15; // Padua stands (sim/story.ts has its own tests)
  return s;
};

/** Two of a house's dens burned: what finds its lair. */
const burnDens = (s: GameState, id: string) => {
  for (const d of s.networks[id]!.sites.filter((x) => x.kind === "den").slice(0, 2)) d.raided = true;
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
  it("two dens burned find the lair; Montségur for the Perfecti, but only in Act 3", () => {
    const s = quiet();
    s.networks.carcassonne!.sites.find((x) => x.kind === "den")!.raided = true;
    s.story.act = 3;
    until(s, "none", 2);
    expect(s.bloodlines.carcassonne!.lairId).toBeNull(); // one den isn't enough
    s.story.act = 1;
    burnDens(s, "carcassonne");
    until(s, "none", 2);
    expect(s.bloodlines.carcassonne!.lairId).toBeNull(); // Agnes is out of reach until the return
    s.story.act = 3;
    const e = until(s, "site", 2)!;
    expect(e.title).toMatch(/Montségur/);
    const lair = s.sites.find((x) => x.id === s.bloodlines.carcassonne!.lairId)!;
    expect(lair.kind).toBe("lair");
    expect(deserialize(serialize(s)).bloodlines.carcassonne!.lairId).toBe(lair.id);
  });

  it("a won assault on the lair destroys the bloodline; a failed one leaves it standing", () => {
    for (const [label, strong] of [["strong", true], ["weak", false]] as const) {
      const s = quiet(3);
      burnDens(s, "jade");
      until(s, "site", 2);
      const lair = s.sites.find((x) => x.kind === "lair")!;
      // Fly in from Padua by jet: everyone, veterans or not.
      lair.pos = { lat: 45.5, lon: 12.0 }; // next door, for the test
      for (const a of s.agents) if (strong) Object.assign(a.aptitudes, { combat: 90, faith: 90, vitality: 90 }), (a.hp = 90);
      s.agents.push(...(strong ? ["b", "c"].flatMap((t) => s.agents.map((a) => ({ ...a, id: a.id + t, stats: { ...a.aptitudes } }))) : []));
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

  it("are territorial: every region is one line's, and a line operates only in its own", () => {
    for (const r of REGIONS) expect(BLOODLINES.filter((b) => b.homeRegions.includes(r.id))).toHaveLength(1);
    const s = newCampaign("inquisitor", 7);
    s.story.fallAt = 8.64e15;
    const seen = new Set<string>();
    const end = s.time + 120 * DAY;
    while (s.time < end) {
      for (const o of s.operations) {
        seen.add(o.id);
        expect(ownerOf(o.regionId)).toBe(o.bloodline);
      }
      if (s.events.length) { dismissEvent(s); continue; }
      advance(s, Math.min(DAY, end - s.time));
    }
    expect(seen.size).toBeGreaterThan(20);
  });
});

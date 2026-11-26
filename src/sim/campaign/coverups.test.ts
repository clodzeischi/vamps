import { primaryStat } from "../intel/judged";
import { isDeployed } from "../core/state";
import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "../core/clock";
import { coverUpBlocker, coverUpChance, dailyCoverUps, declineCoverUp, offerChance, startCoverUp } from "./coverups";
import { monthEnd } from "../economy/economy";
import { dailyMedia, mediaCost, setMedia } from "./media";
import { changeSecrecy } from "./secrecy";
import type { GameState } from "../core/state";
import { DAY } from "../core/time";

function play(s: GameState, days: number) {
  const end = s.time + days * DAY;
  while (s.time < end && !s.gameOver) {
    advance(s, end - s.time);
    while (s.events.length) dismissEvent(s);
  }
}

/** Forces an offer (agents needed or not) and returns it. */
function anOffer(s: GameState, agents?: number) {
  for (let i = 0; i < 500; i++) {
    s.heat = 10;
    s.coverUps = s.coverUps.filter((c) => agents === undefined || c.agents === agents);
    dailyCoverUps(s);
    s.events = [];
    const c = s.coverUps.find((x) => agents === undefined || x.agents === agents);
    if (c) return c;
  }
  throw new Error("no offer");
}

describe("cover-ups", () => {
  it("trickle in on their own, and lapse if not taken", () => {
    const s = newCampaign("inquisitor", 3);
    let offered = 0;
    const end = s.time + 120 * DAY;
    while (s.time < end) {
      advance(s, end - s.time);
      while (s.events.length) {
        if (s.events[0]!.kind === "coverup") offered++;
        dismissEvent(s);
      }
    }
    expect(offered).toBeGreaterThanOrEqual(2);
    expect(s.coverUps.filter((c) => !c.startedAt).length).toBeLessThanOrEqual(3);
    expect(s.coverUps.every((c) => c.expiresAt > s.time)).toBe(true);
  });

  it("come more often after noise, and follow the incident", () => {
    const s = newCampaign("inquisitor", 4);
    const quiet = offerChance(s);
    changeSecrecy(s, -6, "test", { regionId: "iberia", city: "Seville", pos: { lat: 37.4, lon: -6 } });
    expect(offerChance(s)).toBeGreaterThan(quiet + 0.1);
    expect(s.lastIncident?.city).toBe("Seville");
    // Three times in four, while it's hot, the offer is about the incident.
    let followed = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const t = newCampaign("inquisitor", seed);
      changeSecrecy(t, -6, "test", { regionId: "iberia", city: "Seville", pos: { lat: 37.4, lon: -6 } });
      if (anOffer(t).regionId === "iberia") followed++;
    }
    expect(followed).toBeGreaterThanOrEqual(14);
  });

  it("cost money and agents, and buy back secrecy", () => {
    const s = newCampaign("inquisitor", 5);
    const c = anOffer(s, 1);
    expect(coverUpBlocker(s, c, [])).toMatch(/one operative/);
    const agent = s.agents[0]!;
    agent.aptitudes[primaryStat(c.weights)] = 95;
    expect(coverUpChance(c, [agent])).toBeGreaterThan(0.85);
    s.secrecy = 50;
    const funds = s.funds;
    expect(startCoverUp(s, c.id, [agent.id])).toBeNull();
    expect(s.funds).toBe(funds - c.cost);
    expect(isDeployed(s, agent)).toBe(true);
    expect(startCoverUp(s, c.id, [agent.id])).toMatch(/under way/);
    // Mid-operation saves keep it running.
    const back = deserialize(serialize(s));
    expect(back.coverUps.find((x) => x.id === c.id)?.agentIds).toEqual([agent.id]);
    expect(isDeployed(back, back.agents.find((a) => a.id === agent.id)!)).toBe(true);
    s.coverUps = s.coverUps.filter((x) => x.id === c.id);
    let result = "";
    const end = s.time + (c.days + 1) * DAY;
    while (s.time < end) {
      advance(s, end - s.time);
      while (s.events.length) {
        if (s.events[0]!.kind === "coverup-result") result = s.events[0]!.title;
        dismissEvent(s);
      }
    }
    expect(result).not.toBe("");
    expect(isDeployed(s, agent)).toBe(false);
    if (result.startsWith("Covered up")) expect(s.secrecy).toBeGreaterThan(50);
  });

  it("can fail or backfire", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80 && seen.size < 3; seed++) {
      const s = newCampaign("grand", seed);
      const c = anOffer(s, 1);
      const agent = s.agents[0]!;
      agent.aptitudes[primaryStat(c.weights)] = 10;
      // Only hard jobs backfire: make every other one very hard, so the test doesn't hang on the tier roll.
      if (seed % 2) c.tier = "very-hard";
      s.coverUps = [c];
      startCoverUp(s, c.id, [agent.id]);
      play(s, c.days + 1);
      const outcome = s.log.map((l) => l.text.split(":")[0]!).find((t) => ["Covered up", "Cover-up failed", "Cover-up backfired"].includes(t));
      seen.add(outcome!);
    }
    expect(seen).toEqual(new Set(["Covered up", "Cover-up failed", "Cover-up backfired"]));
  });

  it("can be declined", () => {
    const s = newCampaign("inquisitor", 6);
    const c = anOffer(s);
    declineCoverUp(s, c.id);
    expect(s.coverUps.some((x) => x.id === c.id)).toBe(false);
  });
});

describe("media campaigns", () => {
  it("are paid daily, raise support, and show in the report", () => {
    const s = newCampaign("inquisitor", 7);
    s.regions.balkans!.support = 0;
    s.regions.italy!.support = 4.5;
    expect(setMedia(s, "balkans", 2)).toBeNull();
    expect(setMedia(s, "italy", 2)).toBeNull();
    const funds = s.funds;
    for (let d = 0; d < 30; d++) dailyMedia(s);
    expect(funds - s.funds).toBeCloseTo(mediaCost("balkans", 2) + mediaCost("italy", 2), -1);
    expect(s.regions.balkans!.support).toBeGreaterThan(0.6);
    // Little left to win where they already love us.
    expect(s.regions.italy!.support - 4.5).toBeLessThan(0.25);
    monthEnd(s);
    expect(s.lastReport!.media).toBe(Math.round(mediaCost("balkans", 2) + mediaCost("italy", 2)));
    expect(s.mediaSpent).toBe(0);
    setMedia(s, "italy", null);
    expect(s.media).toEqual({ balkans: 2 });
  });

  it("saturation costs a little secrecy", () => {
    const s = newCampaign("inquisitor", 8);
    setMedia(s, "iberia", 3);
    const before = s.secrecy;
    for (let d = 0; d < 30; d++) dailyMedia(s);
    expect(before - s.secrecy).toBeCloseTo(0.6, 5);
  });
});

describe("calling off a cover-up", () => {
  it("frees the agents, costs a little secrecy, and never rolls", async () => {
    const { newCampaign } = await import("./campaign");
    const { abortCoverUp, ABORT_SECRECY, startCoverUp } = await import("./coverups");
    const s = newCampaign("inquisitor", 4);
    s.funds = 1e8;
    s.coverUps = [{
      id: "cover-t", template: "evidence", title: "Test", text: "", regionId: "italy", city: "Milan", pos: { lat: 45, lon: 9 },
      offeredAt: s.time, expiresAt: s.time + 9e8, cost: 100_000, days: 3, agents: 1, kind: "coverup", tier: "routine", weights: { tradecraft: 1 }, gain: 3,
      agentIds: [], startedAt: 0, doneAt: 0,
    }];
    const a = s.agents[0]!;
    expect(abortCoverUp(s, "cover-t")).toMatch(/isn't under way/);
    expect(startCoverUp(s, "cover-t", [a.id])).toBeNull();
    const before = s.secrecy;
    const funds = s.funds;
    expect(abortCoverUp(s, "cover-t")).toBeNull();
    expect(s.coverUps).toHaveLength(0);
    expect(isDeployed(s, a)).toBe(false);
    expect(s.secrecy).toBe(before - ABORT_SECRECY);
    expect(s.funds).toBe(funds); // no refund
  });
});

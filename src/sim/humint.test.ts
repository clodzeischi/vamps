import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../save/format";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { detectionChance, sigintRates } from "./commands";
import { monthlyIncome } from "./economy";
import { accessBlocker, ASSET_KINDS, assetFee, humintRates, INFORMANT_RATE, recruitAsset, type AssetKind } from "./humint";
import { decide, dispatch, dispatchBlocker, type DispatchPlan } from "./missions";
import { theFall } from "./story";
import type { GameState, LeadKind } from "./state";
import { DAY } from "./time";

const MILAN = { lat: 45.46, lon: 9.19 };
const QUIET = Object.fromEntries(["ashgrove", "huaca", "carcassonne", "sahel", "jade", "nullarbor"].map((b) => [b, 1e15]));

/** A quiet campaign with one source lead near Padua, which could become an asset of `asset`. */
function withSource(kind: LeadKind = "source", asset: AssetKind = "informant", seed = 1) {
  const s = newCampaign("inquisitor", seed);
  s.nextOperation = { ...QUIET };
  s.story.fallAt = 8.64e15;
  s.coverUps = [];
  s.operations.push({ id: "op-t", bloodline: "carcassonne", kind: "recruitment", regionId: "italy", pos: MILAN, city: "Milan", startedAt: s.time, endsAt: s.time + 9 * DAY, leadId: "lead-t" });
  s.leads.push({
    id: "lead-t", opId: "op-t", kind, regionId: "italy", pos: MILAN, city: "Milan", appearedAt: s.time, expiresAt: s.time + 4 * DAY,
    intel: 0.7, title: "Test, Milan", text: "", missionId: null, via: "volunteer", who: ASSET_KINDS[asset].roles[0], asset,
  });
  return s;
}

const plan = (s: GameState, n: number, kit: DispatchPlan["kit"]): DispatchPlan => ({
  target: { kind: "lead", id: "lead-t" }, baseId: "ob-padua", aircraftId: s.aircraft.find((a) => a.kind === "helicopter")!.id,
  agentIds: s.agents.slice(0, n).map((a) => a.id), kit,
});

/** Flies the team out and gives the order on arrival; returns the debrief. */
function meet(s: GameState, n: number, kit: DispatchPlan["kit"], order: string) {
  expect(dispatch(s, plan(s, n, kit))).toBeNull();
  for (let i = 0; i < 200; i++) {
    const e = s.events[0];
    if (e?.kind === "arrival") decide(s, e.refId!, order);
    else if (e?.kind === "debrief") return e;
    else if (e) dismissEvent(s);
    else advance(s, DAY);
  }
  throw new Error("no debrief");
}

describe("HUMINT", () => {
  it("volunteers come forward where no station listens, and they are sources", () => {
    const s = newCampaign("inquisitor", 3);
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    s.story.fallAt = 8.64e15;
    const seen: string[] = [];
    const end = s.time + 120 * DAY;
    while (s.time < end) {
      const e = s.events[0];
      if (e?.kind === "lead" && e.heading === "A volunteer") seen.push(e.refId!);
      if (s.events.length) dismissEvent(s);
      else advance(s, end - s.time);
    }
    expect(seen.length).toBeGreaterThan(2);
    for (const l of s.leads.filter((x) => x.via === "volunteer")) {
      expect(["source", "double"]).toContain(l.kind);
      expect(l.asset).toBeTruthy();
    }
  });

  it("recruits a source as an asset with a fee, paid every month", () => {
    let recruited = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = withSource("source", "access", seed);
      for (const a of s.agents) a.stats.tradecraft = 90;
      meet(s, 2, "plainclothes", "recruit");
      if (!s.assets.length) continue;
      recruited++;
      const a = s.assets[0]!;
      expect(a.kind).toBe("access");
      expect(a.regionId).toBe("italy");
      expect(a.monthly).toBe(assetFee(s, "access", "italy"));
      expect(monthlyIncome(s).humint).toBe(a.monthly);
      expect(deserialize(serialize(s)).assets).toHaveLength(1);
    }
    expect(recruited).toBeGreaterThan(8);
  });

  it("a double takes the unarmed agent; an armed team fights its way out", () => {
    const s = withSource("double");
    const n = s.agents.length;
    const e = meet(s, 2, "civilian", "recruit");
    expect(e.title).toMatch(/Failure/);
    expect(s.agents).toHaveLength(n - 1);
    expect(s.assets).toHaveLength(0);

    const t = withSource("double", "informant", 2);
    for (const a of t.agents) a.stats.combat = 90;
    const n2 = t.agents.length;
    const e2 = meet(t, 4, "plainclothes", "recruit");
    expect(e2.body).toMatch(/came armed/);
    expect(t.agents.length).toBeGreaterThanOrEqual(n2 - 4);
  });

  it("an informant hears like a weaker station, sharing one detection rate", () => {
    const s = newCampaign("inquisitor", 1);
    s.installations = s.installations.filter((i) => i.kind !== "sigint");
    recruitAsset(s, "informant", "nurse", "brazil", "São Paulo", { lat: -23.5, lon: -46.6 });
    expect(humintRates(s).get("brazil")).toBe(INFORMANT_RATE);
    expect(humintRates(s).has("andes_south")).toBe(false); // own region only
    expect(sigintRates(s).has("brazil")).toBe(false);
    expect(detectionChance(INFORMANT_RATE)).toBeLessThan(detectionChance(0.5));
  });

  it("access opens hostile regions, and Europe while the Vatican is hostage", () => {
    const s = withSource();
    s.regions.brazil!.support = -4;
    expect(accessBlocker(s, "brazil")).toMatch(/hostile/);
    recruitAsset(s, "access", "customs officer", "brazil", "Santos", { lat: -23.9, lon: -46.3 });
    expect(accessBlocker(s, "brazil")).toBeNull();

    theFall(s);
    s.events = [];
    expect(accessBlocker(s, "italy")).toMatch(/Europe is closed/);
    const cell = s.installations.find((i) => i.kind === "base")!;
    s.aircraft.push({ id: "air-j", kind: "jet", name: "SERAPH-9", baseId: cell.id, deployed: false });
    s.agents.push(...[0, 1].map((i) => ({ ...s.agents[0]!, id: `agent-x${i}`, baseId: cell.id, deployed: false })));
    const p: DispatchPlan = { target: { kind: "lead", id: "lead-t" }, baseId: cell.id, aircraftId: "air-j", agentIds: ["agent-x0"], kit: "plainclothes" };
    expect(dispatchBlocker(s, p)).toMatch(/Europe is closed/);
    recruitAsset(s, "access", "customs officer", "italy", "Milan", MILAN);
    expect(dispatchBlocker(s, p) ?? "").not.toMatch(/closed/);
  });
});

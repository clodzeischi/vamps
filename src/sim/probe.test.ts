// Balance probe, not a test: PROBE=1 npx vitest run src/sim/probe.test.ts
import { it } from "vitest";
import { REGIONS } from "../data/regions";
import { newCampaign } from "./campaign";
import { advance, dismissEvent } from "./clock";
import { availableAgents, availableAircraft, decide, dispatch, dispatchCost, type DispatchPlan } from "./missions";
import { basesInReach } from "./personnel";
import { AIRCRAFT } from "../data/aircraft";
import { coverUpAgents, coverUpBlocker, startCoverUp } from "./coverups";
import type { GameState } from "./state";
import { DAY } from "./time";

const avg = (s: GameState) => Object.values(s.regions).reduce((a, r) => a + r.support, 0) / REGIONS.length;

function bot(s: GameState, stats: Record<string, number>) {
  const targets = [...s.leads.filter((l) => !l.missionId).map((l) => ({ kind: "lead" as const, id: l.id, pos: l.pos, lk: l.kind })),
    ...s.sites.filter((x) => !x.missionId).map((x) => ({ kind: "site" as const, id: x.id, pos: x.pos, lk: null }))];
  for (const t of targets) {
    const b = basesInReach(s, t.pos)[0];
    if (!b) continue;
    const agents = availableAgents(s, b.base.id).sort((a, c) => c.stats.combat - a.stats.combat);
    const air = availableAircraft(s, b.base.id).filter((a) => AIRCRAFT[a.kind].reachNm >= b.distance).sort((a, c) => AIRCRAFT[a.kind].noise - AIRCRAFT[c.kind].noise)[0];
    if (!air || !agents.length) continue;
    const strike = t.kind === "site" || t.lk === "rescue";
    const n = Math.min(strike ? 5 : 2, agents.length);
    const p: DispatchPlan = { target: { kind: t.kind, id: t.id }, baseId: b.base.id, aircraftId: air.id, agentIds: agents.slice(0, n).map((a) => a.id), kit: strike ? "tactical" : "plainclothes" };
    const c = dispatchCost(s, p);
    if (!c || c.lateBy > 0) continue;
    if (!dispatch(s, p)) { stats.dispatched = (stats.dispatched ?? 0) + 1; stats.noise = (stats.noise ?? 0) + c.secrecy; }
  }
  // Cover-ups: take them while secrecy is under 75 and money allows, best agents for the job.
  for (const c of s.coverUps) {
    if (c.startedAt || s.secrecy >= 75 || s.funds < c.cost + 1_000_000) continue;
    const ids = coverUpAgents(s).sort((a, b) => b.stats[c.stat] - a.stats[c.stat]).slice(0, c.agents).map((a) => a.id);
    if (coverUpBlocker(s, c, ids)) continue;
    startCoverUp(s, c.id, ids);
    stats.coverups = (stats.coverups ?? 0) + 1;
    stats.coverSpend = (stats.coverSpend ?? 0) + c.cost / 1e6;
  }
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

it.skipIf(!env.PROBE)("balance probe: a bot that answers every lead for six months", () => {
  for (const diff of ["novice", "inquisitor", "grand"] as const) {
    const st: Record<string, number> = {};
    let idleFunds = 0, cov = 0, covIgnored = 0, sup = 0, sec = 0, funds = 0, fallen = 0, agents = 0, intel = 0;
    const N = 10;
    for (let seed = 1; seed <= N; seed++) {
      const s = newCampaign(diff, seed);
      const s0 = avg(s);
      const sig = s.installations.find((i) => i.kind === 'sigint')!.regionId;
      const c0 = s.regions[sig]!.support;
      const idle = newCampaign(diff, seed);
      for (let d = 0; d < 182 && !idle.gameOver; d++) { advance(idle, DAY); while (idle.events.length) dismissEvent(idle); }
      idleFunds += idle.funds;
      covIgnored += idle.regions[sig]!.support - c0;
      const end = s.time + 182 * DAY;
      while (s.time < end && !s.gameOver) {
        while (s.events.length) {
          const e = s.events[0]!;
          if (e.kind === "arrival") {
            const m = s.missions.find((x) => x.id === e.refId)!;
            const opts = m.decision!.options;
            const pick = opts.find((o) => o.id === "snatch") ?? opts.find((o) => o.odds === "good") ?? opts.find((o) => o.odds === "fair") ?? opts[0]!;
            st[`opt_${pick.id}`] = (st[`opt_${pick.id}`] ?? 0) + 1;
            decide(s, m.id, pick.id);
          } else {
            if (e.kind === "debrief") { const k = e.title.split(":")[0]!; st[k] = (st[k] ?? 0) + 1; }
            if (e.kind === "lead") st.leads = (st.leads ?? 0) + 1;
            if (e.kind === "coverup") st.offers = (st.offers ?? 0) + 1;
            if (e.kind === "coverup-result") { const k = e.title.split(":")[0]!; st[k] = (st[k] ?? 0) + 1; }
            dismissEvent(s);
          }
        }
        bot(s, st);
        advance(s, Math.min(6 * 3600_000, end - s.time));
      }
      cov += s.regions[sig]!.support - c0; sup += avg(s) - s0; sec += s.secrecy; funds += s.funds; fallen += s.fallen.length; agents += s.agents.length;
      intel += Object.values(s.intel).reduce((a, b) => a + b, 0);
    }
    for (const k of Object.keys(st)) st[k] = Math.round((st[k]! / N) * 10) / 10;
    console.log(diff, JSON.stringify(st), `covered ${(cov / N).toFixed(2)} vs ignored ${(covIgnored / N).toFixed(2)} support ${(sup / N).toFixed(2)} secrecy ${(sec / N).toFixed(0)} funds ${(funds / N / 1e6).toFixed(1)}M (idle ${(idleFunds / N / 1e6).toFixed(1)}M) fallen ${(fallen / N).toFixed(1)} agents ${(agents / N).toFixed(1)} intel ${(intel / N).toFixed(0)}`);
  }
}, 60000);

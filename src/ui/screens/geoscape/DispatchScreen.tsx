// The team builder: who goes, in what, wearing what. Shows what it costs
// (secrecy, money) and whether the team gets there before the lead goes cold.
import { useState } from "react";
import { STATS } from "../../../data/agents";
import { AIRCRAFT, CHARTER } from "../../../data/aircraft";
import { KIT, KIT_IDS, type KitId } from "../../../data/kit";
import { regionById } from "../../../data/regions";
import { teamSkill } from "../../../sim/combat";
import { distanceNm } from "../../../sim/geo";
import { availableAgents, availableAircraft, dispatchBlocker, dispatchCost, isCharter, targetInfo, type DispatchPlan } from "../../../sim/missions";
import { LEAD_KIND_NAMES } from "../../../sim/operations";
import { basesInReach } from "../../../sim/personnel";
import { isReady, isWounded, type Agent, type GameState } from "../../../sim/state";
import { formatClock, formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { useGame, useStore } from "../../store";
import { timeLeft } from "./FocusPanels";

const rank = (a: Agent) => a.stats.combat + a.stats.tradecraft + a.stats.insight + a.stats.faith;

/** Ready Operational Bases, nearest to a point first. */
function readyBases(g: GameState, pos: { lat: number; lon: number }) {
  return g.installations
    .filter((b) => b.kind === "base" && isReady(g, b))
    .map((b) => ({ base: b, distance: distanceNm(b.pos, pos) }))
    .sort((a, b) => a.distance - b.distance);
}

/** The base's aircraft that can reach the target, quietest first; else a charter. */
function pickAircraft(g: GameState, target: DispatchPlan["target"], baseId: string, kit: KitId): string {
  const info = targetInfo(g, target)!;
  const base = g.installations.find((i) => i.id === baseId);
  const air = base
    ? availableAircraft(g, baseId)
        .filter((a) => AIRCRAFT[a.kind].reachNm >= distanceNm(base.pos, info.pos))
        .sort((a, b) => AIRCRAFT[a.kind].noise - AIRCRAFT[b.kind].noise)
    : [];
  // Prefer the quiet aircraft unless only the fast one arrives in time.
  const onTime = air.find((a) => dispatchCost(g, { target, baseId, aircraftId: a.id, agentIds: [], kit })!.lateBy === 0);
  return (onTime ?? air[0])?.id ?? CHARTER.id;
}

/** A sensible starting team: quiet for leads, heavy for strikes; one agent on a charter. */
function defaults(g: GameState, target: DispatchPlan["target"]) {
  const info = targetInfo(g, target)!;
  const reach = basesInReach(g, info.pos);
  // Out of every aircraft's reach: the nearest base with someone free sends one by charter.
  const baseId = reach[0]?.base.id ?? readyBases(g, info.pos).find((b) => availableAgents(g, b.base.id).length)?.base.id ?? "";
  const strike = target.kind === "site" || info.leadKind === "rescue";
  let kit: KitId = strike ? "tactical" : "plainclothes";
  const aircraftId = pickAircraft(g, target, baseId, kit);
  if (isCharter(aircraftId)) kit = "plainclothes";
  const ready = g.agents
    .filter((a) => a.baseId === baseId && !a.deployed && !isWounded(g, a))
    .sort((a, b) => (strike ? b.stats.combat - a.stats.combat : rank(b) - rank(a)));
  const agentIds = ready.slice(0, isCharter(aircraftId) ? 1 : strike ? 5 : 2).map((a) => a.id);
  return { baseId, aircraftId, kit, agentIds };
}

export function DispatchScreen() {
  const g = useGame();
  const target = useStore((s) => s.dispatch)!;
  const close = useStore((s) => s.closeDispatch);
  const sendTeam = useStore((s) => s.sendTeam);
  const [initial] = useState(() => defaults(g, target));
  const [baseId, setBaseId] = useState(initial.baseId);
  const [aircraftId, setAircraftId] = useState(initial.aircraftId);
  const [kit, setKit] = useState<KitId>(initial.kit);
  const [picked, setPicked] = useState<string[]>(initial.agentIds);

  const info = targetInfo(g, target);
  if (!info) {
    return (
      <div className="modal-backdrop">
        <Panel title="Dispatch" className="modal event">
          <p className="prose dim">{target.kind === "lead" ? "This lead has gone cold." : "The site is gone."}</p>
          <div className="modal-row"><button className="action primary" onClick={close}><span className="action-title">Close</span></button></div>
        </Panel>
      </div>
    );
  }
  const bases = readyBases(g, info.pos);
  const inReach = new Set(basesInReach(g, info.pos).map((r) => r.base.id));
  const base = g.installations.find((i) => i.id === baseId);
  const plan: DispatchPlan = { target, baseId, aircraftId, agentIds: picked, kit };
  const cost = dispatchCost(g, plan);
  const blocker = dispatchBlocker(g, plan);
  const charter = isCharter(aircraftId);
  const air = g.aircraft.find((a) => a.id === aircraftId);
  const seats = charter ? CHARTER.seats : air ? AIRCRAFT[air.kind].seats : 0;
  const agents = g.agents.filter((a) => a.baseId === baseId);
  const team = agents.filter((a) => picked.includes(a.id));
  const kindName = target.kind === "site" ? "Strike" : LEAD_KIND_NAMES[info.leadKind === "double" ? "source" : info.leadKind!];

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < seats || !seats ? [...p, id] : p));

  const chooseBase = (id: string) => {
    setBaseId(id);
    const a = pickAircraft(g, target, id, kit);
    setAircraftId(a);
    if (isCharter(a) && kit === "tactical") setKit("plainclothes");
    setPicked([]);
  };

  const chooseCharter = () => {
    setAircraftId(CHARTER.id);
    setPicked((p) => p.slice(0, CHARTER.seats));
    if (kit === "tactical") setKit("plainclothes");
  };
  const charterCost = dispatchCost(g, { ...plan, aircraftId: CHARTER.id });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Panel title={`Dispatch · ${kindName}`} className="modal dispatch-screen">
        <div className="base-head">
          <h3 className="event-title">{info.title}</h3>
          <span className="td-dim">{regionById(info.regionId)?.name} · goes cold in {timeLeft(info.expiresAt - g.time)}</span>
        </div>

        <div className="dispatch-grid">
          <div className="dispatch-col">
            {bases.length > 1 && (
              <section>
                <h4 className="section-title">From</h4>
                <div className="choice-row">
                  {bases.map((r) => (
                    <button key={r.base.id} className={`choice${r.base.id === baseId ? " on" : ""}`} onClick={() => chooseBase(r.base.id)}>
                      <span className="choice-title">{r.base.name.replace("Operational Base ", "")}</span>
                      <span className="choice-meta">{Math.round(r.distance)} nm{inReach.has(r.base.id) ? "" : ", charter only"}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="section-title">Aircraft</h4>
              <div className="choice-col">
                {g.aircraft.filter((a) => a.baseId === baseId).map((a) => {
                  const def = AIRCRAFT[a.kind];
                  const dist = base ? distanceNm(base.pos, info.pos) : 0;
                  const c = dispatchCost(g, { ...plan, aircraftId: a.id });
                  const out = dist > def.reachNm;
                  const disabled = a.deployed || out;
                  return (
                    <button key={a.id} disabled={disabled} className={`choice${a.id === aircraftId ? " on" : ""}`}
                      onClick={() => { setAircraftId(a.id); setPicked((p) => p.slice(0, def.seats)); }}>
                      <span className="choice-title">{a.name} <span className="choice-sub">{def.name}, {def.seats} seats{a.kind === "helicopter" ? ", waits on the LZ: can be lost in a fight" : ""}</span></span>
                      <span className={`choice-meta${c && c.lateBy > 0 ? " bad" : ""}`}>
                        {a.deployed ? "In the air" : out ? `Out of reach (${def.reachNm} nm)` : c ? `${c.hours < 1 ? `${Math.round(c.hours * 60)} min` : `${c.hours.toFixed(1)} h`} flight${c.lateBy > 0 ? ", arrives too late" : ""}` : ""}
                      </span>
                    </button>
                  );
                })}
                <button className={`choice${charter ? " on" : ""}`} onClick={chooseCharter}>
                  <span className="choice-title">{CHARTER.name} <span className="choice-sub">hired, 1 seat</span></span>
                  <span className={`choice-meta${charterCost && charterCost.lateBy > 0 ? " bad" : ""}`}>
                    {charterCost
                      ? `${charterCost.hours.toFixed(1)} h flight + ${CHARTER.prepHours} h to book, ${money(charterCost.money)}${charterCost.lateBy > 0 ? ", arrives too late" : ""}`
                      : CHARTER.description}
                  </span>
                </button>
              </div>
            </section>

            <section>
              <h4 className="section-title">Kit</h4>
              <div className="choice-col">
                {KIT_IDS.map((k) => (
                  <button key={k} className={`choice${k === kit ? " on" : ""}`} disabled={charter && k === "tactical"} title={charter && k === "tactical" ? "Not through a charter terminal" : undefined} onClick={() => setKit(k)}>
                    <span className="choice-title">{KIT[k].name}</span>
                    <span className="choice-meta">{KIT[k].description}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="dispatch-col">
            <section>
              <h4 className="section-title">Team <span className="tab-count">{picked.length} / {seats || "–"} seats</span></h4>
              <div className="pick-list">
                {agents.map((a) => {
                  const unavailable = a.deployed ? "In the field" : isWounded(g, a) ? `Wounded, ${formatDate(a.woundedUntil)}` : null;
                  const on = picked.includes(a.id);
                  return (
                    <button key={a.id} className={`pick${on ? " on" : ""}`} disabled={!!unavailable} onClick={() => toggle(a.id)}>
                      <span className="pick-box">{on ? "✓" : ""}</span>
                      <span className="pick-name">{a.sister ? "Sr." : "Br."} {a.name}</span>
                      {unavailable ? (
                        <span className="pick-note">{unavailable}</span>
                      ) : (
                        <span className="pick-stats">
                          {STATS.map((s) => <span key={s.id} title={s.name}><i>{s.short}</i>{a.stats[s.id]}</span>)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h4 className="section-title">The team, as kitted</h4>
              <div className="skill-grid">
                {STATS.filter((s) => s.id !== "vitality").map((s) => {
                  const v = Math.round(teamSkill(team, s.id, kit));
                  return (
                    <div key={s.id} className="skill" title={s.description}>
                      <span>{s.name}</span>
                      <span className="stat-bar"><span style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
                      <span className="stat-num">{team.length ? v : "–"}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {cost && (
              <section className="dispatch-cost">
                <div className={`kv${cost.secrecy >= 3 ? " bad" : ""}`}>
                  <span>Secrecy</span><span>{cost.secrecy ? `−${cost.secrecy.toFixed(1)}` : "unnoticed"}</span>
                </div>
                <div className="kv"><span>{charter ? "Charter" : "Fuel and crew"}</span><span>{money(cost.money)}</span></div>
                <div className={`kv${cost.lateBy > 0 ? " bad" : ""}`}>
                  <span>On the ground</span>
                  <span>{formatDate(cost.arriveAt)} {formatClock(cost.arriveAt)}{cost.lateBy > 0 ? " (too late)" : ` (${timeLeft(info.expiresAt - cost.arriveAt)} to spare)`}</span>
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="modal-row">
          {blocker && <span className="action-blocker grow">{blocker}</span>}
          <button className="action" onClick={close}><span className="action-title">Cancel</span></button>
          <button className="action primary" disabled={!!blocker} onClick={() => sendTeam(plan)}>
            <span className="action-title">Dispatch</span>
          </button>
        </div>
      </Panel>
    </div>
  );
}

// The team builder: who goes, in what, wearing what. Shows what it costs
// (secrecy, money) and whether the team gets there before the lead goes cold.
import { tipLines } from "../../components/Tooltip";
import { useState } from "react";
import { APTITUDES, type OperatorAptitude } from "../../../data/aptitudes";
import { traitsOf, traitValue } from "../../status";
import {
  AIRCRAFT,
  CHARTER,
  COMMERCIAL,
  HIRED_FLIGHTS,
  hiredFlight,
  type HiredFlight,
} from "../../../data/aircraft";
import { KIT, KIT_IDS, type KitId } from "../../../data/kit";
import { regionById } from "../../../data/regions";
import { teamSkill } from "../../../sim/missions/combat";
import { distanceNm } from "../../../sim/core/geo";
import {
  availableAgents,
  availableAircraft,
  dispatchBlocker,
  dispatchCost,
  isHired,
  missionCraft,
  planSeats,
  targetInfo,
  type DispatchPlan,
} from "../../../sim/missions/dispatch";
import { capacityOf, carriesRemains, LOAD } from "../../../sim/base/transfers";
import { LoadBar } from "../../components/LoadBar";
import { GearIcons } from "../../components/Gear";
import { agentName } from "../../status";
import { LEAD_KIND_NAMES } from "../../../sim/intel/operations";
import { basesInReach, canReach } from "../../../sim/people/personnel";
import { routeWords } from "../../../sim/missions/routes";
import {
  isReady,
  isWounded,
  type Agent,
  type Aircraft,
  type GameState,
  isCraftDeployed,
  isDeployed,
  craftById,
  installationById,
  missionById,
  siteById,
} from "../../../sim/core/state";
import { formatClock, formatDate, isNight, moonPhase } from "../../../sim/core/time";
import { nightSight, SIGHT, VAMPIRE_SIGHT } from "../../../tactical/rules";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { useGame, useStore } from "../../store";
import { timeLeft } from "../../format";

const rank = (a: Agent) =>
  a.aptitudes.combat + a.aptitudes.tradecraft + a.aptitudes.insight + a.aptitudes.faith;

/** Ready Operational Bases, nearest to a point first. */
function readyBases(g: GameState, pos: { lat: number; lon: number }) {
  return g.installations
    .filter((b) => b.kind === "base" && isReady(g, b))
    .map((b) => ({ base: b, distance: distanceNm(b.pos, pos) }))
    .sort((a, b) => a.distance - b.distance);
}

/** The base's aircraft that can reach the target, quietest first; else a hired flight (an airline seat for civilian clothes, a charter otherwise). */
function pickAircraft(
  g: GameState,
  target: DispatchPlan["target"],
  baseId: string,
  kit: KitId,
): string {
  const info = targetInfo(g, target)!;
  const base = installationById(g, baseId);
  const air = base
    ? availableAircraft(g, baseId)
        .filter((a) => canReach(g, base.pos, info.pos, a.kind))
        .sort((a, b) => AIRCRAFT[a.kind].noise - AIRCRAFT[b.kind].noise)
    : [];
  // Prefer the quiet aircraft unless only the fast one arrives in time.
  const onTime = air.find(
    (a) => dispatchCost(g, { target, baseId, aircraftId: a.id, agentIds: [], kit })!.lateBy === 0,
  );
  return (onTime ?? air[0])?.id ?? (kit === "civilian" ? COMMERCIAL.id : CHARTER.id);
}

/** A sensible starting team: quiet for leads, heavy for strikes; a hired flight's seats when nothing reaches. */
function defaults(g: GameState, target: DispatchPlan["target"], craftId: string | null) {
  const info = targetInfo(g, target)!;
  const reach = basesInReach(g, info.pos);
  // An aircraft ordered here from the globe flies from its own base.
  const ordered = craftId
    ? g.aircraft.find((a) => a.id === craftId && !isCraftDeployed(g, a))
    : undefined;
  // Out of every aircraft's reach: the nearest base with someone free sends them on a hired flight.
  const baseId =
    ordered?.baseId ??
    reach[0]?.base.id ??
    readyBases(g, info.pos).find((b) => availableAgents(g, b.base.id).length)?.base.id ??
    "";
  const strike = target.kind === "site" || info.leadKind === "rescue";
  // Joining a team already out: its kit.
  const joining = info.missionId ? missionById(g, info.missionId) : undefined;
  let kit: KitId = joining?.kit ?? (strike ? "tactical" : "plainclothes");
  const aircraftId = ordered?.id ?? pickAircraft(g, target, baseId, kit);
  if (isHired(aircraftId))
    kit = hiredFlight(aircraftId)!.kits.includes("plainclothes") ? "plainclothes" : "civilian";
  const ready = g.agents
    .filter((a) => a.baseId === baseId && !isDeployed(g, a) && !isWounded(g, a))
    .sort((a, b) => (strike ? b.aptitudes.combat - a.aptitudes.combat : rank(b) - rank(a)));
  // A lair takes everyone the aircraft can carry.
  const lair = target.kind === "site" && siteById(g, target.id)?.kind === "lair";
  const hired = hiredFlight(aircraftId);
  const seats = hired
    ? hired.seats
    : craftById(g, aircraftId)
      ? AIRCRAFT[craftById(g, aircraftId)!.kind].seats
      : 5;
  const agentIds = ready
    .slice(0, hired ? hired.seats : lair ? seats : strike ? 5 : 2)
    .map((a) => a.id);
  return { baseId, aircraftId, kit, agentIds };
}

/** Who sits where: jets fill first, so the helicopters keep room for bodies (as sim/missions/missions.ts loads the haul). */
function seatPlan(craft: Aircraft[], team: Agent[]) {
  const order = [...craft].sort(
    (a, b) => Number(carriesRemains(a.kind)) - Number(carriesRemains(b.kind)),
  );
  let i = 0;
  return order.map((c) => {
    const n = Math.min(capacityOf(c.kind), team.length - i);
    const aboard = team.slice(i, i + n);
    i += n;
    return { craft: c, aboard };
  });
}

/** Day or night where the team lands, with the moon and how far it lets us see. */
function lightAt(time: number, lon: number): string {
  if (!isNight(time, lon)) return "day";
  const moon = moonPhase(time);
  return `night, ${moon.name.toLowerCase()}: we see ${nightSight(moon.lit)} tiles`;
}

export function DispatchScreen() {
  const g = useGame();
  const target = useStore((s) => s.dispatch)!;
  const close = useStore((s) => s.closeDispatch);
  const sendTeam = useStore((s) => s.sendTeam);
  const [initial] = useState(() => defaults(g, target, useStore.getState().dispatchCraft));
  const [baseId, setBaseId] = useState(initial.baseId);
  const [aircraftId, setAircraftId] = useState(initial.aircraftId);
  const [escorts, setEscorts] = useState<string[]>([]);
  const [kit, setKit] = useState<KitId>(initial.kit);
  const [picked, setPicked] = useState<string[]>(initial.agentIds);

  const info = targetInfo(g, target);
  if (!info) {
    return (
      <div className="modal-backdrop">
        <Panel title="Dispatch" className="modal event">
          <p className="prose dim">
            {target.kind === "lead" ? "This lead has gone cold." : "The site is gone."}
          </p>
          <div className="modal-row">
            <button className="action primary" onClick={close}>
              <span className="action-title">Close</span>
            </button>
          </div>
        </Panel>
      </div>
    );
  }
  const bases = readyBases(g, info.pos);
  const inReach = new Set(basesInReach(g, info.pos).map((r) => r.base.id));
  const base = installationById(g, baseId);
  const plan: DispatchPlan = {
    target,
    baseId,
    aircraftId,
    agentIds: picked,
    kit,
    ...(escorts.length ? { escorts } : {}),
  };
  const cost = dispatchCost(g, plan);
  const blocker = dispatchBlocker(g, plan);
  const hired = hiredFlight(aircraftId);
  const air = craftById(g, aircraftId);
  const seats = hired || air ? planSeats(g, plan) : 0;
  const flying = [aircraftId, ...escorts];
  /** Our own aircraft are chosen together (the first leads, the rest escort); a hired flight goes alone. */
  const toggleCraft = (id: string) => {
    if (hiredFlight(aircraftId)) {
      setAircraftId(id);
      setEscorts([]);
      return;
    }
    if (!flying.includes(id)) {
      setEscorts([...escorts, id]);
      return;
    }
    const rest = flying.filter((x) => x !== id);
    if (!rest.length) return;
    setAircraftId(rest[0]!);
    setEscorts(rest.slice(1));
    const cap = missionCraft(g, { aircraftId: rest[0]!, escorts: rest.slice(1) }).reduce(
      (s, a) => s + capacityOf(a.kind),
      0,
    );
    setPicked((p) => p.slice(0, cap));
  };
  const agents = g.agents.filter((a) => a.baseId === baseId);
  const team = agents.filter((a) => picked.includes(a.id));
  const kindName =
    target.kind === "site"
      ? "Strike"
      : LEAD_KIND_NAMES[info.leadKind === "double" ? "source" : info.leadKind!];
  const joining = info.missionId ? missionById(g, info.missionId) : undefined;

  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < seats || !seats ? [...p, id] : p,
    );

  const chooseBase = (id: string) => {
    setBaseId(id);
    const a = pickAircraft(g, target, id, kit);
    setAircraftId(a);
    setEscorts([]);
    const h = hiredFlight(a);
    if (h && !h.kits.includes(kit))
      setKit(h.kits.includes("plainclothes") ? "plainclothes" : "civilian");
    setPicked([]);
  };

  const chooseHired = (f: HiredFlight) => {
    setAircraftId(f.id);
    setEscorts([]);
    setPicked((p) => p.slice(0, f.seats));
    if (!f.kits.includes(kit))
      setKit(f.kits.includes("plainclothes") ? "plainclothes" : "civilian");
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Panel title={`Dispatch · ${kindName}`} className="modal dispatch-screen">
        <div className="base-head">
          <h3 className="event-title">{info.title}</h3>
          <span className="td-dim">
            {regionById(info.regionId)?.name} · goes cold in {timeLeft(info.expiresAt - g.time)}
          </span>
        </div>
        {joining && (
          <p className="small dim">
            Joins the team {joining.phase === "outbound" ? "on its way" : "on the ground"} (
            {joining.agentIds.length} of ours, {KIT[joining.kit].name.toLowerCase()}). It lands
            beside them; the mission starts when you choose, with whoever is there.
          </p>
        )}

        <div className="dispatch-grid">
          <div className="dispatch-col">
            {bases.length > 1 && (
              <section>
                <h4 className="section-title">From</h4>
                <div className="choice-row">
                  {bases.map((r) => (
                    <button
                      key={r.base.id}
                      className={`choice${r.base.id === baseId ? " on" : ""}`}
                      onClick={() => chooseBase(r.base.id)}
                    >
                      <span className="choice-title">
                        {r.base.name.replace("Operational Base ", "")}
                      </span>
                      <span className="choice-meta">
                        {Math.round(r.distance)} nm
                        {inReach.has(r.base.id) ? "" : ", hired flights only"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="section-title">Aircraft</h4>
              <div className="choice-col">
                {g.aircraft
                  .filter((a) => a.baseId === baseId)
                  .map((a) => {
                    const def = AIRCRAFT[a.kind];
                    const c = dispatchCost(g, { ...plan, aircraftId: a.id, escorts: [] });
                    const out = !base || !canReach(g, base.pos, info.pos, a.kind);
                    const stops = c?.route?.stops.length ?? 0;
                    const away = isCraftDeployed(g, a);
                    const disabled = away || out;
                    return (
                      <button
                        key={a.id}
                        disabled={disabled}
                        className={`choice${flying.includes(a.id) ? " on" : ""}`}
                        onClick={() => toggleCraft(a.id)}
                      >
                        <span className="choice-title">
                          {a.name}{" "}
                          <span className="choice-sub">
                            {def.name}, capacity {capacityOf(a.kind)}
                            {a.kind === "helicopter" ? ", lifts bodies" : ""}
                          </span>
                        </span>
                        <span className={`choice-meta${c && c.lateBy > 0 ? " bad" : ""}`}>
                          {away
                            ? "In the air"
                            : out
                              ? `Out of reach (${def.reachNm} nm${g.installations.some((i) => i.kind === "fuel") ? ", even refuelling" : ""})`
                              : c
                                ? `${c.hours < 1 ? `${Math.round(c.hours * 60)} min` : `${c.hours.toFixed(1)} h`} flight${stops ? `, ${routeWords(c.route!)} (${stops} refuelling stop${stops === 1 ? "" : "s"})` : ""}${c.lateBy > 0 ? ", arrives too late" : ""}`
                                : ""}
                        </span>
                      </button>
                    );
                  })}
                {!joining &&
                  HIRED_FLIGHTS.map((f) => {
                    const c = dispatchCost(g, { ...plan, aircraftId: f.id });
                    return (
                      <button
                        key={f.id}
                        className={`choice${f.id === aircraftId ? " on" : ""}`}
                        onClick={() => chooseHired(f)}
                        title={f.description}
                      >
                        <span className="choice-title">
                          {f.name} <span className="choice-sub">{f.sub}</span>
                        </span>
                        <span className={`choice-meta${c && c.lateBy > 0 ? " bad" : ""}`}>
                          {c
                            ? `${c.hours.toFixed(1)} h flight + ${f.prepHours} h to ${f.id === "commercial" ? "book and connect" : "book"}, ${money(c.money)}${c.lateBy > 0 ? ", arrives too late" : ""}`
                            : f.description}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </section>

            <section>
              <h4 className="section-title">Kit</h4>
              <div className="choice-col">
                {KIT_IDS.map((k) => (
                  <button
                    key={k}
                    className={`choice${k === kit ? " on" : ""}`}
                    disabled={
                      (!!hired && !hired.kits.includes(k)) || (!!joining && k !== joining.kit)
                    }
                    data-tip={tipLines(
                      KIT[k].description,
                      hired &&
                        !hired.kits.includes(k) &&
                        (hired.id === "commercial"
                          ? "Not through airport security"
                          : "Not through a charter terminal"),
                    )}
                    onClick={() => setKit(k)}
                  >
                    <span className="choice-title">{KIT[k].name}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="dispatch-col">
            <section>
              <h4 className="section-title">
                Team{" "}
                <span className="tab-count">
                  {picked.length} / {seats || "–"} seats
                </span>
              </h4>
              {!hired && air && (
                <>
                  {seatPlan(missionCraft(g, plan), team).map(({ craft, aboard }) => (
                    <div key={craft.id} className="craft-load">
                      <span className="small">{craft.name}</span>
                      <LoadBar
                        capacity={capacityOf(craft.kind)}
                        items={aboard.map((a) => ({
                          id: a.id,
                          load: LOAD.person,
                          label: agentName(a),
                          kind: "operative" as const,
                        }))}
                      />
                    </div>
                  ))}
                  <p className="small dim">
                    Room left for the haul: {seats - team.length}. A body takes 2 (helicopter only),
                    a captive 2. {escorts.length ? "" : "Choose more aircraft to fly together."}
                  </p>
                </>
              )}
              <div className="pick-list">
                {agents.map((a) => {
                  const unavailable = isDeployed(g, a) ? "In the field" : null;
                  const hurt = isWounded(g, a);
                  const on = picked.includes(a.id);
                  return (
                    <div key={a.id} className="pick-row">
                      <button
                        className={`pick${on ? " on" : ""}`}
                        disabled={!!unavailable}
                        onClick={() => toggle(a.id)}
                      >
                        <span className="pick-box">{on ? "✓" : ""}</span>
                        <span className="pick-name">
                          {agentName(a)} {!unavailable && <GearIcons a={a} kit={kit} />}
                          {!unavailable && hurt && (
                            <span
                              className="pick-wounded"
                              data-tip={`Wounded: fit ${formatDate(a.woundedUntil)}. Sent now, they fight with the HP they have left.`}
                            >
                              {" "}
                              HP {Math.round(a.hp)}/{a.vitality}
                            </span>
                          )}
                        </span>
                        {unavailable ? (
                          <span className="pick-note">{unavailable}</span>
                        ) : (
                          <span className="pick-stats">
                            {traitsOf("operator").map((x) => (
                              <span key={x.id} title={x.name}>
                                <i>{x.short}</i>
                                {traitValue(a, x.id)}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h4 className="section-title">The team, as kitted</h4>
              <div className="skill-grid">
                {APTITUDES.operator.map((s) => {
                  const v = Math.round(teamSkill(team, s.id as OperatorAptitude, kit));
                  return (
                    <div key={s.id} className="skill" title={s.covers}>
                      <span>{s.name}</span>
                      <span className="stat-bar">
                        <span style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
                      </span>
                      <span className="stat-num">{team.length ? v : "–"}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            {cost && (
              <section className="dispatch-cost">
                <div className={`kv${cost.secrecy >= 3 ? " bad" : ""}`}>
                  <span>Secrecy</span>
                  <span>{cost.secrecy ? `−${cost.secrecy.toFixed(1)}` : "unnoticed"}</span>
                </div>
                <div className="kv">
                  <span>
                    {hired
                      ? hired.id === "commercial"
                        ? "Airline ticket"
                        : "Charter"
                      : "Fuel and crew"}
                  </span>
                  <span>{money(cost.money)}</span>
                </div>
                <div className={`kv${cost.lateBy > 0 ? " bad" : ""}`}>
                  <span>On the ground</span>
                  <span>
                    {formatDate(cost.arriveAt)} {formatClock(cost.arriveAt)}
                    {cost.lateBy > 0
                      ? " (too late)"
                      : ` (${timeLeft(info.expiresAt - cost.arriveAt)} to spare)`}
                  </span>
                </div>
                <div
                  className="kv"
                  data-tip={`If it comes to a fight on landing. In the dark we see 7 tiles at new moon to 11 at full, ${SIGHT} to anything lit; vampires see ${VAMPIRE_SIGHT}. By day they keep indoors.`}
                >
                  <span>Light there</span>
                  <span>{lightAt(cost.arriveAt, info.pos.lon)}</span>
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="modal-row">
          {blocker && <span className="action-blocker grow">{blocker}</span>}
          <button className="action" onClick={close}>
            <span className="action-title">Cancel</span>
          </button>
          <button className="action primary" disabled={!!blocker} onClick={() => sendTeam(plan)}>
            <span className="action-title">Dispatch</span>
          </button>
        </div>
      </Panel>
    </div>
  );
}

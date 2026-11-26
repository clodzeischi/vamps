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

/** The kit a hired flight takes when the one chosen can't go aboard it. */
const kitFor = (f: HiredFlight, kit: KitId): KitId => {
  if (f.kits.includes(kit)) return kit;
  return f.kits.includes("plainclothes") ? "plainclothes" : "civilian";
};

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
  if (!info) return <GoneCold lead={target.kind === "lead"} close={close} />;

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
  const agents = g.agents.filter((a) => a.baseId === baseId);
  const team = agents.filter((a) => picked.includes(a.id));
  const joining = info.missionId ? missionById(g, info.missionId) : undefined;
  const kindName =
    target.kind === "site"
      ? "Strike"
      : LEAD_KIND_NAMES[info.leadKind === "double" ? "source" : info.leadKind!];

  /** Our own aircraft are chosen together (the first leads, the rest escort); a hired flight goes alone. */
  const toggleCraft = (id: string) => {
    if (hired) {
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
    const [lead, ...others] = rest;
    setAircraftId(lead!);
    setEscorts(others);
    const capacity = missionCraft(g, { aircraftId: lead!, escorts: others }).reduce(
      (total, a) => total + capacityOf(a.kind),
      0,
    );
    setPicked((p) => p.slice(0, capacity));
  };

  const chooseHired = (f: HiredFlight) => {
    setAircraftId(f.id);
    setEscorts([]);
    setPicked((p) => p.slice(0, f.seats));
    setKit(kitFor(f, kit));
  };

  const chooseBase = (id: string) => {
    setBaseId(id);
    const craft = pickAircraft(g, target, id, kit);
    setAircraftId(craft);
    setEscorts([]);
    const f = hiredFlight(craft);
    if (f) setKit(kitFor(f, kit));
    setPicked([]);
  };

  /** Pick or drop an operative; picking stops when the seats are full. */
  const toggleAgent = (id: string) =>
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      const full = seats > 0 && p.length >= seats;
      return full ? p : [...p, id];
    });

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
            <BasePicker info={info} baseId={baseId} choose={chooseBase} />
            <AircraftPicker
              plan={plan}
              info={info}
              flying={flying}
              joining={!!joining}
              toggleCraft={toggleCraft}
              chooseHired={chooseHired}
            />
            <KitPicker kit={kit} setKit={setKit} hired={hired} joiningKit={joining?.kit} />
          </div>

          <div className="dispatch-col">
            <section>
              <h4 className="section-title">
                Team{" "}
                <span className="tab-count">
                  {picked.length} / {seats || "–"} seats
                </span>
              </h4>
              {!hired && air && <SeatPlan plan={plan} team={team} roomLeft={seats - team.length} />}
              <TeamPicker agents={agents} picked={picked} kit={kit} toggle={toggleAgent} />
            </section>
            <TeamSkills team={team} kit={kit} />
            {cost && <CostSummary cost={cost} hired={hired} info={info} />}
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

type Info = NonNullable<ReturnType<typeof targetInfo>>;
type Cost = NonNullable<ReturnType<typeof dispatchCost>>;

function GoneCold({ lead, close }: { lead: boolean; close: () => void }) {
  return (
    <div className="modal-backdrop">
      <Panel title="Dispatch" className="modal event">
        <p className="prose dim">{lead ? "This lead has gone cold." : "The site is gone."}</p>
        <div className="modal-row">
          <button className="action primary" onClick={close}>
            <span className="action-title">Close</span>
          </button>
        </div>
      </Panel>
    </div>
  );
}

/** Which base the team flies from, when more than one could. */
function BasePicker({
  info,
  baseId,
  choose,
}: {
  info: Info;
  baseId: string;
  choose: (id: string) => void;
}) {
  const g = useGame();
  const bases = readyBases(g, info.pos);
  if (bases.length <= 1) return null;
  const inReach = new Set(basesInReach(g, info.pos).map((r) => r.base.id));
  return (
    <section>
      <h4 className="section-title">From</h4>
      <div className="choice-row">
        {bases.map((r) => (
          <button
            key={r.base.id}
            className={`choice${r.base.id === baseId ? " on" : ""}`}
            onClick={() => choose(r.base.id)}
          >
            <span className="choice-title">{r.base.name.replace("Operational Base ", "")}</span>
            <span className="choice-meta">
              {Math.round(r.distance)} nm
              {inReach.has(r.base.id) ? "" : ", hired flights only"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const flightTime = (hours: number) =>
  hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`;

/** "2.5 h flight, via Malta (1 refuelling stop)", or why one of ours can't go. */
function craftNote(g: GameState, a: Aircraft, cost: Cost | null, outOfReach: boolean): string {
  if (isCraftDeployed(g, a)) return "In the air";
  if (outOfReach) {
    const refuelling = g.installations.some((i) => i.kind === "fuel") ? ", even refuelling" : "";
    return `Out of reach (${AIRCRAFT[a.kind].reachNm} nm${refuelling})`;
  }
  if (!cost) return "";
  const stops = cost.route?.stops.length ?? 0;
  const route = stops ? `, ${routeWords(cost.route!)} (${plural(stops, "refuelling stop")})` : "";
  const late = cost.lateBy > 0 ? ", arrives too late" : "";
  return `${flightTime(cost.hours)} flight${route}${late}`;
}

/** "3.0 h flight + 4 h to book, $12,000" for a hired flight. */
function hiredNote(f: HiredFlight, cost: Cost | null): string {
  if (!cost) return f.description;
  const booking = f.id === "commercial" ? "book and connect" : "book";
  const late = cost.lateBy > 0 ? ", arrives too late" : "";
  return `${cost.hours.toFixed(1)} h flight + ${f.prepHours} h to ${booking}, ${money(cost.money)}${late}`;
}

/** Our aircraft at the base (several may fly together), then the hired flights. */
function AircraftPicker({
  plan,
  info,
  flying,
  joining,
  toggleCraft,
  chooseHired,
}: {
  plan: DispatchPlan;
  info: Info;
  flying: string[];
  joining: boolean;
  toggleCraft: (id: string) => void;
  chooseHired: (f: HiredFlight) => void;
}) {
  const g = useGame();
  const base = installationById(g, plan.baseId);
  const ours = g.aircraft.filter((a) => a.baseId === plan.baseId);
  return (
    <section>
      <h4 className="section-title">Aircraft</h4>
      <div className="choice-col">
        {ours.map((a) => {
          const cost = dispatchCost(g, { ...plan, aircraftId: a.id, escorts: [] });
          const outOfReach = !base || !canReach(g, base.pos, info.pos, a.kind);
          return (
            <button
              key={a.id}
              disabled={isCraftDeployed(g, a) || outOfReach}
              className={`choice${flying.includes(a.id) ? " on" : ""}`}
              onClick={() => toggleCraft(a.id)}
            >
              <span className="choice-title">
                {a.name}{" "}
                <span className="choice-sub">
                  {AIRCRAFT[a.kind].name}, capacity {capacityOf(a.kind)}
                  {a.kind === "helicopter" ? ", lifts bodies" : ""}
                </span>
              </span>
              <span className={`choice-meta${cost && cost.lateBy > 0 ? " bad" : ""}`}>
                {craftNote(g, a, cost, outOfReach)}
              </span>
            </button>
          );
        })}
        {!joining &&
          HIRED_FLIGHTS.map((f) => {
            const cost = dispatchCost(g, { ...plan, aircraftId: f.id });
            return (
              <button
                key={f.id}
                className={`choice${f.id === plan.aircraftId ? " on" : ""}`}
                onClick={() => chooseHired(f)}
                title={f.description}
              >
                <span className="choice-title">
                  {f.name} <span className="choice-sub">{f.sub}</span>
                </span>
                <span className={`choice-meta${cost && cost.lateBy > 0 ? " bad" : ""}`}>
                  {hiredNote(f, cost)}
                </span>
              </button>
            );
          })}
      </div>
    </section>
  );
}

/** Civilian, plainclothes or tactical: what a hired flight lets aboard, and what a team joined wears. */
function KitPicker({
  kit,
  setKit,
  hired,
  joiningKit,
}: {
  kit: KitId;
  setKit: (k: KitId) => void;
  hired: HiredFlight | undefined;
  joiningKit: KitId | undefined;
}) {
  const refused = (k: KitId) => !!hired && !hired.kits.includes(k);
  const refusal =
    hired?.id === "commercial" ? "Not through airport security" : "Not through a charter terminal";
  return (
    <section>
      <h4 className="section-title">Kit</h4>
      <div className="choice-col">
        {KIT_IDS.map((k) => (
          <button
            key={k}
            className={`choice${k === kit ? " on" : ""}`}
            disabled={refused(k) || (!!joiningKit && k !== joiningKit)}
            data-tip={tipLines(KIT[k].description, refused(k) && refusal)}
            onClick={() => setKit(k)}
          >
            <span className="choice-title">{KIT[k].name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Who sits in which of our aircraft, and the room left for the haul. */
function SeatPlan({
  plan,
  team,
  roomLeft,
}: {
  plan: DispatchPlan;
  team: Agent[];
  roomLeft: number;
}) {
  const g = useGame();
  return (
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
        Room left for the haul: {roomLeft}. A body takes 2 (helicopter only), a captive 2.{" "}
        {plan.escorts?.length ? "" : "Choose more aircraft to fly together."}
      </p>
    </>
  );
}

/** The operatives at the base, to pick from: their gear for the kit chosen, wounds, traits. */
function TeamPicker({
  agents,
  picked,
  kit,
  toggle,
}: {
  agents: Agent[];
  picked: string[];
  kit: KitId;
  toggle: (id: string) => void;
}) {
  const g = useGame();
  return (
    <div className="pick-list">
      {agents.map((a) => {
        const away = isDeployed(g, a);
        const on = picked.includes(a.id);
        return (
          <div key={a.id} className="pick-row">
            <button
              className={`pick${on ? " on" : ""}`}
              disabled={away}
              onClick={() => toggle(a.id)}
            >
              <span className="pick-box">{on ? "✓" : ""}</span>
              <span className="pick-name">
                {agentName(a)} {!away && <GearIcons a={a} kit={kit} />}
                {!away && isWounded(g, a) && (
                  <span
                    className="pick-wounded"
                    data-tip={`Wounded: fit ${formatDate(a.woundedUntil)}. Sent now, they fight with the HP they have left.`}
                  >
                    {" "}
                    HP {Math.round(a.hp)}/{a.vitality}
                  </span>
                )}
              </span>
              {away ? (
                <span className="pick-note">In the field</span>
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
  );
}

/** The team's aptitudes as kitted, one bar each. */
function TeamSkills({ team, kit }: { team: Agent[]; kit: KitId }) {
  return (
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
  );
}

/** What it costs: secrecy, money, when they land, the light there. */
function CostSummary({
  cost,
  hired,
  info,
}: {
  cost: Cost;
  hired: HiredFlight | undefined;
  info: Info;
}) {
  let fare = "Fuel and crew";
  if (hired) fare = hired.id === "commercial" ? "Airline ticket" : "Charter";
  const late = cost.lateBy > 0;
  return (
    <section className="dispatch-cost">
      <div className={`kv${cost.secrecy >= 3 ? " bad" : ""}`}>
        <span>Secrecy</span>
        <span>{cost.secrecy ? `−${cost.secrecy.toFixed(1)}` : "unnoticed"}</span>
      </div>
      <div className="kv">
        <span>{fare}</span>
        <span>{money(cost.money)}</span>
      </div>
      <div className={`kv${late ? " bad" : ""}`}>
        <span>On the ground</span>
        <span>
          {formatDate(cost.arriveAt)} {formatClock(cost.arriveAt)}
          {late ? " (too late)" : ` (${timeLeft(info.expiresAt - cost.arriveAt)} to spare)`}
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
  );
}

// The base view, in the manner of the old XCOM base screen: a base is made of
// facilities, and each facility holds things. Region › Base › Facility › thing.
// The left column is the base's facilities; the right shows the one chosen,
// and inside it a single agent or aircraft.
import { AGENT_UPKEEP, RECRUIT_COST, STATS, type Stats } from "../../../data/agents";
import { AIRCRAFT, type AircraftKind } from "../../../data/aircraft";
import { BLOODLINES } from "../../../data/bloodlines";
import { CELLS_PER_CONTAINMENT, SYNERGY, CONTAINMENT_UPKEEP, FACILITIES, STAFF, type BaseUpgradeKind, type StaffKind } from "../../../data/installations";
import { projectById } from "../../../data/research";
import { regionById } from "../../../data/regions";
import { turnBlocker, turnChance, turnOperator, turnThrall } from "../../../sim/humint";
import { GOOD_IDS, GOODS, goodKnown, shortName, stockOf } from "../../../sim/market";
import {
  acquireAircraft, acquireBlocker, agentsAt, aircraftAt, baseReachNm, dismissAgent, dismissStaff, facilityCount, hangarsOf,
  hireBlocker, hireStaff, occupantsAt, quartersOf, staffOf, recruit, recruitBlocker, recruitingWeights, releaseAircraft, resaleValue, staffAt, staffRoom,
  upfrontCost, upgradeBase, upgradeBlocker, demolishBlocker, demolishRoom,
} from "../../../sim/personnel";
import { FLOOR_NAMES, floorsOf, isEntrance, isRoomKind, layoutOf, pendingRoomAt, ROOM_KINDS, roomAt, roomBonuses, SLOT_XY, type Place, type RoomKind } from "../../../sim/building";
import { daysLeft, executeBlocker, executeCaptive, freeStaff, projectsAt, questioning, releaseBlocker, releaseCaptive, stalled } from "../../../sim/research";
import { isReady, type Agent, type Aircraft, type Candidate, type GameState, type Installation } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { SupportBar } from "../../components/SupportBar";
import { Icon } from "../../components/Icon";
import { ActionButton } from "../../components/ActionButton";
import { money } from "../../format";
import { globe } from "../../globe";
import { agentName, agentStatus, aircraftStatus, STATUS_TONE, type Status } from "../../status";
import { useGame, useStore, type BaseView } from "../../store";
import { timeLeft } from "./FocusPanels";
import { LoadBar, type LoadItem } from "../../components/LoadBar";
import { missionOf } from "../../../sim/missions";
import { AIRLINE_FEE, airlineBlocker, airlineDays, capacityOf, carriesRemains, ferry, ferryBlocker, ferryHours, LOAD, movablePeople, sendByAirline } from "../../../sim/transfers";
import { useState } from "react";

const origin = (c: Candidate) => `${c.originCity}, ${regionById(c.originRegion)?.name ?? ""}`;
const bloodlineName = (id: string) => BLOODLINES.find((b) => b.id === id)?.name ?? id;

const VIEW_NAMES: Record<BaseView, string> = {
  overview: "Overview", quarters: "Quarters", recruit: "Candidates", hangars: "Hangars", labs: "Laboratories",
  workshops: "Workshops", containment: "Containment", stores: "Stores", construction: "Construction",
};

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function StatCells({ stats }: { stats: Stats }) {
  return (
    <>
      {STATS.map((s) => (
        <span key={s.id} className="stat-cell" title={`${s.name}: ${s.description}`}>
          <span className="stat-bar"><span style={{ width: `${stats[s.id]}%` }} /></span>
          <span className="stat-num">{stats[s.id]}</span>
        </span>
      ))}
    </>
  );
}

const StatHeader = () => <>{STATS.map((s) => <span key={s.id} className="th th-stat" title={`${s.name}: ${s.description}`}><Icon name={`stat-${s.id}`} size={14} />{s.short}</span>)}</>;

function StatusTag({ st }: { st: Status }) {
  return (
    <span className={`status status-${STATUS_TONE[st.kind]}`}>
      <span className="status-label">{st.label}</span>
      {st.note && <span className="status-note">{st.note}</span>}
    </span>
  );
}

/** Leave the base and show a mission or covert action on the globe. */
function useShowOnMap() {
  const g = useGame();
  const close = useStore((s) => s.closeBase);
  const focusOn = useStore((s) => s.focusOn);
  return (st: Status) => {
    const m = st.missionId && g.missions.find((x) => x.id === st.missionId);
    const c = st.coverUpId && g.coverUps.find((x) => x.id === st.coverUpId);
    const pos = m ? m.pos : c ? c.pos : null;
    if (!pos) return;
    close();
    globe()?.flyTo(pos, 2.0);
    focusOn(m ? { kind: "mission", id: m.id } : { kind: "coverup", id: (c as { id: string }).id });
  };
}

/** "Build a hangar · $400,000 · 7 days", for the facility a view expands. */
function ExpandButton({ base, kind }: { base: Installation; kind: BaseUpgradeKind }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const f = FACILITIES[kind];
  const why = upgradeBlocker(g, base.id, kind);
  const building = (base.upgrades ?? []).filter((u) => u.kind === kind);
  return (
    <div className="expand">
      {building.map((u, i) => (
        <div key={i} className="kv small"><span>Building {f.article}</span><span>ready {formatDate(u.readyAt)}</span></div>
      ))}
      <ActionButton icon="build" label={kind === "quarters" ? "Expand quarters" : `Build ${f.article}`} blocker={why}
        tip={[`${money(f.cost)} · ${f.days} days`, f.gives.replace(/^./, (c) => c.toUpperCase())]}
        onClick={() => command((s) => upgradeBase(s, base.id, kind), `Work begins on ${f.article}.`)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The facility tiles
// ---------------------------------------------------------------------------

interface Tile {
  view: BaseView;
  name: string;
  /** "6 / 12 beds". */
  count: string;
  /** 0..1 capacity used; null when it isn't a capacity. */
  fill: number | null;
  note: string;
  built: boolean;
}

function tiles(g: GameState, base: Installation): Tile[] {
  const agents = agentsAt(g, base.id);
  const st = agents.map((a) => agentStatus(g, a));
  const ready = st.filter((x) => x.kind === "ready").length;
  const away = st.filter((x) => x.kind === "field" || x.kind === "covert").length;
  const hurt = st.filter((x) => x.kind === "wounded").length;
  const craft = aircraftAt(g, base.id);
  const flying = craft.filter((c) => aircraftStatus(g, c).kind === "field").length;
  const labs = facilityCount(base, "lab"), shops = facilityCount(base, "workshop"), cont = facilityCount(base, "containment");
  const sci = staffAt(g, base, "scientist"), eng = staffAt(g, base, "engineer");
  const cells = cont * CELLS_PER_CONTAINMENT;
  const held = base.captives?.length ?? 0;
  const research = projectsAt(g, base.id, "research").length, engineering = projectsAt(g, base.id, "engineering").length;
  const goods = GOOD_IDS.filter((id) => id !== "tissue").reduce((t, id) => t + stockOf(g, id), 0);
  const pending = base.upgrades?.length ?? 0;
  const parts = (xs: (string | false)[]) => xs.filter(Boolean).join(" · ");
  return [
    { view: "overview", name: "Overview", count: regionById(base.regionId)?.name ?? "", fill: null, note: isReady(g, base) ? "operational" : `under construction, ${timeLeft(base.readyAt - g.time)}`, built: true },
    { view: "quarters", name: "Quarters", count: `${agents.length + sci + eng} / ${quartersOf(base)} beds`, fill: (agents.length + sci + eng) / quartersOf(base), note: parts([`${agents.length} agents, ${sci + eng} staff`, `${ready} ready`, away > 0 && `${away} away`, hurt > 0 && `${hurt} wounded`]), built: true },
    { view: "hangars", name: "Hangars", count: `${craft.length} / ${hangarsOf(base)} bays`, fill: craft.length / hangarsOf(base), note: parts([`${craft.length - flying} in`, flying > 0 && `${flying} flying`]), built: true },
    { view: "labs", name: "Laboratories", count: labs ? `${sci} / ${staffRoom(base, "scientist")} scientists` : "none", fill: labs ? sci / staffRoom(base, "scientist") : null, note: labs ? `${research} project${research === 1 ? "" : "s"}` : "not built", built: labs > 0 },
    { view: "workshops", name: "Workshops", count: shops ? `${eng} / ${staffRoom(base, "engineer")} engineers` : "none", fill: shops ? eng / staffRoom(base, "engineer") : null, note: shops ? `${engineering} project${engineering === 1 ? "" : "s"}` : "not built", built: shops > 0 },
    { view: "containment", name: "Containment", count: cells ? `${held} / ${cells} cells` : "none", fill: cells ? held / cells : null, note: cells ? (held ? "occupied" : "empty") : "not built", built: cells > 0 },
    { view: "stores", name: "Stores", count: `${base.remains ?? 0} remains`, fill: null, note: parts([goods > 0 && `${goods} goods`, g.market.artifacts.length > 0 && `${g.market.artifacts.length} artifacts`]) || "cold storage, goods", built: true },
    { view: "construction", name: "Construction", count: pending ? `${pending} under way` : "nothing under way", fill: null, note: "expand the base", built: true },
  ];
}

function TileNav({ base, view }: { base: Installation; view: BaseView }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const current = view === "recruit" ? "quarters" : view;
  return (
    <nav className="facility-nav">
      {tiles(g, base).map((t) => (
        <button key={t.view} className={`facility-tile${current === t.view ? " on" : ""}${t.built ? "" : " unbuilt"}`} onClick={() => openBase(base.id, t.view)}>
          <span className="facility-name"><Icon name={t.view} />{t.name}</span>
          <span className="facility-count">{t.count}</span>
          {t.fill !== null && <span className="progress"><span style={{ width: `${Math.round(Math.min(1, t.fill) * 100)}%` }} /></span>}
          <span className="facility-note">{t.note}</span>
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

function Overview({ base }: { base: Installation }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const region = regionById(base.regionId);
  const agents = agentsAt(g, base.id);
  const craft = aircraftAt(g, base.id);
  return (
    <>
      <p className="prose dim">
        {base.cell
          ? "A church cell: a few rooms under a parish, holding what's left of the Order's strike teams."
          : "An Operational Base: strike teams and their aircraft, laboratories, workshops and cells. Teams deploy from here, within their aircraft's reach."}
      </p>
      <div className="overview-grid">
        <div>
          <div className="kv"><span>Region</span><span>{region?.name}</span></div>
          <div className="kv kv-block"><span>Support</span><SupportBar support={g.regions[base.regionId]?.support ?? 0} /></div>
          {base.evictionWarned && <div className="kv bad"><span>Warning</span><span>the region means to evict us</span></div>}
          <div className="kv"><span>Status</span><span>{isReady(g, base) ? "Operational" : `Under construction, ready ${formatDate(base.readyAt)}`}</span></div>
          <div className="kv"><span>Reach of its aircraft</span><span>{baseReachNm(g, base.id).toLocaleString("en-US")} nm</span></div>
        </div>
        <div>
          <div className="kv"><span>Agents</span><span>{agents.length}</span></div>
          <div className="kv"><span>Ready now</span><span>{agents.filter((a) => agentStatus(g, a).kind === "ready").length}</span></div>
          <div className="kv"><span>Aircraft</span><span>{craft.map((c) => c.name).join(", ") || "none"}</span></div>
          <div className="kv"><span>Vampire remains</span><span>{base.remains ?? 0}</span></div>
          <div className="kv"><span>Captives</span><span>{base.captives?.length ?? 0}</span></div>
        </div>
      </div>
      <div className="build-actions two">
        <ActionButton icon="quarters" label="Quarters" tip={["The agents stationed here"]} onClick={() => openBase(base.id, "quarters")} />
        <ActionButton icon="hangars" label="Hangars" tip={["Aircraft and their bays"]} onClick={() => openBase(base.id, "hangars")} />
      </div>
    </>
  );
}

function Quarters({ base, agentId }: { base: Installation; agentId?: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  const agents = agentsAt(g, base.id);
  const chosen = agents.find((a) => a.id === agentId);
  const fallen = [...g.fallen].reverse();
  return (
    <div className={`split${chosen ? " with-detail" : ""}`}>
      <div className="split-main">
        <div className="facility-actions">
          <button className="mini primary" onClick={() => openBase(base.id, "recruit")}>Candidates ({g.candidates.length})</button>
          <span className="td-dim">{occupantsAt(g, base.id)} of {quartersOf(base)} beds ({agents.length} agents, {staffOf(g, base.id).length} staff) · upkeep {money(AGENT_UPKEEP)} an agent a month</span>
        </div>
        {agents.length === 0 ? (
          <p className="prose dim">No agents stationed here. Recruit some from the candidates.</p>
        ) : (
          <div className="table roster">
            <span className="th">Name</span><StatHeader /><span className="th">Status</span>
            {agents.map((a) => (
              <button key={a.id} className={`tr tr-button${a.id === agentId ? " on" : ""}`} onClick={() => openBase(base.id, "quarters", a.id === agentId ? undefined : a.id)}>
                <span className="td-name">{agentName(a)}</span>
                <StatCells stats={a.stats} />
                <StatusTag st={agentStatus(g, a)} />
              </button>
            ))}
          </div>
        )}
        {staffOf(g, base.id).length > 0 && (
          <>
            <h4 className="section-title">Staff</h4>
            <div className="table staff-roster">
              <span className="th">Name</span><span className="th">Role</span><span className="th" />
              {staffOf(g, base.id).map((p) => (
                <div key={p.id} className="tr">
                  <span className="td-name">{p.name}</span>
                  <span className="td-dim">{STAFF[p.role].name}, since {formatDate(p.hiredAt)}</span>
                  <button className="mini" onClick={() => command((s) => dismissStaff(s, base.id, p.role, p.id), `${p.name} leaves.`)}>Let go</button>
                </div>
              ))}
            </div>
          </>
        )}
        {fallen.length > 0 && (
          <div className="fallen">
            <h4 className="section-title">The fallen</h4>
            {fallen.map((f, k) => (
              <div key={k} className="td-dim">{f.sister ? "Sr." : "Br."} {f.name}, {f.where}, {formatDate(f.died)}</div>
            ))}
          </div>
        )}
        <ExpandButton base={base} kind="quarters" />
        <h4 className="section-title">Send to another base by airline</h4>
        <TransferPanel base={base} />
      </div>
      {chosen && <AgentDetail base={base} a={chosen} />}
    </div>
  );
}

function AgentDetail({ base, a }: { base: Installation; a: Agent }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  const show = useShowOnMap();
  const st = agentStatus(g, a);
  return (
    <aside className="detail">
      <div className="detail-head">
        <h3 className="detail-title">{agentName(a)}</h3>
        <button className="mini" onClick={() => openBase(base.id, "quarters")} title="Back to the roster">✕</button>
      </div>
      <p className="td-dim">{origin(a)} · joined {formatDate(a.joinedAt)}</p>
      <StatusTag st={st} />
      {(st.missionId || st.coverUpId) && <button className="mini" onClick={() => show(st)}>Show on the map</button>}
      <div className="hp">
        <span className="hp-label">Health</span>
        <span className="hp-bar"><span className={a.hp < a.stats.vitality * 0.75 ? "hurt" : ""} style={{ width: `${Math.round((100 * a.hp) / Math.max(1, a.stats.vitality))}%` }} /></span>
        <span className="hp-num">{Math.round(a.hp)} / {a.stats.vitality}</span>
      </div>
      <div className="detail-stats">
        {STATS.map((s) => (
          <div key={s.id} className="detail-stat" title={s.description}>
            <span className="detail-stat-name"><Icon name={`stat-${s.id}`} size={14} /> {s.name}</span>
            <span className="stat-bar"><span style={{ width: `${a.stats[s.id]}%` }} /></span>
            <span className="stat-num">{a.stats[s.id]}</span>
            <span className="detail-stat-desc">{s.description}</span>
          </div>
        ))}
      </div>
      <div className="kv"><span>Missions</span><span>{a.missions}</span></div>
      <div className="kv"><span>Kills</span><span>{a.kills}</span></div>
      <p className="small dim">Kit is chosen for the whole team when it is sent out.</p>
      <button className="mini" disabled={a.deployed} onClick={() => command((s) => dismissAgent(s, a.id), `${a.name} released from service.`) && openBase(base.id, "quarters")} title="Release from service">
        Release from service
      </button>
    </aside>
  );
}

function Recruit({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const blocker = recruitBlocker(g, base.id);
  const weights = recruitingWeights(g).sort((a, b) => b.weight - a.weight);
  const total = weights.reduce((a, w) => a + w.weight, 0);
  const top = weights.slice(0, 6);
  const rest = 1 - top.reduce((a, w) => a + w.weight, 0) / (total || 1);
  return (
    <>
      <p className="prose dim">
        The Church puts candidates forward from where the Order is trusted and present. Each takes the three vows and is
        trained by the Order: {money(RECRUIT_COST)} to train, {money(AGENT_UPKEEP)} a month in upkeep. New candidates each month.
      </p>
      <div className="network">
        <span className="network-label">Recruiting network</span>
        <div className="network-bar">
          {top.map((w, i) => (
            <span key={w.regionId} className={`seg seg-${i}`} style={{ flexGrow: w.weight }} title={`${regionById(w.regionId)?.name}: ${Math.round((100 * w.weight) / total)}%`} />
          ))}
          {rest > 0.005 && <span className="seg seg-rest" style={{ flexGrow: rest * total }} title={`Elsewhere: ${Math.round(rest * 100)}%`} />}
        </div>
        <div className="network-legend">
          {top.map((w, i) => (
            <span key={w.regionId}><i className={`seg-${i}`} />{regionById(w.regionId)?.name} {Math.round((100 * w.weight) / total)}%</span>
          ))}
        </div>
      </div>
      {g.candidates.length === 0 ? (
        <p className="prose dim">No candidates left this month.</p>
      ) : (
        <div className="table candidates">
          <span className="th">Name</span><span className="th">Origin</span><StatHeader /><span className="th" />
          {g.candidates.map((c) => (
            <div key={c.id} className="tr">
              <span className="td-name">{c.sister ? "Sr." : "Br."} {c.name}</span>
              <span className="td-dim">{origin(c)}</span>
              <StatCells stats={c.stats} />
              <button className="mini primary" disabled={!!blocker} title={blocker ?? `Recruit for ${money(RECRUIT_COST)}`}
                onClick={() => command((s) => recruit(s, c.id, base.id), `${c.name} takes vows and joins the Order.`)}>
                Recruit
              </button>
            </div>
          ))}
        </div>
      )}
      {blocker && <p className="action-blocker">{blocker}</p>}
    </>
  );
}

function Hangars({ base, aircraftId }: { base: Installation; aircraftId?: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  const craft = aircraftAt(g, base.id);
  const bays = hangarsOf(base);
  const chosen = craft.find((c) => c.id === aircraftId);
  return (
    <div className={`split${chosen ? " with-detail" : ""}`}>
      <div className="split-main">
        <div className="bays">
          {Array.from({ length: bays }, (_, i) => {
            const c = craft[i];
            if (!c) return <div key={i} className="bay empty"><span className="bay-num">Bay {i + 1}</span><span className="td-dim">Empty</span></div>;
            const d = AIRCRAFT[c.kind];
            const st = aircraftStatus(g, c);
            return (
              <button key={c.id} className={`bay${c.id === aircraftId ? " on" : ""}`} onClick={() => openBase(base.id, "hangars", c.id === aircraftId ? undefined : c.id)}>
                <span className="bay-num">Bay {i + 1}</span>
                <span className="bay-name">{c.name}</span>
                <span className="td-dim">{d.name} · {d.seats} seats · reach {d.reachNm} nm</span>
                <StatusTag st={st} />
              </button>
            );
          })}
        </div>
        <h4 className="section-title">Acquire aircraft</h4>
        <div className="build-actions two">
          {(Object.keys(AIRCRAFT) as AircraftKind[]).map((k) => {
            const d = AIRCRAFT[k];
            const why = acquireBlocker(g, base.id, k);
            const owned = d.ownership === "owned";
            return (
              <ActionButton key={k} icon={k} label={`${owned ? "Buy" : "Lease"} a ${d.name.toLowerCase()}`} blocker={why}
                tip={[owned ? `${money(upfrontCost(k))}, then ${money(d.monthly)}/mo crew` : `${money(d.monthly)}/mo`, `${d.seats} seats · ${d.speedKn} kn · reach ${d.reachNm} nm`, d.description]}
                onClick={() => command((s) => acquireAircraft(s, base.id, k), `${d.name} ${owned ? "bought" : "leased"}.`)} />
            );
          })}
        </div>
        <ExpandButton base={base} kind="hangar" />
      </div>
      {chosen && <AircraftDetail base={base} c={chosen} />}
    </div>
  );
}

/** Everything aboard an aircraft away from its hangar, for the load bar. */
function aboardItems(g: GameState, c: Aircraft): LoadItem[] {
  const m = missionOf(g, c.id);
  const ids = m?.agentIds ?? c.ferry?.people ?? [];
  const people = ids.map((id): LoadItem | null => {
    const a = g.agents.find((x) => x.id === id);
    if (a) return { id, load: LOAD.person, label: agentName(a), kind: "operative" };
    const p = g.staff.find((x) => x.id === id);
    return p ? { id, load: LOAD.person, label: p.name, kind: p.role } : null;
  }).filter((x): x is LoadItem => !!x);
  const cap = (c.cargo?.captives ?? []).map((x): LoadItem => ({ id: x.id, load: LOAD.captive, label: `Captive ${x.kind}`, kind: "bio" }));
  const bodies = Array.from({ length: c.cargo?.remains ?? 0 }, (_, k): LoadItem => ({ id: `r${k}`, load: LOAD.remains, label: "Vampire remains", kind: "bio" }));
  return [...people, ...cap, ...bodies];
}

/** Who goes where: aboard this aircraft (a ferry flight) or, without one, by airline. */
function TransferPanel({ base, aircraft }: { base: Installation; aircraft?: Aircraft }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const others = g.installations.filter((i) => i.kind === "base" && i.id !== base.id && isReady(g, i));
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [remains, setRemains] = useState(0);
  const [caps, setCaps] = useState<string[]>([]);
  if (!others.length) return <p className="small dim">No other base to send anyone to.</p>;
  const captives = (base.captives ?? []).filter((x) => !questioning(g, x.id));
  const capIds = caps.filter((id) => captives.some((x) => x.id === id));
  const bodies = Math.min(remains, base.remains ?? 0);
  const pick = { remains: bodies, captives: capIds };
  const people = movablePeople(g, base.id);
  const ids = picked.filter((id) => people.some((x) => x.p.id === id));
  const toggle = (id: string) => setPicked(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const items: LoadItem[] = [
    ...people.filter((x) => ids.includes(x.p.id)).map((x): LoadItem => ({
      id: x.p.id, load: LOAD.person, label: x.kind === "agent" ? agentName(x.p) : x.p.name, kind: x.kind === "agent" ? "operative" : x.p.role,
    })),
    ...captives.filter((x) => capIds.includes(x.id)).map((x): LoadItem => ({ id: x.id, load: LOAD.captive, label: `Captive ${x.kind}`, kind: "bio" })),
    ...Array.from({ length: bodies }, (_, k): LoadItem => ({ id: `remains-${k}`, load: LOAD.remains, label: "Vampire remains", kind: "bio" })),
  ];
  const target = others.find((b) => b.id === to);
  const hours = aircraft && ferryHours(g, aircraft.id, to);
  const why = aircraft ? ferryBlocker(g, aircraft.id, to, ids, pick) : airlineBlocker(g, base.id, to, ids);
  return (
    <div className="transfer">
      <div className="kv"><span>To</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>
      {aircraft && <LoadBar items={items} capacity={capacityOf(aircraft.kind)} />}
      <div className="people-pick">
        {people.map((x) => (
          <label key={x.p.id} style={{ display: "contents" }}>
            <input type="checkbox" checked={ids.includes(x.p.id)} onChange={() => toggle(x.p.id)} />
            <span>{x.kind === "agent" ? agentName(x.p) : x.p.name}</span>
            <span className="td-dim">{x.kind === "agent" ? "Operative" : STAFF[x.p.role].name}</span>
          </label>
        ))}
      </div>
      {aircraft && ((base.remains ?? 0) > 0 || captives.length > 0) && (
        <div className="people-pick">
          {(base.remains ?? 0) > 0 && (
            <>
              <span />
              <span>Vampire remains ({base.remains} in cold storage){!carriesRemains(aircraft.kind) ? " — helicopter only" : ""}</span>
              <span className="stepper">
                <button className="mini" disabled={bodies <= 0} onClick={() => setRemains(bodies - 1)}>−</button>
                <span>{bodies}</span>
                <button className="mini" disabled={bodies >= (base.remains ?? 0) || !carriesRemains(aircraft.kind)} onClick={() => setRemains(bodies + 1)}>+</button>
              </span>
            </>
          )}
          {captives.map((x) => (
            <label key={x.id} style={{ display: "contents" }}>
              <input type="checkbox" checked={capIds.includes(x.id)} onChange={() => setCaps(capIds.includes(x.id) ? capIds.filter((y) => y !== x.id) : [...capIds, x.id])} />
              <span>Captive {x.kind}, taken in {x.city}</span>
              <span className="td-dim">needs a cell</span>
            </label>
          ))}
        </div>
      )}
      {aircraft ? (
        <ActionButton icon={aircraft.kind} label={`Fly to ${target?.name ?? "…"}`} blocker={why}
          tip={[hours ? `About ${Math.ceil(hours)} hours` : null, ids.length ? `${ids.length} aboard; their beds move with them` : "Empty: just the aircraft", "It stays at the new base."]}
          onClick={() => { command((s) => ferry(s, aircraft.id, to, ids, pick), `${aircraft.name} takes off.`); setPicked([]); setRemains(0); setCaps([]); }} />
      ) : (
        <ActionButton icon="bases" label={`Send by airline to ${target?.name ?? "…"}`} blocker={why}
          tip={[`${money(AIRLINE_FEE)} a head · ${airlineDays(g, base.id, to)} day${airlineDays(g, base.id, to) === 1 ? "" : "s"}`, "Unarmed. Their beds move with them."]}
          onClick={() => { command((s) => sendByAirline(s, base.id, to, ids), "On their way."); setPicked([]); }} />
      )}
    </div>
  );
}

function AircraftDetail({ base, c }: { base: Installation; c: Aircraft }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  const show = useShowOnMap();
  const d = AIRCRAFT[c.kind];
  const st = aircraftStatus(g, c);
  const owned = d.ownership === "owned";
  const m = missionOf(g, c.id);
  return (
    <aside className="detail">
      <div className="detail-head">
        <h3 className="detail-title">{c.name}</h3>
        <button className="mini" onClick={() => openBase(base.id, "hangars")} title="Back to the hangars">✕</button>
      </div>
      <p className="td-dim">{d.name} · callsign {d.callsign}</p>
      <StatusTag st={st} />
      {st.missionId && <button className="mini" onClick={() => show(st)}>Show on the map</button>}
      {m && <p className="small">Team: {m.agentIds.map((id) => g.agents.find((a) => a.id === id)).filter((a): a is Agent => !!a).map(agentName).join(", ")}</p>}
      {c.deployed && <LoadBar items={aboardItems(g, c)} capacity={capacityOf(c.kind)} />}
      <div className="kv"><span>Capacity</span><span>{capacityOf(c.kind)}</span></div>
      <div className="kv"><span>Speed</span><span>{d.speedKn} kn</span></div>
      <div className="kv"><span>Reach</span><span>{d.reachNm.toLocaleString("en-US")} nm</span></div>
      <div className="kv"><span>{owned ? "Crew and upkeep" : "Lease"}</span><span>{money(d.monthly)}/mo</span></div>
      <p className="small dim">{d.description}</p>
      <button className="mini" disabled={c.deployed}
        onClick={() => command((s) => releaseAircraft(s, c.id), owned ? `${c.name} sold for ${money(resaleValue(c.kind))}.` : `${c.name} returned to the lessor.`) && openBase(base.id, "hangars")}>
        {owned ? `Sell for ${money(resaleValue(c.kind))}` : "Return the lease"}
      </button>
      {!c.deployed && (
        <>
          <h4 className="section-title">Fly to another base</h4>
          <TransferPanel base={base} aircraft={c} />
        </>
      )}
    </aside>
  );
}

function StaffRow({ base, kind }: { base: Installation; kind: StaffKind }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const d = STAFF[kind];
  const why = hireBlocker(g, base.id, kind);
  const n = staffAt(g, base, kind);
  return (
    <div className="staff-row">
      <span className="td-name">{d.plural}</span>
      <span>{n} of {staffRoom(base, kind)} · {n - freeStaff(g, base, kind)} on projects</span>
      <ActionButton mini label="Let go" blocker={n ? null : `No ${d.plural.toLowerCase()} here.`} tip={["They leave the Order's service; the hiring fee is lost"]}
        onClick={() => command((s) => dismissStaff(s, base.id, kind), `A ${d.name.toLowerCase()} leaves the Order's service.`)} />
      <ActionButton mini primary icon="hire" label="Hire" blocker={why} tip={[`${money(d.hire)} to hire, then ${money(d.salary)} a month`]}
        onClick={() => command((s) => hireStaff(s, base.id, kind), `${d.name} hired.`)} />
    </div>
  );
}

/** Laboratories or workshops: their staff, and the projects running here. */
function Science({ base, kind }: { base: Installation; kind: "research" | "engineering" }) {
  const g = useGame();
  const openResearch = useStore((s) => s.openResearch);
  const staff: StaffKind = kind === "research" ? "scientist" : "engineer";
  const facility: BaseUpgradeKind = kind === "research" ? "lab" : "workshop";
  const built = facilityCount(base, facility) > 0;
  const running = projectsAt(g, base.id, kind);
  return (
    <>
      <p className="prose dim">
        {kind === "research"
          ? "Lay scientists, paid a salary, study what the teams bring back. Remains and captives held here can only be studied here."
          : "Lay engineers build what research makes possible: kit, aircraft, and goods for the black market."}
      </p>
      {built ? (
        <>
          <StaffRow base={base} kind={staff} />
          <h4 className="section-title">Projects here</h4>
          {running.length === 0 ? (
            <p className="small dim">Nothing running.</p>
          ) : (
            <ul className="list">
              {running.map((a) => {
                const p = projectById(a.projectId);
                if (!p) return null;
                const left = daysLeft(p, a.progress, a.staff);
                return (
                  <li key={a.id} className="project-line">
                    <span className="td-name">{p.name}</span>
                    <span className="td-dim">{a.staff} on it · {stalled(a) ? "waiting for a free hangar" : Number.isFinite(left) ? `${left} day${left === 1 ? "" : "s"} left` : "nobody on it"}</span>
                    <span className="progress"><span style={{ width: `${Math.round((100 * a.progress) / p.points)}%` }} /></span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="build-actions">
            <ActionButton primary icon={kind === "research" ? "research" : "engineering"} label={kind === "research" ? "Choose research" : "Choose engineering"}
              tip={["Start projects and assign staff, at this base or any other"]} onClick={() => openResearch(kind)} />
          </div>
        </>
      ) : (
        <p className="small dim">This base has no {kind === "research" ? "laboratory" : "workshop"} yet.</p>
      )}
      <ExpandButton base={base} kind={facility} />
    </>
  );
}

function Containment({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const captives = base.captives ?? [];
  const n = facilityCount(base, "containment");
  const cells = n * CELLS_PER_CONTAINMENT;
  return (
    <>
      <p className="prose dim">
        Cells for thralls and vampires taken alive. Captives can be questioned (on the Research screen), turned, released or destroyed.
        {n > 0 && ` Upkeep ${money(n * CONTAINMENT_UPKEEP)} a month, full or empty.`}
      </p>
      {cells === 0 ? (
        <p className="small dim">No containment here: captives taken by teams from this base can't be held.</p>
      ) : (
        <div className="cells">
          {Array.from({ length: cells }, (_, i) => {
            const c = captives[i];
            if (!c) return <div key={i} className="cell empty"><span className="bay-num">Cell {i + 1}</span><span className="td-dim">Empty</span></div>;
            const vampire = c.kind === "vampire";
            const why = vampire ? executeBlocker(g, c.id) : releaseBlocker(g, c.id);
            return (
              <div key={c.id} className={`cell ${c.kind}`}>
                <span className="bay-num">Cell {i + 1}</span>
                <span className="bay-name">{vampire ? "Vampire" : "Thrall"} of {bloodlineName(c.bloodline)}</span>
                <span className="td-dim">taken in {c.city}, {formatDate(c.takenAt)}{questioning(g, c.id) ? " · being questioned" : ""}</span>
                <span className="cell-actions">
                  {!vampire && <TurnButton captiveId={c.id} />}
                  <button className="mini" disabled={!!why} title={why ?? (vampire ? "Fire and sunlight. Its remains go to cold storage." : "Hand them to a convent hospital and free the cell.")}
                    onClick={() => command((s) => (vampire ? executeCaptive(s, c.id) : releaseCaptive(s, c.id)), vampire ? "The vampire is destroyed." : "The thrall is released into the Church's care.")}>
                    {vampire ? "Destroy" : "Release"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <ExpandButton base={base} kind="containment" />
    </>
  );
}

function Stores({ base }: { base: Installation }) {
  const g = useGame();
  const openMarket = useStore((s) => s.openMarket);
  const goods = GOOD_IDS.filter((id) => id !== "tissue" && goodKnown(g, id));
  return (
    <>
      <h4 className="section-title">Cold storage, {base.name}</h4>
      <div className="kv"><span>Vampire remains</span><span>{base.remains ?? 0}</span></div>
      <p className="small dim">Remains here feed the laboratories, or sell as tissue on the black market.</p>
      <h4 className="section-title">The Order's goods</h4>
      {goods.length === 0 ? (
        <p className="small dim">Nothing produced yet. The workshops make goods once research allows.</p>
      ) : (
        goods.map((id) => <div key={id} className="kv"><span>{GOODS[id].name}</span><span>{stockOf(g, id)}</span></div>)
      )}
      <h4 className="section-title">Artifacts</h4>
      {g.market.artifacts.length === 0 ? (
        <p className="small dim">None taken yet. Raids on the bloodlines' sites sometimes turn them up.</p>
      ) : (
        <ul className="list">
          {g.market.artifacts.map((a) => (
            <li key={a.id} className="kv"><span>{shortName(a)}</span><span className="td-dim">{bloodlineName(a.bloodline)}, {a.city}</span></li>
          ))}
        </ul>
      )}
      <div className="build-actions">
        <ActionButton icon="market" label="The black market" tip={["Sell goods, tissue and artifacts"]} onClick={openMarket} />
      </div>
    </>
  );
}

const ROOM_SHORT: Record<RoomKind, string> = { quarters: "Quarters", lab: "Lab", workshop: "Workshop", containment: "Cells", sigint: "SIGINT" };

/** The base building: a floor plan per floor, top floor first. Click a tile to build or clear. */
function Construction({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const [sel, setSel] = useState<Place | null>(null);
  layoutOf(base);
  const bonuses = roomBonuses(base);
  const pending = base.upgrades ?? [];
  const room = sel && roomAt(base, sel);
  const under = sel && pendingRoomAt(base, sel);
  const tile = (floor: number, x: number, y: number) => {
    if (x === 1 && y === 1) return <div key="core" className="room core" title="Lift and stairs">Core</div>;
    const slot = SLOT_XY.findIndex(([sx, sy]) => sx === x && sy === y);
    const p = { floor, slot };
    const r = roomAt(base, p), u = pendingRoomAt(base, p), bonus = bonuses.get(`${floor}:${slot}`) ?? 0;
    const chosen = sel?.floor === floor && sel.slot === slot;
    if (isEntrance(base, p)) return <div key={slot} className="room entrance" title="Lobby and security checkpoint">Entrance</div>;
    return (
      <button key={slot} className={`room ${r ? `built ${r.kind}` : u ? "pending" : "office"}${chosen ? " chosen" : ""}`} onClick={() => setSel(chosen ? null : p)}>
        <span>{r ? ROOM_SHORT[r.kind] : u && isRoomKind(u.kind) ? ROOM_SHORT[u.kind] : "Office"}</span>
        {r && bonus > 0 && <span className="bonus">+{Math.round(bonus * 100)}%</span>}
        {!r && u && <span className="bonus">{timeLeft(u.readyAt - g.time)}</span>}
      </button>
    );
  };
  return (
    <>
      <p className="small dim">Offices on three floors round the lift and stairs. Rooms of one kind in a line of 3 (a side of a floor, or stacked through all three floors) work {Math.round(SYNERGY.line * 100)}% faster; an adjacent pair, {Math.round(SYNERGY.pair * 100)}%.</p>
      <div className="floors">
        {floorsOf(base).map((floor) => (
          <div key={floor} className="floor">
            <div className="small dim">{FLOOR_NAMES[floor]}</div>
            <div className="floor-grid">{[2, 1, 0].flatMap((y) => [0, 1, 2].map((x) => tile(floor, x, y)))}</div>
          </div>
        ))}
        <div className="small dim floor-front">The street is at the bottom of each plan.</div>
      </div>
      {sel && room && (
        <div className="room-panel">
          <div className="kv"><span>{FACILITIES[room.kind].name}{room.kind === "sigint" ? `, level ${facilityCount(base, "sigint")}` : ""}</span><span>{Math.round((bonuses.get(`${sel.floor}:${sel.slot}`) ?? 0) * 100)}% synergy</span></div>
          {room.kind === "sigint" && facilityCount(base, "sigint") < FACILITIES.sigint.max && <ExpandButton base={base} kind="sigint" />}
          <ActionButton icon="build" label="Clear to office space" blocker={demolishBlocker(g, base.id, sel)} tip={["Nothing is refunded."]}
            onClick={() => { command((s) => demolishRoom(s, base.id, sel), "Cleared back to office space."); setSel(null); }} />
        </div>
      )}
      {sel && !room && under && <div className="room-panel kv"><span>Building {FACILITIES[under.kind].article}</span><span>ready {formatDate(under.readyAt)}</span></div>}
      {sel && !room && !under && (
        <div className="room-panel build-actions grid">
          {ROOM_KINDS.map((k) => {
            const f = FACILITIES[k];
            return <ActionButton key={k} icon="build" label={`Build ${f.article}`} blocker={upgradeBlocker(g, base.id, k, sel)}
              tip={[`${money(f.cost)} · ${f.days} days`, f.gives.replace(/^./, (c) => c.toUpperCase())]}
              onClick={() => { command((s) => upgradeBase(s, base.id, k, sel), `Work begins on ${f.article}.`); setSel(null); }} />;
          })}
        </div>
      )}
      {!sel && <p className="small dim">Choose an office to build in it, or a room to see it.</p>}
      <h4 className="section-title">Beside the building</h4>
      <div className="kv"><span>Hangar</span><span>{facilityCount(base, "hangar")} of {FACILITIES.hangar.max} aircraft (one helicopter on the roof)</span></div>
      <ExpandButton base={base} kind="hangar" />
      {pending.length > 0 && <h4 className="section-title">Under way</h4>}
      {pending.map((u, i) => (
        <div key={i} className="kv"><span>Building {FACILITIES[u.kind].article}{u.floor !== undefined ? `, ${FLOOR_NAMES[u.floor]!.toLowerCase()}` : ""}</span><span>ready {formatDate(u.readyAt)} ({timeLeft(u.readyAt - g.time)})</span></div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

export function BaseScreen() {
  const g = useGame();
  const screen = useStore((s) => s.baseScreen);
  const openBase = useStore((s) => s.openBase);
  const close = useStore((s) => s.closeBase);
  if (!screen) return null;
  const base = g.installations.find((i) => i.id === screen.baseId);
  if (!base) return null;
  const bases = g.installations.filter((i) => i.kind === "base");
  const at = bases.indexOf(base);
  const step = (d: number) => openBase(bases[(at + d + bases.length) % bases.length]!.id, screen.view);
  const view = screen.view;
  const item = screen.item;
  const thing = item && (g.agents.find((a) => a.id === item) ?? g.aircraft.find((c) => c.id === item));
  const parent: BaseView | null = view === "recruit" ? "quarters" : null;

  return (
    <div className="base-view">
      <header className="base-view-head">
        <nav className="crumbs">
          <button className="crumb" onClick={() => { close(); globe()?.flyTo(base.pos, 2.4); useStore.getState().selectRegion(base.regionId, base.pos); }}>{regionById(base.regionId)?.name}</button>
          <span className="crumb-sep">›</span>
          <button className="crumb" onClick={() => openBase(base.id, "overview")}>{base.name}</button>
          {view !== "overview" && (
            <>
              {parent && (<><span className="crumb-sep">›</span><button className="crumb" onClick={() => openBase(base.id, parent)}>{VIEW_NAMES[parent]}</button></>)}
              <span className="crumb-sep">›</span>
              <button className="crumb" onClick={() => openBase(base.id, view)}>{VIEW_NAMES[view]}</button>
            </>
          )}
          {thing && (<><span className="crumb-sep">›</span><span className="crumb current">{"sister" in thing ? agentName(thing) : thing.name}</span></>)}
        </nav>
        <div className="base-switch">
          {bases.length > 1 && <button className="mini" onClick={() => step(-1)} title="Previous base">◀</button>}
          <span className="base-switch-name">{base.name}{bases.length > 1 ? ` · ${at + 1} of ${bases.length}` : ""}</span>
          {bases.length > 1 && <button className="mini" onClick={() => step(1)} title="Next base">▶</button>}
        </div>
        <span className="base-funds">Funds <b>{money(g.funds)}</b></span>
        <button className="mini" onClick={close} title="Back to the globe (Esc)">Close ✕</button>
      </header>
      <div className="base-view-body">
        <TileNav base={base} view={view} />
        <section className="base-view-main panel">
          <h2 className="facility-title">{VIEW_NAMES[view]}</h2>
          {view === "overview" && <Overview base={base} />}
          {view === "quarters" && <Quarters base={base} agentId={item} />}
          {view === "recruit" && <Recruit base={base} />}
          {view === "hangars" && <Hangars base={base} aircraftId={item} />}
          {view === "labs" && <Science base={base} kind="research" />}
          {view === "workshops" && <Science base={base} kind="engineering" />}
          {view === "containment" && <Containment base={base} />}
          {view === "stores" && <Stores base={base} />}
          {view === "construction" && <Construction base={base} />}
        </section>
      </div>
    </div>
  );
}

/** Release a thrall as our source inside its bloodline: the best free operator makes the pitch (tradecraft). */
function TurnButton({ captiveId }: { captiveId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const why = turnBlocker(g, captiveId);
  const op = turnOperator(g, captiveId);
  const odds = op ? Math.round(turnChance(op.stats.tradecraft) * 100) : 0;
  return (
    <button className="mini" disabled={!!why} onClick={() => command((s) => turnThrall(s, captiveId))}
      title={why ?? `${op!.sister ? "Sr." : "Br."} ${op!.name} makes the pitch (tradecraft ${op!.stats.tradecraft}, about ${odds}%). Turned, it goes back to its bloodline as our informant; if not, it's released, and may tell its masters what it saw.`}>
      Turn
    </button>
  );
}

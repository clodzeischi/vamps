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
  hireBlocker, hireStaff, occupantsAt, quartersOf, staffCandidatesOf, staffOf, recruit, recruitBlocker, recruitingWeights, releaseAircraft, resaleValue, staffAt, staffRoom,
  upfrontCost, upgradeBase, upgradeBlocker, demolishBlocker, demolishRoom,
} from "../../../sim/personnel";
import { FLOOR_NAMES, floorsOf, isEntrance, isRoomKind, layoutOf, pendingRoomAt, ROOM_KINDS, roomAt, roomBonuses, SLOT_XY, type Place, type RoomKind } from "../../../sim/building";
import { engineersAt, leadOf, moveProject, setLeadEngineer, teamOn, topOfQueue, unitsOf } from "../../../sim/engineering";
import { leadAnalyst, setLeadAnalyst } from "../../../sim/intel";
import { leadScientist, researchBlocked, researchQueue, researchTeam, scientists, setLeadScientist, topOfResearch } from "../../../sim/science";
import { aptitude } from "../../../sim/aptitudes";
import { APTITUDES, type Aptitudes, type StaffRole } from "../../../data/aptitudes";
import { runDays, executeBlocker, executeCaptive, projectsAt, questioning, releaseBlocker, releaseCaptive, stalled } from "../../../sim/research";
import { isReady, type Agent, type Aircraft, type Candidate, type GameState, type Installation, type StaffMember } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { SupportBar } from "../../components/SupportBar";
import { Icon, type IconName } from "../../components/Icon";
import { ActionButton } from "../../components/ActionButton";
import { money } from "../../format";
import { globe } from "../../globe";
import { agentName, agentStatus, aircraftStatus, STATUS_TONE, type Status } from "../../status";
import { useGame, useStore, type BaseView } from "../../store";
import { timeLeft } from "./FocusPanels";
import { LoadBar } from "../../components/LoadBar";
import { Armoury, LoadoutEditor } from "../../components/Gear";
import { missionOf } from "../../../sim/missions";
import { capacityOf } from "../../../sim/transfers";
import { aboardItems, TransferPanel } from "../../components/Transfer";
import { useState } from "react";

const origin = (c: Candidate) => `${c.originCity}, ${regionById(c.originRegion)?.name ?? ""}`;
const bloodlineName = (id: string) => BLOODLINES.find((b) => b.id === id)?.name ?? id;

const VIEW_NAMES: Record<BaseView, string> = {
  overview: "Overview", personnel: "Personnel", hiring: "Hiring", hangars: "Hangars", labs: "Laboratories",
  workshops: "Workshops", containment: "Containment", stores: "Stores", armoury: "Armoury", construction: "Construction",
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

/** A scientist's or engineer's four aptitudes, as stat bars (whole numbers; they grow in fractions). */
function AptCells({ role, apt }: { role: StaffRole; apt?: Aptitudes }) {
  return (
    <>
      {APTITUDES[role].map((a) => (
        <span key={a.id} className="stat-cell" title={`${a.name}: ${a.covers}`}>
          <span className="stat-bar"><span style={{ width: `${Math.floor(aptitude({ aptitudes: apt }, a.id))}%` }} /></span>
          <span className="stat-num">{Math.floor(aptitude({ aptitudes: apt }, a.id))}</span>
        </span>
      ))}
    </>
  );
}
const AptHeader = ({ role }: { role: StaffRole }) => <>{APTITUDES[role].map((a) => <span key={a.id} className="th th-stat" title={`${a.name}: ${a.covers}`}>{a.short}</span>)}</>;

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
  icon: IconName;
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
  const hurt = st.filter((x) => x.kind === "wounded").length;
  const craft = aircraftAt(g, base.id);
  const flying = craft.filter((c) => aircraftStatus(g, c).kind === "field").length;
  const labs = facilityCount(base, "lab"), shops = facilityCount(base, "workshop"), cont = facilityCount(base, "containment");
  const sci = staffAt(g, base, "scientist"), eng = staffAt(g, base, "engineer");
  const cells = cont * CELLS_PER_CONTAINMENT;
  const held = base.captives?.length ?? 0;
  const research = researchQueue(g).length, engineering = projectsAt(g, base.id, "engineering").length;
  const goods = GOOD_IDS.filter((id) => id !== "tissue").reduce((t, id) => t + stockOf(g, id), 0);
  const pending = base.upgrades?.length ?? 0;
  const parts = (xs: (string | false)[]) => xs.filter(Boolean).join(" · ");
  const out: (Tile | false)[] = [
    { view: "overview", icon: "overview", name: "Overview", count: regionById(base.regionId)?.name ?? "", fill: null, note: isReady(g, base) ? "operational" : `under construction, ${timeLeft(base.readyAt - g.time)}`, built: true },
    { view: "personnel", icon: "recruit", name: "Personnel", count: `${occupantsAt(g, base.id)} / ${quartersOf(base)} beds`, fill: occupantsAt(g, base.id) / quartersOf(base), note: parts([`${agents.length} agents, ${sci + eng} staff`, `${ready} ready`, hurt > 0 && `${hurt} wounded`]), built: true },
    { view: "hangars", icon: "hangars", name: "Hangars", count: `${craft.length} / ${hangarsOf(base)} bays`, fill: craft.length / hangarsOf(base), note: parts([`${craft.length - flying} in`, flying > 0 && `${flying} flying`]), built: true },
    { view: "labs", icon: "labs", name: "Laboratories", count: labs ? `${sci} / ${staffRoom(base, "scientist")} scientists` : "none", fill: labs ? sci / staffRoom(base, "scientist") : null, note: labs ? `${research} in the research queue` : "not built", built: labs > 0 },
    { view: "workshops", icon: "workshops", name: "Workshops", count: shops ? `${eng} / ${staffRoom(base, "engineer")} engineers` : "none", fill: shops ? eng / staffRoom(base, "engineer") : null, note: shops ? `${engineering} project${engineering === 1 ? "" : "s"}` : "not built", built: shops > 0 },
    // Containment only once a cell is built (user, 2026-11-16).
    cells > 0 && { view: "containment", icon: "containment", name: "Containment", count: `${held} / ${cells} cells`, fill: held / cells, note: held ? "occupied" : "empty", built: true },
    { view: "armoury", icon: "armoury", name: "Armoury", count: `${Object.values(base.armoury ?? {}).reduce((t, n) => t + (n ?? 0), 0)} items`, fill: null, note: "weapons, armour, kit", built: true },
    { view: "stores", icon: "stores", name: "Stores", count: `${base.remains ?? 0} remains`, fill: null, note: parts([goods > 0 && `${goods} goods`, g.market.artifacts.length > 0 && `${g.market.artifacts.length} artifacts`]) || "cold storage, goods", built: true },
    { view: "construction", icon: "construction", name: "Construction", count: pending ? `${pending} under way` : "nothing under way", fill: null, note: "build and clear rooms, hangars", built: true },
  ];
  return out.filter((t): t is Tile => !!t);
}

function TileNav({ base, view }: { base: Installation; view: BaseView }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const current = view === "hiring" ? "personnel" : view;
  return (
    <nav className="facility-nav">
      {tiles(g, base).map((t) => (
        <button key={t.view} className={`facility-tile${current === t.view ? " on" : ""}${t.built ? "" : " unbuilt"}`} onClick={() => openBase(base.id, t.view)}>
          <span className="facility-name"><Icon name={t.icon} />{t.name}</span>
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

/** The research or engineering projects running at a base, with their progress. */
function ProjectLines({ base, kind }: { base: Installation; kind: "research" | "engineering" }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const eng = kind === "engineering";
  const running = eng ? projectsAt(g, base.id, kind) : researchQueue(g);
  if (!running.length) return <p className="small dim">The queue is empty.</p>;
  const top = eng ? topOfQueue(g, base.id) : topOfResearch(g);
  return (
    <ul className="list">
      {running.map((a, i) => {
        const p = projectById(a.projectId);
        if (!p) return null;
        const left = runDays(g, a);
        const blocked = eng ? null : researchBlocked(g, a);
        const when = blocked ? `waiting: ${blocked.replace(/^Needs/, "needs")}` : stalled(a) ? "waiting for a free hangar" : a.short ? "stopped: no money for the materials"
          : Number.isFinite(left) ? `${left} day${left === 1 ? "" : "s"}${a !== top ? " (queued)" : " left"}` : eng ? "no engineers" : "no scientists";
        return (
          <li key={a.id} className="project-line queued">
            <span className="td-name">{i + 1}. {p.name}{unitsOf(a) > 1 ? ` ×${unitsOf(a)}` : ""}</span>
            <span className="td-dim">{when}</span>
            <span className="stepper">
              <ActionButton mini label="▲" blocker={i === 0 ? "Already at the top." : null} tip={["Move up the queue"]} onClick={() => command((s) => moveProject(s, a.id, -1))} />
              <ActionButton mini label="▼" blocker={i === running.length - 1 ? "Already at the bottom." : null} tip={["Move down the queue"]} onClick={() => command((s) => moveProject(s, a.id, 1))} />
            </span>
            <span className="progress"><span style={{ width: `${Math.round((100 * a.progress) / p.points)}%` }} /></span>
          </li>
        );
      })}
    </ul>
  );
}

/** The lead engineer at a base: who, a choice of who next, and what the team does on the top job. */
function LeadEngineer({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const people = engineersAt(g, base.id);
  const lead = leadOf(g, base);
  const top = topOfQueue(g, base.id);
  const p = top && projectById(top.projectId);
  const team = p ? teamOn(g, base, p) : null;
  return (
    <>
      <div className="kv">
        <span title="Their aptitudes, over 50, multiply everyone else's here: above 50 helps, below 50 hurts">Lead engineer</span>
        <select className="lead-select" value={lead?.id ?? ""} disabled={!people.length}
          onChange={(e) => command((s) => setLeadEngineer(s, base.id, e.target.value || null))}>
          <option value="">No lead</option>
          {people.map((x) => <option key={x.id} value={x.id}>{leadLabel(x)}</option>)}
        </select>
      </div>
      {team && p && (
        <div className="kv" title="Points a day on the job at the top of the queue, and the share of its materials the team uses">
          <span>On {p.name.toLowerCase()}</span>
          <span>{team.rate.toFixed(1)} points a day · materials ×{team.waste.toFixed(2)}</span>
        </div>
      )}
    </>
  );
}

/** A name and their four aptitudes, for a lead picker. */
const leadLabel = (x: StaffMember) => `${x.name} (${APTITUDES[x.role].map((a) => `${a.short} ${Math.floor(aptitude(x, a.id))}`).join(", ")})`;

/** The lead scientist: one for the Order, whatever the topic. */
export function LeadScientist() {
  const g = useGame();
  const command = useStore((s) => s.command);
  const people = scientists(g);
  const lead = leadScientist(g);
  const top = topOfResearch(g);
  const p = top && projectById(top.projectId);
  const team = p ? researchTeam(g, p) : null;
  return (
    <>
      <div className="kv">
        <span title="One for the whole Order, whatever topic is on top: their aptitudes, over 50, multiply every other scientist's. Change them when the topic changes, or don't.">Lead scientist</span>
        <select className="lead-select" value={lead?.id ?? ""} disabled={!people.length}
          onChange={(e) => command((s) => setLeadScientist(s, e.target.value || null))}>
          <option value="">No lead</option>
          {people.map((x) => <option key={x.id} value={x.id}>{leadLabel(x)}</option>)}
        </select>
      </div>
      {team && p && (
        <div className="kv" title="Points a day on the topic at the top of the queue, from every scientist in the Order">
          <span>On {p.name.toLowerCase()}</span>
          <span>{team.scientists} scientist{team.scientists === 1 ? "" : "s"} · {team.rate.toFixed(1)} points a day</span>
        </div>
      )}
    </>
  );
}

/** "3 engaged · 1 available" for a base's scientists or engineers. */
function staffLine(g: GameState, base: Installation, kind: StaffKind): string {
  const n = staffAt(g, base, kind);
  const f = STAFF[kind].facility;
  if (!n) return !f || facilityCount(base, f) ? "none hired" : `no ${kind === "scientist" ? "laboratory" : "workshop"}`;
  const lead = kind === "engineer" ? leadOf(g, base) : kind === "analyst" ? leadAnalyst(g) : leadScientist(g);
  const work = kind === "engineer" ? "on the workshop queue" : kind === "analyst" ? "in the intelligence section" : "on the research queue";
  return `${n} ${work}${lead && lead.baseId === base.id ? ` · ${lead.name} leads` : ""}`;
}

function Overview({ base }: { base: Installation }) {
  const g = useGame();
  const region = regionById(base.regionId);
  const agents = agentsAt(g, base.id);
  const st = agents.map((a) => agentStatus(g, a));
  const ready = st.filter((x) => x.kind === "ready").length;
  const away = st.filter((x) => x.kind === "field" || x.kind === "covert").length;
  const hurt = st.filter((x) => x.kind === "wounded").length;
  const craft = aircraftAt(g, base.id);
  const cells = facilityCount(base, "containment") * CELLS_PER_CONTAINMENT;
  const pending = base.upgrades ?? [];
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
          <div className="kv"><span>Beds</span><span>{occupantsAt(g, base.id)} of {quartersOf(base)} taken</span></div>
        </div>
        <div>
          <div className="kv"><span>Agents</span><span>{ready} available · {agents.length} stationed{away ? ` · ${away} away` : ""}{hurt ? ` · ${hurt} wounded` : ""}</span></div>
          <div className="kv"><span>Aircraft</span><span>{craft.map((c) => c.name).join(", ") || "none"}</span></div>
          <div className="kv"><span>Scientists</span><span>{staffLine(g, base, "scientist")}</span></div>
          <div className="kv"><span>Engineers</span><span>{staffLine(g, base, "engineer")}</span></div>
          <div className="kv"><span>Captives</span><span>{cells ? `${base.captives?.length ?? 0} of ${cells} cells` : "no containment"}</span></div>
          <div className="kv"><span>Vampire remains</span><span>{base.remains ?? 0}</span></div>
        </div>
      </div>
      <div className="overview-grid">
        <div>
          <h4 className="section-title">Research queue (the Order's)</h4>
          <ProjectLines base={base} kind="research" />
        </div>
        <div>
          <h4 className="section-title">Engineering under way</h4>
          <ProjectLines base={base} kind="engineering" />
        </div>
      </div>
      {pending.length > 0 && (
        <>
          <h4 className="section-title">Construction under way</h4>
          {pending.map((u, i) => (
            <div key={i} className="kv"><span>{FACILITIES[u.kind].article.replace(/^./, (c) => c.toUpperCase())}{u.floor !== undefined ? `, ${FLOOR_NAMES[u.floor]!.toLowerCase()}` : ""}</span><span>ready {formatDate(u.readyAt)} ({timeLeft(u.readyAt - g.time)})</span></div>
          ))}
        </>
      )}
    </>
  );
}

/** Personnel: who is here (Current) and who could join (Hiring). */
function PersonnelTabs({ base, view }: { base: Installation; view: BaseView }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  return (
    <nav className="tabs">
      <button className={`tab${view === "personnel" ? " on" : ""}`} onClick={() => openBase(base.id, "personnel")}>
        Current<span className="tab-count">{occupantsAt(g, base.id)}</span>
      </button>
      <button className={`tab${view === "hiring" ? " on" : ""}`} onClick={() => openBase(base.id, "hiring")}>
        Hiring<span className="tab-count">{g.candidates.length + staffCandidatesOf(g).length}</span>
      </button>
    </nav>
  );
}

function Personnel({ base, agentId }: { base: Installation; agentId?: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const agents = agentsAt(g, base.id);
  const chosen = agents.find((a) => a.id === agentId);
  const fallen = [...g.fallen].reverse();
  return (
    <div className={`split${chosen ? " with-detail" : ""}`}>
      <div className="split-main">
        <p className="small dim">{occupantsAt(g, base.id)} of {quartersOf(base)} beds taken · agents' upkeep {money(AGENT_UPKEEP)} a month · staff salaries {money(STAFF.scientist.salary)} a month</p>
        <h4 className="section-title">Agents <span className="tab-count">{agents.length}</span></h4>
        {agents.length === 0 ? (
          <p className="prose dim">No agents stationed here. Recruit some on the Hiring tab.</p>
        ) : (
          <div className="table roster">
            <span className="th">Name</span><StatHeader /><span className="th">Status</span>
            {agents.map((a) => (
              <button key={a.id} className={`tr tr-button${a.id === agentId ? " on" : ""}`} onClick={() => openBase(base.id, "personnel", a.id === agentId ? undefined : a.id)}>
                <span className="td-name">{agentName(a)}</span>
                <StatCells stats={a.stats} />
                <StatusTag st={agentStatus(g, a)} />
              </button>
            ))}
          </div>
        )}
        <StaffList base={base} kind="scientist" />
        <StaffList base={base} kind="engineer" />
        <StaffList base={base} kind="analyst" />
        {fallen.length > 0 && (
          <div className="fallen">
            <h4 className="section-title">The fallen</h4>
            {fallen.map((f, k) => (
              <div key={k} className="td-dim">{f.sister ? "Sr." : "Br."} {f.name}, {f.where}, {formatDate(f.died)}</div>
            ))}
          </div>
        )}
        <h4 className="section-title">Send to another base by airline</h4>
        <TransferPanel base={base} />
      </div>
      {chosen && <AgentDetail base={base} a={chosen} />}
    </div>
  );
}

/** The scientists or engineers at a base, by name. */
function StaffList({ base, kind }: { base: Installation; kind: StaffKind }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const people = staffOf(g, base.id, kind);
  return (
    <>
      <h4 className="section-title">{STAFF[kind].plural} <span className="tab-count">{people.length ? staffLine(g, base, kind) : ""}</span></h4>
      {people.length === 0 ? (
        <p className="small dim">{!STAFF[kind].facility || facilityCount(base, STAFF[kind].facility) ? `No ${STAFF[kind].plural.toLowerCase()} here. Hire some on the Hiring tab.` : `This base has no ${kind === "scientist" ? "laboratory" : "workshop"}: build one in Construction.`}</p>
      ) : (
        <div className="table staff-roster engineers">
          <div className="tr"><span className="th">Name</span><AptHeader role={kind} /><span className="th" /><span className="th" /><span className="th" /></div>
          {people.map((p) => {
            const leads = kind === "engineer" ? base.leadEngineer === p.id : kind === "analyst" ? g.leadAnalyst === p.id : g.leadScientist === p.id;
            const setLead = (s: GameState, id: string | null) => (kind === "engineer" ? setLeadEngineer(s, base.id, id) : kind === "analyst" ? setLeadAnalyst(s, id) : setLeadScientist(s, id));
            return (
            <div key={p.id} className="tr">
              <span className="td-name">{p.name}{leads && !p.arriveAt ? <span className="tag tag-good lead-tag">Lead</span> : null}</span>
              <AptCells role={kind} apt={p.aptitudes} />
              <span className="td-dim">{p.arriveAt ? `arriving ${formatDate(p.arriveAt)}` : `since ${formatDate(p.hiredAt)}`}</span>
              {leads
                ? <ActionButton mini label="Stand down" tip={["No lead: every aptitude counts as it is"]} onClick={() => command((s) => setLead(s, null))} />
                : <ActionButton mini label="Make lead" blocker={p.arriveAt ? "Still in transit." : null}
                    tip={[kind === "engineer" ? "Their aptitudes, over 50, multiply every other engineer's here" : kind === "analyst" ? "Lead analyst for the Order: their aptitudes, over 50, multiply every other analyst's" : "Lead scientist for the Order: their aptitudes, over 50, multiply every other scientist's"]}
                    onClick={() => command((s) => setLead(s, p.id), kind === "engineer" ? `${p.name} leads the workshop.` : kind === "analyst" ? `${p.name} leads the intelligence section.` : `${p.name} leads the Order's research.`)} />}
              <ActionButton mini label="Let go" blocker={p.arriveAt ? "Still in transit." : null}
                tip={["They leave the Order's service; the hiring fee is lost"]}
                onClick={() => command((s) => dismissStaff(s, base.id, kind, p.id), `${p.name} leaves.`)} />
            </div>
            );
          })}
        </div>
      )}
    </>
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
        <button className="mini" onClick={() => openBase(base.id, "personnel")} title="Back to the roster">✕</button>
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
      <LoadoutEditor a={a} base={base} />
      <button className="mini" disabled={a.deployed} onClick={() => command((s) => dismissAgent(s, a.id), `${a.name} released from service.`) && openBase(base.id, "personnel")} title="Release from service">
        Release from service
      </button>
    </aside>
  );
}

function Hiring({ base }: { base: Installation }) {
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
        The Church puts candidates forward from where the Order is trusted and present: agents who take the three vows,
        and lay scientists and engineers who work for a salary. New candidates each month. Everyone hired takes a bed here.
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
      <h4 className="section-title">Agents <span className="tab-count">{money(RECRUIT_COST)} to train · {money(AGENT_UPKEEP)} a month</span></h4>
      {g.candidates.length === 0 ? (
        <p className="small dim">No candidates left this month.</p>
      ) : (
        <div className="table candidates">
          <span className="th">Name</span><span className="th">Origin</span><StatHeader /><span className="th" />
          {g.candidates.map((c) => (
            <div key={c.id} className="tr">
              <span className="td-name">{c.sister ? "Sr." : "Br."} {c.name}</span>
              <span className="td-dim">{origin(c)}</span>
              <StatCells stats={c.stats} />
              <ActionButton mini primary label="Recruit" blocker={blocker} tip={[`${money(RECRUIT_COST)} to train, then ${money(AGENT_UPKEEP)} a month`]}
                onClick={() => command((s) => recruit(s, c.id, base.id), `${c.name} takes vows and joins the Order.`)} />
            </div>
          ))}
        </div>
      )}
      <StaffCandidates base={base} kind="scientist" />
      <StaffCandidates base={base} kind="engineer" />
      <StaffCandidates base={base} kind="analyst" />
    </>
  );
}

/** Scientists or engineers looking for work: names, origins and aptitudes. */
function StaffCandidates({ base, kind }: { base: Installation; kind: StaffKind }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const d = STAFF[kind];
  const people = staffCandidatesOf(g, kind);
  const why = hireBlocker(g, base.id, kind);
  return (
    <>
      <h4 className="section-title">{d.plural} <span className="tab-count">{money(d.hire)} vetting · {money(d.salary)} a month · {d.facility ? `${staffAt(g, base, kind)} of ${staffRoom(base, kind)} places here` : "a bed each, no facility"}</span></h4>
      {people.length === 0 ? (
        <p className="small dim">Nobody left looking this month.</p>
      ) : (
        <div className="table staff-roster eng-candidates">
          <div className="tr"><span className="th">Name</span><span className="th">Origin</span><AptHeader role={kind} /><span className="th" /></div>
          {people.map((p) => (
            <div key={p.id} className="tr">
              <span className="td-name">{p.name}</span>
              <span className="td-dim">{p.originCity}, {regionById(p.originRegion)?.name}</span>
              <AptCells role={kind} apt={p.aptitudes} />
              <ActionButton mini primary icon="hire" label="Hire" blocker={why} tip={[`${money(d.hire)} for vetting (background checks), then ${money(d.salary)} a month`]}
                onClick={() => command((s) => hireStaff(s, base.id, kind, p.id), `${p.name} joins as a ${d.name.toLowerCase()}.`)} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const EMPTY_BAY = "bay-";

function Hangars({ base, item }: { base: Installation; item?: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const craft = aircraftAt(g, base.id);
  const bays = hangarsOf(base);
  const building = (base.upgrades ?? []).filter((u) => u.kind === "hangar");
  const chosen = craft.find((c) => c.id === item);
  const emptyBay = item?.startsWith(EMPTY_BAY) ? Number(item.slice(EMPTY_BAY.length)) : null;
  const pickingBay = emptyBay !== null && emptyBay >= craft.length && emptyBay < bays ? emptyBay : null;
  return (
    <div className={`split${chosen || pickingBay !== null ? " with-detail" : ""}`}>
      <div className="split-main">
        <div className="bays">
          {Array.from({ length: bays }, (_, i) => {
            const c = craft[i];
            if (!c) {
              const on = pickingBay === i;
              return (
                <button key={`empty-${i}`} className={`bay empty${on ? " on" : ""}`} onClick={() => openBase(base.id, "hangars", on ? undefined : `${EMPTY_BAY}${i}`)}>
                  <span className="bay-num">Bay {i + 1}</span>
                  <span className="bay-name">Empty</span>
                  <span className="td-dim">Buy or lease an aircraft</span>
                </button>
              );
            }
            const d = AIRCRAFT[c.kind];
            const st = aircraftStatus(g, c);
            return (
              <button key={c.id} className={`bay${c.id === item ? " on" : ""}`} onClick={() => openBase(base.id, "hangars", c.id === item ? undefined : c.id)}>
                <span className="bay-num">Bay {i + 1}</span>
                <span className="bay-name">{c.name}</span>
                <span className="td-dim">{d.name} · {d.seats} seats · reach {d.reachNm} nm</span>
                <StatusTag st={st} />
              </button>
            );
          })}
          {building.map((u, i) => (
            <div key={`new-${i}`} className="bay empty">
              <span className="bay-num">Bay {bays + i + 1}</span>
              <span className="bay-name">Being built</span>
              <span className="td-dim">ready {formatDate(u.readyAt)}</span>
            </div>
          ))}
        </div>
        <p className="small dim">Every bay holds one aircraft, helicopter or jet. More hangars are built in Construction.</p>
      </div>
      {chosen && <AircraftDetail base={base} c={chosen} />}
      {!chosen && pickingBay !== null && <BayDetail base={base} bay={pickingBay} />}
    </div>
  );
}

/** An empty bay: the aircraft that could go in it. */
function BayDetail({ base, bay }: { base: Installation; bay: number }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  return (
    <aside className="detail">
      <div className="detail-head">
        <h3 className="detail-title">Bay {bay + 1}</h3>
        <button className="mini" onClick={() => openBase(base.id, "hangars")} title="Back to the hangars">✕</button>
      </div>
      <p className="small dim">Empty. Choose an aircraft for it.</p>
      <div className="choice-col">
        {(Object.keys(AIRCRAFT) as AircraftKind[]).map((k) => {
          const d = AIRCRAFT[k];
          const owned = d.ownership === "owned";
          return (
            <div key={k} className="choice static aircraft-choice">
              <span className="choice-title"><Icon name={k} size={16} /> {d.name}</span>
              <span className="choice-meta">{d.seats} seats · {d.speedKn} kn · reach {d.reachNm.toLocaleString("en-US")} nm</span>
              <span className="choice-meta">{owned ? `${money(upfrontCost(k))} to buy, then ${money(d.monthly)} a month for crew` : `${money(d.monthly)} a month, leased`}</span>
              <span className="choice-meta">{d.description}</span>
              <ActionButton mini primary label={owned ? "Buy" : "Lease"} blocker={acquireBlocker(g, base.id, k)}
                tip={[owned ? `${money(upfrontCost(k))} now` : `First month (${money(d.monthly)}) now`]}
                onClick={() => command((s) => acquireAircraft(s, base.id, k), `${d.name} ${owned ? "bought" : "leased"}.`) && openBase(base.id, "hangars")} />
            </div>
          );
        })}
      </div>
    </aside>
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

/** Laboratories or workshops: their staff, and the projects running here. Built and staffed elsewhere. */
function Science({ base, kind }: { base: Installation; kind: "research" | "engineering" }) {
  const g = useGame();
  const openResearch = useStore((s) => s.openResearch);
  const openBase = useStore((s) => s.openBase);
  const staff: StaffKind = kind === "research" ? "scientist" : "engineer";
  const facility: BaseUpgradeKind = kind === "research" ? "lab" : "workshop";
  const built = facilityCount(base, facility) > 0;
  return (
    <>
      <p className="prose dim">
        {kind === "research"
          ? "Lay scientists, paid a salary, study what the teams bring back. Research is the Order's: every scientist, at every base, works the top of one queue, and the lead scientist's aptitudes multiply everyone else's. Remains and captives are studied where a laboratory has at least one scientist."
          : "Lay engineers build what research makes possible: kit, aircraft, and goods for the dark web. They all work the top of the queue; the lead engineer's aptitudes multiply everyone else's."}
      </p>
      {built ? (
        <>
          <div className="kv"><span>{STAFF[staff].plural}</span><span>{staffAt(g, base, staff)} of {staffRoom(base, staff)} places · {staffLine(g, base, staff)}</span></div>
          {kind === "engineering" ? <LeadEngineer base={base} /> : <LeadScientist />}
          <h4 className="section-title">{kind === "engineering" ? "Queue" : "Research queue (the Order's)"}</h4>
          <ProjectLines base={base} kind={kind} />
          <div className="build-actions two">
            <ActionButton primary icon={kind === "research" ? "research" : "engineering"} label={kind === "research" ? "Choose research" : "Choose engineering"}
              tip={[kind === "research" ? "Add topics to the Order's research queue" : "Add jobs to this base's queue, or any other's"]} onClick={() => openResearch(kind)} />
            <ActionButton icon="hire" label={`Hire ${STAFF[staff].plural.toLowerCase()}`} tip={["On the Personnel screen's Hiring tab"]} onClick={() => openBase(base.id, "hiring")} />
          </div>
        </>
      ) : (
        <p className="small dim">This base has no {kind === "research" ? "laboratory" : "workshop"} yet. Build one in Construction.</p>
      )}
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
      <p className="small dim">Remains here feed the laboratories, or sell as tissue on the dark web.</p>
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
        <ActionButton icon="market" label="The dark web" tip={["Sell tissue, artifacts, goods and research; buy equipment and information"]} onClick={() => openMarket()} />
      </div>
    </>
  );
}

const ROOM_SHORT: Record<RoomKind, string> = { quarters: "Quarters", lab: "Lab", workshop: "Workshop", containment: "Cells", sigint: "SIGINT" };

/** The base building, floors stacked top to bottom (the street at the bottom of each plan),
 *  and the hangars beside it. The one place anything at a base is built. */
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
      <div className="construction">
        <div className="floors stacked">
          {[...floorsOf(base)].reverse().map((floor) => (
            <div key={floor} className="floor">
              <div className="floor-name small dim">{FLOOR_NAMES[floor]}</div>
              <div className="floor-grid">{[2, 1, 0].flatMap((y) => [0, 1, 2].map((x) => tile(floor, x, y)))}</div>
            </div>
          ))}
          <div className="small dim floor-front">The street is at the bottom of each plan.</div>
        </div>
        <div className="construction-side">
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
            <div className="room-panel build-actions">
              <div className="small dim">{FLOOR_NAMES[sel.floor]}: build here</div>
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
          <div className="kv"><span>Hangars</span><span>{hangarsOf(base)} of {FACILITIES.hangar.max}, one aircraft each</span></div>
          <ExpandButton base={base} kind="hangar" />
          {pending.length > 0 && <h4 className="section-title">Under way</h4>}
          {pending.map((u, i) => (
            <div key={i} className="kv"><span>Building {FACILITIES[u.kind].article}{u.floor !== undefined ? `, ${FLOOR_NAMES[u.floor]!.toLowerCase()}` : ""}</span><span>ready {formatDate(u.readyAt)} ({timeLeft(u.readyAt - g.time)})</span></div>
          ))}
        </div>
      </div>
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
  // A view this base doesn't have (containment with no cells) falls back to the overview.
  const view: BaseView = tiles(g, base).some((t) => t.view === screen.view) || screen.view === "hiring" ? screen.view : "overview";
  const item = screen.item;
  const thing = item && (g.agents.find((a) => a.id === item) ?? g.aircraft.find((c) => c.id === item));
  const parent: BaseView | null = view === "hiring" ? "personnel" : null;

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
          <h2 className="facility-title">{view === "hiring" ? "Personnel" : VIEW_NAMES[view]}</h2>
          {(view === "personnel" || view === "hiring") && <PersonnelTabs base={base} view={view} />}
          {view === "overview" && <Overview base={base} />}
          {view === "personnel" && <Personnel base={base} agentId={item} />}
          {view === "hiring" && <Hiring base={base} />}
          {view === "hangars" && <Hangars base={base} item={item} />}
          {view === "labs" && <Science base={base} kind="research" />}
          {view === "workshops" && <Science base={base} kind="engineering" />}
          {view === "containment" && <Containment base={base} />}
          {view === "stores" && <Stores base={base} />}
          {view === "armoury" && <Armoury base={base} />}
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

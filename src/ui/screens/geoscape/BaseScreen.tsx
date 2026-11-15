import { AGENT_UPKEEP, RECRUIT_COST, STATS, type Stats } from "../../../data/agents";
import { AIRCRAFT, type AircraftKind } from "../../../data/aircraft";
import { BLOODLINES } from "../../../data/bloodlines";
import { BASE_UPGRADES, CELLS_PER_CONTAINMENT, FACILITIES, STAFF, type StaffKind } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import {
  acquireAircraft, acquireBlocker, agentsAt, aircraftAt, dismissAgent, dismissStaff, facilityCount, hangarsOf,
  hireBlocker, hireStaff, recruit, recruitBlocker, recruitingWeights, releaseAircraft, resaleValue, staffAt, staffRoom,
  upfrontCost, upgradeBase, upgradeBlocker,
} from "../../../sim/personnel";
import { isWounded, type Agent, type Candidate } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { useGame, useStore, type BaseTab } from "../../store";

const TABS: { id: BaseTab; label: string }[] = [
  { id: "agents", label: "Agents" },
  { id: "recruit", label: "Recruit" },
  { id: "aircraft", label: "Aircraft" },
  { id: "science", label: "Science" },
  { id: "facilities", label: "Facilities" },
];

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

function StatHeader() {
  return (
    <>
      {STATS.map((s) => (
        <span key={s.id} className="th" title={`${s.name}: ${s.description}`}>{s.short}</span>
      ))}
    </>
  );
}

const title = (a: { sister: boolean }) => (a.sister ? "Sr." : "Br.");
const origin = (c: Candidate) => `${c.originCity}, ${regionById(c.originRegion)?.name ?? ""}`;

function AgentsTab({ baseId }: { baseId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const agents = agentsAt(g, baseId);
  const fallen = [...g.fallen].reverse();
  if (!agents.length && !fallen.length) return <p className="prose dim">No agents stationed here. Recruit some.</p>;
  return (
    <>
    <div className="table agents-table">
      <span className="th">Name</span><span className="th">Origin</span><StatHeader /><span className="th">Status</span><span className="th" />
      {agents.map((a: Agent) => (
        <div key={a.id} className="tr">
          <span className="td-name" title={`${a.missions} missions, ${a.kills} kills`}>{title(a)} {a.name}{a.missions > 0 && <span className="td-dim"> · {a.missions}</span>}</span>
          <span className="td-dim">{origin(a)}</span>
          <StatCells stats={a.stats} />
          <span className={isWounded(g, a) ? "bad" : a.deployed ? "td-dim" : "good"}>
            {a.deployed ? "In the field" : isWounded(g, a) ? `Wounded until ${formatDate(a.woundedUntil)}` : "Ready"}
          </span>
          <button className="mini" onClick={() => command((s) => dismissAgent(s, a.id), `${a.name} released from service.`)} title="Release from service">
            Release
          </button>
        </div>
      ))}
    </div>
    {fallen.length > 0 && (
      <div className="fallen">
        <h4 className="section-title">The fallen</h4>
        {fallen.map((f, k) => (
          <div key={k} className="td-dim">{f.sister ? "Sr." : "Br."} {f.name}, {f.where}, {formatDate(f.died)}</div>
        ))}
      </div>
    )}
    </>
  );
}

function RecruitTab({ baseId }: { baseId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const blocker = recruitBlocker(g, baseId);
  const weights = recruitingWeights(g).sort((a, b) => b.weight - a.weight);
  const total = weights.reduce((a, w) => a + w.weight, 0);
  const top = weights.slice(0, 6);
  const rest = 1 - top.reduce((a, w) => a + w.weight, 0) / (total || 1);
  return (
    <>
      <p className="prose dim">
        The Church puts candidates forward from where the Order is trusted and present. Each takes the three vows and is
        trained by the Order. Training {money(RECRUIT_COST)}, upkeep {money(AGENT_UPKEEP)} a month. New candidates
        each month.
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
        <div className="table agents-table">
          <span className="th">Name</span><span className="th">Origin</span><StatHeader /><span className="th" /><span className="th" />
          {g.candidates.map((c) => (
            <div key={c.id} className="tr">
              <span className="td-name">{title(c)} {c.name}</span>
              <span className="td-dim">{origin(c)}</span>
              <StatCells stats={c.stats} />
              <span />
              <button className="mini primary" disabled={!!blocker} title={blocker ?? `Recruit for ${money(RECRUIT_COST)}`}
                onClick={() => command((s) => recruit(s, c.id, baseId), `${c.name} takes vows and joins the Order.`)}>
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

function AircraftTab({ baseId }: { baseId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const base = g.installations.find((i) => i.id === baseId)!;
  const aircraft = aircraftAt(g, baseId);
  return (
    <>
      <div className="kv"><span>Hangars</span><span>{aircraft.length} / {hangarsOf(base)} in use</span></div>
      <ul className="list">
        {aircraft.map((a) => {
          const d = AIRCRAFT[a.kind];
          return (
            <li key={a.id} className="aircraft-row">
              <span className="td-name">{a.name}</span>
              <span className="td-dim">
                {d.name} · {d.seats} seats · {d.speedKn} kn · reach {d.reachNm} nm · {d.ownership === "owned" ? `owned, ${money(d.monthly)}/mo crew` : `leased, ${money(d.monthly)}/mo`}
              </span>
              {d.ownership === "owned" ? (
                <button className="mini" disabled={a.deployed} title={`Sell for ${money(resaleValue(a.kind))}`}
                  onClick={() => command((s) => releaseAircraft(s, a.id), `${a.name} sold for ${money(resaleValue(a.kind))}.`)}>
                  Sell
                </button>
              ) : (
                <button className="mini" disabled={a.deployed} onClick={() => command((s) => releaseAircraft(s, a.id), `${a.name} returned to the lessor.`)}>
                  Return lease
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="build-actions two">
        {(Object.keys(AIRCRAFT) as AircraftKind[]).map((k) => {
          const d = AIRCRAFT[k];
          const why = acquireBlocker(g, baseId, k);
          const owned = d.ownership === "owned";
          return (
            <button key={k} className="action" disabled={!!why} onClick={() => command((s) => acquireAircraft(s, baseId, k), `${d.name} ${owned ? "bought" : "leased"}.`)}>
              <span className="action-title">{owned ? "Buy" : "Lease"} a {d.name.toLowerCase()}</span>
              <span className="action-meta">
                {d.seats} seats · reach {d.reachNm} nm · {owned ? `${money(upfrontCost(k))}, then ${money(d.monthly)}/mo crew` : `${money(d.monthly)}/mo`}
              </span>
              <span className="action-meta">{d.description}</span>
              {why && <span className="action-blocker">{why}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function StaffRow({ baseId, kind }: { baseId: string; kind: StaffKind }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const base = g.installations.find((i) => i.id === baseId)!;
  const d = STAFF[kind];
  const why = hireBlocker(g, baseId, kind);
  const n = staffAt(base, kind);
  return (
    <div className="staff-row">
      <span className="td-name">{d.plural}</span>
      <span className="td-dim">{n} of {staffRoom(base, kind)} ({facilityCount(base, d.facility)} {facilityCount(base, d.facility) === 1 ? FACILITIES[d.facility].article.replace(/^an? /, "") : FACILITIES[d.facility].name.toLowerCase()})</span>
      <span className="td-dim">hire {money(d.hire)}, then {money(d.salary)}/mo</span>
      <button className="mini" disabled={!n} onClick={() => command((s) => dismissStaff(s, baseId, kind), `A ${d.name.toLowerCase()} leaves the Order's service.`)}>Let go</button>
      <button className="mini primary" disabled={!!why} title={why ?? undefined} onClick={() => command((s) => hireStaff(s, baseId, kind), `${d.name} hired.`)}>Hire</button>
    </div>
  );
}

const bloodlineName = (id: string) => BLOODLINES.find((b) => b.id === id)?.name ?? id;

function ScienceTab({ baseId }: { baseId: string }) {
  const g = useGame();
  const openResearch = useStore((s) => s.openResearch);
  const base = g.installations.find((i) => i.id === baseId)!;
  const captives = base.captives ?? [];
  const cells = facilityCount(base, "containment") * CELLS_PER_CONTAINMENT;
  return (
    <>
      <p className="prose dim">
        Lay scientists and engineers, paid a salary. Every scientist at every base works on the Order's current research, and
        every engineer on its current engineering job: a day's work each, every day.
      </p>
      <StaffRow baseId={baseId} kind="scientist" />
      <StaffRow baseId={baseId} kind="engineer" />
      <h4 className="section-title">Containment <span className="tab-count">{captives.length} / {cells} cells</span></h4>
      {cells === 0 ? (
        <p className="small dim">No containment here: captives taken by teams from this base can't be held. Build it on the Facilities tab.</p>
      ) : captives.length === 0 ? (
        <p className="small dim">The cells are empty.</p>
      ) : (
        <ul className="list">
          {captives.map((c) => (
            <li key={c.id} className="kv small">
              <span>{c.kind === "vampire" ? "Vampire" : "Thrall"} of {bloodlineName(c.bloodline)}</span>
              <span className="td-dim">taken in {c.city}, {formatDate(c.takenAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="kv"><span>Vampire remains in cold storage</span><span>{base.remains ?? 0}</span></div>
      <div className="build-actions">
        <button className="action primary" onClick={openResearch}>
          <span className="action-title">Research & engineering</span>
          <span className="action-meta">Choose what the laboratories and workshops work on</span>
        </button>
      </div>
    </>
  );
}

function FacilitiesTab({ baseId }: { baseId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const base = g.installations.find((i) => i.id === baseId)!;
  const pending = base.upgrades ?? [];
  return (
    <>
      <div className="facility-grid">
        {BASE_UPGRADES.map((k) => (
          <div key={k} className="kv"><span>{FACILITIES[k].name}</span><span>{facilityCount(base, k)} of {FACILITIES[k].max}{k === "quarters" ? " beds" : ""}</span></div>
        ))}
      </div>
      {pending.map((u, i) => (
        <div key={i} className="kv small"><span>Building {FACILITIES[u.kind].article}</span><span>ready {formatDate(u.readyAt)}</span></div>
      ))}
      <div className="build-actions grid">
        {BASE_UPGRADES.map((k) => {
          const f = FACILITIES[k];
          const why = upgradeBlocker(g, baseId, k);
          return (
            <button key={k} className="action" disabled={!!why} onClick={() => command((s) => upgradeBase(s, baseId, k), `Work begins on ${f.article}.`)}>
              <span className="action-title">{k === "quarters" ? "Expand quarters" : `Build ${f.article}`}</span>
              <span className="action-meta">{money(f.cost)} · {f.days} days · {f.gives}</span>
              {why && <span className="action-blocker">{why}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function BaseScreen() {
  const g = useGame();
  const screen = useStore((s) => s.baseScreen);
  const openBase = useStore((s) => s.openBase);
  const close = useStore((s) => s.closeBase);
  if (!screen) return null;
  const base = g.installations.find((i) => i.id === screen.baseId);
  if (!base) return null;
  return (
    <div className="modal-backdrop" onClick={close}>
      <div onClick={(e) => e.stopPropagation()}>
        <Panel title={regionById(base.regionId)?.name ?? ""} className="modal base-screen">
          <div className="base-head">
            <h3 className="event-title">{base.name}</h3>
            <span className="td-dim">Funds {money(g.funds)}</span>
            <button className="mini" onClick={close}>Close ✕</button>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={`tab${screen.tab === t.id ? " on" : ""}`} onClick={() => openBase(base.id, t.id)}>
                {t.label}
                {t.id === "agents" && <span className="tab-count">{agentsAt(g, base.id).length}</span>}
                {t.id === "recruit" && g.candidates.length > 0 && <span className="tab-count">{g.candidates.length}</span>}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            {screen.tab === "agents" && <AgentsTab baseId={base.id} />}
            {screen.tab === "recruit" && <RecruitTab baseId={base.id} />}
            {screen.tab === "aircraft" && <AircraftTab baseId={base.id} />}
            {screen.tab === "science" && <ScienceTab baseId={base.id} />}
            {screen.tab === "facilities" && <FacilitiesTab baseId={base.id} />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

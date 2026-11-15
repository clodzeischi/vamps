import { AGENT_UPKEEP, RECRUIT_COST, STATS, type Stats } from "../../../data/agents";
import { AIRCRAFT, type AircraftKind } from "../../../data/aircraft";
import { BASE_CAPACITY } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import {
  acquireAircraft, acquireBlocker, agentsAt, aircraftAt, dismissAgent, hangarsOf, quartersOf, recruit,
  recruitBlocker, recruitingWeights, releaseAircraft, resaleValue, upfrontCost, upgradeBase, upgradeBlocker,
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

function FacilitiesTab({ baseId }: { baseId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const base = g.installations.find((i) => i.id === baseId)!;
  const pending = base.upgrades ?? [];
  const hangarWhy = upgradeBlocker(g, baseId, "hangar");
  const quartersWhy = upgradeBlocker(g, baseId, "quarters");
  return (
    <>
      <div className="kv"><span>Hangars</span><span>{hangarsOf(base)} of {BASE_CAPACITY.maxHangars}</span></div>
      <div className="kv"><span>Quarters</span><span>{quartersOf(base)} beds of {BASE_CAPACITY.maxQuarters}</span></div>
      {pending.map((u, i) => (
        <div key={i} className="kv small"><span>Building {u.kind === "hangar" ? "a hangar" : "quarters"}</span><span>ready {formatDate(u.readyAt)}</span></div>
      ))}
      <div className="build-actions two">
        <button className="action" disabled={!!hangarWhy} onClick={() => command((s) => upgradeBase(s, baseId, "hangar"), "Hangar construction begins.")}>
          <span className="action-title">Build a hangar</span>
          <span className="action-meta">{money(BASE_CAPACITY.hangarCost)} · {BASE_CAPACITY.hangarDays} days · room for one more aircraft</span>
          {hangarWhy && <span className="action-blocker">{hangarWhy}</span>}
        </button>
        <button className="action" disabled={!!quartersWhy} onClick={() => command((s) => upgradeBase(s, baseId, "quarters"), "Work on new quarters begins.")}>
          <span className="action-title">Expand quarters</span>
          <span className="action-meta">{money(BASE_CAPACITY.quartersCost)} · {BASE_CAPACITY.quartersDays} days · {BASE_CAPACITY.quartersStep} more agents</span>
          {quartersWhy && <span className="action-blocker">{quartersWhy}</span>}
        </button>
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
            {screen.tab === "facilities" && <FacilitiesTab baseId={base.id} />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

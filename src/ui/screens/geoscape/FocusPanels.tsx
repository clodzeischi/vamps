import { AIRCRAFT } from "../../../data/aircraft";
import { INSTALLATIONS } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import { LEAD_KIND_NAMES } from "../../../sim/operations";
import { agentsAt, aircraftAt, basesInReach, hangarsOf, quartersOf } from "../../../sim/personnel";
import { isReady, shownLeadKind, type Lead } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

export function timeLeft(ms: number): string {
  if (ms <= 0) return "now";
  const h = Math.floor(ms / 3_600_000);
  return h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? `${h} h` : `${Math.max(1, Math.round(ms / 60_000))} min`;
}

const intelWord = (q: number) => (q >= 0.75 ? "solid" : q >= 0.5 ? "fair" : "thin");

export function LeadPanel({ lead }: { lead: Lead }) {
  const g = useGame();
  const reach = basesInReach(g, lead.pos);
  const urgent = lead.expiresAt - g.time < 24 * 3_600_000;
  return (
    <Panel title={LEAD_KIND_NAMES[shownLeadKind(lead)]} className="lead-panel">
      <h3 className="lead-title">{lead.title}</h3>
      <p className="prose lead-text">{lead.text}</p>
      <div className="kv"><span>Region</span><span>{regionById(lead.regionId)?.name}</span></div>
      <div className="kv"><span>Intel</span><span className="intel"><span className="intel-bar"><span style={{ width: `${lead.intel * 100}%` }} /></span>{intelWord(lead.intel)}</span></div>
      <div className={`kv ${urgent ? "bad" : ""}`}><span>Goes cold in</span><span>{timeLeft(lead.expiresAt - g.time)}</span></div>
      <div className="kv kv-block">
        <span>In reach of</span>
        <span>{reach.length ? reach.map((r) => `${r.base.name.replace("Operational Base ", "")} (${Math.round(r.distance)} nm)`).join(", ") : <em className="bad">no base</em>}</span>
      </div>
      <button className="action" disabled title="Team dispatch arrives in the next update">
        <span className="action-title">Dispatch a team</span>
        <span className="action-blocker">Team dispatch arrives in the next update (step 4b).</span>
      </button>
    </Panel>
  );
}

export function InstallationPanel({ id }: { id: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const inst = g.installations.find((i) => i.id === id);
  if (!inst) return null;
  const region = regionById(inst.regionId);
  const ready = isReady(g, inst);
  if (inst.kind === "sigint") {
    const leads = g.leads.filter((l) => l.regionId === inst.regionId).length;
    return (
      <Panel title={INSTALLATIONS.sigint.name}>
        <h3 className="lead-title">{inst.name}</h3>
        <div className="kv"><span>Covers</span><span>{region?.name}</span></div>
        <div className="kv"><span>Status</span><span>{ready ? "Online" : `Ready ${formatDate(inst.readyAt)}`}</span></div>
        <div className="kv"><span>Active leads</span><span>{leads}</span></div>
      </Panel>
    );
  }
  const agents = agentsAt(g, inst.id);
  const aircraft = aircraftAt(g, inst.id);
  return (
    <Panel title={INSTALLATIONS.base.name}>
      <h3 className="lead-title">{inst.name}</h3>
      {!ready ? (
        <div className="kv"><span>Status</span><span>Ready {formatDate(inst.readyAt)}</span></div>
      ) : (
        <>
          <div className="kv"><span>Agents</span><span>{agents.length} / {quartersOf(inst)}</span></div>
          <div className="kv"><span>Aircraft</span><span>{aircraft.length} / {hangarsOf(inst)}</span></div>
          {aircraft.map((a) => (
            <div key={a.id} className="kv small"><span>{a.name}</span><span>{AIRCRAFT[a.kind].name}, reach {AIRCRAFT[a.kind].reachNm} nm</span></div>
          ))}
          <div className="build-actions">
            <button className="action primary" onClick={() => openBase(inst.id)}>
              <span className="action-title">Manage base</span>
              <span className="action-meta">Agents, recruitment, aircraft, facilities</span>
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

export function FocusPanel() {
  const g = useGame();
  const focus = useStore((s) => s.focus);
  if (!focus) return null;
  if (focus.kind === "lead") {
    const lead = g.leads.find((l) => l.id === focus.id);
    if (!lead)
      return (
        <Panel title="Lead">
          <p className="prose dim">This lead has gone cold.</p>
        </Panel>
      );
    return <LeadPanel lead={lead} />;
  }
  return <InstallationPanel id={focus.id} />;
}

export function LeadsPanel() {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const focus = useStore((s) => s.focus);
  if (!g.leads.length) return null;
  const leads = [...g.leads].sort((a, b) => a.expiresAt - b.expiresAt);
  return (
    <Panel title={`Active leads (${leads.length})`}>
      <ul className="list">
        {leads.map((l) => (
          <li key={l.id}>
            <button
              className={`list-row${focus?.kind === "lead" && focus.id === l.id ? " selected" : ""}`}
              onClick={() => {
                globe()?.flyTo(l.pos, 2.0);
                focusOn({ kind: "lead", id: l.id });
              }}
            >
              <span className="dot dot-lead" />
              <span className="grow">{l.title}</span>
              <span className={`row-note${l.expiresAt - g.time < 24 * 3_600_000 ? " bad" : ""}`}>{timeLeft(l.expiresAt - g.time)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Whether the focus panel should replace the region panel. */
export function useHasFocus() {
  const focus = useStore((s) => s.focus);
  return !!focus;
}


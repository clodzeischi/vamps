import { AIRCRAFT } from "../../../data/aircraft";
import { BLOODLINES } from "../../../data/bloodlines";
import { INSTALLATIONS } from "../../../data/installations";
import { KIT } from "../../../data/kit";
import { regionById } from "../../../data/regions";
import { missionAgents, SITE_KINDS, siteTitle } from "../../../sim/missions";
import { LEAD_KIND_NAMES } from "../../../sim/operations";
import { agentsAt, aircraftAt, basesInReach, hangarsOf, quartersOf } from "../../../sim/personnel";
import { isReady, shownLeadKind, type Lead, type Mission, type Site } from "../../../sim/state";
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

/** "Dispatch a team" for a lead or site, or what the team on it is doing. */
function DispatchButton({ target, missionId, inReach }: { target: { kind: "lead" | "site"; id: string }; missionId: string | null; inReach: boolean }) {
  const g = useGame();
  const openDispatch = useStore((s) => s.openDispatch);
  const focusOn = useStore((s) => s.focusOn);
  const m = missionId ? g.missions.find((x) => x.id === missionId) : null;
  if (m)
    return (
      <button className="action" onClick={() => focusOn({ kind: "mission", id: m.id })}>
        <span className="action-title">Team {phaseWord(g, m)}</span>
        <span className="action-meta">{g.aircraft.find((a) => a.id === m.aircraftId)?.name}, {m.agentIds.length} aboard</span>
      </button>
    );
  return (
    <button className="action primary" disabled={!inReach} onClick={() => openDispatch(target)}>
      <span className="action-title">{target.kind === "site" ? "Plan a strike" : "Dispatch a team"}</span>
      {!inReach && <span className="action-blocker">No Operational Base has an aircraft that can reach it.</span>}
    </button>
  );
}

export function phaseWord(g: { time: number }, m: Mission) {
  if (m.phase === "outbound") return g.time < m.departAt ? "boarding" : `en route, ${timeLeft(m.arriveAt - g.time)} out`;
  if (m.phase === "on-site") return m.option ? `at work, ${timeLeft(m.workUntil - g.time)} left` : "on the ground, waiting for orders";
  return `flying home, ${timeLeft(m.returnAt - g.time)}`;
}

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
      <DispatchButton target={{ kind: "lead", id: lead.id }} missionId={lead.missionId ?? null} inReach={reach.length > 0} />
    </Panel>
  );
}

const bloodline = (id: string) => BLOODLINES.find((b) => b.id === id);

export function SitePanel({ site }: { site: Site }) {
  const g = useGame();
  const reach = basesInReach(g, site.pos);
  const kind = SITE_KINDS[site.kind];
  return (
    <Panel title={`Vampire ${kind.name.toLowerCase()}`} className="lead-panel site-panel">
      <h3 className="lead-title">{siteTitle(site)}</h3>
      <p className="prose lead-text">{kind.description}</p>
      <div className="kv"><span>Bloodline</span><span>{bloodline(site.bloodline)?.name}</span></div>
      <div className="kv"><span>Expected</span><span>{site.thralls} thralls, {site.vampires === 1 ? "one of them" : `${site.vampires} of them`}</span></div>
      <div className={`kv ${site.expiresAt - g.time < 2 * 86_400_000 ? "bad" : ""}`}><span>They move in</span><span>about {timeLeft(site.expiresAt - g.time)}</span></div>
      <div className="kv kv-block">
        <span>In reach of</span>
        <span>{reach.length ? reach.map((r) => `${r.base.name.replace("Operational Base ", "")} (${Math.round(r.distance)} nm)`).join(", ") : <em className="bad">no base</em>}</span>
      </div>
      <DispatchButton target={{ kind: "site", id: site.id }} missionId={site.missionId} inReach={reach.length > 0} />
    </Panel>
  );
}

export function MissionPanel({ m }: { m: Mission }) {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const air = g.aircraft.find((a) => a.id === m.aircraftId);
  const base = g.installations.find((i) => i.id === m.baseId);
  const target = m.target.kind === "lead" ? g.leads.find((l) => l.id === m.target.id) : g.sites.find((x) => x.id === m.target.id);
  return (
    <Panel title="Team in the field">
      <h3 className="lead-title">{m.title}</h3>
      <div className="kv"><span>Status</span><span>{phaseWord(g, m)}</span></div>
      <div className="kv"><span>Aircraft</span><span>{air?.name} from {base?.name.replace("Operational Base ", "")}</span></div>
      <div className="kv"><span>Kit</span><span>{KIT[m.kit].name}</span></div>
      <div className="kv kv-block"><span>Team</span><span>{missionAgents(g, m).map((a) => `${a.sister ? "Sr." : "Br."} ${a.name}`).join(", ") || "none"}</span></div>
      {target && m.phase !== "returning" && (
        <button className="action" onClick={() => {
          globe()?.flyTo(target.pos, 2.0);
          focusOn({ kind: m.target.kind, id: target.id });
        }}>
          <span className="action-title">Show the target</span>
        </button>
      )}
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
  if (focus.kind === "site") {
    const site = g.sites.find((x) => x.id === focus.id);
    return site ? <SitePanel site={site} /> : <Panel title="Site"><p className="prose dim">They have moved on.</p></Panel>;
  }
  if (focus.kind === "mission") {
    const m = g.missions.find((x) => x.id === focus.id);
    return m ? <MissionPanel m={m} /> : <Panel title="Team"><p className="prose dim">The team is home.</p></Panel>;
  }
  return <InstallationPanel id={focus.id} />;
}

/** Everything live in the field: teams, vampire sites, leads. */
export function LeadsPanel() {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const focus = useStore((s) => s.focus);
  if (!g.leads.length && !g.sites.length && !g.missions.length) return null;
  const leads = [...g.leads].sort((a, b) => a.expiresAt - b.expiresAt);
  const day = 24 * 3_600_000;
  const row = (id: string, kind: "lead" | "site" | "mission", pos: { lat: number; lon: number }, dot: string, title: string, note: string, urgent: boolean) => (
    <li key={id}>
      <button
        className={`list-row${focus?.id === id ? " selected" : ""}`}
        onClick={() => {
          globe()?.flyTo(pos, 2.0);
          focusOn({ kind, id });
        }}
      >
        <span className={`dot ${dot}`} />
        <span className="grow">{title}</span>
        <span className={`row-note${urgent ? " bad" : ""}`}>{note}</span>
      </button>
    </li>
  );
  return (
    <Panel title="In the field">
      <ul className="list">
        {g.missions.map((m) => row(m.id, "mission", m.phase === "returning" ? m.from : m.pos, "dot-team", m.city,
          m.phase === "outbound" ? timeLeft(m.arriveAt - g.time) : m.phase === "on-site" ? (m.option ? "at work" : "orders?") : "home " + timeLeft(m.returnAt - g.time),
          m.phase === "on-site" && !m.option))}
        {g.sites.map((x) => row(x.id, "site", x.pos, "dot-site", siteTitle(x), timeLeft(x.expiresAt - g.time), x.expiresAt - g.time < 2 * day))}
        {leads.map((l) => row(l.id, "lead", l.pos, "dot-lead", l.title, l.missionId ? "team sent" : timeLeft(l.expiresAt - g.time), !l.missionId && l.expiresAt - g.time < day))}
      </ul>
    </Panel>
  );
}

/** Whether the focus panel should replace the region panel. */
export function useHasFocus() {
  const focus = useStore((s) => s.focus);
  return !!focus;
}


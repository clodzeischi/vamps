// Research and engineering. Each project runs at one base, with staff from
// that base assigned to it; several can run at once as staff allow.
import { STAFF } from "../../../data/installations";
import { projectById, PROJECTS, type ProjectDef, type ProjectKind } from "../../../data/research";
import {
  allCaptives, cancelProject, daysLeft, freeStaff, projectBlocker, projectsAt, researched, setProjectStaff, staffKind,
  staffSummary, stalled, startProject, totalRemains, visibleProjects,
} from "../../../sim/research";
import { isReady, type ActiveProject } from "../../../sim/state";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { useGame, useStore } from "../../store";

function eta(days: number) {
  if (!Number.isFinite(days)) return "nobody on it";
  return days <= 1 ? "1 day" : `${days} days`;
}

const short = (name: string) => name.replace(/^Base /, "");

function Running({ a }: { a: ActiveProject }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const p = projectById(a.projectId)!;
  const base = g.installations.find((i) => i.id === a.baseId);
  const free = base ? freeStaff(g, base, staffKind(p.kind)) : 0;
  const who = STAFF[staffKind(p.kind)].plural.toLowerCase();
  return (
    <div className="project active">
      <div className="project-head">
        <span className="project-name">{p.name}</span>
        <span className="project-eta">{stalled(a) ? "done; waiting for a free hangar" : `${eta(daysLeft(p, a.progress, a.staff))} left`}</span>
      </div>
      <span className="progress"><span style={{ width: `${Math.round((a.progress / p.points) * 100)}%` }} /></span>
      <div className="project-staff">
        <span className="td-dim">{base?.name}</span>
        <span className="stepper">
          <button className="mini" disabled={a.staff <= 1} onClick={() => command((s) => setProjectStaff(s, a.id, a.staff - 1))} title={`Take one off (${who})`}>−</button>
          <span className="stepper-value">{a.staff} {a.staff === 1 ? STAFF[staffKind(p.kind)].name.toLowerCase() : who}</span>
          <button className="mini" disabled={free <= 0} onClick={() => command((s) => setProjectStaff(s, a.id, a.staff + 1))} title={free > 0 ? `${free} free at ${base?.name}` : `No free ${who} at ${base?.name}`}>+</button>
        </span>
        <button className="mini" onClick={() => command((s) => cancelProject(s, a.id), `${p.name} abandoned.`)} title="Progress and materials are lost">Abandon</button>
      </div>
    </div>
  );
}

function Startable({ p }: { p: ProjectDef }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const bases = g.installations.filter((b) => b.kind === "base" && isReady(g, b));
  const k = staffKind(p.kind);
  const options = bases.map((b) => ({ base: b, free: freeStaff(g, b, k), why: projectBlocker(g, p.id, b.id) }));
  const any = options.some((o) => !o.why);
  return (
    <div className={`project choice static${any ? "" : " blocked"}`}>
      <span className="project-head">
        <span className="project-name">{p.name}{p.repeatable && <span className="choice-sub">repeatable</span>}</span>
        <span className="project-eta">{p.points} {k}-days{p.cost ? ` · ${money(p.cost)}` : ""}</span>
      </span>
      <span className="project-text">{p.description}</span>
      <span className="project-starts">
        {options.map(({ base, free, why }) => (
          <button key={base.id} className="mini primary" disabled={!!why} title={why ?? `Put all ${free} free at ${base.name} on it; adjust after`}
            onClick={() => command((s) => startProject(s, p.id, base.id), `${p.kind === "research" ? "Research" : "Work"} begins at ${base.name}: ${p.name}.`)}>
            Start at {short(base.name)}{!why && ` · ${free} free, ${eta(daysLeft(p, 0, free))}`}
          </button>
        ))}
      </span>
      {!any && options[0]?.why && <span className="action-blocker">{options.length === 1 ? options[0].why : options.map((o) => `${short(o.base.name)}: ${o.why}`).join(" ")}</span>}
    </div>
  );
}

function Column({ kind }: { kind: ProjectKind }) {
  const g = useGame();
  const running = projectsAt(g, undefined, kind);
  const options = visibleProjects(g, kind);
  const done = PROJECTS.filter((p) => p.kind === kind && researched(g, p.id));
  const { total, free } = staffSummary(g, kind);
  const who = STAFF[staffKind(kind)].plural.toLowerCase();

  return (
    <div className="research-col">
      <h4 className="section-title">
        {kind === "research" ? "Research" : "Engineering"} <span className="tab-count">{total} {who}, {free} free</span>
      </h4>
      {running.map((a) => <Running key={a.id} a={a} />)}
      {!running.length && <p className="small dim">{total ? "Nothing under way." : `No ${who}. Hire them on a base's Science tab.`}</p>}

      <span className="section-title sub">Start</span>
      <div className="project-list">
        {options.map((p) => <Startable key={p.id} p={p} />)}
        {!options.length && <p className="small dim">Nothing new to start. More opens up as research goes on.</p>}
      </div>

      {done.length > 0 && (
        <div className="project-done">
          <span className="section-title">Done</span>
          {done.map((p) => <span key={p.id} className="small">✓ {p.name}</span>)}
        </div>
      )}
    </div>
  );
}

export function ResearchScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeResearch);
  const captives = allCaptives(g);
  const thralls = captives.filter((c) => c.captive.kind === "thrall").length;
  const vampires = captives.length - thralls;
  const remains = totalRemains(g);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Panel title="Research & engineering" className="modal research-screen">
        <div className="base-head">
          <h3 className="event-title">The Order's laboratories</h3>
          <span className="td-dim">
            Held: {vampires} vampire{vampires === 1 ? "" : "s"}, {thralls} thrall{thralls === 1 ? "" : "s"} · {remains} vampire remains · Funds {money(g.funds)}
          </span>
          <button className="mini" onClick={close}>Close ✕</button>
        </div>
        <p className="small dim research-note">
          A project runs at one base, worked by staff from that base, and anything it needs (remains, a captive, a hangar) must be
          there too. Run as many at once as you have people for.
        </p>
        <div className="research-grid">
          <Column kind="research" />
          <Column kind="engineering" />
        </div>
      </Panel>
    </div>
  );
}

// Research and engineering: one project of each at a time, across the Order.
// Shows what's under way, what can be started (and why not), and what's done.
import { STAFF } from "../../../data/installations";
import { projectById, PROJECTS, type ProjectDef, type ProjectKind } from "../../../data/research";
import {
  allCaptives, cancelProject, daysLeft, NEED_WORDS, projectBlocker, researched, stalled, staffFor, startProject, totalRemains, visibleProjects,
} from "../../../sim/research";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { useGame, useStore } from "../../store";

const STAFF_WORD: Record<ProjectKind, keyof typeof STAFF> = { research: "scientist", engineering: "engineer" };

function eta(days: number) {
  if (!Number.isFinite(days)) return "no staff";
  return days <= 1 ? "1 day" : `${days} days`;
}

function Column({ kind }: { kind: ProjectKind }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const t = kind === "research" ? g.research : g.engineering;
  const staff = staffFor(g, kind);
  const active = t.active ? projectById(t.active.id) : null;
  const options = visibleProjects(g, kind).filter((p) => p.id !== active?.id || p.repeatable);
  const done = PROJECTS.filter((p) => p.kind === kind && researched(g, p.id));
  const who = STAFF[STAFF_WORD[kind]].plural.toLowerCase();

  return (
    <div className="research-col">
      <h4 className="section-title">
        {kind === "research" ? "Research" : "Engineering"} <span className="tab-count">{staff} {who}</span>
      </h4>

      {active && t.active ? (
        <div className="project active">
          <div className="project-head">
            <span className="project-name">{active.name}</span>
            <span className="project-eta">
              {stalled(g, kind) ? "done; waiting for a free hangar" : `${eta(daysLeft(g, active, t.active.progress))} left`}
            </span>
          </div>
          <span className="progress"><span style={{ width: `${Math.round((t.active.progress / active.points) * 100)}%` }} /></span>
          <p className="project-text">{active.description}</p>
          <button className="mini" onClick={() => command((s) => cancelProject(s, kind), `${active.name} abandoned.`)} title="Progress and materials are lost">
            Abandon
          </button>
        </div>
      ) : (
        <p className="small dim">{staff ? `Nothing under way. Choose a ${kind === "research" ? "line of research" : "job"}.` : `No ${who}. Hire them on a base's Science tab.`}</p>
      )}

      <div className="project-list">
        {options.map((p: ProjectDef) => {
          const why = projectBlocker(g, p.id);
          const blockedByActive = !!t.active;
          return (
            <button key={p.id} className="project choice" disabled={!!why}
              onClick={() => command((s) => startProject(s, p.id), `${kind === "research" ? "Research" : "Work"} begins: ${p.name}.`)}>
              <span className="project-head">
                <span className="project-name">{p.name}{p.repeatable && <span className="choice-sub">repeatable</span>}</span>
                <span className="project-eta">{eta(daysLeft(g, p, 0))}{p.cost ? ` · ${money(p.cost)}` : ""}</span>
              </span>
              <span className="project-text">{p.description}</span>
              {why && !blockedByActive && <span className="action-blocker">{why}</span>}
              {!why && p.needs && <span className="project-need">{NEED_WORDS[p.needs].replace("Needs", "Uses")}</span>}
            </button>
          );
        })}
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
        <div className="research-grid">
          <Column kind="research" />
          <Column kind="engineering" />
        </div>
      </Panel>
    </div>
  );
}

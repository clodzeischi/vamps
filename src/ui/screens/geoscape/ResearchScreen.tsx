// Research and engineering, one tab each. A list on the left (under way,
// available, done); the chosen project on the right: what it is, what it will
// give and what it opens, where to run it; and once done, what it found.
// Projects whose prerequisites aren't met, or whose material (remains, a
// captive, a hangar) no base holds, are hidden.
import { STAFF } from "../../../data/installations";
import { projectById, PROJECTS, type ProjectDef, type ProjectKind } from "../../../data/research";
import { offerFor } from "../../../sim/market";
import {
  allCaptives, cancelProject, daysLeft, freeStaff, runDays, NEED_WORDS, needMetSomewhere, projectBlocker, projectsAt, researched,
  setProjectStaff, staffKind, staffSummary, stalled, startProject, totalRemains, visibleProjects,
} from "../../../sim/research";
import { engineeringQueue, leadOf, moveProject, newJobDays, teamOn } from "../../../sim/engineering";
import { isReady, type ActiveProject, type GameState } from "../../../sim/state";
import { ActionButton } from "../../components/ActionButton";
import { hasIcon, Icon, type IconName } from "../../components/Icon";
import { money } from "../../format";
import { useGame, useStore } from "../../store";

const eta = (days: number) => (!Number.isFinite(days) ? "nobody on it" : days <= 1 ? "1 day" : `${days} days`);
const short = (name: string) => name.replace(/^Base /, "");
const iconOf = (p: ProjectDef): IconName => (hasIcon(p.id) ? p.id : p.kind === "research" ? "research" : "engineering");
/** Projects this one leads to. */
const opens = (p: ProjectDef) => PROJECTS.filter((x) => x.requires.includes(p.id));

function runNote(g: GameState, a: ActiveProject, p: ProjectDef) {
  if (stalled(a)) return "done; waiting for a free hangar";
  if (a.short) return "stopped: no money for the materials";
  const days = runDays(g, a);
  if (p.kind === "engineering" && !Number.isFinite(days)) return "no engineers";
  const left = eta(days);
  return p.product ? `next batch in ${left}` : `${left} left`;
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function ListItem({ p, selected, note, progress, done }: { p: ProjectDef; selected: boolean; note?: string; progress?: number; done?: boolean }) {
  const show = useStore((s) => s.showResearchItem);
  return (
    <li>
      <button className={`rlist-row${selected ? " on" : ""}${done ? " done" : ""}`} onClick={() => show(p.id)}>
        <Icon name={iconOf(p)} size={22} />
        <span className="rlist-body">
          <span className="rlist-name">{p.name}</span>
          {note && <span className="rlist-note">{note}</span>}
          {progress !== undefined && <span className="progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>}
        </span>
        {done && <Icon name="done" size={14} className="rlist-done" />}
      </button>
    </li>
  );
}

function ProjectList({ kind, selected }: { kind: ProjectKind; selected: string | null }) {
  const g = useGame();
  const running = projectsAt(g, undefined, kind);
  const runningIds = new Set(running.map((a) => a.projectId));
  const visible = visibleProjects(g, kind);
  const available = visible.filter((p) => needMetSomewhere(g, p) && !(p.repeatable && runningIds.has(p.id) && p.product));
  const hidden = visible.length - visible.filter((p) => needMetSomewhere(g, p)).length;
  const lines = available.filter((p) => p.product);
  const plain = available.filter((p) => !p.product);
  const done = PROJECTS.filter((p) => p.kind === kind && researched(g, p.id));
  return (
    <nav className="rlist">
      <h4 className="section-title">Under way <span className="tab-count">{running.length}</span></h4>
      {running.length === 0 ? (
        <p className="small dim">Nothing under way.</p>
      ) : (
        <ul className="list">
          {running.map((a) => {
            const p = projectById(a.projectId)!;
            const base = g.installations.find((b) => b.id === a.baseId);
            return <ListItem key={a.id} p={p} selected={selected === p.id} note={`${short(base?.name ?? "")} · ${runNote(g, a, p)}`} progress={a.progress / p.points} />;
          })}
        </ul>
      )}
      <h4 className="section-title">Available <span className="tab-count">{plain.length}</span></h4>
      {plain.length === 0 ? (
        <p className="small dim">Nothing new to start. More opens up as research goes on.</p>
      ) : (
        <ul className="list">{plain.map((p) => <ListItem key={p.id} p={p} selected={selected === p.id} note={p.repeatable ? "repeatable" : undefined} />)}</ul>
      )}
      {lines.length > 0 && (
        <>
          <h4 className="section-title">Production lines <span className="tab-count">{lines.length}</span></h4>
          <ul className="list">{lines.map((p) => <ListItem key={p.id} p={p} selected={selected === p.id} note={`sells for about ${money(offerFor(g, p.product!))}`} />)}</ul>
        </>
      )}
      {hidden > 0 && <p className="small dim">{hidden === 1 ? "One more project needs" : `${hidden} more projects need`} something no base holds yet: remains, a captive, or a free hangar.</p>}
      {done.length > 0 && (
        <>
          <h4 className="section-title">Done <span className="tab-count">{done.length}</span></h4>
          <ul className="list">{done.map((p) => <ListItem key={p.id} p={p} selected={selected === p.id} done />)}</ul>
        </>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// The detail
// ---------------------------------------------------------------------------

/** An engineering job in its base's queue: where it stands, the team on it, up, down or off. */
function QueuedJob({ a, p }: { a: ActiveProject; p: ProjectDef }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const base = g.installations.find((i) => i.id === a.baseId);
  const openBase = useStore((s) => s.openBase);
  const queue = engineeringQueue(g, a.baseId);
  const i = queue.indexOf(a);
  const team = base ? teamOn(g, base, p) : null;
  const lead = base ? leadOf(g, base) : undefined;
  return (
    <div className="run">
      <div className="run-head">
        <span className="td-name">{base?.name}</span>
        <span className="td-dim">{i + 1} of {queue.length} in the queue · {runNote(g, a, p)}{p.product ? ` · ${g.market.stock[p.product] ?? 0} in stock` : ""}</span>
      </div>
      <span className="progress"><span style={{ width: `${Math.round((a.progress / p.points) * 100)}%` }} /></span>
      {team && (
        <p className="small dim">
          {team.engineers} engineer{team.engineers === 1 ? "" : "s"}{lead ? `, ${lead.name} leading` : ", no lead"}: {team.rate.toFixed(1)} points a day, materials ×{team.waste.toFixed(2)}
        </p>
      )}
      <div className="run-staff">
        <span className="stepper">
          <ActionButton mini label="▲" blocker={i <= 0 ? "Already at the top." : null} tip={["Move up the queue"]} onClick={() => command((s) => moveProject(s, a.id, -1))} />
          <ActionButton mini label="▼" blocker={i >= queue.length - 1 ? "Already at the bottom." : null} tip={["Move down the queue"]} onClick={() => command((s) => moveProject(s, a.id, 1))} />
        </span>
        {base && <ActionButton mini label="Workshop" tip={["The base's engineers and their lead"]} onClick={() => openBase(base.id, "workshops")} />}
        <ActionButton mini icon="abandon" label={p.product ? "Stop the line" : "Abandon"} tip={["Progress and the materials used so far are lost"]}
          onClick={() => command((s) => cancelProject(s, a.id), p.product ? `${p.name}: the line stops.` : `${p.name} abandoned.`)} />
      </div>
    </div>
  );
}

function Run({ a, p }: { a: ActiveProject; p: ProjectDef }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const base = g.installations.find((i) => i.id === a.baseId);
  const free = base ? freeStaff(g, base, staffKind(p.kind)) : 0;
  const one = STAFF[staffKind(p.kind)].name.toLowerCase();
  const who = STAFF[staffKind(p.kind)].plural.toLowerCase();
  return (
    <div className="run">
      <div className="run-head">
        <span className="td-name">{base?.name}</span>
        <span className="td-dim">{runNote(g, a, p)}{p.product ? ` · ${g.market.stock[p.product] ?? 0} in stock` : ""}</span>
      </div>
      <span className="progress"><span style={{ width: `${Math.round((a.progress / p.points) * 100)}%` }} /></span>
      <div className="run-staff">
        <span className="stepper">
          <ActionButton mini label="−" blocker={a.staff <= 1 ? "At least one has to stay on it." : null} tip={[`Take one ${one} off`]} onClick={() => command((s) => setProjectStaff(s, a.id, a.staff - 1))} />
          <span className="stepper-value">{a.staff} {a.staff === 1 ? one : who}</span>
          <ActionButton mini label="+" blocker={free > 0 ? null : `No free ${who} at ${base?.name}.`} tip={[`${free} free at ${base?.name}`]} onClick={() => command((s) => setProjectStaff(s, a.id, a.staff + 1))} />
        </span>
        <ActionButton mini icon="abandon" label={p.product ? "Stop the line" : "Abandon"} tip={[p.product ? "This batch's materials are lost" : "Progress and materials are lost"]}
          onClick={() => command((s) => cancelProject(s, a.id), p.product ? `${p.name}: the line stops.` : `${p.name} abandoned.`)} />
      </div>
    </div>
  );
}

function Detail({ p }: { p: ProjectDef }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const show = useStore((s) => s.showResearchItem);
  const isDone = !p.repeatable && researched(g, p.id);
  const runs = g.projects.filter((a) => a.projectId === p.id);
  const k = staffKind(p.kind);
  const bases = g.installations.filter((b) => b.kind === "base" && isReady(g, b));
  const canStart = !isDone && (p.repeatable || runs.length === 0);
  const next = opens(p);
  const visibleIds = new Set([...visibleProjects(g, p.kind === "research" ? "research" : "engineering"), ...visibleProjects(g, p.kind === "research" ? "engineering" : "research")].map((x) => x.id));
  return (
    <section className="rdetail">
      <header className="rdetail-head">
        <span className="rdetail-icon"><Icon name={iconOf(p)} size={56} /></span>
        <div>
          <h2 className="facility-title">{p.name}</h2>
          <span className="rdetail-tags">
            <span className={`tag${isDone ? " tag-good" : runs.length ? " tag-field" : ""}`}>{isDone ? "Done" : runs.length ? "Under way" : "Available"}</span>
            {p.product && <span className="tag">Production line</span>}
            {p.repeatable && !p.product && <span className="tag">Repeatable</span>}
            {!isDone && <span className="tag">{p.points} {k}-days{p.cost ? ` · ${money(p.cost)}${p.product ? " a batch" : ""}` : ""}</span>}
          </span>
        </div>
      </header>

      <p className="prose rdetail-text">{p.description}</p>

      {isDone ? (
        <div className="rbox findings">
          <h4 className="section-title"><Icon name="findings" size={14} /> Findings</h4>
          <p className="prose">{p.result}</p>
        </div>
      ) : (
        <div className="rbox">
          <h4 className="section-title">What it gives</h4>
          <p>{p.gives}{p.product && ` About ${money(offerFor(g, p.product))} a batch at today's demand; runs until stopped.`}</p>
        </div>
      )}

      {next.length > 0 && (
        <div className="rbox">
          <h4 className="section-title"><Icon name="unlocks" size={14} /> Opens</h4>
          <div className="chips">
            {next.map((x) => (
              <button key={x.id} className="chip" onClick={() => visibleIds.has(x.id) || researched(g, x.id) ? show(x.id) : undefined}
                data-tip={x.requires.length > 1 ? `Also needs ${x.requires.filter((r) => r !== p.id).map((r) => projectById(r)?.name).join(", ")}` : undefined}>
                <Icon name={iconOf(x)} size={16} />{x.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {(p.requires.length > 0 || p.needs) && !isDone && (
        <div className="rbox">
          <h4 className="section-title">Needs</h4>
          {p.requires.map((r) => <div key={r} className="small"><Icon name="done" size={12} /> {projectById(r)?.name}</div>)}
          {p.needs && <div className="small">{NEED_WORDS[p.needs]}</div>}
        </div>
      )}

      {runs.length > 0 && (
        <div className="rbox">
          <h4 className="section-title">Under way</h4>
          {runs.map((a) => (p.kind === "engineering" ? <QueuedJob key={a.id} a={a} p={p} /> : <Run key={a.id} a={a} p={p} />))}
        </div>
      )}

      {canStart && (
        <div className="rbox">
          <h4 className="section-title">{p.kind === "engineering" ? "Add to a queue" : "Start"}</h4>
          <div className="start-row">
            {bases.map((b) => {
              const free = freeStaff(g, b, k);
              const why = projectBlocker(g, p.id, b.id);
              if (p.kind === "engineering") {
                const team = teamOn(g, b, p);
                const ahead = engineeringQueue(g, b.id).length;
                return (
                  <ActionButton key={b.id} primary icon="start" label={`Queue at ${short(b.name)}`} blocker={why}
                    tip={[
                      `${team.engineers} engineers at ${team.rate.toFixed(1)} points a day: done in ${eta(newJobDays(g, b, p))}${ahead ? `, after the ${ahead} job${ahead === 1 ? "" : "s"} ahead` : ""}`,
                      p.cost ? `Materials about ${money(Math.round(p.cost * team.waste))} at today's team (×${team.waste.toFixed(2)}), drawn as the work is done` : null,
                      "The lead engineer's aptitudes multiply everyone else's",
                    ]}
                    onClick={() => command((s) => startProject(s, p.id, b.id), `${p.name} goes into the queue at ${b.name}.`)} />
                );
              }
              return (
                <ActionButton key={b.id} primary icon="start" label={`Start at ${short(b.name)}`} blocker={why}
                  tip={[`All ${free} free ${STAFF[k].plural.toLowerCase()} at ${b.name} go on it: ${eta(daysLeft(p, 0, free))}`, p.cost ? `Materials ${money(p.cost)}` : null, "Staff can be moved on and off once it runs"]}
                  onClick={() => command((s) => startProject(s, p.id, b.id), `${p.kind === "research" ? "Research" : "Work"} begins at ${b.name}: ${p.name}.`)} />
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** The project shown: the one asked for if it's in this tab, else the first under way, available or done. */
function pick(g: ReturnType<typeof useGame>, kind: ProjectKind, wanted: string | null): ProjectDef | null {
  const w = wanted ? projectById(wanted) : undefined;
  if (w && w.kind === kind) return w;
  const run = projectsAt(g, undefined, kind)[0];
  if (run) return projectById(run.projectId) ?? null;
  return visibleProjects(g, kind).find((p) => needMetSomewhere(g, p)) ?? PROJECTS.find((p) => p.kind === kind && researched(g, p.id)) ?? null;
}

/** Nothing to show yet: say what would open something up. */
function Empty({ kind }: { kind: ProjectKind }) {
  const g = useGame();
  const open = useStore((s) => s.openResearch);
  const { total } = staffSummary(g, kind);
  if (!total) return <p className="prose dim">No {kind === "research" ? "scientists" : "engineers"} yet. Hire them at a base, in its {kind === "research" ? "Laboratories" : "Workshops"}.</p>;
  // Research that would open a project here.
  const keys = PROJECTS.filter((p) => p.kind !== kind && !researched(g, p.id) && PROJECTS.some((x) => x.kind === kind && x.requires.includes(p.id)));
  return (
    <div className="rdetail">
      <p className="prose dim">Nothing to work on yet.</p>
      {keys.length > 0 && (
        <div className="rbox">
          <h4 className="section-title"><Icon name="unlocks" size={14} /> Opened by</h4>
          <div className="chips">
            {keys.map((x) => <button key={x.id} className="chip" onClick={() => open(x.kind, x.id)}><Icon name={iconOf(x)} size={16} />{x.name}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

export function ResearchScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeResearch);
  const tab = useStore((s) => s.researchTab);
  const item = useStore((s) => s.researchItem);
  const open = useStore((s) => s.openResearch);
  const captives = allCaptives(g);
  const thralls = captives.filter((c) => c.captive.kind === "thrall").length;
  const vampires = captives.length - thralls;
  const chosen = pick(g, tab, item);
  const staff = (k: ProjectKind) => staffSummary(g, k);
  return (
    <div className="base-view research-view">
      <header className="base-view-head">
        <nav className="crumbs"><span className="crumb current">Research &amp; engineering</span></nav>
        <nav className="rtabs">
          {(["research", "engineering"] as ProjectKind[]).map((k) => (
            <button key={k} className={`rtab${tab === k ? " on" : ""}`} onClick={() => open(k)}>
              <Icon name={k} size={18} />{k === "research" ? "Research" : "Engineering"}
              <span className="tab-count">{k === "engineering" ? `${staff(k).total} engineers` : `${staff(k).free} of ${staff(k).total} free`}</span>
            </button>
          ))}
        </nav>
        <span className="td-dim" title="Material for research, held at the bases">
          Held: {vampires} vampire{vampires === 1 ? "" : "s"}, {thralls} thrall{thralls === 1 ? "" : "s"}, {totalRemains(g)} remains
        </span>
        <span className="base-funds">Funds <b>{money(g.funds)}</b></span>
        <button className="mini" onClick={close} title="Back to the globe (Esc)">Close ✕</button>
      </header>
      <div className="research-body">
        <div className="panel rlist-panel"><ProjectList kind={tab} selected={chosen?.id ?? null} /></div>
        <div className="panel rdetail-panel">
          {chosen ? <Detail p={chosen} /> : <Empty kind={tab} />}
        </div>
      </div>
    </div>
  );
}

// Research and engineering, one tab each. A list on the left (under way,
// available, done); the chosen project on the right: what it is, what it will
// give and what it opens, where to run it; and once done, what it found.
// Projects whose prerequisites aren't met, or whose material (remains, a
// captive, a hangar) no base holds, are hidden.
import { projectById, PROJECTS, type ProjectDef, type ProjectKind } from "../../../data/research";
import { staffLead } from "../../../sim/personnel";
import { useState } from "react";
import {
  allCaptives, cancelProject, MAX_QUANTITY, queueBlocker, queueJob, queueResearch, researchBlocker, runDays, setQuantity, NEED_WORDS, needMetSomewhere, projectsAt, researched,
  staffKind, staffSummary, stalled, totalRemains, visibleProjects,
} from "../../../sim/research";
import { newTopicDays, researchBlocked, researchQueue, researchTeam } from "../../../sim/science";
import { LeadScientist } from "./BaseScreen";
import { engineeringQueue, moveProject, newJobDays, queuedAt, teamOn, unitsOf } from "../../../sim/engineering";
import { isReady, type ActiveProject, type GameState, installationById } from "../../../sim/state";
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
  if (p.kind === "research" && researchBlocked(g, a)) return "waiting for its material";
  const days = runDays(g, a);
  if (!Number.isFinite(days)) return p.kind === "engineering" ? "no engineers" : "no scientists";
  const left = eta(days);
  const units = unitsOf(a);
  return units > 1 ? `${units} to make, ${left}` : `${left} left`;
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
  const visible = visibleProjects(g, kind);
  const plain = visible.filter((p) => needMetSomewhere(g, p));
  const hidden = visible.length - plain.length;
  const done = PROJECTS.filter((p) => p.kind === kind && researched(g, p.id));
  return (
    <nav className="rlist">
      {kind === "research" && <div className="lead-box"><LeadScientist /></div>}
      <h4 className="section-title">{kind === "research" ? "Research queue" : "Under way"} <span className="tab-count">{running.length}</span></h4>
      {running.length === 0 ? (
        <p className="small dim">Nothing under way.</p>
      ) : (
        <ul className="list">
          {running.map((a) => {
            const p = projectById(a.projectId)!;
            const base = installationById(g, a.baseId);
            return <ListItem key={a.id} p={p} selected={selected === p.id} note={base ? `${short(base.name)} · ${runNote(g, a, p)}` : runNote(g, a, p)} progress={a.progress / p.points} />;
          })}
        </ul>
      )}
      <h4 className="section-title">Available <span className="tab-count">{plain.length}</span></h4>
      {plain.length === 0 ? (
        <p className="small dim">Nothing new to start. More opens up as research goes on.</p>
      ) : (
        <ul className="list">{plain.map((p) => <ListItem key={p.id} p={p} selected={selected === p.id} note={p.repeatable ? (p.kind === "engineering" ? "made to order" : "repeatable") : undefined} />)}</ul>
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
  const base = installationById(g, a.baseId);
  const openBase = useStore((s) => s.openBase);
  const queue = engineeringQueue(g, a.baseId);
  const i = queue.indexOf(a);
  const team = base ? teamOn(g, base, p) : null;
  const lead = base ? staffLead(g, "engineer", base) : undefined;
  const units = unitsOf(a);
  return (
    <div className="run">
      <div className="run-head">
        <span className="td-name">{base?.name}</span>
        <span className="td-dim">{i + 1} of {queue.length} in the queue · {runNote(g, a, p)}</span>
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
        {p.repeatable && (
          <span className="stepper">
            <ActionButton mini label="−" blocker={units <= 1 ? "At least the one under way; abandon it instead." : null} tip={["One fewer"]} onClick={() => command((s) => setQuantity(s, a.id, units - 1))} />
            <span className="stepper-value">{units} to make</span>
            <ActionButton mini label="+" tip={["One more"]} onClick={() => command((s) => setQuantity(s, a.id, units + 1))} />
          </span>
        )}
        {base && <ActionButton mini label="Workshop" tip={["The base's engineers and their lead"]} onClick={() => openBase(base.id, "workshops")} />}
        <ActionButton mini icon="abandon" label="Abandon" tip={[units > 1 ? "The rest of the order is dropped; the one under way and its materials so far are lost" : "Progress and the materials used so far are lost"]}
          onClick={() => command((s) => cancelProject(s, a.id), `${p.name} abandoned.`)} />
      </div>
    </div>
  );
}

/** A topic in the Order's research queue: where it stands, what holds it up, the team on it, up, down or off. */
function QueuedTopic({ a, p }: { a: ActiveProject; p: ProjectDef }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const queue = researchQueue(g);
  const i = queue.indexOf(a);
  const blocked = researchBlocked(g, a);
  const team = researchTeam(g, p);
  const lead = staffLead(g, "scientist");
  const held = a.captiveId ? installationById(g, a.baseId) : undefined;
  return (
    <div className="run">
      <div className="run-head">
        <span className="td-name">{i + 1} of {queue.length} in the queue{held ? ` · held at ${held.name}` : ""}</span>
        <span className="td-dim">{blocked ? `waiting: ${blocked}` : runNote(g, a, p)}</span>
      </div>
      <span className="progress"><span style={{ width: `${Math.round((a.progress / p.points) * 100)}%` }} /></span>
      <p className="small dim">
        {team.scientists} scientist{team.scientists === 1 ? "" : "s"}{lead ? `, ${lead.name} leading` : ", no lead"}: {team.rate.toFixed(1)} points a day on this topic
      </p>
      <div className="run-staff">
        <span className="stepper">
          <ActionButton mini label="▲" blocker={i <= 0 ? "Already at the top." : null} tip={["Move up the queue"]} onClick={() => command((s) => moveProject(s, a.id, -1))} />
          <ActionButton mini label="▼" blocker={i >= queue.length - 1 ? "Already at the bottom." : null} tip={["Move down the queue"]} onClick={() => command((s) => moveProject(s, a.id, 1))} />
        </span>
        <ActionButton mini icon="abandon" label="Abandon" tip={["Progress is lost"]}
          onClick={() => command((s) => cancelProject(s, a.id), `${p.name} abandoned.`)} />
      </div>
    </div>
  );
}

function Detail({ p }: { p: ProjectDef }) {
  const g = useGame();
  const [qty, setQty] = useState(1);
  const command = useStore((s) => s.command);
  const show = useStore((s) => s.showResearchItem);
  const isDone = !p.repeatable && researched(g, p.id);
  const runs = g.projects.filter((a) => a.projectId === p.id);
  const k = staffKind(p.kind);
  const bases = g.installations.filter((b) => b.kind === "base" && isReady(g, b));
  const canStart = !isDone && (p.repeatable || runs.length === 0);
  const captiveTopic = p.needs === "thrall-captive" || p.needs === "vampire-captive";
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
            {p.repeatable && <span className="tag">{p.kind === "engineering" ? "Made to order" : "Repeatable"}</span>}
            {!isDone && <span className="tag">{p.points} {k}-days{p.cost ? ` · ${money(p.cost)}${p.repeatable ? " each" : ""}` : ""}</span>}
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
          <p>{p.gives}</p>
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
          {runs.map((a) => (p.kind === "engineering" ? <QueuedJob key={a.id} a={a} p={p} /> : <QueuedTopic key={a.id} a={a} p={p} />))}
        </div>
      )}

      {canStart && (
        <div className="rbox">
          <h4 className="section-title">{p.kind === "engineering" ? "Add to a queue" : "Add to the research queue"}</h4>
          {p.kind === "engineering" && p.repeatable && (
            <div className="kv">
              <span>How many</span>
              <span className="stepper">
                <ActionButton mini label="−" blocker={qty <= 1 ? "At least one." : null} tip={["One fewer"]} onClick={() => setQty(qty - 1)} />
                <span className="stepper-value">{qty}</span>
                <ActionButton mini label="+" blocker={qty >= MAX_QUANTITY ? `At most ${MAX_QUANTITY}.` : null} tip={["One more"]} onClick={() => setQty(qty + 1)} />
              </span>
            </div>
          )}
          <div className="start-row">
            {p.kind === "research" && !captiveTopic && (() => {
              const team = researchTeam(g, p);
              return (
                <ActionButton primary icon="start" label="Add to the queue" blocker={researchBlocker(g, p.id)}
                  tip={[
                    `${team.scientists} scientists at ${team.rate.toFixed(1)} points a day on it: done in ${eta(newTopicDays(g, p))}, after the topics ahead`,
                    "The lead scientist's aptitudes multiply everyone else's",
                  ]}
                  onClick={() => command((s) => queueResearch(s, p.id), `${p.name} goes into the research queue.`)} />
              );
            })()}
            {bases.map((b) => {
              if (p.kind === "research") {
                if (!captiveTopic) return null;
                return (
                  <ActionButton key={b.id} primary icon="start" label={`Question one at ${short(b.name)}`} blocker={researchBlocker(g, p.id, b.id)}
                    tip={["Into the research queue: the captive held there, longest first", "Needs a laboratory and a scientist there"]}
                    onClick={() => command((s) => queueResearch(s, p.id, b.id), `${p.name} goes into the research queue.`)} />
                );
              }
              {
                const team = teamOn(g, b, p);
                const order = p.repeatable ? queuedAt(g, b.id, p.id) : undefined;
                const ahead = engineeringQueue(g, b.id).length;
                const blocked = queueBlocker(g, p.id, b.id, qty);
                return (
                  <ActionButton key={b.id} primary icon="start" label={order ? `Add ${qty} at ${short(b.name)}` : `Queue ${p.repeatable ? `${qty} ` : ""}at ${short(b.name)}`} blocker={blocked}
                    tip={[
                      order ? `Joins the order already there: ${unitsOf(order) + qty} to make` : null,
                      `${team.engineers} engineers at ${team.rate.toFixed(1)} points a day: done in ${eta(newJobDays(g, b, p, qty))}${!order && ahead ? `, after the ${ahead} job${ahead === 1 ? "" : "s"} ahead` : ""}`,
                      p.cost ? `Materials about ${money(Math.round(qty * p.cost * team.waste))} at today's team (×${team.waste.toFixed(2)}), drawn as the work is done` : null,
                      "The lead engineer's aptitudes multiply everyone else's",
                    ]}
                    onClick={() => command((s) => queueJob(s, p.id, b.id, qty), `${p.name}${qty > 1 ? ` ×${qty}` : ""} queued at ${b.name}.`)} />
                );
              }
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
  const tab = useStore((s) => s.researchTab);
  const item = useStore((s) => s.researchItem);
  const open = useStore((s) => s.openResearch);
  const captives = allCaptives(g);
  const thralls = captives.filter((c) => c.captive.kind === "thrall").length;
  const vampires = captives.length - thralls;
  const chosen = pick(g, tab, item);
  const staff = (k: ProjectKind) => staffSummary(g, k);
  return (
    <div className="control-section research-view">
      <header className="control-sub">
        <nav className="rtabs">
          {(["research", "engineering"] as ProjectKind[]).map((k) => (
            <button key={k} className={`rtab${tab === k ? " on" : ""}`} onClick={() => open(k)} data-tip={`${staff(k).total} ${k === "engineering" ? "engineers" : "scientists"}`}>
              <Icon name={k} size={18} />{k === "research" ? "Research" : "Engineering"}
            </button>
          ))}
        </nav>
        <span className="td-dim" title="Material for research, held at the bases">
          Held: {vampires} vampire{vampires === 1 ? "" : "s"}, {thralls} thrall{thralls === 1 ? "" : "s"}, {totalRemains(g)} remains · Funds {money(g.funds)}
        </span>
      </header>
      <div className="research-body">
        <div className="panel rlist-panel"><ProjectList kind={tab} selected={chosen?.id ?? null} /></div>
        <div className="panel rdetail-panel">
          {chosen ? <Detail key={chosen.id} p={chosen} /> : <Empty kind={tab} />}
        </div>
      </div>
    </div>
  );
}

// Research (the Order's, its own screen) and engineering (a base's, in its
// Workshops): a list on the left (active, available, complete), each with its
// days: left to go, or at today's staff; the chosen project on the right as a
// report (a research proposal, findings once done; an engineering work order),
// then where it stands or how to start it.
// Projects whose prerequisites aren't met, or whose material (remains, a
// captive, a hangar) no base holds, are hidden.
import {
  CLASSIFICATION_WORDS,
  projectById,
  PROJECTS,
  type ProjectDef,
  type ProjectKind,
} from "../../../data/research";
import { APTITUDES } from "../../../data/aptitudes";
import { staffAt, staffLead } from "../../../sim/people/personnel";
import { createContext, useContext, useState } from "react";
import {
  allCaptives,
  cancelProject,
  MAX_QUANTITY,
  needMet,
  queueBlocker,
  queueJob,
  queueResearch,
  researchBlocker,
  runDays,
  setQuantity,
  NEED_WORDS,
  needMetSomewhere,
  projectsAt,
  researched,
  staffSummary,
  stalled,
  totalRemains,
  visibleProjects,
} from "../../../sim/base/research";
import {
  newTopicDays,
  researchBlocked,
  researchQueue,
  researchTeam,
} from "../../../sim/base/science";
import { LeadEngineer, LeadScientist } from "./BaseScreen";
import {
  engineeringQueue,
  newJobDays,
  placeProject,
  queuedAt,
  teamOn,
  unitsOf,
} from "../../../sim/base/engineering";
import {
  isReady,
  type ActiveProject,
  type GameState,
  type Installation,
  installationById,
} from "../../../sim/core/state";
import { ActionButton } from "../../components/ActionButton";
import { hasIcon, Icon, type IconName } from "../../components/Icon";
import { money } from "../../format";
import { tipLines } from "../../components/Tooltip";
import { useGame, useStore } from "../../store";

const eta = (days: number) =>
  !Number.isFinite(days) ? "nobody on it" : days <= 1 ? "1 day" : `${days} days`;
const short = (name: string) => name.replace(/^Base /, "");
const iconOf = (p: ProjectDef): IconName =>
  hasIcon(p.id) ? p.id : p.kind === "research" ? "research" : "engineering";
/** Projects this one leads to. */
const opens = (p: ProjectDef) => PROJECTS.filter((x) => x.requires.includes(p.id));
const readyBases = (g: GameState) =>
  g.installations.filter((b) => b.kind === "base" && isReady(g, b));

/** Where the list and detail are: research (the Order's), or one base's workshops. */
interface Scope {
  kind: ProjectKind;
  base?: Installation;
  show: (id: string) => void;
}
const ScopeContext = createContext<Scope>({ kind: "research", show: () => {} });

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

/** The days column for a project under way: time left, or what holds it up. */
function runEta(g: GameState, a: ActiveProject, p: ProjectDef) {
  if (stalled(a)) return { text: "hangar", tip: "Done; waiting for a free hangar" };
  if (a.short) return { text: "stopped", tip: "Stopped: no money for the materials" };
  if (p.kind === "research" && researchBlocked(g, a))
    return { text: "waiting", tip: `Waiting: ${researchBlocked(g, a)}` };
  const days = runDays(g, a);
  if (!Number.isFinite(days))
    return {
      text: "no staff",
      tip: p.kind === "engineering" ? "No engineers at the base" : "No scientists",
    };
  return {
    text: eta(days),
    tip:
      p.kind === "research"
        ? "Left to go, after the topics ahead, at today's staff"
        : "Left to go at today's team",
  };
}

/** Days a project would take on its own at today's staff: the Order's scientists, or the base's engineers (one unit). */
function soloDays(g: GameState, p: ProjectDef, base?: Installation): number {
  const rate =
    p.kind === "research"
      ? researchTeam(g, p).rate
      : Math.max(0, ...(base ? [base] : readyBases(g)).map((b) => teamOn(g, b, p).rate));
  return rate > 0 ? Math.max(1, Math.ceil(p.points / rate)) : Infinity;
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

interface Drag {
  /** The run being dragged. */
  id: string | null;
  /** Where it would land: before this place (0 to queue.length). */
  at: number | null;
}

function ListItem({
  p,
  selected,
  note,
  progress,
  done,
  days,
  li,
}: {
  p: ProjectDef;
  selected: boolean;
  note?: string;
  progress?: number;
  done?: boolean;
  days?: { text: string; tip: string };
  li?: React.LiHTMLAttributes<HTMLLIElement>;
}) {
  const { show } = useContext(ScopeContext);
  return (
    <li {...li}>
      <button
        className={`rlist-row${selected ? " on" : ""}${done ? " done" : ""}`}
        onClick={() => show(p.id)}
      >
        <Icon name={iconOf(p)} size={22} />
        <span className="rlist-body">
          <span className="rlist-line">
            <span className="rlist-name">{p.name}</span>
            {days && (
              <span className="rlist-eta" data-tip={days.tip}>
                {days.text}
              </span>
            )}
            {done && <Icon name="done" size={14} className="rlist-done" />}
          </span>
          {note && <span className="rlist-note">{note}</span>}
          {progress !== undefined && (
            <span className="progress">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function ProjectList({ selected }: { selected: string | null }) {
  const g = useGame();
  const { kind, base } = useContext(ScopeContext);
  const running = projectsAt(g, base?.id, kind);
  const visible = visibleProjects(g, kind);
  const plain = visible.filter((p) => (base ? needMet(g, base, p.needs) : needMetSomewhere(g, p)));
  const hidden = visible.length - plain.length;
  const done = PROJECTS.filter((p) => p.kind === kind && researched(g, p.id));
  const staffTip =
    kind === "research"
      ? "At today's scientists, if it had them all"
      : "At this workshop's engineers today, one unit";
  const command = useStore((s) => s.command);
  // The active list is the queue, top first: drag a row to reprioritise.
  const [drag, setDrag] = useState<Drag>({ id: null, at: null });
  const queue = running.map((a) => a.id);
  const dropAt = (i: number, e: React.DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2 ? i + 1 : i;
  };
  const rowDnd = (id: string, i: number): React.LiHTMLAttributes<HTMLLIElement> | undefined =>
    queue.length < 2
      ? undefined
      : {
          draggable: true,
          className: `rlist-drag${drag.id === id ? " dragging" : ""}${drag.id && drag.at === i ? " drop-before" : ""}${drag.id && drag.at === i + 1 && i === queue.length - 1 ? " drop-after" : ""}`,
          title: "Drag to reprioritise",
          onDragStart: (e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", id);
            setDrag({ id, at: null });
          },
          onDragOver: (e) => {
            if (!drag.id) return;
            e.preventDefault();
            const at = dropAt(i, e);
            if (at !== drag.at) setDrag({ ...drag, at });
          },
          onDrop: (e) => {
            e.preventDefault();
            const from = queue.indexOf(drag.id ?? "");
            const at = dropAt(i, e);
            if (from >= 0) {
              const to = at > from ? at - 1 : at;
              if (to !== from) command((s) => placeProject(s, drag.id!, to));
            }
            setDrag({ id: null, at: null });
          },
          onDragEnd: () => setDrag({ id: null, at: null }),
        };
  return (
    <nav className="rlist">
      <div className="lead-box">{base ? <LeadEngineer base={base} /> : <LeadScientist />}</div>
      <h4 className="section-title">
        Active <span className="tab-count">{running.length}</span>
      </h4>
      {running.length === 0 ? (
        <p className="small dim">Nothing under way.</p>
      ) : (
        <ul className="list">
          {running.map((a, i) => {
            const p = projectById(a.projectId)!;
            const units = unitsOf(a);
            const where = a.captiveId ? installationById(g, a.baseId) : undefined;
            const note =
              [where && short(where.name), units > 1 ? `${units} to make` : undefined]
                .filter(Boolean)
                .join(" · ") || undefined;
            return (
              <ListItem
                key={a.id}
                p={p}
                selected={selected === p.id}
                note={note}
                days={runEta(g, a, p)}
                progress={a.progress / p.points}
                li={rowDnd(a.id, i)}
              />
            );
          })}
        </ul>
      )}
      <h4 className="section-title">
        Available <span className="tab-count">{plain.length}</span>
      </h4>
      {plain.length === 0 ? (
        <p className="small dim">Nothing new to start. More opens up as research goes on.</p>
      ) : (
        <ul className="list">
          {plain.map((p) => (
            <ListItem
              key={p.id}
              p={p}
              selected={selected === p.id}
              days={{
                text: Number.isFinite(soloDays(g, p, base))
                  ? eta(soloDays(g, p, base))
                  : "no staff",
                tip: staffTip,
              }}
              note={
                p.repeatable
                  ? p.kind === "engineering"
                    ? "made to order"
                    : "repeatable"
                  : undefined
              }
            />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="small dim">
          {hidden === 1 ? "One more project needs" : `${hidden} more projects need`} something{" "}
          {base
            ? "this base doesn't hold yet: a free hangar"
            : "no base holds yet: remains or a captive"}
          .
        </p>
      )}
      {done.length > 0 && (
        <>
          <h4 className="section-title">
            Complete <span className="tab-count">{done.length}</span>
          </h4>
          <ul className="list">
            {done.map((p) => (
              <ListItem key={p.id} p={p} selected={selected === p.id} done />
            ))}
          </ul>
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
  const queue = engineeringQueue(g, a.baseId);
  const i = queue.indexOf(a);
  const team = base ? teamOn(g, base, p) : null;
  const lead = base ? staffLead(g, "engineer", base) : undefined;
  const units = unitsOf(a);
  return (
    <div className="run">
      <div className="run-head">
        <span className="td-name">{base?.name}</span>
        <span className="td-dim">
          {i + 1} of {queue.length} in the queue · {runNote(g, a, p)}
        </span>
      </div>
      <span className="progress">
        <span style={{ width: `${Math.round((a.progress / p.points) * 100)}%` }} />
      </span>
      {team && (
        <p className="small dim">
          {team.engineers} engineer{team.engineers === 1 ? "" : "s"}
          {lead ? `, ${lead.name} leading` : ", no lead"}: {team.rate.toFixed(1)} points a day,
          materials ×{team.waste.toFixed(2)}
        </p>
      )}
      <div className="run-staff">
        {p.repeatable && (
          <span className="stepper">
            <ActionButton
              mini
              label="−"
              blocker={units <= 1 ? "At least the one under way; abandon it instead." : null}
              tip={["One fewer"]}
              onClick={() => command((s) => setQuantity(s, a.id, units - 1))}
            />
            <span className="stepper-value">{units} to make</span>
            <ActionButton
              mini
              label="+"
              tip={["One more"]}
              onClick={() => command((s) => setQuantity(s, a.id, units + 1))}
            />
          </span>
        )}
        <ActionButton
          mini
          icon="abandon"
          label="Abandon"
          tip={[
            units > 1
              ? "The rest of the order is dropped; the one under way and its materials so far are lost"
              : "Progress and the materials used so far are lost",
          ]}
          onClick={() => command((s) => cancelProject(s, a.id), `${p.name} abandoned.`)}
        />
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
        <span className="td-name">
          {i + 1} of {queue.length} in the queue{held ? ` · held at ${held.name}` : ""}
        </span>
        <span className="td-dim">{blocked ? `waiting: ${blocked}` : runNote(g, a, p)}</span>
      </div>
      <span className="progress">
        <span style={{ width: `${Math.round((a.progress / p.points) * 100)}%` }} />
      </span>
      <p className="small dim">
        {team.scientists} scientist{team.scientists === 1 ? "" : "s"}
        {lead ? `, ${lead.name} leading` : ", no lead"}: {team.rate.toFixed(1)} points a day on this
        topic
      </p>
      <div className="run-staff">
        <ActionButton
          mini
          icon="abandon"
          label="Abandon"
          tip={["Progress is lost"]}
          onClick={() => command((s) => cancelProject(s, a.id), `${p.name} abandoned.`)}
        />
      </div>
    </div>
  );
}

/** The disciplines a project asks for, heaviest first. */
function disciplines(p: ProjectDef) {
  const all = [...APTITUDES.scientist, ...APTITUDES.engineer];
  return Object.entries(p.skills ?? {})
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k]) => all.find((x) => x.id === k)?.name ?? k)
    .join(", ");
}

/** The report: a research proposal (findings and outcome once done), or an engineering work order. */
function Report({
  p,
  isDone,
  children,
}: {
  p: ProjectDef;
  isDone: boolean;
  children?: React.ReactNode;
}) {
  const g = useGame();
  const scope = useContext(ScopeContext);
  const research = p.kind === "research";
  const mark = research && p.classification ? `[${CLASSIFICATION_WORDS[p.classification]}]` : null;
  const serial = `${research ? "RP" : "WO"}-${String(PROJECTS.filter((x) => x.kind === p.kind).indexOf(p) + 1).padStart(3, "0")}`;
  const next = isDone ? opens(p) : [];
  const visibleIds = new Set(
    [...visibleProjects(g, "research"), ...visibleProjects(g, "engineering")].map((x) => x.id),
  );
  let n = 0;
  const sec = (title: string) => (
    <h4 className="report-sec">
      {++n}. {title}
    </h4>
  );
  return (
    <article className={`report${p.classification ? ` mark-${p.classification}` : ""}`}>
      {mark && <div className="report-mark">{mark}</div>}
      <header className="report-head">
        <span className="rdetail-icon">
          <Icon name={iconOf(p)} size={56} />
        </span>
        <div className="report-fields">
          <span className="report-doc">
            {research ? (isDone ? "Research report" : "Research proposal") : "Work order"} ·{" "}
            {serial}
          </span>
          <h2 className="facility-title">{p.name}</h2>
          <dl>
            <dt>Discipline</dt>
            <dd>{disciplines(p)}</dd>
            {!isDone && p.needs && (
              <>
                <dt>Material</dt>
                <dd>{NEED_WORDS[p.needs]}</dd>
              </>
            )}
            {!research && p.cost > 0 && (
              <>
                <dt>Materials</dt>
                <dd>
                  {money(p.cost)}
                  {p.repeatable ? " each" : ""}
                </dd>
              </>
            )}
          </dl>
        </div>
      </header>
      <section>
        {sec(research ? "Proposal" : "Specification")}
        <p className="prose">{p.proposal}</p>
      </section>
      {research && isDone && (
        <section>
          {sec("Findings")}
          <p className="prose">{p.findings}</p>
        </section>
      )}
      {(!research || isDone) && (
        <section>
          {sec(research ? "Outcome" : "Delivers")}
          <p className="report-outcome">{p.outcome}</p>
        </section>
      )}
      {next.length > 0 && (
        <section>
          {sec("Further work")}
          <div className="chips">
            {next.map((x) => (
              <button
                key={x.id}
                className="chip"
                onClick={() =>
                  x.kind === scope.kind && (visibleIds.has(x.id) || researched(g, x.id))
                    ? scope.show(x.id)
                    : undefined
                }
                data-tip={tipLines(
                  x.kind !== scope.kind ? "Made in a base's workshops" : null,
                  x.requires.length > 1
                    ? `Also needs ${x.requires
                        .filter((r) => r !== p.id)
                        .map((r) => projectById(r)?.name)
                        .join(", ")}`
                    : null,
                )}
              >
                <Icon name={iconOf(x)} size={16} />
                {x.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {children}
      {mark && <div className="report-mark">{mark}</div>}
    </article>
  );
}

function Detail({ p }: { p: ProjectDef }) {
  const g = useGame();
  const [qty, setQty] = useState(1);
  const command = useStore((s) => s.command);
  const { base } = useContext(ScopeContext);
  const isDone = !p.repeatable && researched(g, p.id);
  const runs = g.projects.filter((a) => a.projectId === p.id && (!base || a.baseId === base.id));
  const bases = base ? [base] : readyBases(g);
  const canStart = !isDone && (p.repeatable || runs.length === 0);
  const captiveTopic = p.needs === "thrall-captive" || p.needs === "vampire-captive";
  return (
    <section className="rdetail">
      <Report p={p} isDone={isDone}>
        {runs.length > 0 && (
          <div className="report-actions">
            {runs.map((a) =>
              p.kind === "engineering" ? (
                <QueuedJob key={a.id} a={a} p={p} />
              ) : (
                <QueuedTopic key={a.id} a={a} p={p} />
              ),
            )}
          </div>
        )}
        {canStart && (
          <div className="report-actions">
            {p.kind === "engineering" && p.repeatable && (
              <div className="kv">
                <span>How many</span>
                <span className="stepper">
                  <ActionButton
                    mini
                    label="−"
                    blocker={qty <= 1 ? "At least one." : null}
                    tip={["One fewer"]}
                    onClick={() => setQty(qty - 1)}
                  />
                  <span className="stepper-value">{qty}</span>
                  <ActionButton
                    mini
                    label="+"
                    blocker={qty >= MAX_QUANTITY ? `At most ${MAX_QUANTITY}.` : null}
                    tip={["One more"]}
                    onClick={() => setQty(qty + 1)}
                  />
                </span>
              </div>
            )}
            <div className="start-row">
              {p.kind === "research" &&
                !captiveTopic &&
                (() => {
                  const team = researchTeam(g, p);
                  return (
                    <ActionButton
                      primary
                      icon="start"
                      label="Add to the queue"
                      blocker={researchBlocker(g, p.id)}
                      tip={[
                        `${team.scientists} scientists at ${team.rate.toFixed(1)} points a day on it: done in ${eta(newTopicDays(g, p))}, after the topics ahead`,
                        "The lead scientist's aptitudes multiply everyone else's",
                      ]}
                      onClick={() =>
                        command(
                          (s) => queueResearch(s, p.id),
                          `${p.name} goes into the research queue.`,
                        )
                      }
                    />
                  );
                })()}
              {bases.map((b) => {
                if (p.kind === "research") {
                  if (!captiveTopic) return null;
                  return (
                    <ActionButton
                      key={b.id}
                      primary
                      icon="start"
                      label={`Question one at ${short(b.name)}`}
                      blocker={researchBlocker(g, p.id, b.id)}
                      tip={[
                        "Into the research queue: the captive held there, longest first",
                        "Needs a laboratory and a scientist there",
                      ]}
                      onClick={() =>
                        command(
                          (s) => queueResearch(s, p.id, b.id),
                          `${p.name} goes into the research queue.`,
                        )
                      }
                    />
                  );
                }
                {
                  const team = teamOn(g, b, p);
                  const order = p.repeatable ? queuedAt(g, b.id, p.id) : undefined;
                  const ahead = engineeringQueue(g, b.id).length;
                  const blocked = queueBlocker(g, p.id, b.id, qty);
                  return (
                    <ActionButton
                      key={b.id}
                      primary
                      icon="start"
                      label={order ? `Add ${qty}` : `Queue${p.repeatable ? ` ${qty}` : ""}`}
                      blocker={blocked}
                      tip={[
                        order
                          ? `Joins the order already there: ${unitsOf(order) + qty} to make`
                          : null,
                        `${team.engineers} engineers at ${team.rate.toFixed(1)} points a day: done in ${eta(newJobDays(g, b, p, qty))}${!order && ahead ? `, after the ${ahead} job${ahead === 1 ? "" : "s"} ahead` : ""}`,
                        p.cost
                          ? `Materials about ${money(Math.round(qty * p.cost * team.waste))} at today's team (×${team.waste.toFixed(2)}), drawn as the work is done`
                          : null,
                        "The lead engineer's aptitudes multiply everyone else's",
                      ]}
                      onClick={() =>
                        command(
                          (s) => queueJob(s, p.id, b.id, qty),
                          `${p.name}${qty > 1 ? ` ×${qty}` : ""} queued at ${b.name}.`,
                        )
                      }
                    />
                  );
                }
              })}
            </div>
          </div>
        )}
      </Report>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** The project shown: the one asked for if it's of this kind, else the first under way, available or done. */
function pick(
  g: GameState,
  kind: ProjectKind,
  wanted: string | null | undefined,
  base?: Installation,
): ProjectDef | null {
  const w = wanted ? projectById(wanted) : undefined;
  if (w && w.kind === kind) return w;
  const run = projectsAt(g, base?.id, kind)[0];
  if (run) return projectById(run.projectId) ?? null;
  return (
    visibleProjects(g, kind).find((p) =>
      base ? needMet(g, base, p.needs) : needMetSomewhere(g, p),
    ) ??
    PROJECTS.find((p) => p.kind === kind && researched(g, p.id)) ??
    null
  );
}

/** Nothing to show yet: say what would open something up. */
function Empty() {
  const g = useGame();
  const { kind, base } = useContext(ScopeContext);
  const open = useStore((s) => s.openResearch);
  const staff = base ? staffAt(g, base, "engineer") : staffSummary(g, kind).total;
  if (!staff)
    return (
      <p className="prose dim">
        No {kind === "research" ? "scientists" : "engineers"} {base ? "here" : "yet"}. Hire them at
        a base, on Personnel's Hiring tab.
      </p>
    );
  // Research that would open a project here.
  const keys = PROJECTS.filter(
    (p) =>
      p.kind === "research" &&
      !researched(g, p.id) &&
      PROJECTS.some((x) => x.kind === kind && x.requires.includes(p.id)),
  );
  return (
    <div className="rdetail">
      <p className="prose dim">Nothing to work on yet.</p>
      {keys.length > 0 && (
        <div className="rbox">
          <h4 className="section-title">
            <Icon name="unlocks" size={14} /> Opened by research
          </h4>
          <div className="chips">
            {keys.map((x) => (
              <button key={x.id} className="chip" onClick={() => open(x.id)}>
                <Icon name={iconOf(x)} size={16} />
                {x.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The list and the chosen project, side by side. */
function Body({ chosen }: { chosen: ProjectDef | null }) {
  return (
    <div className="research-body">
      <div className="panel rlist-panel">
        <ProjectList selected={chosen?.id ?? null} />
      </div>
      <div className="panel rdetail-panel">
        {chosen ? <Detail key={chosen.id} p={chosen} /> : <Empty />}
      </div>
    </div>
  );
}

/** A base's workshops: its engineers' queue and what they could make. */
export function Workshop({ base, item }: { base: Installation; item?: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const chosen = pick(g, "engineering", item, base);
  return (
    <ScopeContext.Provider
      value={{ kind: "engineering", base, show: (id) => openBase(base.id, "workshops", id) }}
    >
      <Body chosen={chosen} />
    </ScopeContext.Provider>
  );
}

export function ResearchScreen() {
  const g = useGame();
  const item = useStore((s) => s.researchItem);
  const show = useStore((s) => s.showResearchItem);
  const captives = allCaptives(g);
  const thralls = captives.filter((c) => c.captive.kind === "thrall").length;
  const vampires = captives.length - thralls;
  const chosen = pick(g, "research", item);
  return (
    <ScopeContext.Provider value={{ kind: "research", show }}>
      <div className="control-section research-view">
        <header className="control-sub">
          <span className="td-dim" data-tip="Material for research, held at the bases">
            Held: {vampires} vampire{vampires === 1 ? "" : "s"}, {thralls} thrall
            {thralls === 1 ? "" : "s"}, {totalRemains(g)} remains · Funds {money(g.funds)}
          </span>
        </header>
        <Body chosen={chosen} />
      </div>
    </ScopeContext.Provider>
  );
}

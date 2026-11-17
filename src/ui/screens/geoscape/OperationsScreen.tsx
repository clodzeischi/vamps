// The operations dashboard: the whole Order at a glance, by status rather than
// by place. Who is in the field and when they're back, who is wounded, who is
// ready and where; which aircraft are flying; what is being built or studied.
// Every row leads to the thing itself (its base, or the globe).
import { regionById } from "../../../data/regions";
import { AIRCRAFT } from "../../../data/aircraft";
import type { Agent, Aircraft, GameState } from "../../../sim/state";
import { money } from "../../format";
import { globe } from "../../globe";
import { agentName, agentStatus, aircraftStatus, type Status } from "../../status";
import { useGame, useStore } from "../../store";
import { underWay } from "./LeftPanels";

const baseName = (g: GameState, id: string) => g.installations.find((i) => i.id === id)?.name ?? "";
const byEnd = (a: { st: Status }, b: { st: Status }) => (a.st.until ?? Infinity) - (b.st.until ?? Infinity);

function Group({ title, count, tone, children }: { title: string; count: number; tone: string; children: React.ReactNode }) {
  return (
    <section className={`ops-group ops-${tone}`}>
      <h4 className="section-title">{title} <span className="tab-count">{count}</span></h4>
      {count === 0 ? <p className="small dim">None.</p> : <ul className="list">{children}</ul>}
    </section>
  );
}

function Row({ title, sub, note, onClick }: { title: string; sub: string; note?: string; onClick: () => void }) {
  return (
    <li>
      <button className="list-row ops-row" onClick={onClick}>
        <span className="ops-body">
          <span className="ops-title">{title}</span>
          <span className="ops-sub">{sub}</span>
        </span>
        {note && <span className="ops-note">{note}</span>}
      </button>
    </li>
  );
}

export function OperationsScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeOperations);
  const openBase = useStore((s) => s.openBase);
  const focusOn = useStore((s) => s.focusOn);

  const toMap = (st: Status) => {
    const m = st.missionId ? g.missions.find((x) => x.id === st.missionId) : undefined;
    const c = st.coverUpId ? g.coverUps.find((x) => x.id === st.coverUpId) : undefined;
    if (!m && !c) return;
    close();
    globe()?.flyTo(m ? m.pos : c!.pos, 2.0);
    focusOn(m ? { kind: "mission", id: m.id } : { kind: "coverup", id: c!.id });
  };

  const agents = g.agents.map((a) => ({ a, st: agentStatus(g, a) }));
  const field = agents.filter((x) => x.st.kind === "field").sort(byEnd);
  const covert = agents.filter((x) => x.st.kind === "covert").sort(byEnd);
  const wounded = agents.filter((x) => x.st.kind === "wounded").sort(byEnd);
  const ready = agents.filter((x) => x.st.kind === "ready").sort((x, y) => x.a.baseId.localeCompare(y.a.baseId));

  const craft = g.aircraft.map((c) => ({ c, st: aircraftStatus(g, c) }));
  const flying = craft.filter((x) => x.st.kind === "field").sort(byEnd);
  const parked = craft.filter((x) => x.st.kind !== "field");

  // Everything else under way: building, research, covert actions, media (teams and wounds have their own columns).
  const work = underWay(g, (f) => { close(); focusOn(f); }, openBase).filter((it) => !/dot-team|dot-wounded/.test(it.dot));

  const agentRow = ({ a, st }: { a: Agent; st: Status }, onClick: () => void) => (
    <Row key={a.id} title={agentName(a)} sub={st.kind === "ready" ? baseName(g, a.baseId) : st.label} note={st.note || undefined} onClick={onClick} />
  );
  const aircraftRow = ({ c, st }: { c: Aircraft; st: Status }, onClick: () => void) => (
    <Row key={c.id} title={c.name} sub={`${AIRCRAFT[c.kind].name} · ${st.kind === "field" ? st.label : baseName(g, c.baseId)}`} note={st.note || undefined} onClick={onClick} />
  );


  return (
    <div className="base-view ops-view">
      <header className="base-view-head">
        <nav className="crumbs"><span className="crumb current">Operations</span></nav>
        <span className="td-dim">{g.agents.length} agents · {g.aircraft.length} aircraft · {g.installations.filter((i) => i.kind === "base").length} base{g.installations.filter((i) => i.kind === "base").length === 1 ? "" : "s"}</span>
        <span className="base-funds">Funds <b>{money(g.funds)}</b></span>
        <button className="mini" onClick={close} title="Back to the globe (Esc)">Close ✕</button>
      </header>
      <div className="ops-grid">
        <section className="panel ops-col">
          <h2 className="facility-title">Agents</h2>
          <Group title="In the field" count={field.length} tone="field">{field.map((x) => agentRow(x, () => toMap(x.st)))}</Group>
          <Group title="Covert work" count={covert.length} tone="covert">{covert.map((x) => agentRow(x, () => toMap(x.st)))}</Group>
          <Group title="Wounded" count={wounded.length} tone="warn">{wounded.map((x) => agentRow(x, () => openBase(x.a.baseId, "personnel", x.a.id)))}</Group>
          <Group title="Ready" count={ready.length} tone="good">{ready.map((x) => agentRow(x, () => openBase(x.a.baseId, "personnel", x.a.id)))}</Group>
        </section>
        <section className="panel ops-col">
          <h2 className="facility-title">Aircraft</h2>
          <Group title="Flying" count={flying.length} tone="field">{flying.map((x) => aircraftRow(x, () => toMap(x.st)))}</Group>
          <Group title="In the hangar" count={parked.length} tone="good">{parked.map((x) => aircraftRow(x, () => openBase(x.c.baseId, "hangars", x.c.id)))}</Group>
          <h2 className="facility-title ops-sub-title">Bases</h2>
          <ul className="list">
            {g.installations.filter((i) => i.kind === "base").map((b) => {
              const here = agents.filter((x) => x.a.baseId === b.id);
              return (
                <Row key={b.id} title={b.name} sub={regionById(b.regionId)?.name ?? ""}
                  note={`${here.filter((x) => x.st.kind === "ready").length} of ${here.length} ready`} onClick={() => openBase(b.id, "overview")} />
              );
            })}
          </ul>
        </section>
        <section className="panel ops-col">
          <h2 className="facility-title">Work under way</h2>
          {work.length === 0 ? (
            <p className="small dim">Nothing under way.</p>
          ) : (
            <ul className="list">
              {work.map((it) => (
                <li key={it.key}>
                  <button className="list-row ops-row" onClick={it.onClick}>
                    <span className={`dot ${it.dot}`} />
                    <span className="ops-body">
                      <span className="ops-title">{it.title}</span>
                      <span className="ops-sub">{it.note}</span>
                      {it.progress !== null && <span className="progress"><span style={{ width: `${Math.round(it.progress * 100)}%` }} /></span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

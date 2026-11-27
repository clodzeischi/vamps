// Personnel: who is at a base (Current) and who could join it (Hiring).
import { RECRUIT_COST } from "../../../../data/agents";
import { STAFF } from "../../../../data/installations";
import { regionById } from "../../../../data/regions";
import {
  agentsAt,
  facilityCount,
  hireBlocker,
  occupantsAt,
  quartersOf,
  staffOf,
  recruitingWeights,
  staffAt,
  staffRoom,
  candidatesOf,
  dismiss,
  hire,
  monthlyPay,
  monthlyPersonnelCost,
} from "../../../../sim/people/personnel";
import { type StaffRole } from "../../../../data/aptitudes";
import { type Installation, isDeployed } from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { ActionButton } from "../../../components/ActionButton";
import { money } from "../../../format";
import { agentName, agentStatus } from "../../../status";
import { useGame, useStore, type BaseView } from "../../../store";
import { TransferPanel } from "../../../components/Transfer";
import { AptHeader, PayHeader, AptCells, PayCell, StatusTag, staffLine } from "./shared";

/** Personnel: who is here (Current) and who could join (Hiring). */
export function PersonnelTabs({ base, view }: { base: Installation; view: BaseView }) {
  const openBase = useStore((s) => s.openBase);
  return (
    <nav className="tabs">
      <button
        className={`tab${view === "personnel" ? " on" : ""}`}
        onClick={() => openBase(base.id, "personnel")}
      >
        Current
      </button>
      <button
        className={`tab${view === "hiring" ? " on" : ""}`}
        onClick={() => openBase(base.id, "hiring")}
      >
        Hiring
      </button>
    </nav>
  );
}

export function Personnel({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const agents = agentsAt(g, base.id);
  const fallen = [...g.fallen].reverse();
  const here = [...agents, ...g.staff.filter((p) => p.baseId === base.id)].reduce(
    (t, p) => t + monthlyPay(p),
    0,
  );
  return (
    <div className="split">
      <div className="split-main">
        <p
          className="small dim"
          data-tip={`The Order, every base: ${money(Object.values(monthlyPersonnelCost(g)).reduce((t, n) => t + n, 0))} a month with aircraft and containment`}
        >
          {occupantsAt(g, base.id)} of {quartersOf(base)} beds taken · pay here {money(here)} a
          month
        </p>
        <h4 className="section-title">
          Operatives <span className="tab-count">{agents.length}</span>
        </h4>
        {agents.length === 0 ? (
          <p className="prose dim">No operatives stationed here. Recruit some on the Hiring tab.</p>
        ) : (
          <div className="table roster">
            <span className="th">Name</span>
            <AptHeader role="operator" />
            <PayHeader />
            <span className="th">Status</span>
            <span className="th" />
            {agents.map((a) => (
              <div key={a.id} className="tr">
                <span className="td-name">{agentName(a)}</span>
                <AptCells p={a} />
                <PayCell p={a} />
                <StatusTag st={agentStatus(g, a)} />
                <ActionButton
                  mini
                  label="Let go"
                  blocker={isDeployed(g, a) ? `${a.name} is away.` : null}
                  tip={["Released from service; what they carry goes back to the armoury"]}
                  onClick={() =>
                    command((s) => dismiss(s, a.id), `${a.name} released from service.`)
                  }
                />
              </div>
            ))}
          </div>
        )}
        <StaffList base={base} kind="scientist" />
        <StaffList base={base} kind="engineer" />
        <StaffList base={base} kind="analyst" />
        {fallen.length > 0 && (
          <div className="fallen">
            <h4 className="section-title">The fallen</h4>
            {fallen.map((f, k) => (
              <div key={k} className="td-dim">
                {agentName(f)}, {f.where}, {formatDate(f.died)}
              </div>
            ))}
          </div>
        )}
        <h4 className="section-title">Send to another base by airline</h4>
        <TransferPanel base={base} />
      </div>
    </div>
  );
}

/** The scientists or engineers at a base, by name. */
function StaffList({ base, kind }: { base: Installation; kind: StaffRole }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const people = staffOf(g, base.id, kind);
  return (
    <>
      <h4 className="section-title">
        {STAFF[kind].plural}{" "}
        <span className="tab-count">{people.length ? staffLine(g, base, kind) : ""}</span>
      </h4>
      {people.length === 0 ? (
        <p className="small dim">
          {!STAFF[kind].facility || facilityCount(base, STAFF[kind].facility)
            ? `No ${STAFF[kind].plural.toLowerCase()} here. Hire some on the Hiring tab.`
            : `This base has no ${kind === "scientist" ? "laboratory" : "workshop"}: build one in Construction.`}
        </p>
      ) : (
        <div className="table staff-roster engineers">
          <div className="tr">
            <span className="th">Name</span>
            <AptHeader role={kind} />
            <PayHeader />
            <span className="th" />
            <span className="th" />
          </div>
          {people.map((p) => {
            const leads =
              (kind === "engineer"
                ? base.leadEngineer
                : kind === "analyst"
                  ? g.leadAnalyst
                  : g.leadScientist) === p.id;
            return (
              <div key={p.id} className="tr">
                <span className="td-name">
                  {p.name}
                  {leads && !p.arriveAt ? (
                    <span
                      className="tag tag-good lead-tag"
                      data-tip={`Chosen in ${kind === "engineer" ? "the Workshops" : kind === "analyst" ? "Intelligence" : "Research"}`}
                    >
                      Lead
                    </span>
                  ) : null}
                </span>
                <AptCells p={p} />
                <PayCell p={p} />
                <span className="td-dim">
                  {p.arriveAt
                    ? `arriving ${formatDate(p.arriveAt)}`
                    : `since ${formatDate(p.joinedAt)}`}
                </span>
                <ActionButton
                  mini
                  label="Let go"
                  blocker={p.arriveAt ? "Still in transit." : null}
                  tip={["They leave the Order's service; the hiring fee is lost"]}
                  onClick={() => command((s) => dismiss(s, p.id), `${p.name} leaves.`)}
                />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function Hiring({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const blocker = hireBlocker(g, base.id, "operator");
  const operators = candidatesOf(g, "operator");
  const weights = recruitingWeights(g).sort((a, b) => b.weight - a.weight);
  const total = weights.reduce((a, w) => a + w.weight, 0);
  const top = weights.slice(0, 6);
  const rest = 1 - top.reduce((a, w) => a + w.weight, 0) / (total || 1);
  return (
    <>
      <p className="prose dim">
        The Church puts candidates forward from where the Order is trusted and present: operatives
        who take the three vows, and lay scientists, engineers and analysts who work for a salary.
        New candidates each month. Everyone hired takes a bed here.
      </p>
      <div className="network">
        <span className="network-label">Recruiting network</span>
        <div className="network-bar">
          {top.map((w, i) => (
            <span
              key={w.regionId}
              className={`seg seg-${i}`}
              style={{ flexGrow: w.weight }}
              title={`${regionById(w.regionId)?.name}: ${Math.round((100 * w.weight) / total)}%`}
            />
          ))}
          {rest > 0.005 && (
            <span
              className="seg seg-rest"
              style={{ flexGrow: rest * total }}
              title={`Elsewhere: ${Math.round(rest * 100)}%`}
            />
          )}
        </div>
        <div className="network-legend">
          {top.map((w, i) => (
            <span key={w.regionId}>
              <i className={`seg-${i}`} />
              {regionById(w.regionId)?.name} {Math.round((100 * w.weight) / total)}%
            </span>
          ))}
        </div>
      </div>
      <h4 className="section-title">
        Operatives <span className="tab-count">{money(RECRUIT_COST)} to train</span>
      </h4>
      {operators.length === 0 ? (
        <p className="small dim">No candidates left this month.</p>
      ) : (
        <div className="table candidates">
          <span className="th">Name</span>
          <AptHeader role="operator" />
          <PayHeader />
          <span className="th" />
          {operators.map((c) => (
            <div key={c.id} className="tr">
              <span className="td-name">{agentName(c)}</span>
              <AptCells p={c} />
              <PayCell p={c} />
              <ActionButton
                mini
                primary
                label="Recruit"
                blocker={blocker}
                tip={[`${money(RECRUIT_COST)} to train, then ${money(monthlyPay(c))} a month`]}
                onClick={() =>
                  command(
                    (s) => hire(s, base.id, "operator", c.id),
                    `${c.name} takes vows and joins the Order.`,
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
      <StaffCandidates base={base} kind="scientist" />
      <StaffCandidates base={base} kind="engineer" />
      <StaffCandidates base={base} kind="analyst" />
    </>
  );
}

/** Scientists or engineers looking for work: names, origins and aptitudes. */
function StaffCandidates({ base, kind }: { base: Installation; kind: StaffRole }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const d = STAFF[kind];
  const people = candidatesOf(g, kind);
  const why = hireBlocker(g, base.id, kind);
  return (
    <>
      <h4 className="section-title">
        {d.plural}{" "}
        <span className="tab-count">
          {money(d.hire)} vetting ·{" "}
          {`${staffAt(g, base, kind)} of ${staffRoom(base, kind)} places here`}
        </span>
      </h4>
      {people.length === 0 ? (
        <p className="small dim">Nobody left looking this month.</p>
      ) : (
        <div className="table staff-roster eng-candidates">
          <div className="tr">
            <span className="th">Name</span>
            <AptHeader role={kind} />
            <PayHeader />
            <span className="th" />
          </div>
          {people.map((p) => (
            <div key={p.id} className="tr">
              <span className="td-name">{p.name}</span>
              <AptCells p={p} />
              <PayCell p={p} />
              <ActionButton
                mini
                primary
                icon="hire"
                label="Hire"
                blocker={why}
                tip={[
                  `${money(d.hire)} for vetting (background checks), then ${money(monthlyPay(p))} a month`,
                ]}
                onClick={() =>
                  command(
                    (s) => hire(s, base.id, kind, p.id),
                    `${p.name} joins as a ${d.name.toLowerCase()}.`,
                  )
                }
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

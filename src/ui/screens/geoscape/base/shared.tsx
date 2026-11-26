// Small pieces the base views share: aptitude bars, pay, status tags, the expand button.
import { PAY_AT_MIDDLE } from "../../../../data/agents";
import { bloodlineById } from "../../../../data/bloodlines";
import { FACILITIES, givesOf, STAFF, type BaseUpgradeKind } from "../../../../data/installations";
import {
  facilityCount,
  staffAt,
  upgradeBase,
  upgradeBlocker,
  staffLead,
  monthlyPay,
} from "../../../../sim/people/personnel";
import { type Role, type StaffRole } from "../../../../data/aptitudes";
import { type GameState, type Installation, Person, missionById } from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { Icon } from "../../../components/Icon";
import { ActionButton } from "../../../components/ActionButton";
import { money } from "../../../format";
import { globe } from "../../../globe";
import { STATUS_TONE, type Status, traitValue, traitsOf } from "../../../status";
import { useGame, useStore } from "../../../store";

export const bloodlineName = (id: string) => bloodlineById(id)?.name ?? id;

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** A person's bars: their role's four aptitudes, and an operator's Vitality. */
export function AptCells({ p }: { p: Person & { vitality?: number } }) {
  return (
    <>
      {traitsOf(p.role).map((x) => (
        <span key={x.id} className="stat-cell" title={`${x.name}: ${x.covers}`}>
          <span className="stat-bar">
            <span style={{ width: `${traitValue(p, x.id)}%` }} />
          </span>
          <span className="stat-num">{traitValue(p, x.id)}</span>
        </span>
      ))}
    </>
  );
}
/** Pay: a column head and a cell. */
const PAY_TIP = `A month's pay: ${money(PAY_AT_MIDDLE)} at 50 in every aptitude, in proportion to the mean. It rises as they learn.`;
export const PayHeader = () => (
  <span className="th th-pay" data-tip={PAY_TIP}>
    Pay
  </span>
);
export const PayCell = ({ p }: { p: Person }) => (
  <span className="td-pay">{money(monthlyPay(p))}</span>
);
export const AptHeader = ({ role }: { role: Role }) => (
  <>
    {traitsOf(role).map((x) => (
      <span key={x.id} className="th th-stat" title={`${x.name}: ${x.covers}`}>
        {x.icon && <Icon name={x.icon} size={14} />}
        {x.short}
      </span>
    ))}
  </>
);

export function StatusTag({ st }: { st: Status }) {
  return (
    <span className={`status status-${STATUS_TONE[st.kind]}`}>
      <span className="status-label">{st.label}</span>
      {st.note && <span className="status-note">{st.note}</span>}
    </span>
  );
}

/** Leave the base and show a mission or covert action on the globe. */
export function useShowOnMap() {
  const g = useGame();
  const close = useStore((s) => s.closeOverlay);
  const focusOn = useStore((s) => s.focusOn);
  return (st: Status) => {
    const m = st.missionId && missionById(g, st.missionId);
    const c = st.coverUpId && g.coverUps.find((x) => x.id === st.coverUpId);
    const pos = m ? m.pos : c ? c.pos : null;
    if (!pos) return;
    close();
    globe()?.flyTo(pos, 2.0);
    focusOn(m ? { kind: "mission", id: m.id } : { kind: "coverup", id: (c as { id: string }).id });
  };
}

/** "Build a hangar · $400,000 · 7 days", for the facility a view expands. */
export function ExpandButton({ base, kind }: { base: Installation; kind: BaseUpgradeKind }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const f = FACILITIES[kind];
  const why = upgradeBlocker(g, base.id, kind);
  const building = (base.upgrades ?? []).filter((u) => u.kind === kind);
  return (
    <div className="expand">
      {building.map((u, i) => (
        <div key={i} className="kv small">
          <span>Building {f.article}</span>
          <span>ready {formatDate(u.readyAt)}</span>
        </div>
      ))}
      <ActionButton
        icon="build"
        label={kind === "quarters" ? "Expand quarters" : `Build ${f.article}`}
        blocker={why}
        tip={[`${money(f.cost)} · ${f.days} days`, givesOf(f)]}
        onClick={() =>
          command((s) => upgradeBase(s, base.id, kind), `Work begins on ${f.article}.`)
        }
      />
    </div>
  );
}

/** "3 engaged · 1 available" for a base's scientists or engineers. */
export function staffLine(g: GameState, base: Installation, kind: StaffRole): string {
  const n = staffAt(g, base, kind);
  const f = STAFF[kind].facility;
  if (!n)
    return !f || facilityCount(base, f)
      ? "none hired"
      : `no ${kind === "scientist" ? "laboratory" : "workshop"}`;
  const lead = staffLead(g, kind, base);
  const work =
    kind === "engineer"
      ? "on the workshop queue"
      : kind === "analyst"
        ? "in the intelligence section"
        : "on the research queue";
  return `${n} ${work}${lead && lead.baseId === base.id ? ` · ${lead.name} leads` : ""}`;
}

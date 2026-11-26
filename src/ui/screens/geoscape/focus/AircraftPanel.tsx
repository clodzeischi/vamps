// One of our aircraft in focus.
import { AIRCRAFT } from "../../../../data/aircraft";
import { missionOf } from "../../../../sim/missions/missions";
import { capacityOf, carriesRemains } from "../../../../sim/base/transfers";
import { LoadBar } from "../../../components/LoadBar";
import { aboardItems, TransferPanel } from "../../../components/Transfer";
import { aircraftStatus } from "../../../status";
import { type Aircraft, isCraftDeployed, installationById } from "../../../../sim/core/state";
import { Panel } from "../../../components/Panel";
import { useGame, useStore } from "../../../store";
import { ActionButton } from "../../../components/ActionButton";

/** One of our aircraft: where it is, what it carries, and its orders (Phoenix Point style). */
export function AircraftPanel({ c }: { c: Aircraft }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const focusOn = useStore((s) => s.focusOn);
  const d = AIRCRAFT[c.kind];
  const st = aircraftStatus(g, c);
  const base = installationById(g, c.baseId);
  const m = missionOf(g, c.id);
  const startOrder = useStore((s) => s.startOrder);
  const ferryTo = useStore((s) => s.ferryTo);
  return (
    <Panel title={d.name}>
      <h3 className="detail-title">{c.name}</h3>
      <div className="kv">
        <span>{st.label}</span>
        <span className="td-dim">{st.note}</span>
      </div>
      <div className="kv">
        <span>{c.ferry ? "Bound for" : "Home"}</span>
        <span>{base?.name ?? "—"}</span>
      </div>
      {isCraftDeployed(g, c) ? (
        <LoadBar items={aboardItems(g, c)} capacity={capacityOf(c.kind)} />
      ) : (
        <div className="kv small">
          <span>Capacity</span>
          <span>{capacityOf(c.kind)}</span>
        </div>
      )}
      <div className="kv small">
        <span>Speed</span>
        <span>{d.speedKn} kn</span>
      </div>
      <div className="kv small">
        <span>Reach</span>
        <span>
          {d.reachNm.toLocaleString("en-US")} nm{carriesRemains(c.kind) ? ", lifts bodies" : ""}
        </span>
      </div>
      {m && (
        <ActionButton
          icon="status-field"
          label="Show the team"
          tip={[m.title]}
          onClick={() => focusOn({ kind: "mission", id: m.id })}
        />
      )}
      {c.ferry && (
        <ActionButton
          primary
          icon={c.kind}
          label="Change course…"
          tip={[
            "Then click a base on the globe.",
            "It flies on from where it is; beds and cells move with it.",
          ]}
          onClick={() => startOrder(c.id)}
        />
      )}
      {!isCraftDeployed(g, c) && base && (
        <>
          <h4 className="section-title">Orders</h4>
          <ActionButton
            primary
            icon={c.kind}
            label="Fly to…"
            tip={[
              "Then click a destination on the globe:",
              "a base, to transfer there with people and cargo",
              "a lead or a site, to plan a mission with this aircraft",
            ]}
            onClick={() => startOrder(c.id)}
          />
          <h4 className="section-title">Fly to another base</h4>
          <TransferPanel
            key={ferryTo?.aircraftId === c.id ? ferryTo.baseId : "none"}
            base={base}
            aircraft={c}
          />
          <ActionButton
            icon="bases"
            label="Open in the hangar"
            onClick={() => openBase(base.id, "hangars", c.id)}
          />
        </>
      )}
    </Panel>
  );
}

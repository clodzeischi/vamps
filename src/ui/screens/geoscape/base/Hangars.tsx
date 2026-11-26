// Hangars: the bays, the aircraft in them, and what could fill an empty one.
import { CloseX } from "../../../components/CloseX";
import { AIRCRAFT, type AircraftKind } from "../../../../data/aircraft";
import {
  acquireAircraft,
  acquireBlocker,
  aircraftAt,
  hangarsOf,
  releaseAircraft,
  resaleValue,
  upfrontCost,
} from "../../../../sim/people/personnel";
import {
  type Agent,
  type Aircraft,
  type Installation,
  isCraftDeployed,
  agentById,
} from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { Icon } from "../../../components/Icon";
import { ActionButton } from "../../../components/ActionButton";
import { money } from "../../../format";
import { agentName, aircraftStatus } from "../../../status";
import { useGame, useStore } from "../../../store";
import { LoadBar } from "../../../components/LoadBar";
import { missionOf } from "../../../../sim/missions/missions";
import { capacityOf } from "../../../../sim/base/transfers";
import { aboardItems, TransferPanel } from "../../../components/Transfer";
import { StatusTag, useShowOnMap } from "./shared";

const EMPTY_BAY = "bay-";

export function Hangars({ base, item }: { base: Installation; item?: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const craft = aircraftAt(g, base.id);
  const bays = hangarsOf(base);
  const building = (base.upgrades ?? []).filter((u) => u.kind === "hangar");
  const chosen = craft.find((c) => c.id === item);
  const emptyBay = item?.startsWith(EMPTY_BAY) ? Number(item.slice(EMPTY_BAY.length)) : null;
  const pickingBay =
    emptyBay !== null && emptyBay >= craft.length && emptyBay < bays ? emptyBay : null;
  return (
    <div className={`split${chosen || pickingBay !== null ? " with-detail" : ""}`}>
      <div className="split-main">
        <div className="bays">
          {Array.from({ length: bays }, (_, i) => {
            const c = craft[i];
            if (!c) {
              const on = pickingBay === i;
              return (
                <button
                  key={`empty-${i}`}
                  className={`bay empty${on ? " on" : ""}`}
                  onClick={() => openBase(base.id, "hangars", on ? undefined : `${EMPTY_BAY}${i}`)}
                >
                  <span className="bay-num">Bay {i + 1}</span>
                  <span className="bay-name">Empty</span>
                  <span className="td-dim">Buy or lease an aircraft</span>
                </button>
              );
            }
            const d = AIRCRAFT[c.kind];
            const st = aircraftStatus(g, c);
            return (
              <button
                key={c.id}
                className={`bay${c.id === item ? " on" : ""}`}
                onClick={() => openBase(base.id, "hangars", c.id === item ? undefined : c.id)}
              >
                <span className="bay-num">Bay {i + 1}</span>
                <span className="bay-name">{c.name}</span>
                <span className="td-dim">
                  {d.name} · {d.seats} seats · reach {d.reachNm} nm
                </span>
                <StatusTag st={st} />
              </button>
            );
          })}
          {building.map((u, i) => (
            <div key={`new-${i}`} className="bay empty">
              <span className="bay-num">Bay {bays + i + 1}</span>
              <span className="bay-name">Being built</span>
              <span className="td-dim">ready {formatDate(u.readyAt)}</span>
            </div>
          ))}
        </div>
        <p className="small dim">
          Every bay holds one aircraft, helicopter or jet. More hangars are built in Construction.
        </p>
      </div>
      {chosen && <AircraftDetail base={base} c={chosen} />}
      {!chosen && pickingBay !== null && <BayDetail base={base} bay={pickingBay} />}
    </div>
  );
}

/** An empty bay: the aircraft that could go in it. */
function BayDetail({ base, bay }: { base: Installation; bay: number }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  return (
    <aside className="detail">
      <div className="detail-head">
        <h3 className="detail-title">Bay {bay + 1}</h3>
        <CloseX onClick={() => openBase(base.id, "hangars")} tip="Back to the hangars" />
      </div>
      <p className="small dim">Empty. Choose an aircraft for it.</p>
      <div className="choice-col">
        {(Object.keys(AIRCRAFT) as AircraftKind[]).map((k) => {
          const d = AIRCRAFT[k];
          const owned = d.ownership === "owned";
          return (
            <div key={k} className="choice static aircraft-choice" data-tip={d.description}>
              <span className="choice-title">
                <Icon name={k} size={16} /> {d.name}
              </span>
              <span className="choice-meta">
                {d.seats} seats · {d.speedKn} kn · reach {d.reachNm.toLocaleString("en-US")} nm
              </span>
              <span className="choice-meta">
                {owned
                  ? `${money(upfrontCost(k))} to buy, then ${money(d.monthly)} a month for crew`
                  : `${money(d.monthly)} a month, leased`}
              </span>
              <ActionButton
                mini
                primary
                label={owned ? "Buy" : "Lease"}
                blocker={acquireBlocker(g, base.id, k)}
                tip={[
                  owned ? `${money(upfrontCost(k))} now` : `First month (${money(d.monthly)}) now`,
                ]}
                onClick={() =>
                  command(
                    (s) => acquireAircraft(s, base.id, k),
                    `${d.name} ${owned ? "bought" : "leased"}.`,
                  ) && openBase(base.id, "hangars")
                }
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function AircraftDetail({ base, c }: { base: Installation; c: Aircraft }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  const show = useShowOnMap();
  const d = AIRCRAFT[c.kind];
  const st = aircraftStatus(g, c);
  const owned = d.ownership === "owned";
  const m = missionOf(g, c.id);
  return (
    <aside className="detail">
      <div className="detail-head">
        <h3 className="detail-title">{c.name}</h3>
        <CloseX onClick={() => openBase(base.id, "hangars")} tip="Back to the hangars" />
      </div>
      <p className="td-dim">
        {d.name} · callsign {d.callsign}
      </p>
      <StatusTag st={st} />
      {st.missionId && (
        <button className="mini" onClick={() => show(st)}>
          Show on the map
        </button>
      )}
      {m && (
        <p className="small">
          Team:{" "}
          {m.agentIds
            .map((id) => agentById(g, id))
            .filter((a): a is Agent => !!a)
            .map(agentName)
            .join(", ")}
        </p>
      )}
      {isCraftDeployed(g, c) && <LoadBar items={aboardItems(g, c)} capacity={capacityOf(c.kind)} />}
      <div className="kv">
        <span>Capacity</span>
        <span>{capacityOf(c.kind)}</span>
      </div>
      <div className="kv">
        <span>Speed</span>
        <span>{d.speedKn} kn</span>
      </div>
      <div className="kv">
        <span>Reach</span>
        <span>{d.reachNm.toLocaleString("en-US")} nm</span>
      </div>
      <div className="kv">
        <span>{owned ? "Crew and upkeep" : "Lease"}</span>
        <span>{money(d.monthly)}/mo</span>
      </div>
      <p className="small dim">{d.description}</p>
      <button
        className="mini"
        disabled={isCraftDeployed(g, c)}
        onClick={() =>
          command(
            (s) => releaseAircraft(s, c.id),
            owned
              ? `${c.name} sold for ${money(resaleValue(c.kind))}.`
              : `${c.name} returned to the lessor.`,
          ) && openBase(base.id, "hangars")
        }
      >
        {owned ? `Sell for ${money(resaleValue(c.kind))}` : "Return the lease"}
      </button>
      {!isCraftDeployed(g, c) && (
        <>
          <h4 className="section-title">Fly to another base</h4>
          <TransferPanel base={base} aircraft={c} />
        </>
      )}
    </aside>
  );
}

// Hangars: the bays and the aircraft in them; empty ones are filled from the dark web.
import { CloseX } from "../../../components/CloseX";
import { AIRCRAFT, reachOf } from "../../../../data/aircraft";
import {
  aircraftAt,
  aircraftOnOrder,
  hangarsOf,
  releaseAircraft,
  resaleValue,
} from "../../../../sim/people/personnel";
import {
  type Agent,
  type Aircraft,
  type Installation,
  isCraftDeployed,
  agentById,
} from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { money } from "../../../format";
import { agentName, aircraftStatus } from "../../../status";
import { useGame, useStore } from "../../../store";
import { LoadBar } from "../../../components/LoadBar";
import { missionOf } from "../../../../sim/missions/dispatch";
import { capacityOf } from "../../../../sim/base/transfers";
import { aboardItems, TransferPanel } from "../../../components/Transfer";
import { StatusTag, useShowOnMap } from "./shared";

export function Hangars({ base, item }: { base: Installation; item?: string }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const openMarket = useStore((s) => s.openMarket);
  const craft = aircraftAt(g, base.id);
  const bays = hangarsOf(base);
  const coming = aircraftOnOrder(g, base.id);
  const building = (base.upgrades ?? []).filter((u) => u.kind === "hangar");
  const chosen = craft.find((c) => c.id === item);
  return (
    <div className={`split${chosen ? " with-detail" : ""}`}>
      <div className="split-main">
        <div className="bays">
          {Array.from({ length: bays }, (_, i) => {
            const c = craft[i];
            if (!c && i < craft.length + coming)
              return (
                <div key={`coming-${i}`} className="bay empty">
                  <span className="bay-num">Bay {i + 1}</span>
                  <span className="bay-name">On order</span>
                  <span className="td-dim">Flying in from the dark web</span>
                </div>
              );
            if (!c)
              return (
                <button
                  key={`empty-${i}`}
                  className="bay empty"
                  data-tip="Aircraft are bought on the dark web."
                  onClick={() => openMarket(base.id)}
                >
                  <span className="bay-num">Bay {i + 1}</span>
                  <span className="bay-name">Empty</span>
                  <span className="td-dim">Order an aircraft on the dark web</span>
                </button>
              );
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
                  {d.name} · {d.seats} seats · reach {reachOf(c)} nm
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
    </div>
  );
}

function AircraftDetail({ base, c }: { base: Installation; c: Aircraft }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const openBase = useStore((s) => s.openBase);
  const show = useShowOnMap();
  const d = AIRCRAFT[c.kind];
  const st = aircraftStatus(g, c);
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
        <span>
          {reachOf(c).toLocaleString("en-US")} nm{c.tanks ? ", with fuel tanks" : ""}
        </span>
      </div>
      <div className="kv">
        <span>Crew and upkeep</span>
        <span>{money(d.monthly)}/mo</span>
      </div>
      <p className="small dim">{d.description}</p>
      <button
        className="mini"
        disabled={isCraftDeployed(g, c)}
        onClick={() =>
          command(
            (s) => releaseAircraft(s, c.id),
            `${c.name} sold for ${money(resaleValue(c.kind))}.`,
          ) && openBase(base.id, "hangars")
        }
      >
        Sell for {money(resaleValue(c.kind))}
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

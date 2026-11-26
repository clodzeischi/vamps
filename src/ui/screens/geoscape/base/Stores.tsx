// Stores: the goods at a base, and sending them on by courier.
import { GOOD_IDS, GOODS, goodKnown, shortName, stockOf } from "../../../../sim/economy/market";
import { type Installation } from "../../../../sim/core/state";
import { ActionButton } from "../../../components/ActionButton";
import { useGame, useStore } from "../../../store";
import { Courier } from "../../../components/Gear";
import { bloodlineName } from "./shared";

export function Stores({ base }: { base: Installation }) {
  const g = useGame();
  const openMarket = useStore((s) => s.openMarket);
  const goods = GOOD_IDS.filter((id) => id !== "tissue" && goodKnown(g, id));
  return (
    <>
      <h4 className="section-title">Cold storage, {base.name}</h4>
      <div className="kv">
        <span>Vampire remains</span>
        <span>{base.remains ?? 0}</span>
      </div>
      <p className="small dim">
        Remains here feed the laboratories, or sell as tissue on the dark web.
      </p>
      <h4 className="section-title">The Order's goods</h4>
      {goods.length === 0 ? (
        <p className="small dim">
          Nothing produced yet. The workshops make goods once research allows.
        </p>
      ) : (
        goods.map((id) => (
          <div key={id} className="kv">
            <span>{GOODS[id].name}</span>
            <span>{stockOf(g, id)}</span>
          </div>
        ))
      )}
      <h4 className="section-title">Artifacts</h4>
      {g.market.artifacts.length === 0 ? (
        <p className="small dim">
          None taken yet. Raids on the bloodlines' sites sometimes turn them up.
        </p>
      ) : (
        <ul className="list">
          {g.market.artifacts.map((a) => (
            <li key={a.id} className="kv">
              <span>{shortName(a)}</span>
              <span className="td-dim">
                {bloodlineName(a.bloodline)}, {a.city}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="build-actions">
        <ActionButton
          icon="market"
          label="The dark web"
          tip={["Sell tissue, artifacts, goods and research; buy equipment and information"]}
          onClick={() => openMarket()}
        />
      </div>
      <Courier base={base} />
    </>
  );
}

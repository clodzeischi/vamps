// The black market (sim/market.ts): what the war brings back, and what our
// workshops make, sold quietly; and what can be bought back (never anything
// that moves the hunt forward). Each market has a demand meter: selling
// knocks it down, and it recovers by itself day by day.
import { useState } from "react";
import { ITEM_IDS, ITEMS, type ItemId } from "../../../data/equipment";
import { buyBlocker, buyItem, itemKnown, stockAt } from "../../../sim/equipment";
import { BLOODLINES } from "../../../data/bloodlines";
import { projectById, PROJECTS } from "../../../data/research";
import { regionById } from "../../../data/regions";
import {
  ARTIFACT_SECRECY, artifactOffer, buyGood, buyGoodBlocker, buyPrice, DEMAND_RECOVERY, fullPrice, demandOf, GOOD_IDS, GOODS, goodKnown, itemSalePrice, offerFor,
  RETURN_SUPPORT, returnArtifact, sellArtifact, sellBlocker, sellGood, sellItem, sellItemBlocker, shortName, stockOf,
} from "../../../sim/market";
import { isReady, type Artifact, type GoodId } from "../../../sim/state";
import { Icon } from "../../components/Icon";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { useGame, useStore } from "../../store";

const pct = (p: number) => `${Math.round(p * 100)}%`;

function Demand({ d }: { d: number }) {
  return (
    <span className="demand" title={`Demand ${pct(d)}: each sale pays the full price times this. It recovers ${pct(DEMAND_RECOVERY)} a day.`}>
      <span className="progress"><span style={{ width: pct(d) }} /></span>
      <span className="td-dim">demand {pct(d)}</span>
    </span>
  );
}

function Good({ id }: { id: GoodId }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const def = GOODS[id];
  const known = goodKnown(g, id);
  const line = PROJECTS.find((p) => p.product === id);
  if (!known) {
    return (
      <div className="project choice static blocked">
        <span className="project-head">
          <span className="project-name">{def.name}</span>
          <span className="project-eta">{money(fullPrice(g, id))} a {def.unit}</span>
        </span>
        <span className="project-text">Needs {projectById(def.requires!)?.name ?? def.requires} before our workshops can make it.</span>
      </div>
    );
  }
  const stock = stockOf(g, id);
  const why = sellBlocker(g, id);
  const offer = offerFor(g, id);
  const running = line ? g.projects.filter((a) => a.projectId === line.id).length : 0;
  return (
    <div className="project choice static">
      <span className="project-head">
        <span className="project-name">{def.name}</span>
        <span className="project-eta">{stock} in stock · {money(offer)} a {def.unit}</span>
      </span>
      <span className="project-text">
        Buyer: {def.buyer}.
        {id === "tissue"
          ? " From the remains in cold storage. Worth more the more our labs understand it; the remains are also what vampire research needs."
          : running
            ? ` ${running} production line${running === 1 ? "" : "s"} running.`
            : ` Made in our workshops (Research, ${line?.name}).`}
        {def.secrecy > 0 && ` Each sale: Secrecy −${def.secrecy}.`}
      </span>
      <span className="project-starts">
        <Demand d={demandOf(g, id)} />
        <button className="mini primary" disabled={!!why} title={why ?? `Sell one ${def.unit} for ${money(offer)}`}
          onClick={() => command((s) => sellGood(s, id))}>
          Sell one
        </button>
      </span>
    </div>
  );
}

function Piece({ a }: { a: Artifact }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const [title, ...rest] = a.name.split(": ");
  const where = regionById(a.regionId)?.name;
  return (
    <div className={`project choice static${a.treasure ? " treasure" : ""}`}>
      <span className="project-head">
        <span className="project-name">{title}</span>
        <span className="project-eta">{money(artifactOffer(g, a))}</span>
      </span>
      <span className="project-text">
        {rest.length ? `${rest.join(": ").charAt(0).toUpperCase()}${rest.join(": ").slice(1)}. ` : ""}Taken from {BLOODLINES.find((b) => b.id === a.bloodline)?.short ?? "a bloodline"} in {a.city}.
      </span>
      <span className="project-starts">
        <button className="mini primary" disabled={g.story.exposed} title={`A private collector pays ${money(artifactOffer(g, a))}. Secrecy −${ARTIFACT_SECRECY}.`}
          onClick={() => command((s) => sellArtifact(s, a.id))}>
          Sell
        </button>
        <button className="mini" title={`Hand it back to a church or museum in ${where}: support there +${RETURN_SUPPORT}, and they remember it at the month's review.`}
          onClick={() => command((s) => returnArtifact(s, a.id), `${shortName(a)} returned.`)}>
          Return it
        </button>
      </span>
    </div>
  );
}

/** A good on the buy side: products only; anything that advances the story is never offered. */
function BuyGood({ id }: { id: GoodId }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const def = GOODS[id];
  const why = buyGoodBlocker(g, id);
  const price = buyPrice(g, id);
  return (
    <div className="project choice static">
      <span className="project-head">
        <span className="project-name">{def.name}</span>
        <span className="project-eta">{stockOf(g, id)} in stock · {money(price)} a {def.unit}</span>
      </span>
      <span className="project-text">Bought quietly at the dealer's price, half again what a sale brings.</span>
      <span className="project-starts">
        <button className="mini primary" disabled={!!why} title={why ?? `Buy one ${def.unit} for ${money(price)}`} onClick={() => command((s) => buyGood(s, id))}>
          Buy one
        </button>
      </span>
    </div>
  );
}

/** Weapons, armour and kit: sold out of a base's armoury, or bought into it. */
function EquipmentTrade({ mode }: { mode: "sell" | "buy" }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const bases = g.installations.filter((i) => i.kind === "base" && isReady(g, i));
  const [baseId, setBaseId] = useState(bases[0]?.id ?? "");
  const base = bases.find((b) => b.id === baseId) ?? bases[0];
  if (!base) return <p className="small dim">No operational base to trade from.</p>;
  const items = ITEM_IDS.filter((x) => ITEMS[x].cost > 0 && itemKnown(g, x) && (mode === "buy" || stockAt(base, x) > 0));
  return (
    <>
      <div className="kv"><span>{mode === "sell" ? "From the armoury at" : "Delivered to the armoury at"}</span>
        <select className="market-base" value={base.id} onChange={(e) => setBaseId(e.target.value)}>{bases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>
      {items.length === 0 ? (
        <p className="small dim">Nothing spare in the armoury. What agents carry isn't for sale.</p>
      ) : (
        <div className="table market-items">
          {items.map((x: ItemId) => {
            const d = ITEMS[x];
            const why = mode === "sell" ? sellItemBlocker(g, base.id, x) : buyBlocker(g, base.id, x);
            const price = mode === "sell" ? itemSalePrice(x) : d.cost;
            return (
              <div key={x} className="tr" title={d.description}>
                <span className="td-name"><Icon name={x} size={16} /> {d.name}</span>
                <span className="td-dim">{stockAt(base, x)} here</span>
                <span>{money(price)}</span>
                <button className="mini primary" disabled={!!why} title={why ?? `${mode === "sell" ? "Sell" : "Buy"} one for ${money(price)}`}
                  onClick={() => command((s) => (mode === "sell" ? sellItem(s, base.id, x) : buyItem(s, base.id, x)), mode === "buy" ? `Bought a ${d.name.toLowerCase()}.` : undefined)}>
                  {mode === "sell" ? "Sell" : "Buy"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function MarketScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeMarket);
  const [tab, setTab] = useState<"sell" | "buy">("sell");
  const pieces = [...g.market.artifacts].sort((a, b) => b.value - a.value);
  const buyable = GOOD_IDS.filter((id) => !GOODS[id].story && goodKnown(g, id));
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Panel title="The black market" className="modal research-screen">
        <div className="base-head">
          <nav className="tabs market-tabs">
            <button className={`tab${tab === "sell" ? " on" : ""}`} onClick={() => setTab("sell")}>Sell</button>
            <button className={`tab${tab === "buy" ? " on" : ""}`} onClick={() => setTab("buy")}>Buy</button>
          </nav>
          <span className="td-dim">{money(g.market.earned)} earned this month · Funds {money(g.funds)} · Secrecy {Math.round(g.secrecy)}</span>
          <button className="mini" onClick={close}>Close ✕</button>
        </div>
        {tab === "sell" ? (
          <>
            <p className="small dim research-note">
              Every sale knocks its market's demand down, and demand comes back by itself, a little each day. Selling a little of
              everything, steadily, pays far better than flooding one buyer. Anything that came out of a vampire leaves a trail.
            </p>
            <div className="research-grid">
              <div className="research-col">
                <h4 className="section-title">Goods</h4>
                <div className="project-list">
                  {GOOD_IDS.map((id) => <Good key={id} id={id} />)}
                </div>
                <h4 className="section-title">Equipment <span className="tab-count">half what it cost</span></h4>
                <EquipmentTrade mode="sell" />
              </div>
              <div className="research-col">
                <h4 className="section-title">
                  The vault <span className="tab-count">{pieces.length}</span>
                </h4>
                {pieces.length > 0 && <Demand d={demandOf(g, "artifacts")} />}
                <div className="project-list">
                  {pieces.map((a) => <Piece key={a.id} a={a} />)}
                  {!pieces.length && (
                    <p className="small dim">
                      Nothing yet. The bloodlines have been collecting for eight hundred years: dens and havens sometimes
                      keep pieces worth a fortune, and every lair keeps its line's treasure.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="small dim research-note">
              The dealers sell too, at their price. Never what moves the hunt forward: vampire remains and blood, captives and the
              bloodlines' heirlooms have to be taken, not bought.
            </p>
            <div className="research-grid">
              <div className="research-col">
                <h4 className="section-title">Equipment</h4>
                <EquipmentTrade mode="buy" />
              </div>
              <div className="research-col">
                <h4 className="section-title">Goods</h4>
                <div className="project-list">
                  {buyable.map((id) => <BuyGood key={id} id={id} />)}
                  {!buyable.length && <p className="small dim">Nothing on offer yet. Goods appear once our research knows what they are.</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

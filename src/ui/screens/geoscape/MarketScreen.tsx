// The dark web (sim/market.ts). Buy: a catalogue of equipment and
// information on the left, the cart on the right (destination, quantities,
// the tumbler's fee, one payment). Sell: what the war brings back, what our
// workshops make, spare kit, our research, and the vault. Prices are the same
// either way; the fee is what stops buying and selling back from paying.
import { useState } from "react";
import { bloodlineById } from "../../../data/bloodlines";
import { ITEM_IDS, ITEMS, type ItemId } from "../../../data/equipment";
import { stockAt } from "../../../sim/equipment";
import { projectById, PROJECTS, type ProjectDef } from "../../../data/research";
import { regionById } from "../../../data/regions";
import {
  ARTIFACT_SECRECY, artifactOffer, DEMAND_RECOVERY, demandOf, fullPrice, GOOD_IDS, GOODS, goodKnown, infoForSale, itemOnSale, itemPrice, LEAKED_GOOD_PRICE,
  offerFor, orderBlocker, orderTotal, placeOrder, researchPrice, researchToSell, RETURN_SUPPORT, returnArtifact, sellArtifact, sellBlocker, sellGood, sellItem,
  sellItemBlocker, sellResearch, sellResearchBlocker, SHIPPING_HOURS, shortName, stockOf, topicPublic, TUMBLER_FEE, type Order,
} from "../../../sim/market";
import { isReady, type Artifact, type GoodId } from "../../../sim/state";
import { DAY } from "../../../sim/time";
import { ActionButton } from "../../components/ActionButton";
import { Icon } from "../../components/Icon";
import { money } from "../../format";
import { CART_MAX, useGame, useStore } from "../../store";

const pct = (p: number) => `${Math.round(p * 100)}%`;
const KIT_SHORT = { civilian: "any kit", plainclothes: "plainclothes", tactical: "tactical" } as const;

function Demand({ d }: { d: number }) {
  return (
    <span className="demand" title={`Demand ${pct(d)}: each sale pays the full price times this. It recovers ${pct(DEMAND_RECOVERY)} a day.`}>
      <span className="progress"><span style={{ width: pct(d) }} /></span>
      <span className="td-dim">demand {pct(d)}</span>
    </span>
  );
}

const useBases = () => {
  const g = useGame();
  return g.installations.filter((i) => i.kind === "base" && isReady(g, i));
};

// ----- Buy -----

/** The catalogue: equipment (shipped) and information (at once). */
function Catalogue({ order }: { order: Order }) {
  const g = useGame();
  const setCartItem = useStore((s) => s.setCartItem);
  const toggleCartInfo = useStore((s) => s.toggleCartInfo);
  const items = ITEM_IDS.filter((x) => itemOnSale(g, x));
  const info = infoForSale(g);
  return (
    <div className="research-col">
      <h4 className="section-title">Equipment <span className="tab-count">shipped in {SHIPPING_HOURS} hours</span></h4>
      <div className="table market-items">
        {items.map((x) => {
          const d = ITEMS[x];
          const n = order.items[x] ?? 0;
          return (
            <div key={x} className="tr" title={d.description}>
              <span className="td-name"><Icon name={x} size={16} /> {d.name}</span>
              <span className="td-dim">{KIT_SHORT[d.kit]}</span>
              <span>{money(itemPrice(x))}</span>
              <button className={`mini${n ? "" : " primary"}`} disabled={n >= CART_MAX} title={`Add one to the cart${n ? ` (${n} in it)` : ""}`} onClick={() => setCartItem(x, n + 1)}>
                {n ? `In cart: ${n} +` : "Add"}
              </button>
            </div>
          );
        })}
      </div>
      <h4 className="section-title">Information <span className="tab-count">known at once</span></h4>
      <div className="project-list">
        {info.map((p) => {
          const inCart = order.info.includes(p.id);
          return (
            <div key={p.id} className="project choice static">
              <span className="project-head">
                <span className="project-name">{p.name}</span>
                <span className="project-eta">{money(researchPrice(g, p.id))}</span>
              </span>
              <span className="project-text">{p.description} {p.gives}</span>
              <span className="project-starts">
                <span className="td-dim">{p.points} scientist-days of work, if we did it ourselves</span>
                <button className={`mini${inCart ? "" : " primary"}`} onClick={() => toggleCartInfo(p.id)}>{inCart ? "Take out" : "Add"}</button>
              </span>
            </div>
          );
        })}
        {!info.length && <p className="small dim">Nothing on offer that we don't already know, or can follow yet.</p>}
      </div>
      <p className="small dim">
        Nobody sells what only we could know: vampire tissue, blood and captives, the bloodlines' heirlooms, or anything built on our
        own vampire research, until we sell that research and it gets out.
      </p>
    </div>
  );
}

/** The cart: where it ships, how many of each, the fee, one payment. */
function Cart({ order }: { order: Order }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const setCartItem = useStore((s) => s.setCartItem);
  const toggleCartInfo = useStore((s) => s.toggleCartInfo);
  const setCartBase = useStore((s) => s.setCartBase);
  const clearCart = useStore((s) => s.clearCart);
  const bases = useBases();
  const lines = (Object.entries(order.items) as [ItemId, number][]).filter(([, n]) => n > 0);
  const count = lines.reduce((t, [, n]) => t + n, 0);
  const { subtotal, fee, total } = orderTotal(g, order);
  const why = orderBlocker(g, order);
  const base = bases.find((b) => b.id === order.baseId);
  const pay = () => {
    const ok = command((s) => placeOrder(s, order),
      [count ? `Paid. ${count} item${count === 1 ? "" : "s"} on the way to ${base?.name}, ${SHIPPING_HOURS} hours out.` : "", order.info.length ? "The data is ours." : ""].filter(Boolean).join(" "));
    if (ok) clearCart();
  };
  return (
    <div className="research-col cart">
      <h4 className="section-title">The cart <span className="tab-count">{count + order.info.length || ""}</span></h4>
      <div className="kv"><span>Ship to</span>
        <select className="market-base" value={order.baseId ?? ""} onChange={(e) => setCartBase(e.target.value)} disabled={!bases.length}>
          {bases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {!lines.length && !order.info.length && <p className="small dim">Empty. Add equipment or information from the list.</p>}
      {lines.length > 0 && (
        <div className="cart-lines">
          {lines.map(([x, n]) => (
            <div key={x} className="cart-line">
              <span className="td-name"><Icon name={x} size={16} /> {ITEMS[x].name}</span>
              <span className="stepper">
                <button className="mini" onClick={() => setCartItem(x, n - 1)}>−</button>
                <CartQty n={n} label={`${ITEMS[x].name}: how many`} onSet={(k) => setCartItem(x, k)} />
                <button className="mini" disabled={n >= CART_MAX} onClick={() => setCartItem(x, n + 1)}>+</button>
              </span>
              <span className="cart-price">{money(itemPrice(x) * n)}</span>
              <button className="mini cart-remove" title="Take it out of the cart" onClick={() => setCartItem(x, 0)}>✕</button>
            </div>
          ))}
        </div>
      )}
      {order.info.length > 0 && (
        <div className="cart-lines">
          {order.info.map((id) => (
            <div key={id} className="cart-line">
              <span className="td-name">{projectById(id)?.name}</span>
              <span className="td-dim">data</span>
              <span className="cart-price">{money(researchPrice(g, id))}</span>
              <button className="mini cart-remove" title="Take it out of the cart" onClick={() => toggleCartInfo(id)}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div className="cart-totals">
        <div className="kv"><span>Subtotal</span><span>{money(subtotal)}</span></div>
        <div className="kv" title="The payment goes through a crypto tumbler so it can't be traced back to the Order. Buying and selling back never pays."><span>Crypto tumbler ({pct(TUMBLER_FEE)})</span><span>{money(fee)}</span></div>
        <div className="kv cart-total"><span>Total</span><span>{money(total)}</span></div>
        <div className="kv td-dim"><span>Funds after</span><span>{money(g.funds - total)}</span></div>
      </div>
      <p className="small dim">
        {count ? `Equipment arrives at ${base?.name ?? "the base"} in ${SHIPPING_HOURS} hours, into the armoury. ` : ""}
        {order.info.length ? "Information is ours the moment it's paid for." : ""}
      </p>
      <div className="build-actions">
        <ActionButton primary icon="market" label={`Pay ${money(total)}`} blocker={why} onClick={pay}
          tip={[`${money(subtotal)} and the tumbler's ${money(fee)}`]} />
        {(lines.length > 0 || order.info.length > 0) && <button className="mini" onClick={clearCart}>Empty the cart</button>}
      </div>
    </div>
  );
}

/** How many, typed: an empty field while typing keeps the line; left empty, it goes back to what it was. */
function CartQty({ n, label, onSet }: { n: number; label: string; onSet: (n: number) => void }) {
  const [empty, setEmpty] = useState(false);
  return (
    <input className="cart-qty" type="number" min={1} max={CART_MAX} value={empty ? "" : n} aria-label={label} onBlur={() => setEmpty(false)}
      onChange={(e) => {
        const k = Math.floor(Number(e.target.value));
        setEmpty(!(k > 0));
        if (k > 0) onSet(k);
      }} />
  );
}

/** The cart as it can be paid for now: lines no longer on sale dropped, and a base to ship to. */
function useOrder(): Order {
  const g = useGame();
  const cart = useStore((s) => s.cart);
  const bases = useBases();
  const offered = new Set(infoForSale(g).map((p) => p.id));
  const items = Object.fromEntries((Object.entries(cart.items) as [ItemId, number][]).filter(([x, n]) => n > 0 && itemOnSale(g, x))) as Order["items"];
  const baseId = bases.some((b) => b.id === cart.baseId) ? cart.baseId : bases[0]?.id;
  return { items, info: cart.info.filter((id) => offered.has(id)), ...(baseId ? { baseId } : {}) };
}

// ----- Sell -----

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
  const running = line ? g.projects.filter((a) => a.projectId === line.id).reduce((t, a) => t + (a.count ?? 1), 0) : 0;
  const leaked = def.requires && g.market.sold?.[def.requires] && topicPublic(g, def.requires);
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
            ? ` ${running} more on order in our workshops.`
            : ` Made in our workshops, to order (Engineering, ${line?.name}).`}
        {leaked && ` Our research is out: others make it too, and it fetches ${pct(LEAKED_GOOD_PRICE)} of what it did.`}
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

/** Our research, to sell once: who pays, what it costs us, and when it gets out. */
function ResearchSale({ p }: { p: ProjectDef }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const trade = p.trade as { buyer: string; secrecy: number };
  const sold = g.market.sold?.[p.id];
  const why = sellResearchBlocker(g, p.id);
  const price = researchPrice(g, p.id);
  const made = [...GOOD_IDS.filter((x) => GOODS[x].requires === p.id).map((x) => GOODS[x].name.toLowerCase()), ...ITEM_IDS.filter((x) => ITEMS[x].requires === p.id).map((x) => ITEMS[x].name.toLowerCase())];
  const days = sold ? Math.max(0, Math.ceil((sold.publicAt - g.time) / DAY)) : 0;
  return (
    <div className={`project choice static${sold ? " blocked" : ""}`}>
      <span className="project-head">
        <span className="project-name">{p.name}</span>
        <span className="project-eta">{sold ? (days ? "sold" : "public") : money(price)}</span>
      </span>
      <span className="project-text">
        Buyer: {trade.buyer}. We keep it; they get a copy.
        {made.length > 0 && ` Once it gets out, others make ${made.join(" and ")} too.`}
        {trade.secrecy > 0 && ` Secrecy −${trade.secrecy}.`}
      </span>
      <span className="project-starts">
        <span className="td-dim">
          {sold ? (days ? `Out in the world in about ${days} day${days === 1 ? "" : "s"}.` : "Out in the world now.") : "Public a month or two after it's sold."}
        </span>
        {!sold && (
          <button className="mini primary" disabled={!!why} title={why ?? `Sell the data for ${money(price)}`} onClick={() => command((s) => sellResearch(s, p.id))}>
            Sell
          </button>
        )}
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
        {rest.length ? `${rest.join(": ").charAt(0).toUpperCase()}${rest.join(": ").slice(1)}. ` : ""}Taken from {bloodlineById(a.bloodline)?.short ?? "a bloodline"} in {a.city}.
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

/** Spare weapons, armour and kit out of a base's armoury, at what they cost. */
function SellEquipment() {
  const g = useGame();
  const command = useStore((s) => s.command);
  const bases = useBases();
  const [baseId, setBaseId] = useState(bases[0]?.id ?? "");
  const base = bases.find((b) => b.id === baseId) ?? bases[0];
  if (!base) return <p className="small dim">No operational base to sell from.</p>;
  const items = ITEM_IDS.filter((x) => ITEMS[x].cost > 0 && stockAt(base, x) > 0);
  return (
    <>
      <div className="kv"><span>From the armoury at</span>
        <select className="market-base" value={base.id} onChange={(e) => setBaseId(e.target.value)}>{bases.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>
      {items.length === 0 ? (
        <p className="small dim">Nothing spare in the armoury. What operatives carry isn't for sale.</p>
      ) : (
        <div className="table market-items">
          {items.map((x: ItemId) => {
            const d = ITEMS[x];
            const why = sellItemBlocker(g, base.id, x);
            return (
              <div key={x} className="tr" title={d.description}>
                <span className="td-name"><Icon name={x} size={16} /> {d.name}</span>
                <span className="td-dim">{stockAt(base, x)} here</span>
                <span>{money(itemPrice(x))}</span>
                <button className="mini primary" disabled={!!why} title={why ?? `Sell one for ${money(itemPrice(x))}`} onClick={() => command((s) => sellItem(s, base.id, x))}>
                  Sell
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function SellTab() {
  const g = useGame();
  const pieces = [...g.market.artifacts].sort((a, b) => b.value - a.value);
  const research = researchToSell(g);
  return (
    <>
      <p className="small dim research-note">
        Every sale of goods knocks its market's demand down, and demand comes back by itself, a little each day. Kit fetches what it
        costs. Anything that came out of a vampire leaves a trail.
      </p>
      <div className="research-grid">
        <div className="research-col">
          <h4 className="section-title">Goods</h4>
          <div className="project-list">
            {GOOD_IDS.map((id) => <Good key={id} id={id} />)}
          </div>
          <h4 className="section-title">Equipment</h4>
          <SellEquipment />
        </div>
        <div className="research-col">
          <h4 className="section-title">Research <span className="tab-count">{research.length || ""}</span></h4>
          <div className="project-list">
            {research.map((p) => <ResearchSale key={p.id} p={p} />)}
            {!research.length && (
              <p className="small dim">
                Nothing yet. What only we know is worth a great deal to people who ask no questions: pharmaceutical companies through
                cutouts, defence contractors, data brokers. Common science sells for nothing.
              </p>
            )}
          </div>
          <h4 className="section-title">The vault <span className="tab-count">{pieces.length}</span></h4>
          {pieces.length > 0 && <Demand d={demandOf(g, "artifacts")} />}
          <div className="project-list">
            {pieces.map((a) => <Piece key={a.id} a={a} />)}
            {!pieces.length && (
              <p className="small dim">
                Nothing yet. The bloodlines have been collecting for eight hundred years: dens and havens sometimes keep pieces worth a
                fortune, and every lair keeps its line's treasure.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function MarketScreen() {
  const g = useGame();
  const tab = useStore((s) => s.marketTab);
  const setTab = useStore((s) => s.setMarketTab);
  const order = useOrder();
  const inCart = Object.values(order.items).reduce((t: number, n) => t + (n ?? 0), 0) + order.info.length;
  return (
    <div className="control-section control-scroll research-screen">
        <header className="control-sub">
          <nav className="tabs market-tabs">
            <button className={`tab${tab === "buy" ? " on" : ""}`} onClick={() => setTab("buy")}>Buy{inCart ? <span className="tab-count"> {inCart}</span> : null}</button>
            <button className={`tab${tab === "sell" ? " on" : ""}`} onClick={() => setTab("sell")}>Sell</button>
          </nav>
          <span className="td-dim">{money(g.market.earned)} earned this month · Funds {money(g.funds)} · Secrecy {Math.round(g.secrecy)}</span>
        </header>
        {tab === "buy" ? (
          <>
            <p className="small dim research-note">
              Weapons, armour and kit, and the science anyone can buy. Every order goes through a crypto tumbler for {pct(TUMBLER_FEE)} on
              top. Equipment ships to a base in {SHIPPING_HOURS} hours; information is ours at once.
            </p>
            <div className="research-grid market-buy">
              <Catalogue order={order} />
              <Cart order={order} />
            </div>
          </>
        ) : (
          <SellTab />
        )}
    </div>
  );
}

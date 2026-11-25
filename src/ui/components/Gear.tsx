// Per-agent equipment in the UI: the loadout (a summary, and the equip
// window with the inventory grid), gear icons, the armoury.
import { ITEM_IDS, ITEMS, type ItemId } from "../../data/equipment";
import { KIT, type KitId } from "../../data/kit";
import { carried, fromArmoury, gearOf, issueBest, itemKnown, moveGear, stockAt, toArmoury } from "../../sim/equipment";
import { allItems, canPut, cloneGear, moveWithin, slotTakes } from "../../sim/inventory";
import { isReady, type Agent, type Installation, isDeployed } from "../../sim/state";
import { airlineDays, COURIER_FEE, courierBlocker, sendByCourier } from "../../sim/transfers";
import { itemOnSale, onOrder } from "../../sim/market";
import { useEffect, useState } from "react";
import { money } from "../format";
import { agentName } from "../status";
import { useGame, useStore } from "../store";
import { ActionButton } from "./ActionButton";
import { Icon } from "./Icon";
import { Inventory, InventoryWindow, StatSheet, type Ref } from "./Inventory";
import { traitsOf, traitValue } from "../status";

const KIT_SHORT: Record<KitId, string> = { civilian: "any kit", plainclothes: "plainclothes or tactical", tactical: "tactical only" };

/** An agent's loadout in their panel: what they carry, and the button to the equip window. */
export function LoadoutEditor({ a, base }: { a: Agent; base: Installation }) {
  const [open, setOpen] = useState(false);
  const away = isDeployed(useGame(), a);
  const g = gearOf(a);
  return (
    <div className="loadout">
      <h4 className="section-title">Loadout</h4>
      <div className="kv"><span>Hand</span><span>{g.weapon ? ITEMS[g.weapon].name : "Combat knife"}</span></div>
      <div className="kv"><span>Worn</span><span>{[g.armour, g.helmet].filter((x): x is ItemId => !!x).map((x) => ITEMS[x].name).join(", ") || "—"}</span></div>
      <div className="kv"><span>Carried</span><span className="gear-icons">{g.stowed.length ? g.stowed.map((x, i) => <span key={i} data-tip={ITEMS[x.item].name}><Icon name={x.item} size={14} /></span>) : "—"}</span></div>
      <ActionButton icon="inventory" label="Equip" blocker={away ? `${a.name} is away.` : null} tip={["The inventory: hand, armour, helmet, two pockets, the backpack; the base's armoury"]} onClick={() => setOpen(true)} />
      {open && <EquipWindow first={a} base={base} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The equip window: one agent's inventory over the base's armoury; the agents at home can be stepped through. */
function EquipWindow({ first, base, onClose }: { first: Agent; base: Installation; onClose: () => void }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const home = g.agents.filter((x) => x.baseId === base.id && !isDeployed(g, x));
  const [id, setId] = useState(first.id);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const a = home.find((x) => x.id === id) ?? home[0];
  if (!a) return null;
  const gear = gearOf(a);
  const stock = ITEM_IDS.filter((x) => x !== "knife" && stockAt(base, x) > 0).map((x) => ({ item: x, count: stockAt(base, x), note: KIT_SHORT[ITEMS[x].kit] }));
  const blocker = (from: Ref, to: Ref): string | null => {
    if ("floor" in from || "floor" in to) return "Not here";
    if ("armoury" in from && "armoury" in to) return "";
    if ("armoury" in to) return null;
    if ("armoury" in from) {
      if ("slot" in to) return slotTakes(to.slot, from.armoury) ? null : "That doesn't go there";
      return canPut(gear, from.armoury, to) ? null : "It doesn't fit there";
    }
    return moveWithin(cloneGear(gear), from, to);
  };
  const onMove = (from: Ref, to: Ref) => {
    if ("floor" in from || "floor" in to) return;
    if ("armoury" in from) command((s) => fromArmoury(s, a.id, from.armoury, "armoury" in to ? undefined : to));
    else if ("armoury" in to) command((s) => toArmoury(s, a.id, from));
    else command((s) => moveGear(s, a.id, from, to));
  };
  const i = home.indexOf(a);
  return (
    <InventoryWindow name={agentName(a)} canStep={home.length > 1} onStep={(d) => setId(home[(i + d + home.length) % home.length]!.id)} onClose={onClose}>
        <Inventory gear={gear} blocker={blocker} onMove={onMove} armoury={stock}
          sheet={<StatSheet rows={[
            ["Health", `${Math.round(a.hp)}/${a.vitality}`],
            ...traitsOf("operator").filter((x) => x.id !== "vitality").map((x): [string, string] => [x.name, `${traitValue(a, x.id)}`]),
            ["Missions", `${a.missions}`],
          ]} />}
          header={<>
            {(["plainclothes", "tactical"] as KitId[]).map((k) => (
              <button key={k} className="mini" data-tip="The best the armoury has for that kit, with two magazines, an incendiary and a trauma kit if there's room" onClick={() => command((s) => issueBest(s, a.id, k))}>
                Best for {KIT[k].name.split(",")[0]!.toLowerCase()}
              </button>
            ))}
            <span>The team's kit decides what goes along: plainclothes leaves long guns, plate and helmets behind; civilian clothes, everything but a knife.</span>
          </>} />
    </InventoryWindow>
  );
}

/** What an agent takes with a kit, as icons; what stays behind is struck through. */
export function GearIcons({ a, kit }: { a: Agent; kit: KitId }) {
  const c = carried(a, kit);
  return (
    <span className="gear-icons">
      {[c.weapon, c.armour, c.helmet, ...c.stowed.map((x) => x.item)].filter((x): x is ItemId => !!x).map((x, i) => <span key={i} title={ITEMS[x].name}><Icon name={x} size={14} /></span>)}
      {c.leftBehind.map((x, i) => <span key={`l${i}`} className="left-behind" title={`${ITEMS[x].name}: stays behind with ${KIT[kit].name.toLowerCase()}`}><Icon name={x} size={14} /></span>)}
    </span>
  );
}

/** A base's armoury: stock, what agents here carry, what's on the way. Bought on the dark web. */
export function Armoury({ base }: { base: Installation }) {
  const g = useGame();
  const openMarket = useStore((s) => s.openMarket);
  const setCartItem = useStore((s) => s.setCartItem);
  const cart = useStore((s) => s.cart);
  const here = g.agents.filter((a) => a.baseId === base.id);
  const carriedHere = (x: ItemId) => here.reduce((t, a) => t + allItems(gearOf(a)).filter((y) => y === x).length, 0);
  const toCart = (x: ItemId) => {
    setCartItem(x, (cart.items[x] ?? 0) + 1);
    openMarket(base.id);
  };
  return (
    <>
      <p className="small dim">
        Bought on the dark web and shipped here (40 hours), carried by the agents. What an agent carries goes where they go and is lost with
        them; released from service, it comes back here.
      </p>
      <div className="table armoury-table">
        <span className="th">Item</span><span className="th">Goes with</span><span className="th">Stock</span><span className="th">Carried</span><span className="th">Price</span><span className="th" />
        {ITEM_IDS.filter((x) => x !== "knife" && (itemKnown(g, x) || itemOnSale(g, x) || stockAt(base, x) > 0)).map((x) => {
          const d = ITEMS[x];
          const coming = onOrder(g, base.id, x);
          return (
            <div key={x} className="tr" title={d.description}>
              <span className="td-name"><Icon name={x} size={16} /> {d.name}</span>
              <span className="td-dim">{KIT_SHORT[d.kit]}{d.consumable ? ", used up" : ""}</span>
              <span>{stockAt(base, x)}{coming ? <span className="td-dim"> +{coming} coming</span> : null}</span>
              <span className="td-dim">{carriedHere(x)}</span>
              <span>{money(d.cost)}</span>
              <span className="armoury-buy">
                <button className="mini" disabled={!itemOnSale(g, x)} title={itemOnSale(g, x) ? `Add one to the dark-web cart, shipping to ${base.name}` : "Nobody sells it."}
                  onClick={() => toCart(x)}>Order</button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="build-actions">
        <ActionButton icon="market" label="The dark web" tip={[`Buy equipment, shipped to ${base.name} in 40 hours`]} onClick={() => openMarket(base.id)} />
      </div>
      <Courier base={base} />
    </>
  );
}

/** Items that may go by courier (trauma kits; no weapons) to another base. */
function Courier({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const others = g.installations.filter((i) => i.kind === "base" && i.id !== base.id && isReady(g, i));
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [n, setN] = useState<Partial<Record<ItemId, number>>>({});
  const sendable = ITEM_IDS.filter((x) => ITEMS[x].courier && stockAt(base, x) > 0);
  if (!others.length || !sendable.length) return null;
  const items = Object.fromEntries(sendable.map((x) => [x, Math.min(n[x] ?? 0, stockAt(base, x))])) as Partial<Record<ItemId, number>>;
  const count = Object.values(items).reduce((t: number, k) => t + (k ?? 0), 0);
  return (
    <div className="transfer">
      <h4 className="section-title">Send by courier</h4>
      <p className="small dim">Only what may cross a border in a parcel: no weapons, no armour (those go aboard our own aircraft).</p>
      <div className="kv"><span>To</span>
        <select value={to} onChange={(e) => setTo(e.target.value)}>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      </div>
      {sendable.map((x) => (
        <div key={x} className="kv"><span>{ITEMS[x].name} ({stockAt(base, x)})</span>
          <span className="stepper">
            <button className="mini" disabled={!items[x]} onClick={() => setN({ ...n, [x]: (items[x] ?? 0) - 1 })}>−</button>
            <span>{items[x] ?? 0}</span>
            <button className="mini" disabled={(items[x] ?? 0) >= stockAt(base, x)} onClick={() => setN({ ...n, [x]: (items[x] ?? 0) + 1 })}>+</button>
          </span>
        </div>
      ))}
      <ActionButton icon="buy" label={`Send ${count || ""} by courier`} blocker={courierBlocker(g, base.id, to, items)}
        tip={[`${money(COURIER_FEE)} an item · ${airlineDays(g, base.id, to)} day${airlineDays(g, base.id, to) === 1 ? "" : "s"}`]}
        onClick={() => { command((s) => sendByCourier(s, base.id, to, items), "Sent."); setN({}); }} />
    </div>
  );
}

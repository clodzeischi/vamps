// Per-agent equipment in the UI: the base's armoury (X-COM style: pick an
// operative and one of their two loadouts, Low viz or Full tactical, and drag
// and drop between it and the stock), gear icons, the courier.
import { ITEM_IDS, ITEMS, type ItemId } from "../../data/equipment";
import { KIT, type KitId } from "../../data/kit";
import { carried, fromArmoury, gearOf, LAYOUT_NAMES, layoutBlocker, moveGear, stockAt, toArmoury, type Layout } from "../../sim/people/equipment";
import { canPut, cloneGear, moveWithin, slotTakes } from "../../sim/people/inventory";
import { isReady, type Agent, type Installation, isDeployed } from "../../sim/core/state";
import { airlineDays, COURIER_FEE, courierBlocker, sendByCourier } from "../../sim/base/transfers";
import { countRooms } from "../../sim/base/building";
import { useState } from "react";
import { money } from "../format";
import { agentName } from "../status";
import { useGame, useStore } from "../store";
import { ActionButton } from "./ActionButton";
import { Icon } from "./Icon";
import { Inventory, StatSheet, type Ref } from "./Inventory";
import { traitsOf, traitValue } from "../status";

const KIT_SHORT: Record<KitId, string> = { civilian: "any kit", plainclothes: "plainclothes or tactical", tactical: "tactical only" };

/** Moving things between one of an agent's loadouts and their base's armoury: what's allowed, and doing it. */
function useArmouryMoves(a: Agent, which: Layout) {
  const command = useStore((s) => s.command);
  const gear = gearOf(a, which);
  const blocker = (from: Ref, to: Ref): string | null => {
    if ("floor" in from || "floor" in to) return "Not here";
    if ("armoury" in from && "armoury" in to) return "";
    if ("armoury" in to) return null;
    if ("armoury" in from) {
      const why = layoutBlocker(which, from.armoury);
      if (why) return why;
      if ("slot" in to) return slotTakes(to.slot, from.armoury) ? null : "That doesn't go there";
      return canPut(gear, from.armoury, to) ? null : "It doesn't fit there";
    }
    return moveWithin(cloneGear(gear), from, to);
  };
  const onMove = (from: Ref, to: Ref) => {
    if ("floor" in from || "floor" in to) return;
    if ("armoury" in from) command((s) => fromArmoury(s, a.id, from.armoury, "armoury" in to ? undefined : to, which));
    else if ("armoury" in to) command((s) => toArmoury(s, a.id, from, which));
    else command((s) => moveGear(s, a.id, from, to, which));
  };
  return { gear, blocker, onMove };
}

/** The equip panel: one of an operative's two loadouts over the base's armoury. */
function Equip({ a, base }: { a: Agent; base: Installation }) {
  const g = useGame();
  const [which, setWhich] = useState<Layout>("tactical");
  const { gear, blocker, onMove } = useArmouryMoves(a, which);
  const away = isDeployed(g, a);
  const stock = ITEM_IDS.filter((x) => x !== "knife" && stockAt(base, x) > 0)
    .map((x) => ({ item: x, count: stockAt(base, x), note: KIT_SHORT[ITEMS[x].kit], off: !!layoutBlocker(which, x) }));
  return (
    <Inventory gear={gear} blocker={away ? () => `${a.name} is away.` : blocker} onMove={onMove} armoury={away ? undefined : stock}
      sheet={<StatSheet rows={[
        ["Health", `${Math.round(a.hp)}/${a.vitality}`],
        ...traitsOf("operator").filter((x) => x.id !== "vitality").map((x): [string, string] => [x.name, `${traitValue(a, x.id)}`]),
        ["Missions", `${a.missions}`],
        ["Kills", `${a.kills}`],
      ]} />}
      header={<>
        <span className="loadout-head">
          <b>{agentName(a)}</b>
          {(["lowViz", "tactical"] as Layout[]).map((k) => (
            <button key={k} className={`choice${which === k ? " on" : ""}`} onClick={() => setWhich(k)}
              data-tip={k === "lowViz" ? "Goes with plainclothes kit (civilian: a knife). Plainclothes things only." : "Goes with tactical kit."}>
              {LAYOUT_NAMES[k]}
            </button>
          ))}
        </span>
        {away && <span>{a.name} is away: their kit changes when they're home.</span>}
      </>} />
  );
}

/** The operatives at a base, to pick one to equip. */
function Roster({ base, chosen }: { base: Installation; chosen?: Agent }) {
  const g = useGame();
  const openBase = useStore((s) => s.openBase);
  const here = g.agents.filter((x) => x.baseId === base.id);
  return (
    <nav className="armoury-roster">
      <h4 className="section-title">Operatives <span className="tab-count">{here.length}</span></h4>
      {here.length === 0 && <p className="small dim">Nobody stationed here.</p>}
      <ul className="list">
        {here.map((a) => {
          const away = isDeployed(g, a);
          return (
            <li key={a.id}>
              <button className={`rlist-row${chosen?.id === a.id ? " on" : ""}`} onClick={() => openBase(base.id, "armoury", a.id)}>
                <span className="rlist-body">
                  <span className="rlist-line"><span className="rlist-name">{agentName(a)}</span>{away && <span className="rlist-eta">away</span>}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** What an agent takes with a kit, as icons; what stays behind is struck through. */
export function GearIcons({ a, kit }: { a: Agent; kit: KitId }) {
  const c = carried(a, kit);
  return (
    <span className="gear-icons">
      {[c.weapon, c.armour, c.helmet, ...c.stowed.map((x) => x.item)].filter((x): x is ItemId => !!x).map((x, i) => <span key={i} title={ITEMS[x].name}><Icon name={x} size={14} /></span>)}
      {c.leftBehind.map((x, i) => <span key={`l${i}`} className="left-behind" title={`${ITEMS[x].name}: stays behind with ${KIT[kit].name.toLowerCase()}`}><Icon name={x} size={14} /></span>)}
      {kit !== "civilian" && c.weapon === "knife" && <span className="warn-text" data-tip={`Nothing in the hand of their ${kit === "tactical" ? "Full tactical" : "Low viz"} loadout: kit them out in the Armoury`}>knife only</span>}
    </span>
  );
}

/** A base's armoury: equip the operatives here (X-COM style, drag and drop, two loadouts each).
 *  Equipment is ordered on the dark web. */
export function Armoury({ base, item }: { base: Installation; item?: string }) {
  const g = useGame();
  const openMarket = useStore((s) => s.openMarket);
  const here = g.agents.filter((x) => x.baseId === base.id);
  const chosen = here.find((x) => x.id === item) ?? here.find((x) => !isDeployed(g, x)) ?? here[0];
  return (
    <>
      <div className="armoury-equip">
        <Roster base={base} chosen={chosen} />
        {chosen ? <Equip key={chosen.id} a={chosen} base={base} /> : <p className="prose dim">No operatives stationed here.</p>}
      </div>
      <div className="build-actions">
        <ActionButton icon="market" label="Order equipment on dark web" blocker={storageBlocker(base)}
          tip={[`Shipped to ${base.name} in 40 hours`]} onClick={() => openMarket(base.id)} />
      </div>
    </>
  );
}

/** Why nothing can be shipped to a base, or null. */
const storageBlocker = (base: Installation) => (countRooms(base, "storage") ? null : `${base.name} has no storage. Build one in Construction.`);

/** Items that may go by courier (trauma kits; no weapons) to another base. */
export function Courier({ base }: { base: Installation }) {
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

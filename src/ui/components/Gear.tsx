// Per-agent equipment in the UI: a loadout editor, gear icons, the armoury.
import { ITEM_IDS, ITEMS, UTILITY_SLOTS, type ItemId, type Slot } from "../../data/equipment";
import { KIT, type KitId } from "../../data/kit";
import { buyBlocker, buyItem, carried, equip, gearOf, issueBest, itemKnown, stockAt } from "../../sim/equipment";
import type { Agent, Installation } from "../../sim/state";
import { money } from "../format";
import { useGame, useStore } from "../store";
import { ActionButton } from "./ActionButton";
import { Icon } from "./Icon";

const SLOT_NAMES: Record<Slot, string> = { weapon: "Weapon", armour: "Armour", utility: "Utility" };
const KIT_SHORT: Record<KitId, string> = { civilian: "any kit", plainclothes: "plainclothes or tactical", tactical: "tactical only" };

/** One slot: what's in it, and a list of what the base's armoury could put there instead. */
function SlotRow({ a, base, slot, index = 0 }: { a: Agent; base: Installation; slot: Slot; index?: number }) {
  const command = useStore((s) => s.command);
  const g = gearOf(a);
  const current = slot === "utility" ? g.utility[index] : g[slot];
  const options = ITEM_IDS.filter((x) => ITEMS[x].slot === slot && x !== current && (x === "knife" || stockAt(base, x) > 0));
  const away = a.deployed || !!a.arriveAt;
  const label = current ? ITEMS[current].name : slot === "weapon" ? "Combat knife" : "—";
  return (
    <div className="kv gear-slot">
      <span>{SLOT_NAMES[slot]}</span>
      <span className="gear-pick">
        {(current ?? (slot === "weapon" ? "knife" : null)) && <Icon name={current ?? "knife"} size={16} />}
        <select value={current ?? ""} disabled={away}
          title={current ? `${ITEMS[current].description} Goes with ${KIT_SHORT[ITEMS[current].kit]}.` : undefined}
          onChange={(e) => command((s) => equip(s, a.id, slot, (e.target.value || null) as ItemId | null, index))}>
          <option value={current ?? ""}>{label}</option>
          {current && slot !== "weapon" && <option value="">— (back to the armoury)</option>}
          {options.map((x) => <option key={x} value={x}>{ITEMS[x].name}{x === "knife" ? "" : ` (${stockAt(base, x)} in stock)`}</option>)}
        </select>
      </span>
    </div>
  );
}

/** An agent's loadout, editable while at home. */
export function LoadoutEditor({ a, base }: { a: Agent; base: Installation }) {
  const command = useStore((s) => s.command);
  const away = a.deployed || !!a.arriveAt;
  const used = gearOf(a).utility.length;
  return (
    <div className="loadout">
      <h4 className="section-title">Loadout</h4>
      <SlotRow a={a} base={base} slot="weapon" />
      <SlotRow a={a} base={base} slot="armour" />
      {Array.from({ length: Math.min(UTILITY_SLOTS, used + 1) }, (_, i) => <SlotRow key={i} a={a} base={base} slot="utility" index={i} />)}
      {!away && (
        <div className="build-actions two">
          {(["plainclothes", "tactical"] as KitId[]).map((k) => (
            <ActionButton key={k} icon="armoury" label={`Best for ${KIT[k].name.split(",")[0]!.toLowerCase()}`} tip={["The best the armoury has, for that kit"]}
              onClick={() => command((s) => issueBest(s, a.id, k))} />
          ))}
        </div>
      )}
      <p className="small dim">The team's kit decides what goes along: plainclothes leaves long guns and plate carriers behind; civilian clothes, everything but a knife.</p>
    </div>
  );
}

/** What an agent takes with a kit, as icons; what stays behind is struck through. */
export function GearIcons({ a, kit }: { a: Agent; kit: KitId }) {
  const c = carried(a, kit);
  return (
    <span className="gear-icons">
      {[c.weapon, c.armour, ...c.utility].filter((x): x is ItemId => !!x).map((x, i) => <span key={i} title={ITEMS[x].name}><Icon name={x} size={14} /></span>)}
      {c.leftBehind.map((x, i) => <span key={`l${i}`} className="left-behind" title={`${ITEMS[x].name}: stays behind with ${KIT[kit].name.toLowerCase()}`}><Icon name={x} size={14} /></span>)}
    </span>
  );
}

/** A base's armoury: stock, what agents here carry, buying. */
export function Armoury({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const here = g.agents.filter((a) => a.baseId === base.id);
  const carriedHere = (x: ItemId) => here.reduce((t, a) => { const gg = gearOf(a); return t + [gg.weapon, gg.armour, ...gg.utility].filter((y) => y === x).length; }, 0);
  return (
    <>
      <p className="small dim">Bought here, carried by the agents. What an agent carries goes where they go and is lost with them; released from service, it comes back here.</p>
      <div className="table armoury-table">
        <span className="th">Item</span><span className="th">Goes with</span><span className="th">Stock</span><span className="th">Carried</span><span className="th">Price</span><span className="th" />
        {ITEM_IDS.filter((x) => x !== "knife" && itemKnown(g, x)).map((x) => {
          const d = ITEMS[x];
          return (
            <div key={x} className="tr" title={d.description}>
              <span className="td-name"><Icon name={x} size={16} /> {d.name}</span>
              <span className="td-dim">{KIT_SHORT[d.kit]}{d.consumable ? ", used up" : ""}</span>
              <span>{stockAt(base, x)}</span>
              <span className="td-dim">{carriedHere(x)}</span>
              <span>{money(d.cost)}</span>
              <span className="armoury-buy">
                {[1, 4].map((n) => (
                  <button key={n} className="mini" disabled={!!buyBlocker(g, base.id, x, n)} title={buyBlocker(g, base.id, x, n) ?? `${money(d.cost * n)}`}
                    onClick={() => command((s) => buyItem(s, base.id, x, n), `Bought ${n} × ${d.name.toLowerCase()}.`)}>Buy {n}</button>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

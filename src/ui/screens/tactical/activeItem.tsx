// The item an agent holds ready (the weapon, or a grenade or trauma kit from the backpack strip).
import { WEAPONS } from "../../../tactical/rules";
import { type Unit } from "../../../tactical/battle";
import { ITEMS } from "../../../data/equipment";
import { countOf } from "../../../sim/people/inventory";
import type { ItemId } from "../../../data/equipment";
import { ItemPicture } from "../../components/ItemPicture";

/** The agent's active item, if they still carry one of it (else the weapon: undefined). */
export function activeOf(u: Unit, item: ItemId | undefined): ItemId | undefined {
  return item && countOf(u.gear, item) > 0 ? item : undefined;
}

/** What can be used from the pockets and the backpack, by kind. */
/** One kind of usable thing an agent carries: how many, and how many of those in pockets. */
export interface Usable {
  item: ItemId;
  n: number;
  pockets: number;
}

export function usableKinds(u: Unit): Usable[] {
  const out: Usable[] = [];
  for (const x of u.gear.stowed) {
    if (!ITEMS[x.item].use) continue;
    let k = out.find((o) => o.item === x.item);
    if (!k) out.push((k = { item: x.item, n: 0, pockets: 0 }));
    k.n++;
    if (x.in !== "pack") k.pockets++;
  }
  return out;
}

/** The active item, large (Paradise Cracked style): the weapon in hand and its rounds, or the item held ready and how many are left. */
export function ActiveWell({ me, item }: { me: Unit; item: ItemId | undefined }) {
  const w = WEAPONS[me.weapon];
  const shown = item ?? me.gear.weapon;
  return (
    <div className={`battle-well${item ? " item" : ""}`}>
      <ItemPicture
        item={shown ?? "knife"}
        w={88}
        h={40}
        lying={ITEMS[shown ?? "knife"].slot === "weapon"}
      />
      <div className="battle-well-text">
        <span className="battle-well-name">{shown ? ITEMS[shown].name : "Combat knife"}</span>
        <span className="battle-well-sub">
          {item
            ? `×${countOf(me.gear, item)} ready`
            : w.clip
              ? `${me.ammo}/${w.clip} rounds`
              : w.melee
                ? "A blow"
                : ""}
        </span>
      </div>
    </div>
  );
}

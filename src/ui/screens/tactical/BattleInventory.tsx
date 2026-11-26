// The inventory window in battle: moving things costs TU, and the ground is the tile underfoot.
import { useEffect } from "react";
import { detectRadius, INV_TU, type Battle, type Unit } from "../../../tactical/battle";
import {
  commandInventory,
  floorNear,
  inventoryBlocker,
  inventoryCost,
  type InvRef,
} from "../../../tactical/inventory";
import { Inventory, InventoryWindow, StatSheet, type Ref } from "../../components/Inventory";
import { bindingsOf } from "../../keys";
import { useStore } from "../../store";

/**
 * The inventory window on the battlescape: the agent's sheet (stats) beside
 * the inventory, the ground near by below. Every move costs time. ◀ ▶ steps
 * through the squad, to hand things over by the floor.
 */
export function BattleInventory({
  b,
  me,
  squad,
  onSelect,
  onChange,
  onClose,
}: {
  b: Battle;
  me: Unit;
  squad: Unit[];
  onSelect: (u: Unit) => void;
  onChange: () => void;
  onClose: () => void;
}) {
  const key = bindingsOf(useStore((s) => s.settings.keys)).inventory;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.code === key) onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, key]);
  const toInv = (r: Ref): InvRef | null => ("armoury" in r ? null : r);
  const i = Math.max(0, squad.indexOf(me));
  const blocker = (from: Ref, to: Ref) => {
    const f = toInv(from),
      t = toInv(to);
    return f && t ? inventoryBlocker(b, me, f, t) : "Not here";
  };
  const cost = (from: Ref, to: Ref) => {
    const f = toInv(from),
      t = toInv(to);
    return f && t ? inventoryCost(f, t) : 0;
  };
  const onMove = (from: Ref, to: Ref) => {
    const f = toInv(from),
      t = toInv(to);
    if (!f || !t) return;
    const why = commandInventory(b, me, f, t);
    if (why) useStore.getState().notify(why, "bad");
    onChange();
  };
  return (
    <InventoryWindow
      name={me.name}
      canStep={squad.length > 1}
      onStep={(d) => onSelect(squad[(i + d + squad.length) % squad.length]!)}
      onClose={onClose}
    >
      <Inventory
        gear={me.gear}
        handAmmo={me.ammo}
        locked={["armour", "helmet"]}
        blocker={blocker}
        cost={cost}
        onMove={onMove}
        sheet={
          <StatSheet
            rows={[
              ["Health", `${me.hp}/${me.maxHp}`],
              ["Time units", `${me.tu}/${me.maxTu}`],
              ["Aim", `${me.aim}`],
              ["Armour", `${me.armour}`],
              ["Faith", `${me.faith}`],
              ["Tradecraft", `${me.tradecraft}`],
              ["Insight", `${me.insight}`],
              ["Spotted at", `${detectRadius(me)} tiles`],
            ]}
          />
        }
        ground={floorNear(b, me).map((f) => ({ id: f.id, item: f.item, ammo: f.ammo }))}
        menu={[
          ["In or out of hand", `${INV_TU.hand} TU`],
          ["In or out of pocket", `${INV_TU.pocket} TU`],
          ["In or out of pack", `${INV_TU.pack} TU`],
          ["To or from ground", `${INV_TU.floor} TU`],
          ["Rearrange", `${INV_TU.shuffle} TU`],
        ]}
      />
    </InventoryWindow>
  );
}

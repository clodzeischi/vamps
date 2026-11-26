// The inventory screen (docs/design/inventory.md), shared by the base's
// equip window and the battlescape. Paradise Cracked style: a paperdoll
// (helmet, armour, the hand, two pockets, the backpack) over a source below,
// drawn as a grid of items at their size: the ground near the agent, or the
// base's armoury (where each kind is one stack, with its count).
// Drag an item to where it goes; dropped anywhere else (or Esc, or a right
// click) it goes back. The caller decides what a move means (stock, time units).
import { useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ITEMS, type ItemId } from "../../data/equipment";
import {
  CONTAINERS,
  sizeOf,
  type Container,
  type Gear,
  type Place,
  type WornSlot,
} from "../../sim/people/inventory";
import { CELL, ItemBox, layoutGround, type GroundItem } from "./ItemBox";
import { useItemDrag, type Held } from "./useItemDrag";

export { InventoryWindow, StatSheet } from "./InventoryWindow";

/** Where a lifted item comes from, or goes: the agent's inventory, the ground, the armoury. */
export type Ref = Place | { floor: string } | { armoury: ItemId };

interface InventoryProps {
  gear: Gear;
  /** The rounds in the weapon in hand (battle), else a full clip. */
  handAmmo?: number;
  /** Slots that can't change (armour mid-fight). */
  locked?: WornSlot[];
  /** Why a move can't happen (null: it can). */
  blocker: (from: Ref, to: Ref) => string | null;
  /** What a move costs, if anything (time units). */
  cost?: (from: Ref, to: Ref) => number;
  onMove: (from: Ref, to: Ref) => void;
  /** Below the paperdoll: the ground (a grid) or the armoury (a list). */
  ground?: GroundItem[];
  /** `off`: can't go in this inventory (shown dim). */
  armoury?: { item: ItemId; count: number; note?: string; off?: boolean }[];
  /** Beside the ground: what moving things costs. */
  menu?: [action: string, cost: string][];
  /** Over the paperdoll: buttons. */
  header?: ReactNode;
  /** The character sheet, left of the paperdoll (Paradise Cracked style). */
  sheet?: ReactNode;
}

const SLOT_BOX: Record<WornSlot, { w: number; h: number; name: string }> = {
  helmet: { w: 2, h: 2, name: "Helmet" },
  armour: { w: 2, h: 3, name: "Armour" },
  weapon: { w: 2, h: 5, name: "Hand" },
};

/** Columns of the ground grid and of the armoury's. */
const GROUND_COLS = 12;
const STOCK_COLS = 20;

/** What the boxes need to draw the drag: what's held, where it's over, and why it can't go there. */
interface DragState {
  held: Held | null;
  target: Ref | null;
  why: string | null;
  lift: (e: ReactPointerEvent, from: Ref, item: ItemId) => void;
}

/** " good" or " bad" while the held item is over this box. */
const dropClass = (over: boolean, why: string | null) => (over ? (why ? " bad" : " good") : "");

export function Inventory({
  gear,
  handAmmo,
  locked = [],
  blocker,
  cost,
  onMove,
  ground,
  armoury,
  header,
  sheet,
  menu,
}: InventoryProps) {
  const root = useRef<HTMLDivElement>(null);
  const { held, target, mouse, lift } = useItemDrag(root, (from, to) => !blocker(from, to), onMove);
  const why = held && target ? blocker(held.from, target) : null;
  const tu = held && target && !why && cost ? cost(held.from, target) : 0;
  const drag: DragState = { held, target, why, lift };

  return (
    <div className="inventory" ref={root}>
      {header && <div className="inv-header">{header}</div>}
      <div className="inv-doll">
        {sheet}
        <div className="inv-col">
          <WornSlotBox slot="helmet" gear={gear} locked={locked} drag={drag} />
          <WornSlotBox slot="armour" gear={gear} locked={locked} drag={drag} />
        </div>
        <div className="inv-col">
          <WornSlotBox slot="weapon" gear={gear} locked={locked} drag={drag} handAmmo={handAmmo} />
        </div>
        <div className="inv-col">
          <div className="inv-row">
            <ContainerGrid c="pocket0" gear={gear} drag={drag} />
            <ContainerGrid c="pocket1" gear={gear} drag={drag} />
          </div>
          <ContainerGrid c="pack" gear={gear} drag={drag} />
        </div>
      </div>
      {ground && <GroundBox ground={ground} menu={menu} drag={drag} />}
      {armoury && <ArmouryBox armoury={armoury} drag={drag} />}
      <div className="inv-status small">
        {held ? (
          <>
            <b>{ITEMS[held.item].name}</b>
            {why && (
              <>
                : <span className="warn-text">{why}</span>
              </>
            )}
            {!why && tu ? `: ${tu} TU` : ""}
          </>
        ) : (
          "Drag an item to move it."
        )}
      </div>
      {held && (
        <div className="inv-cursor" style={{ left: mouse.x - held.gx, top: mouse.y - held.gy }}>
          <ItemBox item={held.item} />
          {(why || tu > 0) && (
            <span className={`inv-cursor-note${why ? " bad" : ""}`}>{why ?? `${tu} TU`}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** A worn slot (helmet, armour, the hand): one item, or the knife when the hand is empty. */
function WornSlotBox({
  slot,
  gear,
  locked,
  drag,
  handAmmo,
}: {
  slot: WornSlot;
  gear: Gear;
  locked: WornSlot[];
  drag: DragState;
  handAmmo?: number;
}) {
  const { held, target, why, lift } = drag;
  const box = SLOT_BOX[slot];
  const item = gear[slot];
  const isLocked = locked.includes(slot);
  const over = !!target && "slot" in target && target.slot === slot;
  const isHeld = !!held && "slot" in held.from && held.from.slot === slot;
  return (
    <div className="inv-box">
      <div className="inv-box-title">
        {box.name}
        {isLocked ? " (stays on)" : ""}
      </div>
      <div
        className={`inv-grid inv-slot${dropClass(over, why)}${isLocked ? " locked" : ""}`}
        style={{ width: box.w * CELL, height: box.h * CELL }}
        data-drop={slot}
        onPointerDown={(e) => item && !isLocked && lift(e, { slot }, item)}
      >
        {item && (
          <ItemBox item={item} ammo={slot === "weapon" ? handAmmo : undefined} held={isHeld} />
        )}
        {!item && slot === "weapon" && <span className="inv-empty">Knife</span>}
      </div>
    </div>
  );
}

/** A pocket or the backpack: items at their place in its grid, and a ghost where the held one would land. */
function ContainerGrid({ c, gear, drag }: { c: Container; gear: Gear; drag: DragState }) {
  const { held, target, why, lift } = drag;
  const box = CONTAINERS[c];
  const anchored = gear.stowed.filter((s) => s.in === c);
  const ghost = target && "in" in target && target.in === c ? target : null;
  const [gw, gh] = held ? sizeOf(held.item) : [0, 0];
  const heldHere = (x: number, y: number) =>
    !!held && "in" in held.from && held.from.in === c && held.from.x === x && held.from.y === y;
  return (
    <div className="inv-box">
      <div className="inv-box-title">{box.name}</div>
      <div
        className="inv-grid inv-bag"
        data-drop={c}
        style={{ width: box.w * CELL, height: box.h * CELL }}
      >
        {anchored.map((s) => (
          <div
            key={`${s.x},${s.y}`}
            className="inv-place"
            style={{ left: s.x * CELL + 1, top: s.y * CELL + 1 }}
            onPointerDown={(e) => lift(e, { in: c, x: s.x, y: s.y }, s.item)}
          >
            <ItemBox item={s.item} ammo={s.ammo} held={heldHere(s.x, s.y)} />
          </div>
        ))}
        {ghost && (
          <div
            className={`inv-ghost${why ? " bad" : ""}`}
            style={{
              left: ghost.x * CELL,
              top: ghost.y * CELL,
              width: gw * CELL,
              height: gh * CELL,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Rows a packed grid needs (at least 3). */
const rowsOf = (laid: { g: GroundItem; y: number }[]) =>
  Math.max(3, ...laid.map((l) => l.y + sizeOf(l.g.item)[1]));

const overSource = (target: Ref | null) => !!target && ("floor" in target || "armoury" in target);

/** Below the paperdoll in battle: what lies on the ground near by, and what moving things costs. */
function GroundBox({
  ground,
  menu,
  drag,
}: {
  ground: GroundItem[];
  menu?: [string, string][];
  drag: DragState;
}) {
  const { held, target, why, lift } = drag;
  const laid = useMemo(() => layoutGround(ground, GROUND_COLS), [ground]);
  return (
    <div className="inv-bottom">
      <div className="inv-box inv-ground-box">
        <div className="inv-box-title">
          On the ground near by{ground.length ? ` (${ground.length})` : ": nothing"}
        </div>
        <div className="inv-ground-scroll">
          <div
            className={`inv-grid inv-ground${dropClass(overSource(target), why)}`}
            style={{ width: GROUND_COLS * CELL, height: rowsOf(laid) * CELL }}
            data-drop="floor"
          >
            {laid.map(({ g, x, y }) => (
              <div
                key={g.id}
                className="inv-place"
                style={{ left: x * CELL + 1, top: y * CELL + 1 }}
                onPointerDown={(e) => lift(e, { floor: g.id }, g.item)}
              >
                <ItemBox
                  item={g.item}
                  ammo={g.ammo}
                  held={!!held && "floor" in held.from && held.from.floor === g.id}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      {menu && (
        <div className="inv-box inv-menu">
          <div className="inv-box-title">Time to move things</div>
          <dl>
            {menu.map(([action, price]) => (
              <div key={action}>
                <dt>{action}</dt>
                <i />
                <dd>{price}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

type Stock = NonNullable<InventoryProps["armoury"]>;

/** Below the paperdoll at a base: the armoury, one stack a kind with its count. */
function ArmouryBox({ armoury, drag }: { armoury: Stock; drag: DragState }) {
  const { held, target, why, lift } = drag;
  const laid = useMemo(
    () =>
      layoutGround(
        armoury.map((r) => ({ id: r.item, item: r.item })),
        STOCK_COLS,
      ),
    [armoury],
  );
  const byItem = new Map(armoury.map((r) => [r.item, r]));
  let title = "";
  if (held && !("armoury" in held.from)) title = ": drop it here to put it back";
  else if (!armoury.length) title = ": empty";
  return (
    <div className="inv-box inv-armoury-box">
      <div className="inv-box-title">The armoury{title}</div>
      <div className="inv-ground-scroll">
        <div
          className={`inv-grid inv-ground${dropClass(overSource(target), why)}`}
          style={{ width: STOCK_COLS * CELL, height: rowsOf(laid) * CELL }}
          data-drop="armoury"
        >
          {laid.map(({ g, x, y }) => {
            const r = byItem.get(g.item)!;
            // The last of a kind lifted leaves its place empty.
            const lifted =
              !!held && "armoury" in held.from && held.from.armoury === g.item && r.count <= 1;
            return (
              <div
                key={g.id}
                className="inv-place"
                style={{ left: x * CELL + 1, top: y * CELL + 1 }}
                onPointerDown={(e) => !r.off && lift(e, { armoury: g.item }, g.item)}
              >
                <ItemBox item={g.item} count={r.count} note={r.note} off={r.off} held={lifted} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

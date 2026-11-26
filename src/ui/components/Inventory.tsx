// The inventory screen (docs/design/inventory.md), shared by the base's
// equip window and the battlescape. Paradise Cracked style: a paperdoll
// (helmet, armour, the hand, two pockets, the backpack) over a source below,
// drawn as a grid of items at their size: the ground near the agent, or the
// base's armoury (where each kind is one stack, with its count).
// Drag an item to where it goes; dropped anywhere else (or Esc, or a right
// click) it goes back. The caller decides what a move means (stock, time units).
import { CloseX } from "./CloseX";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ITEMS, type ItemId } from "../../data/equipment";
import {
  CONTAINERS,
  samePlace,
  sizeOf,
  type Container,
  type Gear,
  type Place,
  type WornSlot,
} from "../../sim/people/inventory";
import { WEAPONS } from "../../tactical/rules";
import { Icon, hasIcon } from "./Icon";

/** Where a lifted item comes from, or goes: the agent's inventory, the ground, the armoury. */
export type Ref = Place | { floor: string } | { armoury: ItemId };

interface GroundItem {
  id: string;
  item: ItemId;
  ammo?: number;
}

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

/** The window: the agent in the middle of its head, ◀ ▶ round the name. A press that starts and ends outside closes it (not a drag let go there). */
export function InventoryWindow({
  name,
  canStep,
  onStep,
  onClose,
  children,
}: {
  name: string;
  canStep: boolean;
  onStep: (d: 1 | -1) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const pressed = useRef(false);
  return (
    <div
      className="inv-backdrop"
      onPointerDown={(e) => {
        pressed.current = e.target === e.currentTarget;
      }}
      onClick={(e) => e.target === e.currentTarget && pressed.current && onClose()}
    >
      <section className="panel inv-window">
        <div className="inv-head">
          <h3 className="detail-title">
            <button
              className="mini"
              disabled={!canStep}
              onClick={() => onStep(-1)}
              data-tip="Previous operative"
              aria-label="Previous operative"
            >
              ◀
            </button>
            <span>{name}</span>
            <button
              className="mini"
              disabled={!canStep}
              onClick={() => onStep(1)}
              data-tip="Next operative"
              aria-label="Next operative"
            >
              ▶
            </button>
          </h3>
          <CloseX onClick={onClose} />
        </div>
        {children}
      </section>
    </div>
  );
}

/** An agent's stats beside the inventory. */
export function StatSheet({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="inv-box inv-sheet">
      <div className="inv-box-title">Operative</div>
      <div className="inv-sheet-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="kv">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const CELL = 34;

const KIND_CLASS = (item: ItemId) => {
  const d = ITEMS[item];
  if (d.slot === "weapon") return "inv-weapon";
  if (d.slot === "armour" || d.slot === "helmet") return "inv-armour";
  if (d.use) return "inv-use";
  return "inv-ammo";
};

/** An item drawn as a box of its cells (placeholder art: its icon and short name). */
function ItemBox({
  item,
  ammo,
  held,
  count,
  note,
  off,
}: {
  item: ItemId;
  ammo?: number;
  held?: boolean;
  count?: number;
  note?: string;
  off?: boolean;
}) {
  const [ww, hh] = sizeOf(item);
  const d = ITEMS[item];
  const clip = d.weapon ? WEAPONS[d.weapon].clip : 0;
  return (
    <div
      className={`inv-item ${KIND_CLASS(item)}${held ? " held" : ""}${off ? " off" : ""}`}
      style={{ width: ww * CELL - 2, height: hh * CELL - 2 }}
      data-tip={`${d.name} (${ww} × ${hh})${count !== undefined ? `, ${count} in the armoury` : ""}\n${d.description}${note ? `\n${note}` : ""}`}
    >
      {hasIcon(item) && <Icon name={item} size={Math.min(ww, hh) * CELL * 0.62} />}
      {ww >= 2 && hh >= 2 && <span className="inv-item-name">{short(d.name)}</span>}
      {count !== undefined ? (
        <span className="inv-item-count">×{count}</span>
      ) : (
        clip > 0 && (
          <span className="inv-item-ammo">
            {ammo ?? clip}/{clip}
          </span>
        )
      )}
    </div>
  );
}

const short = (name: string) =>
  name
    .replace("Suppressed", "Supp.")
    .replace("magazine", "mag")
    .replace("Incendiary grenade", "Incendiary")
    .replace("Ballistic helmet", "Helmet");

/** Shelf-packs ground items into rows of a grid, for display. */
function layoutGround(
  items: GroundItem[],
  cols: number,
): { g: GroundItem; x: number; y: number }[] {
  const out: { g: GroundItem; x: number; y: number }[] = [];
  const taken = new Set<string>();
  const free = (x: number, y: number, w: number, h: number) => {
    if (x + w > cols) return false;
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) if (taken.has(`${x + dx},${y + dy}`)) return false;
    return true;
  };
  const sorted = [...items].sort(
    (a, b) => sizeOf(b.item)[1] - sizeOf(a.item)[1] || a.id.localeCompare(b.id),
  );
  for (const g of sorted) {
    const [w, h] = sizeOf(g.item);
    for (let y = 0; ; y++) {
      const x = Array.from({ length: cols }, (_, i) => i).find((i) => free(i, y, w, h));
      if (x === undefined) continue;
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) taken.add(`${x + dx},${y + dy}`);
      out.push({ g, x, y });
      break;
    }
  }
  return out;
}

const SLOT_BOX: Record<WornSlot, { w: number; h: number; name: string }> = {
  helmet: { w: 2, h: 2, name: "Helmet" },
  armour: { w: 2, h: 3, name: "Armour" },
  weapon: { w: 2, h: 5, name: "Hand" },
};

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
  /** The item being dragged: where from, and where in its box (pixels) it was taken. */
  const [held, setHeld] = useState<{ from: Ref; item: ItemId; gx: number; gy: number } | null>(
    null,
  );
  const [hover, setHover] = useState<Ref | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const root = useRef<HTMLDivElement>(null);

  /** Starts a drag (left button). The grip is where the item's box was pressed, or its middle if it isn't drawn at its size there. */
  const lift = (e: ReactPointerEvent, from: Ref, item: ItemId) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection
    const [w, h] = sizeOf(item);
    const box = (e.target as Element).closest(".inv-item")?.getBoundingClientRect();
    setMouse({ x: e.clientX, y: e.clientY });
    setHover(null);
    setHeld({
      from,
      item,
      gx: box ? e.clientX - box.left : (w * CELL) / 2,
      gy: box ? e.clientY - box.top : (h * CELL) / 2,
    });
  };

  /** Where the held item would go with the cursor there: a container's nearest cells, a slot, the ground, the armoury. */
  const targetAt = (x: number, y: number): Ref | null => {
    if (!held) return null;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop]");
    if (!el || !root.current?.contains(el)) return null;
    const id = el.dataset.drop!;
    if (id === "floor") return { floor: "" };
    if (id === "armoury") return { armoury: held.item };
    if (id in SLOT_BOX) return { slot: id as WornSlot };
    const c = id as Container,
      r = el.getBoundingClientRect(),
      [w, h] = sizeOf(held.item);
    const cell = (at: number, room: number) => Math.max(0, Math.min(room, Math.round(at / CELL)));
    return {
      in: c,
      x: cell(x - held.gx - r.left, CONTAINERS[c].w - w),
      y: cell(y - held.gy - r.top, CONTAINERS[c].h - h),
    };
  };
  /** Back where it came from: no move. */
  const home = (from: Ref, to: Ref) =>
    "floor" in from || "floor" in to
      ? "floor" in from && "floor" in to
      : "armoury" in from || "armoury" in to
        ? "armoury" in from && "armoury" in to
        : samePlace(from, to);

  // The drag follows the pointer anywhere on the page.
  const drag = useRef({ move: (_: PointerEvent) => {}, up: (_: PointerEvent) => {} });
  drag.current = {
    move: (e) => {
      setMouse({ x: e.clientX, y: e.clientY });
      setHover(targetAt(e.clientX, e.clientY));
    },
    up: (e) => {
      const to = targetAt(e.clientX, e.clientY);
      if (held && to && !home(held.from, to) && !blocker(held.from, to)) onMove(held.from, to);
      setHeld(null);
      setHover(null);
    },
  };
  const dragging = !!held;
  useEffect(() => {
    if (!dragging) return;
    const cancel = () => {
      setHeld(null);
      setHover(null);
    };
    const move = (e: PointerEvent) => drag.current.move(e);
    const up = (e: PointerEvent) => drag.current.up(e);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cancel();
      }
    };
    const menu = (e: Event) => {
      e.preventDefault();
      cancel();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("contextmenu", menu);
    window.addEventListener("keydown", key, true);
    document.body.classList.add("inv-dragging");
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("contextmenu", menu);
      window.removeEventListener("keydown", key, true);
      document.body.classList.remove("inv-dragging");
    };
  }, [dragging]);

  const moving = held && hover && !home(held.from, hover) ? hover : null;
  const why = held && moving ? blocker(held.from, moving) : null;
  const tu = held && moving && !why && cost ? cost(held.from, moving) : 0;

  const gridOf = (c: Container) => {
    const box = CONTAINERS[c];
    const anchored = gear.stowed.filter((s) => s.in === c);
    const ghost = held && moving && "in" in moving && moving.in === c ? moving : null;
    const [gw, gh] = held ? sizeOf(held.item) : [0, 0];
    return (
      <div className="inv-box">
        <div className="inv-box-title">{box.name}</div>
        <div
          className="inv-grid inv-bag"
          data-drop={c}
          style={{ width: box.w * CELL, height: box.h * CELL }}
        >
          {anchored.map((s) => {
            const isHeld =
              !!held &&
              "in" in held.from &&
              held.from.in === c &&
              held.from.x === s.x &&
              held.from.y === s.y;
            return (
              <div
                key={`${s.x},${s.y}`}
                className="inv-place"
                style={{ left: s.x * CELL + 1, top: s.y * CELL + 1 }}
                onPointerDown={(e) => lift(e, { in: c, x: s.x, y: s.y }, s.item)}
              >
                <ItemBox item={s.item} ammo={s.ammo} held={isHeld} />
              </div>
            );
          })}
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
  };

  const slotOf = (slot: WornSlot) => {
    const box = SLOT_BOX[slot];
    const item = gear[slot];
    const isLocked = locked.includes(slot);
    const over = held && moving && "slot" in moving && moving.slot === slot;
    const isHeld = !!held && "slot" in held.from && held.from.slot === slot;
    return (
      <div className="inv-box">
        <div className="inv-box-title">
          {box.name}
          {isLocked ? " (stays on)" : ""}
        </div>
        <div
          className={`inv-grid inv-slot${over ? (why ? " bad" : " good") : ""}${isLocked ? " locked" : ""}`}
          style={{ width: box.w * CELL, height: box.h * CELL }}
          data-drop={slot}
          onPointerDown={(e) => item && !isLocked && lift(e, { slot }, item)}
        >
          {item ? (
            <ItemBox item={item} ammo={slot === "weapon" ? handAmmo : undefined} held={isHeld} />
          ) : slot === "weapon" ? (
            <span className="inv-empty">Knife</span>
          ) : null}
        </div>
      </div>
    );
  };

  const cols = 12;
  const laid = useMemo(() => (ground ? layoutGround(ground, cols) : []), [ground]);
  const rows = Math.max(3, ...laid.map((l) => l.y + sizeOf(l.g.item)[1]));
  // The armoury: one stack a kind, packed the same way, wider.
  const stockCols = 20;
  const stock = useMemo(
    () =>
      armoury
        ? layoutGround(
            armoury.map((r) => ({ id: r.item, item: r.item })),
            stockCols,
          )
        : [],
    [armoury],
  );
  const stockRows = Math.max(3, ...stock.map((l) => l.y + sizeOf(l.g.item)[1]));
  const byItem = new Map((armoury ?? []).map((r) => [r.item, r]));
  const overGround = held && moving && ("floor" in moving || "armoury" in moving);

  return (
    <div className="inventory" ref={root}>
      {header && <div className="inv-header">{header}</div>}
      <div className="inv-doll">
        {sheet}
        <div className="inv-col">
          {slotOf("helmet")}
          {slotOf("armour")}
        </div>
        <div className="inv-col">{slotOf("weapon")}</div>
        <div className="inv-col">
          <div className="inv-row">
            {gridOf("pocket0")}
            {gridOf("pocket1")}
          </div>
          {gridOf("pack")}
        </div>
      </div>

      {ground && (
        <div className="inv-bottom">
          <div className="inv-box inv-ground-box">
            <div className="inv-box-title">
              On the ground near by{ground.length ? ` (${ground.length})` : ": nothing"}
            </div>
            <div className="inv-ground-scroll">
              <div
                className={`inv-grid inv-ground${overGround ? (why ? " bad" : " good") : ""}`}
                style={{ width: cols * CELL, height: rows * CELL }}
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
      )}

      {armoury && (
        <div className="inv-box inv-armoury-box">
          <div className="inv-box-title">
            The armoury
            {held && !("armoury" in held.from)
              ? ": drop it here to put it back"
              : armoury.length
                ? ""
                : ": empty"}
          </div>
          <div className="inv-ground-scroll">
            <div
              className={`inv-grid inv-ground${overGround ? (why ? " bad" : " good") : ""}`}
              style={{ width: stockCols * CELL, height: stockRows * CELL }}
              data-drop="armoury"
            >
              {stock.map(({ g, x, y }) => {
                const r = byItem.get(g.item)!;
                return (
                  <div
                    key={g.id}
                    className="inv-place"
                    style={{ left: x * CELL + 1, top: y * CELL + 1 }}
                    onPointerDown={(e) => !r.off && lift(e, { armoury: g.item }, g.item)}
                  >
                    <ItemBox
                      item={g.item}
                      count={r.count}
                      note={r.note}
                      off={r.off}
                      held={
                        !!held &&
                        "armoury" in held.from &&
                        held.from.armoury === g.item &&
                        r.count <= 1
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="inv-status small">
        {held ? (
          <>
            <b>{ITEMS[held.item].name}</b>
            {why ? (
              <>
                : <span className="warn-text">{why}</span>
              </>
            ) : tu ? (
              `: ${tu} TU`
            ) : (
              ""
            )}
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

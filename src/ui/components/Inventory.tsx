// The inventory screen (docs/design/inventory.md), shared by the base's
// equip window and the battlescape. Paradise Cracked style: a paperdoll
// (helmet, armour, the hand, two pockets, the backpack) over a source below
// (the base's armoury as a list, or the ground near the agent as a grid).
// Click an item to lift it, click where it goes; right click or Esc puts it
// back. The caller decides what a move means (stock, time units).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ITEMS, type ItemId } from "../../data/equipment";
import { CONTAINERS, sizeOf, stowedAt, type Container, type Gear, type Place, type WornSlot } from "../../sim/inventory";
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
  armoury?: { item: ItemId; count: number; note?: string }[];
  /** Right of the title row: TU, buttons. */
  header?: ReactNode;
  /** The character sheet, left of the paperdoll (Paradise Cracked style). */
  sheet?: ReactNode;
}

/** An agent's stats beside the inventory. */
export function StatSheet({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="inv-box inv-sheet">
      <div className="inv-box-title">Agent</div>
      <div className="inv-sheet-rows">
        {rows.map(([k, v]) => <div key={k} className="kv"><span>{k}</span><span>{v}</span></div>)}
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
function ItemBox({ item, ammo, w, h, held, onClick, tip }: { item: ItemId; ammo?: number; w?: number; h?: number; held?: boolean; onClick?: (e: React.MouseEvent) => void; tip?: string }) {
  const [iw, ih] = sizeOf(item);
  const ww = w ?? iw, hh = h ?? ih;
  const d = ITEMS[item];
  const clip = d.weapon ? WEAPONS[d.weapon].clip : 0;
  return (
    <div className={`inv-item ${KIND_CLASS(item)}${held ? " held" : ""}`} style={{ width: ww * CELL - 2, height: hh * CELL - 2 }}
      onClick={onClick} data-tip={tip ?? `${d.name} (${iw} × ${ih})\n${d.description}`}>
      {hasIcon(item) && <Icon name={item} size={Math.min(ww, hh) * CELL * 0.62} />}
      {ww >= 2 && hh >= 2 && <span className="inv-item-name">{short(d.name)}</span>}
      {clip > 0 && <span className="inv-item-ammo">{ammo ?? clip}/{clip}</span>}
    </div>
  );
}

const short = (name: string) => name.replace("Suppressed", "Supp.").replace("magazine", "mag").replace("Incendiary grenade", "Incendiary").replace("Ballistic helmet", "Helmet");

/** Shelf-packs ground items into rows of a grid, for display. */
function layoutGround(items: GroundItem[], cols: number): { g: GroundItem; x: number; y: number }[] {
  const out: { g: GroundItem; x: number; y: number }[] = [];
  const taken = new Set<string>();
  const free = (x: number, y: number, w: number, h: number) => {
    if (x + w > cols) return false;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (taken.has(`${x + dx},${y + dy}`)) return false;
    return true;
  };
  const sorted = [...items].sort((a, b) => sizeOf(b.item)[1] - sizeOf(a.item)[1] || a.id.localeCompare(b.id));
  for (const g of sorted) {
    const [w, h] = sizeOf(g.item);
    for (let y = 0; ; y++) {
      const x = Array.from({ length: cols }, (_, i) => i).find((i) => free(i, y, w, h));
      if (x === undefined) continue;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) taken.add(`${x + dx},${y + dy}`);
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

export function Inventory({ gear, handAmmo, locked = [], blocker, cost, onMove, ground, armoury, header, sheet }: InventoryProps) {
  const [held, setHeld] = useState<{ from: Ref; item: ItemId; dx: number; dy: number } | null>(null);
  const [hover, setHover] = useState<Ref | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && held) { e.stopPropagation(); setHeld(null); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [held]);

  const drop = (to: Ref) => {
    if (!held) return;
    if (!blocker(held.from, to)) onMove(held.from, to);
    setHeld(null);
    setHover(null);
  };
  const lift = (from: Ref, item: ItemId, dx = 0, dy = 0) => setHeld({ from, item, dx, dy });

  /** Where the held item would go with the cursor over a container's cell. */
  const anchor = (c: Container, x: number, y: number): Place => ({ in: c, x: x - (held?.dx ?? 0), y: y - (held?.dy ?? 0) });
  const why = held && hover ? blocker(held.from, hover) : null;
  const tu = held && hover && !why && cost ? cost(held.from, hover) : 0;

  const gridOf = (c: Container) => {
    const box = CONTAINERS[c];
    const anchored = gear.stowed.filter((s) => s.in === c);
    const ghost = held && hover && "in" in hover && hover.in === c ? hover : null;
    const [gw, gh] = held ? sizeOf(held.item) : [0, 0];
    return (
      <div className="inv-box">
        <div className="inv-box-title">{box.name}</div>
        <div className="inv-grid" style={{ width: box.w * CELL, height: box.h * CELL }} onContextMenu={(e) => { e.preventDefault(); setHeld(null); }}>
          {Array.from({ length: box.w * box.h }, (_, i) => {
            const x = i % box.w, y = Math.floor(i / box.w);
            return (
              <div key={i} className="inv-cell" style={{ left: x * CELL, top: y * CELL }}
                onMouseEnter={() => held && setHover(anchor(c, x, y))}
                onClick={() => {
                  if (held) return drop(anchor(c, x, y));
                  const s = stowedAt(gear, c, x, y);
                  if (s) lift({ in: c, x: s.x, y: s.y }, s.item, x - s.x, y - s.y);
                }} />
            );
          })}
          {anchored.map((s) => {
            const isHeld = !!held && "in" in held.from && held.from.in === c && held.from.x === s.x && held.from.y === s.y;
            return (
              <div key={`${s.x},${s.y}`} className="inv-place" style={{ left: s.x * CELL + 1, top: s.y * CELL + 1 }}>
                <ItemBox item={s.item} ammo={s.ammo} held={isHeld} />
              </div>
            );
          })}
          {ghost && (
            <div className={`inv-ghost${why ? " bad" : ""}`} style={{ left: ghost.x * CELL, top: ghost.y * CELL, width: gw * CELL, height: gh * CELL }} />
          )}
        </div>
      </div>
    );
  };

  const slotOf = (slot: WornSlot) => {
    const box = SLOT_BOX[slot];
    const item = gear[slot];
    const isLocked = locked.includes(slot);
    const over = held && hover && "slot" in hover && hover.slot === slot;
    const isHeld = !!held && "slot" in held.from && held.from.slot === slot;
    return (
      <div className="inv-box">
        <div className="inv-box-title">{box.name}{isLocked ? " (stays on)" : ""}</div>
        <div className={`inv-grid inv-slot${over ? (why ? " bad" : " good") : ""}${isLocked ? " locked" : ""}`} style={{ width: box.w * CELL, height: box.h * CELL }}
          onMouseEnter={() => held && setHover({ slot })} onMouseLeave={() => setHover(null)}
          onContextMenu={(e) => { e.preventDefault(); setHeld(null); }}
          onClick={() => {
            if (held) return drop({ slot });
            if (item && !isLocked) lift({ slot }, item);
          }}>
          {item ? <ItemBox item={item} ammo={slot === "weapon" ? handAmmo : undefined} held={isHeld} /> : slot === "weapon" ? <span className="inv-empty">Knife</span> : null}
        </div>
      </div>
    );
  };

  const cols = 12;
  const laid = useMemo(() => (ground ? layoutGround(ground, cols) : []), [ground]);
  const rows = Math.max(3, ...laid.map((l) => l.y + sizeOf(l.g.item)[1]));
  const overGround = held && hover && ("floor" in hover || "armoury" in hover);

  return (
    <div className="inventory" onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>
      {header && <div className="inv-header">{header}</div>}
      <div className="inv-doll">
        {sheet}
        <div className="inv-col">{slotOf("helmet")}{slotOf("armour")}</div>
        <div className="inv-col">{slotOf("weapon")}</div>
        <div className="inv-col">
          <div className="inv-row">{gridOf("pocket0")}{gridOf("pocket1")}</div>
          {gridOf("pack")}
        </div>
      </div>

      {ground && (
        <div className="inv-box inv-ground-box">
          <div className="inv-box-title">On the ground near by{ground.length ? ` (${ground.length})` : ": nothing"}</div>
          <div className="inv-ground-scroll">
            <div className={`inv-grid inv-ground${overGround ? (why ? " bad" : " good") : ""}`} style={{ width: cols * CELL, height: rows * CELL }}
              onMouseEnter={() => held && setHover({ floor: "" })} onMouseLeave={() => setHover(null)}
              onContextMenu={(e) => { e.preventDefault(); setHeld(null); }}
              onClick={() => held && !("floor" in held.from) && drop({ floor: "" })}>
              {laid.map(({ g, x, y }) => (
                <div key={g.id} className="inv-place clickable" style={{ left: x * CELL + 1, top: y * CELL + 1 }}>
                  <ItemBox item={g.item} ammo={g.ammo} held={!!held && "floor" in held.from && held.from.floor === g.id}
                    onClick={(e) => { if (held) return; e.stopPropagation(); lift({ floor: g.id }, g.item); }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {armoury && (
        <div className="inv-box inv-armoury-box">
          <div className="inv-box-title">The armoury{held && !("armoury" in held.from) ? ": click here to put it back" : ""}</div>
          <div className={`inv-armoury${overGround ? " good" : ""}`}
            onMouseEnter={() => held && setHover({ armoury: held.item })} onMouseLeave={() => setHover(null)}
            onClick={() => held && !("armoury" in held.from) && drop({ armoury: held.item })}
            onContextMenu={(e) => { e.preventDefault(); setHeld(null); }}>
            {armoury.length === 0 && <span className="dim small">Empty.</span>}
            {armoury.map((r) => (
              <button key={r.item} className={`inv-stock ${KIND_CLASS(r.item)}${held && "armoury" in held.from && held.from.armoury === r.item ? " on" : ""}`}
                data-tip={`${ITEMS[r.item].name} (${sizeOf(r.item).join(" × ")})\n${ITEMS[r.item].description}${r.note ? `\n${r.note}` : ""}`}
                onClick={(e) => { if (held) return; e.stopPropagation(); lift({ armoury: r.item }, r.item); }}>
                {hasIcon(r.item) && <Icon name={r.item} size={16} />}
                <span className="inv-stock-name">{ITEMS[r.item].name}</span>
                <span className="inv-stock-n">{r.count}</span>
                {r.note && <span className="inv-stock-note">{r.note}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="inv-status small">
        {held
          ? <>Holding: <b>{ITEMS[held.item].name}</b>. {why ? <span className="warn-text">{why}</span> : hover ? (tu ? `${tu} TU` : "Click to put it here") : "Click where it goes"} · right click or Esc: put it back</>
          : "Click an item to pick it up."}
      </div>
      {held && (
        <div className="inv-cursor" style={{ left: mouse.x + 10, top: mouse.y + 10 }}>
          <ItemBox item={held.item} />
        </div>
      )}
    </div>
  );
}

// An item drawn as a box of its grid cells, and packing loose items into a grid.
import { ITEMS, type ItemId } from "../../data/equipment";
import { sizeOf } from "../../sim/people/inventory";
import { WEAPONS } from "../../tactical/rules";
import { Icon, hasIcon } from "./Icon";

/** A grid cell's size on screen (pixels). */
export const CELL = 34;

/** The box's colour class, by what the item is. */
const kindClass = (item: ItemId) => {
  const d = ITEMS[item];
  if (d.slot === "weapon") return "inv-weapon";
  if (d.slot === "armour" || d.slot === "helmet") return "inv-armour";
  if (d.use) return "inv-use";
  return "inv-ammo";
};

/** An item drawn as a box of its cells (placeholder art: its icon and short name). */
export function ItemBox({
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
      className={`inv-item ${kindClass(item)}${held ? " held" : ""}${off ? " off" : ""}`}
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

/** Shelf-packs items into rows of a grid, for display: the tallest first. */
export function layoutGround(
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

/** An item lying on the ground, by its id there. */
export interface GroundItem {
  id: string;
  item: ItemId;
  ammo?: number;
}

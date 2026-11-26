// An item's picture: its inventory render (public/assets/items/icons/<id>.webp,
// docs/design/item-art.md), fitted to a box. Upright as the grid has it (a
// long gun muzzle up), or lying on its side (a weapon in a wide box: the
// muzzle to the left, the grip down).
import { type ItemId } from "../../data/equipment";

export const itemIconUrl = (id: ItemId) =>
  `${import.meta.env.BASE_URL}assets/items/icons/${id}.webp`;

export function ItemPicture({
  item,
  w,
  h,
  lying = false,
}: {
  item: ItemId;
  w: number;
  h: number;
  lying?: boolean;
}) {
  return (
    <span className={`item-pic${lying ? " lying" : ""}`} style={{ width: w, height: h }}>
      <img
        src={itemIconUrl(item)}
        alt=""
        draggable={false}
        style={lying ? { width: h, height: w } : undefined}
      />
    </span>
  );
}

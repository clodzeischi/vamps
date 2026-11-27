// An icon from game-icons.net (CC BY 3.0), drawn in the current text colour.
// The set we use is listed in scripts/build-icons.mjs. A few of ours are
// alpha masks in public/assets/ instead, tinted the same way.
import { ICONS } from "../icons.generated";
import { sampleOf, type ItemId } from "../../data/equipment";

/** Our own icons, as masks: the OPV emblem stands in for any cross. */
const MASKS = { "stat-faith": "emblem/glyph.png" } as const;

export type IconName = keyof typeof ICONS | keyof typeof MASKS;

/** An item's glyph for text rows: its own, or for a tissue sample, the sample's. */
export const itemGlyph = (item: ItemId): IconName =>
  sampleOf(item)
    ? "tissue-sample"
    : item.startsWith("silencer-")
      ? "bolt-silencer"
      : (item as Exclude<ItemId, `sample-${string}` | `silencer-${string}`>);

export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  if (name in MASKS) {
    const mask = `url(${import.meta.env.BASE_URL}assets/${MASKS[name as keyof typeof MASKS]}) center / contain no-repeat`;
    return (
      <span
        className={`icon icon-mask ${className}`}
        style={{ width: size, height: size, mask, WebkitMask: mask }}
        aria-hidden="true"
      />
    );
  }
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name as keyof typeof ICONS] }}
    />
  );
}

export const hasIcon = (name: string): name is IconName => name in ICONS || name in MASKS;

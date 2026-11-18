// A button that says only what it does. Cost, time, consequences and why it
// can't be used go in its tooltip. It stays hoverable when blocked (so the
// tooltip can say why), and ignores clicks.
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import { tipLines, warn } from "./Tooltip";

export function ActionButton(props: {
  label: ReactNode;
  icon?: IconName;
  /** Details for the tooltip: cost, time, what happens. One string per line. */
  tip?: (string | null | undefined | false)[];
  /** Why it can't be used now (shown as a warning in the tooltip). */
  blocker?: string | null;
  onClick: () => void;
  primary?: boolean;
  /** A small inline button instead of a full-width one. */
  mini?: boolean;
  /** A square tile: the icon on top, the label under it (the battle's action bar). */
  tile?: boolean;
  /** The key, shown in a tile's top right corner and in the tooltip. */
  hotkey?: string;
  /** A count in a tile's top left corner (e.g. incendiaries left). */
  badge?: string;
  className?: string;
}) {
  const blocked = !!props.blocker;
  const tip = tipLines(...(props.tip ?? []), props.hotkey && `Key: ${props.hotkey}`, warn(props.blocker));
  const kind = props.tile ? "act-tile act" : props.mini ? "mini act" : "action act";
  return (
    <button
      className={`${kind}${props.primary ? " primary" : ""}${blocked ? " is-blocked" : ""} ${props.className ?? ""}`}
      aria-disabled={blocked}
      data-tip={tip || undefined}
      onClick={() => !blocked && props.onClick()}
    >
      {props.tile && props.badge !== undefined && <span className="act-tile-badge">{props.badge}</span>}
      {props.tile && props.hotkey && <kbd className="act-tile-key">{props.hotkey}</kbd>}
      {props.icon && <Icon name={props.icon} size={props.tile ? 28 : props.mini ? 14 : 18} />}
      <span className={props.tile ? "act-tile-label" : props.mini ? "" : "action-title"}>{props.label}</span>
    </button>
  );
}

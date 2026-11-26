// The action panel, bottom left (after Paradise Cracked): the agent's round
// buttons, the active item in its well with the weapon keys beside it, and
// above them the backpack strip when it's open.
import { INCENDIARY, INV_TU, type Unit } from "../../../tactical/battle";
import { ITEMS, type ItemId } from "../../../data/equipment";
import { ActionButton } from "../../components/ActionButton";
import { ItemPicture } from "../../components/ItemPicture";
import type { BindingId } from "../../keys";
import { ActiveWell, type Usable } from "./activeItem";
import type { Command } from "./actionCommands";

interface Props {
  me: Unit;
  activeItem: ItemId | undefined;
  usable: Usable[];
  stripOpen: boolean;
  agentCmds: Command[];
  weaponCmds: Command[];
  keyOf: (id: BindingId) => string;
  /** Hold an item ready (or, with undefined, go back to the weapon) and close the strip. */
  choose: (item: ItemId | undefined) => void;
}

export function ActionPanel(p: Props) {
  const { me, activeItem, keyOf } = p;
  return (
    <div className="battle-panel">
      {p.stripOpen && (
        <BackpackStrip me={me} activeItem={activeItem} usable={p.usable} choose={p.choose} />
      )}
      <div className="battle-panel-body panel">
        <div className="pc-agent">
          {p.agentCmds.map((c) => (
            <ActionButton
              key={c.id}
              tile
              iconOnly
              className={`pc-round${c.on ? " on" : ""}`}
              icon={c.icon}
              label={c.label}
              badge={c.badge}
              hotkey={c.key ? keyOf(c.key) : undefined}
              tip={c.tip}
              blocker={c.blocker}
              onClick={c.run}
            />
          ))}
        </div>
        <div className="pc-weapon">
          <ActiveWell me={me} item={activeItem} />
          <div className="pc-tray">
            {p.weaponCmds.map((c) => (
              <ActionButton
                key={c.id}
                tile
                iconOnly
                className={`pc-key${c.id === "reload" ? " pc-reload" : ""}`}
                icon={c.icon}
                label={c.label}
                hotkey={c.key ? keyOf(c.key) : undefined}
                tip={c.tip}
                blocker={c.blocker}
                onClick={c.run}
                primary={c.on}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function usableTip(x: Usable): string {
  const where = `${ITEMS[x.item].name}: ${x.n} carried (${x.pockets} in pockets, ${x.n - x.pockets} in the backpack). Pockets first; from the backpack +${INV_TU.pack} TU.`;
  const how =
    x.item === "incendiary"
      ? `Click where to throw, up to ${INCENDIARY.range} tiles: a 3 × 3 fire, ${INCENDIARY.damage[0]}–${INCENDIARY.damage[1]} burns, double to a vampire, for ${INCENDIARY.turns} turns. A vampire in torpor burns to ash.`
      : `Click the operative to patch, this one or one next to them: up to 10 health back.`;
  return `${where}\n${how}`;
}

/** The weapon in hand, then each kind of usable thing carried. */
function BackpackStrip({
  me,
  activeItem,
  usable,
  choose,
}: Pick<Props, "me" | "activeItem" | "usable" | "choose">) {
  const weapon = me.gear.weapon;
  return (
    <div className="battle-strip panel">
      <button
        className={`strip-item${!activeItem ? " on" : ""}`}
        onClick={() => choose(undefined)}
        data-tip="Back to the weapon in hand"
      >
        <ItemPicture item={weapon ?? "knife"} w={72} h={26} lying />
        <span>{weapon ? ITEMS[weapon].name : "Knife"}</span>
      </button>
      {usable.map((x) => (
        <button
          key={x.item}
          className={`strip-item${activeItem === x.item ? " on" : ""}`}
          onClick={() => choose(x.item)}
          data-tip={usableTip(x)}
        >
          <ItemPicture item={x.item} w={72} h={26} />
          <span>{ITEMS[x.item].name}</span>
          <b>×{x.n}</b>
        </button>
      ))}
    </div>
  );
}

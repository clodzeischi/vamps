// The buttons of the action panel, bottom left (after Paradise Cracked): the
// weapon console (fire modes, reload), the agent's own (sneak, backpack,
// inventory), and Evacuate beside End turn. Each is a plain description; the
// screen draws them and the keyboard runs them.
import { ITEMS } from "../../../data/equipment";
import { countOf } from "../../../sim/people/inventory";
import { WEAPONS } from "../../../tactical/rules";
import {
  commandEvacuate,
  commandReload,
  detectRadius,
  modesOf,
  onLandingZone,
  reloadBlocker,
  reloadPlan,
  setMode,
  setSneak,
  shotCost,
  SNEAK,
  TU_COST,
  type Battle,
  type BattleEvent,
  type ShotMode,
  type Unit,
} from "../../../tactical/battle";
import type { IconName } from "../../components/Icon";
import type { BindingId } from "../../keys";
import { MODE_NAME } from "./shotTip";

export interface Command {
  id: string;
  icon: IconName;
  label: string;
  badge?: string;
  key?: BindingId;
  on?: boolean;
  blocker: string | null;
  tip: string[];
  run: () => void;
}

/** What the commands need from the screen. */
export interface CommandContext {
  b: Battle;
  me: Unit;
  /** The item held ready in place of the weapon, if any. */
  activeItem: string | undefined;
  /** How many usable things are carried (grenades, trauma kits). */
  usableCount: number;
  stripOpen: boolean;
  act: (result: BattleEvent[] | string) => void;
  /** Redraw after a change made in place (fire mode, sneak). */
  bump: () => void;
  toggleStrip: () => void;
  openInventory: () => void;
}

const MODE_LABEL: Record<ShotMode, string> = { snap: "Snap", aimed: "Aimed", burst: "Burst" };

function modeTip(me: Unit, mode: ShotMode): string {
  if (mode === "snap") return "Quick, from the hip.";
  if (mode === "aimed") return "Steadier: a cone about half as wide.";
  return `${WEAPONS[me.weapon].burst} rounds at one target, each in a wider cone, until it drops.`;
}

/** Fire modes (when the weapon has more than one) and reload. */
export function weaponCommands(c: CommandContext): Command[] {
  const { b, me } = c;
  const modes = c.activeItem ? [] : modesOf(me);
  const modeCommands = modes.length > 1 ? modes.map((mode) => fireModeCommand(c, mode)) : [];

  const plan = reloadPlan(me);
  const magazine = me.gear.weapon ? ITEMS[me.gear.weapon].mag : undefined;
  const carried = magazine ? countOf(me.gear, magazine) : 0;
  const reload: Command = {
    id: "reload",
    icon: "reload",
    label: "Reload",
    key: "reload",
    blocker: reloadBlocker(me),
    tip: [
      `${plan?.cost ?? TU_COST.reload} TU${plan?.mag.in === "pack" ? " (from the backpack)" : ""}. The magazine in the gun is dropped.`,
      `${me.ammo} of ${WEAPONS[me.weapon].clip} rounds left. Magazines carried: ${carried}.`,
    ],
    run: () => c.act(commandReload(b, me)),
  };
  return [...modeCommands, reload];
}

function fireModeCommand(c: CommandContext, mode: ShotMode): Command {
  const { me } = c;
  const chosen = me.mode === mode;
  return {
    id: `mode-${mode}`,
    icon: mode as IconName,
    label: MODE_LABEL[mode],
    key: chosen ? "fireMode" : undefined,
    on: chosen,
    blocker: null,
    tip: [
      `Fire mode: ${MODE_NAME[mode].toLowerCase()}, ${shotCost(me, mode)} TU.`,
      modeTip(me, mode),
      "Clicking an enemy shoots in this mode; Ctrl-click fires at a spot.",
    ],
    run: () => {
      setMode(me, mode);
      c.bump();
    },
  };
}

/** Sneak, the backpack strip, the inventory. */
export function agentCommands(c: CommandContext): Command[] {
  const { me } = c;
  const sneak: Command = {
    id: "sneak",
    icon: "status-covert",
    label: "Sneak",
    key: "sneak",
    on: me.sneak,
    blocker: null,
    tip: [
      me.sneak ? "Sneaking: on." : "Sneaking: off.",
      `Each step costs ${SNEAK.move}× the time; while the team is concealed, an enemy must come twice as close to spot this operative (now within ${detectRadius(me)} tiles).`,
      "Stack up on a door before a breach, by day, while they sleep inside.",
    ],
    run: () => {
      setSneak(me, !me.sneak);
      c.bump();
    },
  };
  const backpack: Command = {
    id: "backpack",
    icon: "use-item",
    label: "Backpack",
    key: "useItem",
    on: c.stripOpen,
    badge: c.usableCount ? `${c.usableCount}` : undefined,
    blocker: c.usableCount ? null : "Nothing to use in the pockets or the backpack",
    tip: [
      "Grenades and trauma kits carried: pick one to hold it ready in place of the weapon, then click where to throw it, or who to patch. It stays ready while there's another; after the last, the weapon is back. Right click or Esc: the weapon now.",
    ],
    run: c.toggleStrip,
  };
  const inventory: Command = {
    id: "inventory",
    icon: "inventory",
    label: "Inventory",
    key: "inventory",
    blocker: null,
    tip: [
      "The operative's sheet: stats, hand, pockets, backpack, and what lies on the ground near by. Moving things costs TU: a pocket is quick, the backpack and the ground slower.",
    ],
    run: c.openInventory,
  };
  return [sneak, backpack, inventory];
}

/** Leave the battle from the landing zone. */
export function evacuateCommand(c: CommandContext): Command {
  const { b, me } = c;
  let blocker: string | null = null;
  if (!onLandingZone(b, me)) blocker = "Only from the landing zone";
  else if (me.tu < TU_COST.evacuate) blocker = `Needs ${TU_COST.evacuate} TU (${me.tu} left)`;
  return {
    id: "evacuate",
    icon: "evacuate",
    label: "Evacuate",
    key: "evacuate",
    blocker,
    tip: [
      `${TU_COST.evacuate} TU. This operative leaves the battle. If everyone left alive leaves, the mission is abandoned.`,
    ],
    run: () => c.act(commandEvacuate(b, me)),
  };
}

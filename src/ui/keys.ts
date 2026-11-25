// Key bindings for the geoscape and the battlescape (docs/design/tactical.md).
// Stored as KeyboardEvent.code, so they follow the key's place on the
// keyboard, not its letter (WASD stays WASD on AZERTY). Rebound in Settings,
// main menu. Each screen has its own set: a key can mean one thing on the
// globe and another in battle. Esc is fixed everywhere (it closes things).

type BattleBindingId =
  | "agent1" | "agent2" | "agent3" | "agent4" | "agent5" | "agent6" | "agent7" | "agent8"
  | "nextAgent" | "endTurn"
  | "shoot" | "fireMode" | "reload" | "incendiary" | "useItem" | "sneak" | "inventory" | "evacuate"
  | "panForward" | "panBack" | "panLeft" | "panRight" | "rotateLeft" | "rotateRight" | "levelUp" | "levelDown";

type GeoBindingId =
  | "geoPause" | "geoFaster" | "geoSlower" | "geoOverlay"
  | "geoTab1" | "geoTab2" | "geoTab3" | "geoTab4" | "geoTab5" | "geoTab6" | "geoTab7";

export type BindingId = BattleBindingId | GeoBindingId;
export type KeyBindings = Record<BindingId, string>;
export type BindingScope = "geo" | "battle";

export const AGENT_KEYS: BindingId[] = ["agent1", "agent2", "agent3", "agent4", "agent5", "agent6", "agent7", "agent8"];
/** Control's tabs, in order (ui/control.ts). */
export const TAB_KEYS: BindingId[] = ["geoTab1", "geoTab2", "geoTab3", "geoTab4", "geoTab5", "geoTab6", "geoTab7"];
const TAB_NAMES = ["Bases", "Operations", "Research", "Intelligence", "Covert", "Dark web", "Ledger"];

export interface BindingGroup {
  scope: BindingScope;
  title: string;
  items: { id: BindingId; label: string; note?: string }[];
}

export const GEO_GROUPS: BindingGroup[] = [
  {
    scope: "geo",
    title: "Time",
    items: [
      { id: "geoPause", label: "Pause / resume" },
      { id: "geoFaster", label: "Faster", note: "A longer interval for each second" },
      { id: "geoSlower", label: "Slower" },
    ],
  },
  {
    scope: "geo",
    title: "Control",
    items: TAB_KEYS.map((id, i) => ({ id, label: TAB_NAMES[i]!, note: i === 0 ? "Opens Control on that tab; inside, switches to it" : undefined })),
  },
  {
    scope: "geo",
    title: "Globe",
    items: [{ id: "geoOverlay", label: "Next map overlay", note: "Support, SIGINT, HUMINT, access, IO, vampire activity, none" }],
  },
];

export const BATTLE_GROUPS: BindingGroup[] = [
  {
    scope: "battle",
    title: "Squad",
    items: [
      ...AGENT_KEYS.map((id, i) => ({ id, label: `Operative ${i + 1}`, note: i === 0 ? "Press once to select, again to move the camera to them" : undefined })),
      { id: "nextAgent", label: "Next operative" },
      { id: "endTurn", label: "End turn" },
    ],
  },
  {
    scope: "battle",
    title: "Actions",
    items: [
      { id: "shoot", label: "Shoot the best target", note: "In the fire mode chosen" },
      { id: "fireMode", label: "Next fire mode", note: "Snap, aimed, burst (if the weapon has it)" },
      { id: "reload", label: "Reload" },
      { id: "incendiary", label: "Ready an incendiary", note: "Again, or Esc: the weapon" },
      { id: "useItem", label: "Backpack", note: "The grenades and trauma kits carried, to pick one" },
      { id: "sneak", label: "Sneak on / off" },
      { id: "inventory", label: "Inventory" },
      { id: "evacuate", label: "Evacuate" },
    ],
  },
  {
    scope: "battle",
    title: "Camera",
    items: [
      { id: "panForward", label: "Pan forward" },
      { id: "panBack", label: "Pan back" },
      { id: "panLeft", label: "Pan left" },
      { id: "panRight", label: "Pan right" },
      { id: "rotateLeft", label: "Rotate left" },
      { id: "rotateRight", label: "Rotate right" },
      { id: "levelUp", label: "Level up", note: "Or the mouse wheel. The view starts at the selected operative's level" },
      { id: "levelDown", label: "Level down", note: "Or the mouse wheel" },
    ],
  },
];

export const DEFAULT_KEYS: KeyBindings = {
  agent1: "Digit1", agent2: "Digit2", agent3: "Digit3", agent4: "Digit4",
  agent5: "Digit5", agent6: "Digit6", agent7: "Digit7", agent8: "Digit8",
  nextAgent: "Tab", endTurn: "Enter",
  shoot: "KeyT", reload: "KeyL", incendiary: "KeyG", evacuate: "KeyX",
  fireMode: "KeyM", useItem: "KeyU", inventory: "KeyI", sneak: "KeyC",
  panForward: "KeyW", panBack: "KeyS", panLeft: "KeyA", panRight: "KeyD",
  rotateLeft: "KeyQ", rotateRight: "KeyE", levelUp: "KeyR", levelDown: "KeyF",

  geoPause: "Space", geoFaster: "Equal", geoSlower: "Minus", geoOverlay: "KeyM",
  geoTab1: "Digit1", geoTab2: "Digit2", geoTab3: "Digit3", geoTab4: "Digit4", geoTab5: "Digit5", geoTab6: "Digit6", geoTab7: "Digit7",
};

const isGeo = (id: BindingId) => id.startsWith("geo");
const scopeOf = (id: BindingId): BindingScope => (isGeo(id) ? "geo" : "battle");
const idsOf = (scope: BindingScope) => (Object.keys(DEFAULT_KEYS) as BindingId[]).filter((k) => scopeOf(k) === scope);

/** Keys that can't be bound: they belong to the browser or the menus. */
export const RESERVED = new Set(["Escape", "MetaLeft", "MetaRight", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "CapsLock", "F5", "F11", "F12"]);

export function bindingsOf(saved: Partial<KeyBindings> | undefined): KeyBindings {
  // Only actions that still exist: settings saved before a key was retired keep it.
  const keys = { ...DEFAULT_KEYS };
  for (const [id, code] of Object.entries(saved ?? {})) if (id in DEFAULT_KEYS && typeof code === "string") keys[id as BindingId] = code;
  return keys;
}

/** Binds `code` to `id`; whatever on the same screen had `code` before takes `id`'s old key (a swap). */
export function rebind(keys: KeyBindings, id: BindingId, code: string): KeyBindings {
  const next = { ...keys };
  const other = idsOf(scopeOf(id)).find((k) => k !== id && next[k] === code);
  if (other) next[other] = keys[id];
  next[id] = code;
  return next;
}

/** Puts one screen's keys back to the defaults, leaving the other's alone. */
export function resetScope(keys: KeyBindings, scope: BindingScope): Partial<KeyBindings> {
  const next: Partial<KeyBindings> = { ...keys };
  for (const k of idsOf(scope)) next[k] = DEFAULT_KEYS[k];
  return next;
}

export const scopeChanged = (keys: KeyBindings, scope: BindingScope) => idsOf(scope).some((k) => keys[k] !== DEFAULT_KEYS[k]);

/** The action a key press means on this screen, if any. */
export function actionFor(keys: KeyBindings, code: string, scope: BindingScope = "battle"): BindingId | undefined {
  return idsOf(scope).find((k) => keys[k] === code);
}

/** "KeyT" → "T", "Digit1" → "1", "ArrowUp" → "↑". */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Space: "Space", Enter: "Enter", Tab: "Tab",
    Backspace: "Backspace", PageUp: "Page Up", PageDown: "Page Down", Backquote: "`", Minus: "-", Equal: "=",
    BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\",
  };
  return named[code] ?? code;
}

// Key bindings for the battlescape (docs/WEB_PORT.md 3.11). Stored as
// KeyboardEvent.code, so they follow the key's place on the keyboard, not
// its letter (WASD stays WASD on AZERTY). Rebound in Settings, main menu.

export type BindingId =
  | "agent1" | "agent2" | "agent3" | "agent4" | "agent5" | "agent6" | "agent7" | "agent8"
  | "nextAgent" | "endTurn"
  | "shoot" | "overwatch" | "hunker" | "reload" | "incendiary" | "evacuate"
  | "panForward" | "panBack" | "panLeft" | "panRight" | "rotateLeft" | "rotateRight" | "levelUp" | "levelDown";

export type KeyBindings = Record<BindingId, string>;

export const AGENT_KEYS: BindingId[] = ["agent1", "agent2", "agent3", "agent4", "agent5", "agent6", "agent7", "agent8"];

export const BINDING_GROUPS: { title: string; items: { id: BindingId; label: string; note?: string }[] }[] = [
  {
    title: "Squad",
    items: [
      ...AGENT_KEYS.map((id, i) => ({ id, label: `Agent ${i + 1}`, note: i === 0 ? "Press once to select, again to move the camera to them" : undefined })),
      { id: "nextAgent", label: "Next agent" },
      { id: "endTurn", label: "End turn" },
    ],
  },
  {
    title: "Actions",
    items: [
      { id: "shoot", label: "Shoot the best target", note: "With Shift: an aimed shot" },
      { id: "overwatch", label: "Overwatch" },
      { id: "hunker", label: "Hunker down" },
      { id: "reload", label: "Reload" },
      { id: "incendiary", label: "Incendiary" },
      { id: "evacuate", label: "Evacuate" },
    ],
  },
  {
    title: "Camera",
    items: [
      { id: "panForward", label: "Pan forward" },
      { id: "panBack", label: "Pan back" },
      { id: "panLeft", label: "Pan left" },
      { id: "panRight", label: "Pan right" },
      { id: "rotateLeft", label: "Rotate left" },
      { id: "rotateRight", label: "Rotate right" },
      { id: "levelUp", label: "Level up" },
      { id: "levelDown", label: "Level down" },
    ],
  },
];

export const DEFAULT_KEYS: KeyBindings = {
  agent1: "Digit1", agent2: "Digit2", agent3: "Digit3", agent4: "Digit4",
  agent5: "Digit5", agent6: "Digit6", agent7: "Digit7", agent8: "Digit8",
  nextAgent: "Tab", endTurn: "Enter",
  shoot: "KeyT", overwatch: "KeyO", hunker: "KeyH", reload: "KeyL", incendiary: "KeyG", evacuate: "KeyX",
  panForward: "KeyW", panBack: "KeyS", panLeft: "KeyA", panRight: "KeyD",
  rotateLeft: "KeyQ", rotateRight: "KeyE", levelUp: "KeyR", levelDown: "KeyF",
};

/** Keys that can't be bound: they belong to the browser or the menus. */
export const RESERVED = new Set(["Escape", "MetaLeft", "MetaRight", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "CapsLock", "F5", "F11", "F12"]);

export function bindingsOf(saved: Partial<KeyBindings> | undefined): KeyBindings {
  return { ...DEFAULT_KEYS, ...saved };
}

/** Binds `code` to `id`; whatever had `code` before takes `id`'s old key (a swap). */
export function rebind(keys: KeyBindings, id: BindingId, code: string): KeyBindings {
  const next = { ...keys };
  const other = (Object.keys(next) as BindingId[]).find((k) => k !== id && next[k] === code);
  if (other) next[other] = keys[id];
  next[id] = code;
  return next;
}

/** The action a key press means, if any. */
export function actionFor(keys: KeyBindings, code: string): BindingId | undefined {
  return (Object.keys(keys) as BindingId[]).find((k) => keys[k] === code);
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

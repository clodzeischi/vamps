// Save slots in the browser's localStorage, plus file export/import for moving
// a campaign to another computer. Storage can be unavailable or full, so every
// call reports failure instead of throwing.
import { difficulty } from "../data/difficulty";
import type { GameState } from "../sim/state";
import { formatDate } from "../sim/time";
import { deserialize, serialize, SaveError } from "./format";

export type SlotId = "auto" | "1" | "2" | "3";
export const SLOTS: SlotId[] = ["auto", "1", "2", "3"];
const key = (slot: SlotId) => `vamps.save.${slot}`;
const metaKey = (slot: SlotId) => `vamps.save.${slot}.meta`;

interface SlotInfo {
  slot: SlotId;
  savedAt: string;
  label: string;
}

function slotLabel(s: GameState) {
  return `${formatDate(s.time)} · ${difficulty(s.difficulty).name} · ${s.installations.length} installations`;
}

export function saveToSlot(state: GameState, slot: SlotId): string | null {
  try {
    localStorage.setItem(key(slot), serialize(state));
    const meta: SlotInfo = { slot, savedAt: new Date().toISOString(), label: slotLabel(state) };
    localStorage.setItem(metaKey(slot), JSON.stringify(meta));
    return null;
  } catch {
    return "Could not save: browser storage is unavailable or full.";
  }
}

export function loadFromSlot(slot: SlotId): GameState {
  let text: string | null = null;
  try {
    text = localStorage.getItem(key(slot));
  } catch {
    throw new SaveError("Browser storage is unavailable.");
  }
  if (!text) throw new SaveError("That slot is empty.");
  return deserialize(text);
}

export function listSlots(): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const slot of SLOTS) {
    try {
      const m = localStorage.getItem(metaKey(slot));
      if (m && localStorage.getItem(key(slot))) out.push(JSON.parse(m) as SlotInfo);
    } catch {
      /* skip unreadable slot */
    }
  }
  return out;
}

export function latestSlot(): SlotInfo | null {
  const all = listSlots();
  return all.length ? all.reduce((a, b) => (a.savedAt > b.savedAt ? a : b)) : null;
}

export function exportToFile(state: GameState) {
  const blob = new Blob([serialize(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date(state.time);
  a.href = url;
  a.download = `vamps-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}.vamps.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importFromFile(file: File): Promise<GameState> {
  if (file.size > 5_000_000) throw new SaveError("That file is too large to be a Vamps save.");
  return deserialize(await file.text());
}

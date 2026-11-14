import { useState } from "react";
import { importFromFile, listSlots, loadFromSlot, SLOTS, type SlotId } from "../../save/storage";
import { useStore } from "../store";

const slotName = (s: SlotId) => (s === "auto" ? "Autosave" : `Slot ${s}`);

/** Save or load slots. Saving offers the manual slots; loading lists whatever exists. */
export function SaveSlots({ mode, onDone }: { mode: "save" | "load"; onDone?: () => void }) {
  const [, refresh] = useState(0);
  const save = useStore((s) => s.save);
  const loadGame = useStore((s) => s.loadGame);
  const notify = useStore((s) => s.notify);
  const filled = new Map(listSlots().map((i) => [i.slot, i]));
  const slots = mode === "save" ? SLOTS.filter((s) => s !== "auto") : SLOTS.filter((s) => filled.has(s));

  if (!slots.length) return <p className="prose dim">No saved campaigns in this browser.</p>;
  return (
    <div className="slot-list">
      {slots.map((slot) => {
        const info = filled.get(slot);
        return (
          <button
            key={slot}
            className="slot"
            onClick={() => {
              if (mode === "save") {
                save(slot);
                refresh((n) => n + 1);
                onDone?.();
                return;
              }
              try {
                loadGame(loadFromSlot(slot));
                notify(`Loaded ${slotName(slot).toLowerCase()}.`);
                onDone?.();
              } catch (e) {
                notify((e as Error).message, "bad");
              }
            }}
          >
            <span className="slot-name">{slotName(slot)}</span>
            <span className="slot-label">{info ? info.label : "empty"}</span>
            {info && <span className="slot-date">saved {new Date(info.savedAt).toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A button that opens a file picker and loads a .vamps.json export. */
export function ImportButton({ className = "menu-button", onDone }: { className?: string; onDone?: () => void }) {
  const loadGame = useStore((s) => s.loadGame);
  const notify = useStore((s) => s.notify);
  return (
    <label className={className} role="button" tabIndex={0}>
      <span className="menu-button-label">Import Save</span>
      <input
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            loadGame(await importFromFile(file));
            notify("Campaign imported.");
            onDone?.();
          } catch (err) {
            notify((err as Error).message, "bad");
          }
        }}
      />
    </label>
  );
}

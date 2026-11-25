import { useState } from "react";
import { exportToFile } from "../../../save/storage";
import { Panel } from "../../components/Panel";
import { VolumeSettings } from "../../components/VolumeSettings";
import { ImportButton, SaveSlots } from "../../components/SaveSlots";
import { useStore } from "../../store";

type Sub = "none" | "save" | "load";

/**
 * The menu on the globe and in battle. `saving`: there is a campaign here to
 * save (not in a skirmish). `wait`: events are playing back, so nothing that
 * saves or leaves until they end.
 */
export function PauseMenu({ onClose, title = "Paused", saving = true, wait = false }: { onClose: () => void; title?: string; saving?: boolean; wait?: boolean }) {
  const [sub, setSub] = useState<Sub>("none");
  const quitToMenu = useStore((s) => s.quitToMenu);
  const notify = useStore((s) => s.notify);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pause-layout" onClick={(e) => e.stopPropagation()}>
        <Panel title={title} className="modal">
          <div className="modal-actions">
            <button className="menu-button" onClick={onClose}><span className="menu-button-label">Resume</span></button>
            {saving && <button className={`menu-button${sub === "save" ? " active" : ""}`} disabled={wait} onClick={() => setSub(sub === "save" ? "none" : "save")}>
              <span className="menu-button-label">Save</span>
            </button>}
            <button className={`menu-button${sub === "load" ? " active" : ""}`} disabled={wait} onClick={() => setSub(sub === "load" ? "none" : "load")}>
              <span className="menu-button-label">Load</span>
            </button>
            {saving && <button
              className="menu-button"
              disabled={wait}
              onClick={() => {
                const { game, saveBattle } = useStore.getState();
                saveBattle();
                if (game) exportToFile(game);
                notify("Save file downloaded. Import it on another computer to continue there.");
              }}
            >
              <span className="menu-button-label">Export to File</span>
            </button>}
            {!wait && <ImportButton onDone={onClose} />}
            <button className="menu-button" disabled={wait} onClick={quitToMenu}><span className="menu-button-label">Quit to Main Menu</span></button>
          </div>
          <VolumeSettings />
        </Panel>
        {sub !== "none" && (
          <Panel title={sub === "save" ? "Save campaign" : "Load campaign"} className="modal slots-panel">
            <SaveSlots mode={sub} onDone={sub === "load" ? onClose : undefined} />
          </Panel>
        )}
      </div>
    </div>
  );
}

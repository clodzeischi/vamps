import { useState } from "react";
import { exportToFile } from "../../../save/storage";
import { Panel } from "../../components/Panel";
import { ImportButton, SaveSlots } from "../../components/SaveSlots";
import { useStore } from "../../store";

type Sub = "none" | "save" | "load";

export function PauseMenu({ onClose }: { onClose: () => void }) {
  const [sub, setSub] = useState<Sub>("none");
  const quitToMenu = useStore((s) => s.quitToMenu);
  const notify = useStore((s) => s.notify);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pause-layout" onClick={(e) => e.stopPropagation()}>
        <Panel title="Paused" className="modal">
          <div className="modal-actions">
            <button className="menu-button" onClick={onClose}><span className="menu-button-label">Resume</span></button>
            <button className={`menu-button${sub === "save" ? " active" : ""}`} onClick={() => setSub(sub === "save" ? "none" : "save")}>
              <span className="menu-button-label">Save</span>
            </button>
            <button className={`menu-button${sub === "load" ? " active" : ""}`} onClick={() => setSub(sub === "load" ? "none" : "load")}>
              <span className="menu-button-label">Load</span>
            </button>
            <button
              className="menu-button"
              onClick={() => {
                const g = useStore.getState().game;
                if (g) exportToFile(g);
                notify("Save file downloaded. Import it on another computer to continue there.");
              }}
            >
              <span className="menu-button-label">Export to File</span>
            </button>
            <ImportButton onDone={onClose} />
            <button className="menu-button" onClick={quitToMenu}><span className="menu-button-label">Quit to Main Menu</span></button>
          </div>
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

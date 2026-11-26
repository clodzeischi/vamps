// The inventory's window (an agent's name with ◀ ▶ to step through the squad)
// and the stat sheet beside it.
import { useRef, type ReactNode } from "react";
import { CloseX } from "./CloseX";

/** The window: the agent in the middle of its head, ◀ ▶ round the name. A press that starts and ends outside closes it (not a drag let go there). */
export function InventoryWindow({
  name,
  canStep,
  onStep,
  onClose,
  children,
}: {
  name: string;
  canStep: boolean;
  onStep: (d: 1 | -1) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const pressed = useRef(false);
  return (
    <div
      className="inv-backdrop"
      onPointerDown={(e) => {
        pressed.current = e.target === e.currentTarget;
      }}
      onClick={(e) => e.target === e.currentTarget && pressed.current && onClose()}
    >
      <section className="panel inv-window">
        <div className="inv-head">
          <h3 className="detail-title">
            <button
              className="mini"
              disabled={!canStep}
              onClick={() => onStep(-1)}
              data-tip="Previous operative"
              aria-label="Previous operative"
            >
              ◀
            </button>
            <span>{name}</span>
            <button
              className="mini"
              disabled={!canStep}
              onClick={() => onStep(1)}
              data-tip="Next operative"
              aria-label="Next operative"
            >
              ▶
            </button>
          </h3>
          <CloseX onClick={onClose} />
        </div>
        {children}
      </section>
    </div>
  );
}

/** An agent's stats beside the inventory. */
export function StatSheet({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="inv-box inv-sheet">
      <div className="inv-box-title">Operative</div>
      <div className="inv-sheet-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="kv">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

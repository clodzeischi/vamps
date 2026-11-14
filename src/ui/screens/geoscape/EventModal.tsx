import { regionById } from "../../../data/regions";
import { Panel } from "../../components/Panel";
import { money, signed } from "../../format";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

/** The oldest pending event. Time stays stopped until it is dismissed. */
export function EventModal() {
  const g = useGame();
  const dismiss = useStore((s) => s.dismissEvent);
  const selectRegion = useStore((s) => s.selectRegion);
  const focusOn = useStore((s) => s.focusOn);
  const quitToMenu = useStore((s) => s.quitToMenu);
  const e = g.events[0];
  if (!e) return null;

  const show = () => {
    // Stop the clock so the player can read what they asked to see.
    useStore.setState({ paused: true });
    if (e.pos) globe()?.flyTo(e.pos, 2.2);
    if (e.regionId && e.pos) selectRegion(e.regionId, e.pos);
    dismiss();
    if (e.refId) focusOn({ kind: e.kind === "lead" ? "lead" : "installation", id: e.refId });
  };

  const r = g.lastReport;
  return (
    <div className="modal-backdrop">
      <Panel title={e.kind === "monthly" ? "Report to the Holy See" : e.kind === "game-over" ? "Finis" : e.kind === "lead" ? "SIGINT intercept" : "Dispatch"} className={`modal event event-${e.kind}`}>
        <h3 className="event-title">{e.kind === "monthly" && r ? `Month ending ${r.month}` : e.title}</h3>
        {e.kind === "monthly" && r ? (
          <div className="report">
            <div className="kv"><span>Holy See stipend</span><span>{money(r.stipend)}</span></div>
            <div className="kv"><span>Regional contributions</span><span>{money(r.regional)}</span></div>
            <div className="kv"><span>Installations</span><span>−{money(r.running)}</span></div>
            <div className="kv"><span>Agent upkeep</span><span>−{money(r.upkeep ?? 0)}</span></div>
            <div className="kv"><span>Aircraft leases</span><span>−{money(r.leases ?? 0)}</span></div>
            <div className="kv kv-total"><span>Treasury</span><span>{money(r.balance)}</span></div>
            <div className={`kv ${r.supportChange < 0 ? "bad" : "good"}`}>
              <span>Average support</span><span>{signed(r.supportChange, 2)} this month</span>
            </div>
            {r.supportChange < -0.1 && (
              <p className="prose dim">The bloodlines' campaigns are working. Without results in the field, regions will turn on us.</p>
            )}
          </div>
        ) : (
          <p className="prose event-body">{e.body}</p>
        )}
        {e.regionId && <p className="event-region">{regionById(e.regionId)?.name}</p>}
        <div className="modal-row">
          {e.kind === "game-over" ? (
            <button className="action primary" onClick={quitToMenu}>
              <span className="action-title">Return to the main menu</span>
            </button>
          ) : (
            <>
              {e.pos && (
                <button className="action" onClick={show}>
                  <span className="action-title">Show on the globe</span>
                </button>
              )}
              <button className="action primary" onClick={dismiss} autoFocus>
                <span className="action-title">Continue</span>
              </button>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

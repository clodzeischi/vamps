import { useEffect } from "react";
import { sfx } from "../../../audio/sfx";
import { regionById } from "../../../data/regions";
import { DEBT_MONTHS_TO_DISSOLVE, HOSTILE_LOSS, HOSTILE_WARNING } from "../../../sim/economy";
import { Panel } from "../../components/Panel";
import { money, signed } from "../../format";
import { globe } from "../../globe";
import { focusFor, useGame, useStore } from "../../store";

const HEADINGS: Partial<Record<string, string>> = {
  monthly: "Report to the Holy See",
  "game-over": "Finis",
  lead: "SIGINT intercept",
  arrival: "Orders",
  debrief: "Debrief",
  coverup: "Cover-up opportunity",
  "coverup-result": "Cover-up",
  vampire: "Bloodline activity",
  research: "Laboratories",
  debt: "The Holy See",
};

const ODDS_WORDS = { good: "Good odds", fair: "Fair odds", poor: "Poor odds" } as const;

/** A team on the ground waits for one decision. */
function ArrivalOrders({ missionId }: { missionId: string }) {
  const g = useGame();
  const decide = useStore((s) => s.decide);
  const m = g.missions.find((x) => x.id === missionId);
  if (!m?.decision) return null;
  return (
    <>
      {m.decision.warning && <p className="prose warning"><span className="warning-mark">Something is off.</span> {m.decision.warning}</p>}
      <div className="orders">
        {m.decision.options.map((o, i) => (
          <button key={o.id} className={`action order${o.id === "abort" ? "" : " primary"}`} onClick={() => decide(m.id, o.id)} autoFocus={i === 0}>
            <span className="order-head">
              <span className="action-title">{o.label}</span>
              {o.odds && <span className={`odds odds-${o.odds}`}>{ODDS_WORDS[o.odds]}</span>}
            </span>
            <span className="action-meta">{o.detail}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** The oldest pending event. Time stays stopped until it is dismissed. */
export function EventModal() {
  const g = useGame();
  const dismiss = useStore((s) => s.dismissEvent);
  const selectRegion = useStore((s) => s.selectRegion);
  const focusOn = useStore((s) => s.focusOn);
  const quitToMenu = useStore((s) => s.quitToMenu);
  const e = g.events[0];
  // Each dispatch sounds its cue once, as it comes up.
  useEffect(() => {
    if (e) sfx.playEvent(e.kind);
  }, [e?.id]);
  if (!e) return null;

  const show = () => {
    // Stop the clock so the player can read what they asked to see.
    useStore.setState({ paused: true });
    if (e.pos) globe()?.flyTo(e.pos, 2.2);
    if (e.regionId && e.pos) selectRegion(e.regionId, e.pos);
    dismiss();
    const f = e.refId ? focusFor(g, e.refId) : null;
    if (f) focusOn(f);
  };

  const r = g.lastReport;
  return (
    <div className="modal-backdrop">
      <Panel title={HEADINGS[e.kind] ?? "Dispatch"} className={`modal event event-${e.kind}`}>
        <h3 className="event-title">{e.kind === "monthly" && r ? `Month ending ${r.month}` : e.title}</h3>
        {e.kind === "monthly" && r ? (
          <div className="report">
            <div className="kv"><span>Holy See stipend</span><span>{money(r.stipend)}</span></div>
            <div className="kv"><span>Regional contributions</span><span>{money(r.regional)}</span></div>
            <div className="kv"><span>Installations</span><span>−{money(r.running)}</span></div>
            <div className="kv"><span>Agent upkeep</span><span>−{money(r.upkeep ?? 0)}</span></div>
            <div className="kv"><span>Aircraft</span><span>−{money(r.leases ?? 0)}</span></div>
            <div className="kv"><span>Scientists & engineers</span><span>−{money(r.staff ?? 0)}</span></div>
            {(r.containment ?? 0) > 0 && <div className="kv"><span>Containment</span><span>−{money(r.containment!)}</span></div>}
            {(r.media ?? 0) > 0 && <div className="kv"><span>Media campaigns</span><span>−{money(r.media)}</span></div>}
            <div className="kv kv-total"><span>Treasury</span><span>{money(r.balance)}</span></div>
            <div className={`kv ${r.supportChange < 0 ? "bad" : "good"}`}>
              <span>Average support</span><span>{signed(r.supportChange, 2)} this month</span>
            </div>
            {r.hostile !== undefined && (
              <div className={`kv ${r.hostile >= HOSTILE_WARNING ? "bad" : ""}`}>
                <span>Hostile regions</span><span>{r.hostile} ({HOSTILE_LOSS} loses the war)</span>
              </div>
            )}
            {r.balance < 0 && (
              <p className="prose warning">
                In the red: {g.debtMonths} of {DEBT_MONTHS_TO_DISSOLVE} months before the Holy See dissolves the Order.
              </p>
            )}
            {r.supportChange < -0.1 && (
              <p className="prose dim">The bloodlines' campaigns are working. Without results in the field, regions will turn on us.</p>
            )}
          </div>
        ) : (
          e.body.split("\n\n").map((para, i) => <p key={i} className="prose event-body">{para}</p>)
        )}
        {e.effects && <p className="effects">{e.effects}</p>}
        {e.improved && e.improved.length > 0 && (
          <div className="improved">
            <span className="improved-head">Experience</span>
            {e.improved.map((l) => <span key={l} className="improved-line">{l}</span>)}
          </div>
        )}
        {e.casualties && (e.casualties.dead.length > 0 || e.casualties.wounded.length > 0) && (
          <div className="casualties">
            {e.casualties.dead.length > 0 && <div className="kv bad"><span>Fallen</span><span>{e.casualties.dead.join(", ")}</span></div>}
            {e.casualties.wounded.length > 0 && <div className="kv"><span>Wounded</span><span className="tone-warn-text">{e.casualties.wounded.join(", ")}</span></div>}
          </div>
        )}
        {e.regionId && <p className="event-region">{regionById(e.regionId)?.name}</p>}
        {e.kind === "arrival" && e.refId ? (
          <ArrivalOrders missionId={e.refId} />
        ) : (
        <div className="modal-row">
          {e.kind === "game-over" ? (
            <button className="action primary" onClick={quitToMenu}>
              <span className="action-title">Return to the main menu</span>
            </button>
          ) : (
            <>
              {e.kind === "research" && (
                <button className="action" onClick={() => { dismiss(); useStore.getState().openResearch(); }}>
                  <span className="action-title">Choose what's next</span>
                </button>
              )}
              {e.pos && (
                <button className={`action${e.kind === "coverup" ? " primary" : ""}`} onClick={show}>
                  <span className="action-title">{e.kind === "coverup" ? "Review the offer" : "Show on the globe"}</span>
                </button>
              )}
              <button className={`action${e.kind === "coverup" ? "" : " primary"}`} onClick={dismiss} autoFocus>
                <span className="action-title">{e.kind === "coverup" ? "Later" : "Continue"}</span>
              </button>
            </>
          )}
        </div>
        )}
      </Panel>
    </div>
  );
}

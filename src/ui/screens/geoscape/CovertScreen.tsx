// Covert actions, shown in Operations: every off-the-books operation under way
// and every offer waiting. Anything under way can be called off at a small cost
// in secrecy, which spares it the final roll (and any chance of failure).
// Cover-ups, asset calls and disinformation (docs/design/covert.md), and every
// HUMINT asset we pay.
import { regionById } from "../../../data/regions";
import { ASSET_KINDS, dismissAsset, monthlyHumintCost } from "../../../sim/intel/humint";
import { money } from "../../format";
import {
  ABORT_SECRECY,
  abortCoverUp,
  coverUpReward,
  coverUpTerms,
  covertLabel,
} from "../../../sim/campaign/coverups";
import { type CoverUp, agentName } from "../../../sim/core/state";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";
import { timeLeft } from "./FocusPanels";

function Running({ c }: { c: CoverUp }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const agents = g.agents.filter((a) => c.agentIds.includes(a.id));
  const progress = Math.min(1, (g.time - c.startedAt) / Math.max(1, c.doneAt - c.startedAt));
  return (
    <div className="project active">
      <div className="project-head">
        <span className="project-name">{c.title}</span>
        <span className="project-eta">{timeLeft(c.doneAt - g.time)} left</span>
      </div>
      <span className="progress">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      <span className="project-text">
        {covertLabel(c)} · {regionById(c.regionId)?.name} ·{" "}
        {agents.length ? agents.map((a) => `${agentName(a)}`).join(", ") : "money and contacts"} ·{" "}
        {coverUpReward(c)} if it works
      </span>
      <div className="project-staff">
        <button
          className="mini"
          onClick={() => command((s) => abortCoverUp(s, c.id), `Called off: ${c.title}.`)}
          title="The money is spent; the operatives come home"
        >
          Call it off (Secrecy −{ABORT_SECRECY})
        </button>
      </div>
    </div>
  );
}

function Offer({ c }: { c: CoverUp }) {
  const close = useStore((s) => s.closeOverlay);
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const selectRegion = useStore((s) => s.selectRegion);
  const review = () => {
    close();
    globe()?.flyTo(c.pos, 2.2);
    selectRegion(c.regionId, c.pos);
    focusOn({ kind: "coverup", id: c.id });
  };
  return (
    <div className="project choice static">
      <span className="project-head">
        <span className="project-name">{c.title}</span>
        <span className="project-eta">lapses in {timeLeft(c.expiresAt - g.time)}</span>
      </span>
      <span className="project-text">
        {covertLabel(c)} · {regionById(c.regionId)?.name} · {coverUpTerms(c)}
      </span>
      <span className="project-starts">
        <button className="mini primary" onClick={review}>
          Review the offer
        </button>
      </span>
    </div>
  );
}

/** Every asset we pay, by region. */
function Assets() {
  const g = useGame();
  const command = useStore((s) => s.command);
  const close = useStore((s) => s.closeOverlay);
  const selectRegion = useStore((s) => s.selectRegion);
  const assets = [...g.assets].sort(
    (a, b) => a.regionId.localeCompare(b.regionId) || a.kind.localeCompare(b.kind),
  );
  return (
    <div className="covert-assets">
      <h4 className="section-title">
        Agents{" "}
        <span className="tab-count">
          {assets.length}
          {assets.length ? `, ${money(monthlyHumintCost(g))}/mo` : ""}
        </span>
      </h4>
      {assets.length ? (
        <ul className="list compact">
          {assets.map((a) => (
            <li key={a.id} className="asset-row">
              <span className={`dot dot-asset dot-asset-${a.kind}`} />
              <button
                className="asset-who link"
                onClick={() => {
                  close();
                  globe()?.flyTo(a.pos, 2.2);
                  selectRegion(a.regionId, a.pos);
                }}
              >
                {a.name}, {a.role}, {a.city}{" "}
                <span className="row-note">
                  {ASSET_KINDS[a.kind].name} · {regionById(a.regionId)?.name} · {money(a.monthly)}
                  /mo
                </span>
              </button>
              <button
                className="mini"
                onClick={() => command((s) => dismissAsset(s, a.id), `${a.name} let go.`)}
              >
                Let go
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="small dim"
          data-tip="When a source comes forward (through SIGINT, an informant or a volunteer), the team can recruit them instead of debriefing them."
        >
          None.
        </p>
      )}
    </div>
  );
}

/** Operations' covert column: offers waiting, what's under way (each can be called off), and our agents. */
export function CovertColumn() {
  const g = useGame();
  const running = g.coverUps.filter((c) => c.startedAt).sort((a, b) => a.doneAt - b.doneAt);
  const offers = g.coverUps.filter((c) => !c.startedAt).sort((a, b) => a.expiresAt - b.expiresAt);
  return (
    <>
      <h4
        className="section-title"
        data-tip="Cover-ups come more often after noise and when secrecy is low; agents call when they need us."
      >
        Offers <span className="tab-count">{offers.length}</span>
      </h4>
      <div className="project-list">
        {offers.map((c) => (
          <Offer key={c.id} c={c} />
        ))}
        {!offers.length && <p className="small dim">None.</p>}
      </div>
      <h4
        className="section-title"
        data-tip="Anything under way can be called off at any time: the money is spent and a little secrecy is lost, but nothing can fail or backfire."
      >
        Under way <span className="tab-count">{running.length}</span>
      </h4>
      <div className="project-list">
        {running.map((c) => (
          <Running key={c.id} c={c} />
        ))}
        {!running.length && <p className="small dim">None.</p>}
      </div>
      <Assets />
    </>
  );
}

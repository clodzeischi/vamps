// Covert actions: every off-the-books operation under way and every offer
// waiting, in one place. Anything under way can be called off at a small cost
// in secrecy, which spares it the final roll (and any chance of failure).
// Cover-ups now; disinformation and HUMINT asset calls will join them
// (docs/WEB_PORT.md 3.8).
import { regionById } from "../../../data/regions";
import { ASSET_KINDS, dismissAsset, monthlyHumintCost } from "../../../sim/humint";
import { money } from "../../format";
import { ABORT_SECRECY, abortCoverUp, coverUpChance, coverUpTerms } from "../../../sim/coverups";
import { type CoverUp } from "../../../sim/state";
import { Panel } from "../../components/Panel";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";
import { timeLeft } from "./FocusPanels";

const pct = (p: number) => `${Math.round(p * 100)}%`;

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
      <span className="progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /></span>
      <span className="project-text">
        Cover-up · {regionById(c.regionId)?.name} · {agents.length ? agents.map((a) => `${a.sister ? "Sr." : "Br."} ${a.name}`).join(", ") : "money and contacts"} ·
        {" "}{pct(coverUpChance(g, c, agents))} to work, Secrecy +{c.gain} if it does
      </span>
      <div className="project-staff">
        <span className="td-dim">Calling it off avoids the risk of failure.</span>
        <button className="mini" onClick={() => command((s) => abortCoverUp(s, c.id), `Called off: ${c.title}.`)} title="The money is spent; the agents come home">
          Call it off (Secrecy −{ABORT_SECRECY})
        </button>
      </div>
    </div>
  );
}

function Offer({ c }: { c: CoverUp }) {
  const g = useGame();
  const close = useStore((s) => s.closeCovert);
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
      <span className="project-text">Cover-up · {regionById(c.regionId)?.name} · {coverUpTerms(c)}</span>
      <span className="project-starts">
        <button className="mini primary" onClick={review}>Review the offer</button>
      </span>
    </div>
  );
}

/** Every asset we pay, by region. */
function Assets() {
  const g = useGame();
  const command = useStore((s) => s.command);
  const close = useStore((s) => s.closeCovert);
  const selectRegion = useStore((s) => s.selectRegion);
  const assets = [...g.assets].sort((a, b) => a.regionId.localeCompare(b.regionId) || a.kind.localeCompare(b.kind));
  return (
    <div className="covert-assets">
      <h4 className="section-title">
        HUMINT assets <span className="tab-count">{assets.length}, {money(monthlyHumintCost(g))}/mo</span>
      </h4>
      {assets.length ? (
        <ul className="list compact">
          {assets.map((a) => (
            <li key={a.id} className="asset-row">
              <span className={`dot dot-asset dot-asset-${a.kind}`} />
              <button className="asset-who link" onClick={() => { close(); globe()?.flyTo(a.pos, 2.2); selectRegion(a.regionId, a.pos); }}>
                {a.name}, {a.role}, {a.city} <span className="row-note">{ASSET_KINDS[a.kind].name} · {regionById(a.regionId)?.name} · {money(a.monthly)}/mo</span>
              </button>
              <button className="mini" onClick={() => command((s) => dismissAsset(s, a.id), `${a.name} let go.`)}>Let go</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small dim">None yet. When a source comes forward (through SIGINT, an informant or a volunteer), the team can recruit them instead of debriefing them.</p>
      )}
    </div>
  );
}

export function CovertScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeCovert);
  const running = g.coverUps.filter((c) => c.startedAt).sort((a, b) => a.doneAt - b.doneAt);
  const offers = g.coverUps.filter((c) => !c.startedAt).sort((a, b) => a.expiresAt - b.expiresAt);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Panel title="Covert actions" className="modal research-screen">
        <div className="base-head">
          <h3 className="event-title">Off the books</h3>
          <span className="td-dim">{running.length} under way · {offers.length} offer{offers.length === 1 ? "" : "s"} waiting · Secrecy {Math.round(g.secrecy)}</span>
          <button className="mini" onClick={close}>Close ✕</button>
        </div>
        <p className="small dim research-note">
          Anything under way can be called off at any time. The money is spent and a little secrecy is lost, but there is no
          final roll: nothing can fail or backfire.
        </p>
        <div className="research-grid">
          <div className="research-col">
            <h4 className="section-title">Under way</h4>
            {running.map((c) => <Running key={c.id} c={c} />)}
            {!running.length && <p className="small dim">Nothing under way.</p>}
          </div>
          <div className="research-col">
            <h4 className="section-title">Offers</h4>
            <div className="project-list">
              {offers.map((c) => <Offer key={c.id} c={c} />)}
              {!offers.length && <p className="small dim">No offers waiting. They come more often after noise, and when secrecy is low.</p>}
            </div>
          </div>
        </div>
        <Assets />
      </Panel>
    </div>
  );
}

// The six bloodlines: what we know of each, where its lair is, which have fallen.
import { AGNES, BLOODLINES } from "../../../data/bloodlines";
import { ELDER_BIO_INTEL, ELDER_NAME_INTEL, ELDERS } from "../../../data/people";
import { Portrait } from "../../components/Portrait";
import { regionById } from "../../../data/regions";
import { destroyedCount, lairLocked } from "../../../sim/bloodlines";
import { ACT_NAMES, lesserBroken, SIGILS_TO_RETURN } from "../../../sim/story";
import { formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

export function BloodlinesScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeBloodlines);
  const focusOn = useStore((s) => s.focusOn);
  const selectRegion = useStore((s) => s.selectRegion);
  const fallen = destroyedCount(g);

  const showLair = (siteId: string) => {
    const site = g.sites.find((x) => x.id === siteId);
    if (!site) return;
    close();
    globe()?.flyTo(site.pos, 2.2);
    selectRegion(site.regionId, site.pos);
    focusOn({ kind: "site", id: site.id });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Panel title="The bloodlines" className="modal bloodlines-screen">
        <div className="base-head">
          <h3 className="event-title">Six sigils</h3>
          <span className="td-dim">{fallen ? `${fallen} destroyed, ${BLOODLINES.length - fallen} remain` : "None destroyed yet"}</span>
          <button className="mini" onClick={close}>Close ✕</button>
        </div>
        <p className="small dim research-note">
          Missions and interrogations teach us about a bloodline. When we know enough (100), we find its lair; destroy the lair
          and the bloodline dies with it. The survivors grow bolder with each one that falls.
        </p>
        <p className="small research-note">
          {ACT_NAMES[g.story.act]}.{" "}
          {g.story.act === 1 && "Agnes of Toulouse and the Serpenta Sigil are our quarry, and far beyond us."}
          {g.story.act === 2 && `Break ${SIGILS_TO_RETURN} of the five lesser sigils to reopen Europe: ${lesserBroken(g)} of ${SIGILS_TO_RETURN} so far.`}
          {g.story.act === 3 && "Europe is open. Find Agnes and end it at Montségur."}
        </p>
        <div className="sigil-grid">
          {BLOODLINES.map((b) => {
            const st = g.bloodlines[b.id];
            const intel = Math.round(g.intel[b.id] ?? 0);
            const lair = st?.lairId ? g.sites.find((x) => x.id === st.lairId) : null;
            const locked = !st?.destroyedAt && lairLocked(g, b.id);
            const homes = b.homeRegions.map((r) => regionById(r)?.name).filter(Boolean);
            // We learn who leads a line as we learn about it. Agnes we know from the start.
            const elder = ELDERS[b.id]!;
            const known = b.id === AGNES || intel >= ELDER_NAME_INTEL || !!lair || !!st?.destroyedAt;
            const told = b.id === AGNES || intel >= ELDER_BIO_INTEL || !!lair || !!st?.destroyedAt;
            return (
              <div key={b.id} className={`sigil${st?.destroyedAt ? " destroyed" : lair ? " found" : ""}`}>
                <div className="elder">
                  <Portrait person={elder} size="sm" hidden={!told} />
                  <div className="elder-text">
                    <span className="elder-name">{known ? elder.name : "Its eldest: unknown"}</span>
                    <span className="small dim">{known ? elder.title : `We will learn more at ${ELDER_NAME_INTEL} intel.`}</span>
                    {told && <span className="elder-bio">{elder.bio}</span>}
                    {known && !told && <span className="small dim">More at {ELDER_BIO_INTEL} intel.</span>}
                  </div>
                </div>
                <div className="project-head">
                  <span className="project-name">{b.name}</span>
                  <span className="project-eta">
                    {st?.destroyedAt ? `destroyed ${formatDate(st.destroyedAt)}` : lair ? "lair found" : locked && intel >= 100 ? "out of reach" : intel ? `${intel} / 100` : "unknown"}
                  </span>
                </div>
                {!st?.destroyedAt && <span className="progress"><span style={{ width: `${intel}%` }} /></span>}
                <span className="project-text" title={homes.join(", ")}>
                  {homes.slice(0, 4).join(", ")}{homes.length > 4 ? ` and ${homes.length - 4} more` : ""}
                </span>
                {locked && (
                  <span className="small dim">
                    {g.story.act === 1 ? "Her lair is beyond anything we can reach." : `Out of reach until Europe reopens (${lesserBroken(g)} of ${SIGILS_TO_RETURN} sigils).`}
                  </span>
                )}
                {lair && !st?.destroyedAt && (
                  <button className="mini primary" onClick={() => showLair(lair.id)}>
                    The lair: {lair.city}{lair.missionId ? " (team on the way)" : ""}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

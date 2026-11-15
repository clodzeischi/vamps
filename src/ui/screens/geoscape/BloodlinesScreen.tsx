// The six bloodlines: what we know of each, where its lair is, which have fallen.
import { BLOODLINES } from "../../../data/bloodlines";
import { regionById } from "../../../data/regions";
import { destroyedCount } from "../../../sim/bloodlines";
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
        <div className="sigil-grid">
          {BLOODLINES.map((b) => {
            const st = g.bloodlines[b.id];
            const intel = Math.round(g.intel[b.id] ?? 0);
            const lair = st?.lairId ? g.sites.find((x) => x.id === st.lairId) : null;
            const homes = b.homeRegions.map((r) => regionById(r)?.name).filter(Boolean);
            return (
              <div key={b.id} className={`sigil${st?.destroyedAt ? " destroyed" : lair ? " found" : ""}`}>
                <div className="project-head">
                  <span className="project-name">{b.name}</span>
                  <span className="project-eta">
                    {st?.destroyedAt ? `destroyed ${formatDate(st.destroyedAt)}` : lair ? "lair found" : intel ? `${intel} / 100` : "unknown"}
                  </span>
                </div>
                {!st?.destroyedAt && <span className="progress"><span style={{ width: `${intel}%` }} /></span>}
                <span className="project-text" title={homes.join(", ")}>
                  {homes.slice(0, 4).join(", ")}{homes.length > 4 ? ` and ${homes.length - 4} more` : ""}
                </span>
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

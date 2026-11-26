// The focus panel: whatever is selected on the globe (a lead, a site, a team,
// an installation, a cover-up, an aircraft), one panel for each kind.
import { craftById, leadById, missionById, siteById } from "../../../../sim/core/state";
import { Panel } from "../../../components/Panel";
import { useGame, useStore } from "../../../store";
import { LeadPanel } from "./LeadPanel";
import { SitePanel } from "./SitePanel";
import { CoverUpPanel } from "./CoverUpPanel";
import { MissionPanel } from "./MissionPanel";
import { AircraftPanel } from "./AircraftPanel";
import { InstallationPanel } from "./InstallationPanel";

export function FocusPanel() {
  const g = useGame();
  const focus = useStore((s) => s.focus);
  if (!focus) return null;
  if (focus.kind === "lead") {
    const lead = leadById(g, focus.id);
    if (!lead)
      return (
        <Panel title="Lead">
          <p className="prose dim">This lead has gone cold.</p>
        </Panel>
      );
    return <LeadPanel lead={lead} />;
  }
  if (focus.kind === "site") {
    const site = siteById(g, focus.id);
    return site ? (
      <SitePanel site={site} />
    ) : (
      <Panel title="Site">
        <p className="prose dim">They have moved on.</p>
      </Panel>
    );
  }
  if (focus.kind === "coverup") {
    const c = g.coverUps.find((x) => x.id === focus.id);
    return c ? (
      <CoverUpPanel key={c.id} c={c} />
    ) : (
      <Panel title="Cover-up">
        <p className="prose dim">That's over now.</p>
      </Panel>
    );
  }
  if (focus.kind === "mission") {
    const m = missionById(g, focus.id);
    return m ? (
      <MissionPanel m={m} />
    ) : (
      <Panel title="Team">
        <p className="prose dim">The team is home.</p>
      </Panel>
    );
  }
  if (focus.kind === "aircraft") {
    const a = craftById(g, focus.id);
    return a ? (
      <AircraftPanel key={a.id} c={a} />
    ) : (
      <Panel title="Aircraft">
        <p className="prose dim">That aircraft is gone.</p>
      </Panel>
    );
  }
  return <InstallationPanel id={focus.id} />;
}

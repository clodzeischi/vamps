// A team in the field, in focus.
import { timeLeft } from "../../../format";
import { KIT } from "../../../../data/kit";
import { missionCraftName } from "../../../../sim/missions/dispatch";
import { missionAgents } from "../../../../sim/missions/common";
import { recallTeam } from "../../../../sim/missions/haul";
import { startMission } from "../../../../sim/missions/arrival";
import {
  type Mission,
  agentName,
  installationById,
  leadById,
  siteById,
} from "../../../../sim/core/state";
import { Panel } from "../../../components/Panel";
import { globe } from "../../../globe";
import { useGame, useStore } from "../../../store";
import { ActionButton } from "../../../components/ActionButton";
import { phaseWord } from "./shared";

export function MissionPanel({ m }: { m: Mission }) {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  const command = useStore((s) => s.command);
  const base = installationById(g, m.baseId);
  const target = m.target.kind === "lead" ? leadById(g, m.target.id) : siteById(g, m.target.id);
  return (
    <Panel title="Team in the field">
      <h3 className="lead-title">{m.title}</h3>
      <div className="kv">
        <span>Status</span>
        <span>{phaseWord(g, m)}</span>
      </div>
      <div className="kv">
        <span>Aircraft</span>
        <span>
          {missionCraftName(g, { aircraftId: m.aircraftId, escorts: m.escorts })} from{" "}
          {base?.name.replace("Operational Base ", "")}
        </span>
      </div>
      {(m.wings ?? [])
        .filter((w) => w.landed)
        .map((w) => (
          <div key={w.id} className="kv small">
            <span>Joined</span>
            <span>
              {missionCraftName(g, w)} from {installationById(g, w.baseId)?.name ?? "?"}
            </span>
          </div>
        ))}
      <div className="kv">
        <span>Kit</span>
        <span>{KIT[m.kit].name}</span>
      </div>
      <div className="kv kv-block">
        <span>{m.wings?.some((w) => w.landed) ? "On the ground" : "Team"}</span>
        <span>
          {missionAgents(g, m)
            .map((a) => `${agentName(a)}`)
            .join(", ") || "none"}
        </span>
      </div>
      {(m.wings ?? [])
        .filter((w) => !w.landed)
        .map((w) => (
          <div key={w.id} className="kv small">
            <span>
              {missionCraftName(g, w)} from {installationById(g, w.baseId)?.name ?? "?"}
            </span>
            <span>
              {w.agentIds.length} aboard, lands in {timeLeft(w.arriveAt - g.time)}{" "}
              <button
                className="mini"
                onClick={() => command((s) => recallTeam(s, m.id, w.id), "Turning back.")}
              >
                Turn back
              </button>
            </span>
          </div>
        ))}
      {m.phase === "outbound" && (
        <ActionButton
          icon="close"
          label="Turn back"
          tip={[
            (m.wings ?? []).some((w) => !w.landed)
              ? "The team turns around; the next team in the air carries on."
              : "The team turns around where it is. The target stays open for another try.",
          ]}
          onClick={() => command((s) => recallTeam(s, m.id), "Turning back.")}
        />
      )}
      {m.phase === "on-site" && m.waiting && (
        <ActionButton
          primary
          icon="status-field"
          label="Start mission"
          tip={[
            `With the ${missionAgents(g, m).length} on the ground now.`,
            "Teams still in the air turn back.",
          ]}
          onClick={() => command((s) => startMission(s, m.id))}
        />
      )}
      {target && m.phase !== "returning" && (
        <button
          className="action"
          onClick={() => {
            globe()?.flyTo(target.pos, 2.0);
            focusOn({ kind: m.target.kind, id: target.id });
          }}
        >
          <span className="action-title">Show the target</span>
        </button>
      )}
    </Panel>
  );
}

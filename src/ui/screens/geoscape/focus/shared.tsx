// Pieces the focus panels share: time left, the dispatch button, a mission's phase.
import { timeLeft } from "../../../format";
import { bloodlineById } from "../../../../data/bloodlines";
import { joinable, missionCraftName } from "../../../../sim/missions/missions";
import { isReady, type Mission, missionById } from "../../../../sim/core/state";
import { useGame, useStore } from "../../../store";
import { ActionButton } from "../../../components/ActionButton";

/** "Dispatch a team" for a lead or site, or what the team on it is doing. */
export function DispatchButton({
  target,
  missionId,
  inReach,
}: {
  target: { kind: "lead" | "site"; id: string };
  missionId: string | null;
  inReach: boolean;
}) {
  const g = useGame();
  const anyBase = g.installations.some((i) => i.kind === "base" && isReady(g, i));
  const openDispatch = useStore((s) => s.openDispatch);
  const focusOn = useStore((s) => s.focusOn);
  const m = missionId ? missionById(g, missionId) : null;
  if (m)
    return (
      <>
        <ActionButton
          icon="status-field"
          label={`Team ${phaseWord(g, m)}`}
          tip={[`${missionCraftName(g, m)}, ${m.agentIds.length} aboard`]}
          onClick={() => focusOn({ kind: "mission", id: m.id })}
        />
        {joinable(m) && (
          <ActionButton
            icon="helicopter"
            label="Send another team"
            tip={[
              "From any base in reach, on our own aircraft, in the same kit.",
              "It lands beside the team; start the mission when you choose.",
            ]}
            onClick={() => openDispatch(target)}
          />
        )}
      </>
    );
  return (
    <ActionButton
      primary
      icon={inReach ? "helicopter" : "jet"}
      blocker={!inReach && !anyBase ? "No base to send anyone from." : null}
      label={
        target.kind === "site"
          ? target.id.startsWith("lair-")
            ? "Plan the assault"
            : "Plan a strike"
          : inReach
            ? "Dispatch a team"
            : "Send an operative by charter"
      }
      tip={[
        inReach
          ? "Choose the team, its kit and its aircraft"
          : "Out of our aircraft's reach: a chartered jet can take two operatives (armed), an airline one (unarmed)",
      ]}
      onClick={() => openDispatch(target)}
    />
  );
}

export function phaseWord(g: { time: number }, m: Mission) {
  if (m.phase === "outbound")
    return g.time < m.departAt ? "boarding" : `en route, ${timeLeft(m.arriveAt - g.time)} out`;
  if (m.phase === "on-site")
    return m.option
      ? `at work, ${timeLeft(m.workUntil - g.time)} left`
      : m.haul
        ? "loading the haul"
        : m.waiting
          ? "on the ground, holding for the others"
          : "on the ground, waiting for orders";
  return `flying home, ${timeLeft(m.returnAt - g.time)}`;
}

export const bloodline = (id: string) => bloodlineById(id);

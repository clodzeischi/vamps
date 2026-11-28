// The battle's objectives, top right.
import { nightSight, SIGHT, VAMPIRE_SIGHT } from "../../../tactical/rules";
import { enemies, seenByAgents, type Battle } from "../../../tactical/battle";
import { ObjectivesText, type ObjectiveLine } from "../../components/Objectives";

/**
 * What the team is here to do, as plain text at the top right: the
 * battle's name and conditions, then each objective, ticked off or failed as
 * it goes.
 */
export function Objectives({ b, title, lineName }: { b: Battle; title: string; lineName: string }) {
  const killed = b.units.filter((u) => u.side === "enemy" && !u.alive).length;
  const hostage = b.units.find((u) => u.kind === "hostage");
  const torpor = b.units.filter(
    (u) => u.side === "enemy" && u.alive && u.torpor && seenByAgents(b, u, u),
  ).length;
  const carried = b.loot.filter((l) => l.by).length;
  const lines: ObjectiveLine[] = [
    {
      text: `Destroy every thrall and vampire${killed ? ` (${killed} down)` : ""}`,
      state: !enemies(b).length ? "done" : undefined,
      tip: "A vampire in torpor still counts: finish it, burn it, or take it alive.",
    },
  ];
  if (torpor)
    lines.push({
      text: `Finish the vampire${torpor > 1 ? "s" : ""} in torpor before ${torpor > 1 ? "they rise" : "it rises"}`,
    });
  if (hostage) {
    const freed = hostage.side === "agent";
    lines.push({
      text: !hostage.alive
        ? "The prisoner is dead"
        : hostage.evacuated
          ? "The prisoner is out"
          : freed
            ? "Keep the prisoner alive"
            : "Rescue the prisoner",
      state: !hostage.alive ? "failed" : hostage.evacuated ? "done" : undefined,
      tip: "A vampire stands guard over them and never leaves its post. Win with the prisoner alive, or cut them loose (stand next to them) and get them to the landing zone.",
    });
  }
  if (b.loot.length)
    lines.push({
      text: `Recover the crates: ${carried} of ${b.loot.length} carried`,
      state: carried === b.loot.length ? "done" : undefined,
      optional: true,
      tip: `Walk over one to pick it up; one per operative. ${b.airlift ? "With a win, the helicopter comes back and lifts whatever is left." : "Only what the team carries out counts."}`,
    });
  lines.push({ text: "Or withdraw: everyone evacuates from the landing zone", optional: true });

  return (
    <div className="battle-objectives">
      <ObjectivesText
        title={title}
        lines={lines}
        conditions={
          <>
            {lineName} ·{" "}
            {b.night ? (
              <span
                data-tip={`In the dark we see ${nightSight(b.moon)} tiles above ground, ${SIGHT} to anything lit; vampires see ${VAMPIRE_SIGHT}`}
              >
                Night, moon {Math.round(b.moon * 100)}%
              </span>
            ) : (
              "Day"
            )}{" "}
            · Turn {b.turn} · {b.side === "agent" ? "our move" : "enemy activity"}
            {b.concealed && (
              <span
                className="concealed"
                data-tip="Unseen. Enemies notice an operative only this close (Tradecraft): the first shot gets +15 aim. Shooting or throwing gives us away; finishing a body doesn't."
              >
                {" "}
                · Concealed
              </span>
            )}
          </>
        }
      />
    </div>
  );
}

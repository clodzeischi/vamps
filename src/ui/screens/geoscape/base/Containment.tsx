// Containment: the captives held at a base, and turning one into a source.
import { FACILITIES } from "../../../../data/installations";
import { turnBlocker, turnChance, turnOperator, turnThrall } from "../../../../sim/intel/turned";
import { facilityCount } from "../../../../sim/people/personnel";
import {
  executeBlocker,
  executeCaptive,
  questioning,
  releaseBlocker,
  releaseCaptive,
} from "../../../../sim/base/research";
import { type Installation } from "../../../../sim/core/state";
import { formatDate } from "../../../../sim/core/time";
import { money } from "../../../format";
import { agentName } from "../../../status";
import { useGame, useStore } from "../../../store";
import { bloodlineName } from "./shared";

export function Containment({ base }: { base: Installation }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const captives = base.captives ?? [];
  const n = facilityCount(base, "containment");
  const cells = n * FACILITIES.containment.holds!;
  return (
    <>
      <p className="prose dim">
        Cells for thralls and vampires taken alive. Captives can be questioned (on the Research
        screen), turned, released or destroyed.
        {n > 0 && ` Upkeep ${money(n * FACILITIES.containment.upkeep!)} a month, full or empty.`}
      </p>
      <div className="cells">
        {Array.from({ length: cells }, (_, i) => {
          const c = captives[i];
          if (!c)
            return (
              <div key={i} className="cell empty">
                <span className="bay-num">Cell {i + 1}</span>
                <span className="td-dim">Empty</span>
              </div>
            );
          const vampire = c.kind === "vampire";
          const why = vampire ? executeBlocker(g, c.id) : releaseBlocker(g, c.id);
          return (
            <div key={c.id} className={`cell ${c.kind}`}>
              <span className="bay-num">Cell {i + 1}</span>
              <span className="bay-name">
                {vampire ? "Vampire" : "Thrall"} of {bloodlineName(c.bloodline)}
              </span>
              <span className="td-dim">
                taken in {c.city}, {formatDate(c.takenAt)}
                {questioning(g, c.id) ? " · being questioned" : ""}
              </span>
              <span className="cell-actions">
                {!vampire && <TurnButton captiveId={c.id} />}
                <button
                  className="mini"
                  disabled={!!why}
                  title={
                    why ??
                    (vampire
                      ? "Fire and sunlight. Its remains go to cold storage."
                      : "Hand them to a convent hospital and free the cell.")
                  }
                  onClick={() =>
                    command(
                      (s) => (vampire ? executeCaptive(s, c.id) : releaseCaptive(s, c.id)),
                      vampire
                        ? "The vampire is destroyed."
                        : "The thrall is released into the Church's care.",
                    )
                  }
                >
                  {vampire ? "Destroy" : "Release"}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Release a thrall as our source inside its bloodline: the best free operator makes the pitch (tradecraft). */
function TurnButton({ captiveId }: { captiveId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const why = turnBlocker(g, captiveId);
  const op = turnOperator(g, captiveId);
  const odds = op ? Math.round(turnChance(op.aptitudes.tradecraft) * 100) : 0;
  return (
    <button
      className="mini"
      disabled={!!why}
      onClick={() => command((s) => turnThrall(s, captiveId))}
      title={
        why ??
        `${agentName(op!)} makes the pitch (tradecraft ${op!.aptitudes.tradecraft}, about ${odds}%). Turned, it goes back to its bloodline as our informant; if not, it's released, and may tell its masters what it saw.`
      }
    >
      Turn
    </button>
  );
}

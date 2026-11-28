// Smaller parts of the battlescape's screen: the level picker on the right,
// and the result card once the battle is over.
import { levelName, type BattleMap } from "../../../tactical/map/map";
import { hostageFate, lootShare } from "../../../tactical/campaign";
import type { Battle, BattleResult } from "../../../tactical/battle";

export function LevelPicker({
  map,
  level,
  setLevel,
  upKey,
  downKey,
}: {
  map: BattleMap;
  level: number;
  setLevel: (z: number) => void;
  upKey: string;
  downKey: string;
}) {
  const top = map.levels - 1;
  return (
    <div className="battle-levels panel">
      <button
        className="mini"
        onClick={() => setLevel(Math.min(top, level + 1))}
        disabled={level >= top}
        data-tip={`Show the level above (${upKey}, or the wheel)`}
      >
        ▲
      </button>
      <span className="battle-level">{level === top ? "All levels" : levelName(map, level)}</span>
      <button
        className="mini"
        onClick={() => setLevel(Math.max(0, level - 1))}
        disabled={level <= 0}
        data-tip={`Cut away to the level below (${downKey}, or the wheel)`}
      >
        ▼
      </button>
    </div>
  );
}

const RESULT_TITLE: Record<BattleResult, string> = {
  won: "The site is clean",
  lost: "The team is lost",
  aborted: "Withdrawn",
};

export function ResultCard({
  b,
  doneLabel,
  onDone,
}: {
  b: Battle;
  doneLabel: string;
  onDone: () => void;
}) {
  const lost = b.units.filter((u) => u.side === "agent" && !u.alive).length;
  const killed = b.units.filter((u) => u.side === "enemy" && !u.alive).length;
  const taken = b.units.filter((u) => u.captured).length;
  const hostage = b.units.find((u) => u.kind === "hostage");
  const won = b.result === "won";
  const hostageSafe = hostageFate(b) === "saved";
  return (
    <div className="battle-result panel">
      <h2>{b.result && RESULT_TITLE[b.result]}</h2>
      <p className="small">
        {killed} enemies destroyed{taken ? ` · ${taken} taken alive` : ""} · {lost} operative
        {lost === 1 ? "" : "s"} lost · {b.turn} turns
      </p>
      {hostage && (
        <p className="small">
          {hostageSafe ? "The prisoner is safe." : "We could not save the prisoner."}
        </p>
      )}
      {b.loot.length > 0 && (
        <p className="small">
          Crates recovered: {Math.round(lootShare(b) * b.loot.length)} of {b.loot.length}
          {b.airlift && won ? " (the helicopter came back for the lot)" : ""}
        </p>
      )}
      <button className="mini primary" onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}

// Building: choose the kind, click the globe, then name it (a suggestion from
// the nearest city is filled in) and confirm.
import { useState } from "react";
import { INSTALLATIONS, type InstallationKind } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import { buildBlocker, MAX_NAME_LENGTH, nameBlocker, nearestPlace } from "../../../sim/commands";
import { runningCostMultiplier } from "../../../sim/economy";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { useGame, useStore } from "../../store";
import { ActionButton } from "../../components/ActionButton";

/** "Build new base" / "Build new SIGINT station": starts placing on the globe. */
export function BuildButtons() {
  const g = useGame();
  const placing = useStore((s) => s.placing);
  const startPlacing = useStore((s) => s.startPlacing);
  const cancelPlacing = useStore((s) => s.cancelPlacing);
  return (
    <div className="build-actions">
      {(["base", "sigint", "fuel"] as InstallationKind[]).map((kind) => {
        const def = INSTALLATIONS[kind];
        const on = placing === kind;
        const poor = g.funds < def.buildCost;
        return (
          <ActionButton key={kind} primary={on} icon={kind === "base" ? "bases" : kind === "fuel" ? "fuel" : "sigint"} blocker={poor && !on ? "Not enough funds." : null}
            label={on ? "Click the globe… (cancel)" : `Build new ${kind === "base" ? "base" : kind === "fuel" ? "refuelling station" : "SIGINT station"}`}
            tip={[`${money(def.buildCost)} · ${def.buildDays} days · ${money(def.monthlyCost)}/mo`, def.description]}
            onClick={() => (on ? cancelPlacing() : startPlacing(kind))} />
        );
      })}
    </div>
  );
}

/** Across the top of the globe while placing. */
export function PlacementBanner() {
  const placing = useStore((s) => s.placing);
  const cancel = useStore((s) => s.cancelPlacing);
  if (!placing) return null;
  return (
    <div className="placement-banner">
      <span>
        Click where to build the new <b>{INSTALLATIONS[placing].name}</b>.
        {placing === "sigint" ? " It covers the whole region." : placing === "fuel" ? " Our aircraft can refuel there and fly on." : " Its aircraft reach out from there."}
      </span>
      <button className="mini" onClick={cancel}>Cancel (Esc)</button>
    </div>
  );
}

/** Hover label line while placing: can we build here? */
export function placementNote(g: ReturnType<typeof useGame>, kind: InstallationKind, regionId: string): { ok: boolean; text: string } {
  const why = buildBlocker(g, kind, regionId);
  return why ? { ok: false, text: why } : { ok: true, text: "Click to build here" };
}

export function BuildDialog() {
  const g = useGame();
  const draft = useStore((s) => s.buildDraft)!;
  const cancel = useStore((s) => s.cancelPlacing);
  const startPlacing = useStore((s) => s.startPlacing);
  const confirm = useStore((s) => s.confirmBuild);
  const [name, setName] = useState(draft.name);
  const def = INSTALLATIONS[draft.kind];
  const region = regionById(draft.regionId);
  const support = g.regions[draft.regionId]?.support ?? 0;
  const mult = runningCostMultiplier(support);
  const blocker = buildBlocker(g, draft.kind, draft.regionId) ?? nameBlocker(g, name);
  const submit = () => !blocker && confirm(name);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <Panel title={`New ${def.name}`} className="modal event build-dialog">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="text-input" value={name} maxLength={MAX_NAME_LENGTH} autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") { e.stopPropagation(); cancel(); }
            }} />
        </label>
        <div className="kv"><span>Region</span><span>{region?.name}</span></div>
        <div className="kv"><span>Nearest city</span><span>{nearestPlace(draft.regionId, draft.pos)}</span></div>
        <div className="kv"><span>Construction</span><span>{money(def.buildCost)}, {def.buildDays} days</span></div>
        <div className="kv">
          <span>Running cost</span>
          <span>{money(def.monthlyCost * mult)}/mo{mult !== 1 ? ` (${mult === 0 ? "free at support +5" : mult < 1 ? "halved by local support" : "raised by local hostility"})` : ""}</span>
        </div>
        <p className="prose dim small">{def.description}</p>
        <div className="modal-row">
          {blocker && <span className="action-blocker grow">{blocker}</span>}
          <button className="action" onClick={() => startPlacing(draft.kind)}><span className="action-title">Move</span></button>
          <button className="action" onClick={cancel}><span className="action-title">Cancel</span></button>
          <button className="action primary" disabled={!!blocker} onClick={submit}><span className="action-title">Build</span></button>
        </div>
      </Panel>
    </div>
  );
}

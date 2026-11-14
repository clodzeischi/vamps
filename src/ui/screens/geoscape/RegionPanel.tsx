import { INSTALLATIONS, type InstallationKind } from "../../../data/installations";
import { regionById } from "../../../data/regions";
import { formatLatLon } from "../../../render/geo";
import { buildBlocker, coveredRegions } from "../../../sim/commands";
import { regionalContribution, runningCostMultiplier } from "../../../sim/economy";
import { isReady } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { SupportBar } from "../../components/SupportBar";
import { money } from "../../format";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

const costNote = (mult: number) =>
  mult === 0 ? "free (support +5)" : mult < 1 ? "halved" : mult === 1 ? "normal" : mult === 1.5 ? "+50% (indifferent)" : "doubled (hostile)";

export function RegionPanel() {
  const g = useGame();
  const selection = useStore((s) => s.selection);
  const buildCmd = useStore((s) => s.build);
  if (!selection) return null;

  const region = selection.regionId ? regionById(selection.regionId) : undefined;
  if (!region)
    return (
      <Panel title="Open water">
        <p className="mono">{formatLatLon(selection.pos)}</p>
        <p className="prose dim">No government here to fund us, and nowhere to build.</p>
      </Panel>
    );

  const st = g.regions[region.id]!;
  const covered = coveredRegions(g).has(region.id);
  const here = g.installations.filter((i) => i.regionId === region.id);
  const mult = runningCostMultiplier(st.support);
  const warned = here.some((i) => i.evictionWarned);

  return (
    <Panel title={region.name} className="region-panel">
      <div className="kv"><span>Theatre</span><span>{region.group}</span></div>
      <div className="kv kv-block"><span>Support</span><SupportBar support={st.support} /></div>
      <div className="kv"><span>Monthly contribution</span><span>{money(regionalContribution(g, region.id))}</span></div>
      <div className="kv"><span>Running costs here</span><span>{costNote(mult)}</span></div>
      <div className={`coverage ${covered ? "on" : ""}`}>
        {covered ? "◉ Covered by SIGINT: vampire activity here surfaces as leads." : "○ No SIGINT coverage: whatever happens here, we won't see it."}
      </div>
      {warned && <div className="warning">⚠ The authorities have threatened to evict us. Raise support before month end.</div>}

      {here.length > 0 && (
        <ul className="list compact">
          {here.map((i) => (
            <li key={i.id}>
              <button className="list-row" onClick={() => globe()?.flyTo(i.pos, 2.0)}>
                <span className={`dot dot-${i.kind}${isReady(g, i) ? "" : " dot-pending"}`} />
                <span>{i.name}</span>
                {!isReady(g, i) && <span className="row-note">ready {formatDate(i.readyAt)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="build-actions">
        {(["sigint", "base"] as InstallationKind[]).map((kind) => {
          const def = INSTALLATIONS[kind];
          const blocker = buildBlocker(g, kind, region.id);
          if (blocker?.startsWith("There is already")) return null;
          return (
            <button key={kind} className="action" disabled={!!blocker} onClick={() => buildCmd(kind)} title={blocker ?? def.description}>
              <span className="action-title">Build {def.name}</span>
              <span className="action-meta">
                {money(def.buildCost)} · {def.buildDays} days · {money(def.monthlyCost)}/mo
              </span>
              {blocker && <span className="action-blocker">{blocker}</span>}
            </button>
          );
        })}
      </div>
      <p className="mono dim small">{formatLatLon(selection.pos)}</p>
    </Panel>
  );
}

import { regionById } from "../../../data/regions";
import { monthlyIncome } from "../../../sim/economy";
import { isReady } from "../../../sim/state";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

export function InstallationsPanel() {
  const g = useGame();
  const selectRegion = useStore((s) => s.selectRegion);
  return (
    <Panel title="Installations">
      <ul className="list">
        {g.installations.map((i) => (
          <li key={i.id}>
            <button
              className="list-row"
              onClick={() => {
                globe()?.flyTo(i.pos, 2.1);
                selectRegion(i.regionId, i.pos);
              }}
            >
              <span className={`dot dot-${i.kind}${isReady(g, i) ? "" : " dot-pending"}`} />
              <span className="grow">{i.name}</span>
              {i.evictionWarned && <span className="row-note bad">eviction</span>}
              {!isReady(g, i) && <span className="row-note">building</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="prose dim small">Click a region on the globe to build. Stations need support +1 or better.</p>
    </Panel>
  );
}

export function FinancePanel() {
  const g = useGame();
  const { stipend, regional, running, net } = monthlyIncome(g);
  return (
    <Panel title="This month">
      <div className="kv"><span>Holy See stipend</span><span>{money(stipend)}</span></div>
      <div className="kv"><span>Regional contributions</span><span>{money(regional)}</span></div>
      <div className="kv"><span>Running costs</span><span>−{money(running)}</span></div>
      <div className={`kv kv-total ${net < 0 ? "bad" : ""}`}><span>Projected net</span><span>{money(net)}</span></div>
    </Panel>
  );
}

export function HoverLabel() {
  const g = useGame();
  const hover = useStore((s) => s.hoverRegion);
  if (!hover) return null;
  const r = regionById(hover)!;
  const support = Math.round(g.regions[hover]?.support ?? 0);
  return (
    <div className="hover-label">
      <span className="hover-name">{r.name}</span>
      <span className="hover-meta">support {support > 0 ? "+" : ""}{support}</span>
    </div>
  );
}

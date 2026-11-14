import { regionById } from "../../../data/regions";
import { monthlyIncome } from "../../../sim/economy";
import { isReady } from "../../../sim/state";
import { Panel } from "../../components/Panel";
import { money } from "../../format";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";
import { BuildButtons, placementNote } from "./BuildDialog";

export function InstallationsPanel() {
  const g = useGame();
  const focusOn = useStore((s) => s.focusOn);
  return (
    <Panel title="Installations">
      <ul className="list">
        {g.installations.map((i) => (
          <li key={i.id}>
            <button
              className="list-row"
              onClick={() => {
                globe()?.flyTo(i.pos, 2.1);
                focusOn({ kind: "installation", id: i.id });
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
      <BuildButtons />
      <p className="prose dim small">New installations need local support of +1 or better. A SIGINT station covers its whole region.</p>
    </Panel>
  );
}

export function FinancePanel() {
  const g = useGame();
  const { stipend, regional, running, upkeep, leases, media, net } = monthlyIncome(g);
  return (
    <Panel title="This month">
      <div className="kv"><span>Holy See stipend</span><span>{money(stipend)}</span></div>
      <div className="kv"><span>Regional contributions</span><span>{money(regional)}</span></div>
      <div className="kv"><span>Installations</span><span>−{money(running)}</span></div>
      <div className="kv"><span>Agent upkeep</span><span>−{money(upkeep)}</span></div>
      <div className="kv"><span>Aircraft leases</span><span>−{money(leases)}</span></div>
      {media > 0 && <div className="kv"><span>Media campaigns</span><span>−{money(media)}</span></div>}
      <div className={`kv kv-total ${net < 0 ? "bad" : ""}`}><span>Projected net</span><span>{money(net)}</span></div>
    </Panel>
  );
}

export function HoverLabel() {
  const g = useGame();
  const hover = useStore((s) => s.hoverRegion);
  const placing = useStore((s) => s.placing);
  if (!hover) return null;
  const r = regionById(hover)!;
  const support = Math.round(g.regions[hover]?.support ?? 0);
  const note = placing ? placementNote(g, placing, hover) : null;
  return (
    <div className="hover-label">
      <span className="hover-name">{r.name}</span>
      <span className="hover-meta">support {support > 0 ? "+" : ""}{support}</span>
      {note && <span className={`hover-meta ${note.ok ? "good" : "bad"}`}>{note.text}</span>}
    </div>
  );
}

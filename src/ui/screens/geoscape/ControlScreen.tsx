// Control: the management screens as numbered tabs (ui/control.ts).
import { useMemo } from "react";
import { CONTROL_TABS, type ControlTab } from "../../control";
import { Icon } from "../../components/Icon";
import { bindingsOf, keyLabel } from "../../keys";
import { useGame, useStore } from "../../store";
import { BloodlinesScreen } from "./BloodlinesScreen";
import { CovertScreen } from "./CovertScreen";
import { DetailsScreen } from "./DetailsScreen";
import { MarketScreen } from "./MarketScreen";
import { OperationsScreen } from "./OperationsScreen";
import { ResearchScreen } from "./ResearchScreen";
import { BasesSection } from "./SidePanels";

const SECTIONS: Record<ControlTab, () => React.JSX.Element> = {
  installations: BasesSection, operations: OperationsScreen, research: ResearchScreen, bloodlines: BloodlinesScreen,
  covert: CovertScreen, market: MarketScreen, details: DetailsScreen,
};

export function ControlScreen({ tab }: { tab: ControlTab }) {
  const g = useGame();
  const open = useStore((s) => s.openControl);
  const close = useStore((s) => s.closeOverlay);
  const saved = useStore((s) => s.settings.keys);
  const keys = useMemo(() => bindingsOf(saved), [saved]);
  const Section = SECTIONS[tab];
  return (
    <div className="base-view control-view" role="dialog" aria-label="Control">
      <header className="base-view-head control-head">
        <span className="control-title">Control</span>
        <nav className="tabs control-tabs" role="tablist">
          {CONTROL_TABS.map((t) => {
            const st = t.status(g);
            return (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab control-tab${tab === t.id ? " on" : ""}`}
                onClick={() => open(t.id)} title={`${t.tip} (${keyLabel(keys[t.key])})`}>
                <kbd>{keyLabel(keys[t.key])}</kbd>
                <Icon name={t.icon} size={18} />
                <span className="control-tab-text">
                  <span className="control-tab-label">{t.label}</span>
                  <span className={`control-tab-status${st.attention ? " attention" : ""}`}>{st.text}</span>
                </span>
              </button>
            );
          })}
        </nav>
        <button className="mini" onClick={close} title="Back to the globe (Esc)">Close ✕</button>
      </header>
      <Section />
    </div>
  );
}

// Control: the management screens as numbered tabs (ui/control.ts).
import { useMemo } from "react";
import { CONTROL_TABS, type ControlTab } from "../../control";
import { Icon } from "../../components/Icon";
import { CloseX } from "../../components/CloseX";
import { tipLines } from "../../components/Tooltip";
import { bindingsOf, keyLabel } from "../../keys";
import { useGame, useStore } from "../../store";
import { BloodlinesScreen } from "./BloodlinesScreen";
import { DetailsScreen } from "./DetailsScreen";
import { MarketScreen } from "./MarketScreen";
import { OperationsScreen } from "./OperationsScreen";
import { ResearchScreen } from "./ResearchScreen";
import { BasesSection } from "./SidePanels";

const SECTIONS: Record<ControlTab, () => React.JSX.Element> = {
  installations: BasesSection, operations: OperationsScreen, research: ResearchScreen, bloodlines: BloodlinesScreen,
  market: MarketScreen, details: DetailsScreen,
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
              <button key={t.id} role="tab" aria-selected={tab === t.id} aria-label={t.label} className={`tab control-tab${tab === t.id ? " on" : ""}`}
                onClick={() => open(t.id)} data-tip={tipLines(t.tip, st.text, `Key: ${keyLabel(keys[t.key])}`)}>
                <kbd>{keyLabel(keys[t.key])}</kbd>
                <Icon name={t.icon} size={18} />
                {t.label}
                {st.attention && <span className="control-tab-dot" />}
              </button>
            );
          })}
        </nav>
        <CloseX onClick={close} />
      </header>
      <Section />
    </div>
  );
}

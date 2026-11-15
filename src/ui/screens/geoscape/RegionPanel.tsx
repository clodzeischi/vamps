import { regionById } from "../../../data/regions";
import { formatLatLon } from "../../../render/geo";
import { coveredRegions, detectionChance, sigintRates } from "../../../sim/commands";
import { MEDIA_LEVELS, mediaCost, mediaEffect, mediaLevel, setMedia as setMediaCmd } from "../../../sim/media";
import type { MediaLevel } from "../../../sim/state";
import { BUILD_MIN_SUPPORT, regionalContribution, runningCostMultiplier } from "../../../sim/economy";
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
  const command = useStore((s) => s.command);
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
  const rate = sigintRates(g).get(region.id) ?? 0;
  const chance = detectionChance(rate) * 100;
  const pct = `${chance < 10 ? chance.toFixed(1) : Math.round(chance)}%`;
  const ownStations = g.installations.filter((i) => i.kind === "sigint" && i.regionId === region.id && i.readyAt <= g.time).length;
  const here = g.installations.filter((i) => i.regionId === region.id);
  const mult = runningCostMultiplier(st.support);
  const warned = here.some((i) => i.evictionWarned);

  return (
    <Panel title={region.name} className="region-panel">
      <div className="kv"><span>Theatre</span><span>{region.group}</span></div>
      <div className="kv kv-block"><span>Support</span><SupportBar support={st.support} /></div>
      <div className="kv"><span>Monthly contribution</span><span>{money(regionalContribution(g, region.id))}</span></div>
      <div className="kv"><span>Running costs here</span><span>{costNote(mult)}</span></div>
      <div className={`coverage ${covered ? "on" : rate > 0 ? "faint" : ""}`}>
        {covered
          ? `◉ Covered by SIGINT${ownStations > 1 ? ` (${ownStations} stations)` : ""}: vampire activity here surfaces as leads. Each operation: ${pct} a day.`
          : rate > 0
            ? `◎ Faint SIGINT from a neighbouring station: some vampire activity here may surface as leads. Each operation: ${pct} a day.`
            : "○ No SIGINT coverage: whatever happens here, we won't see it."}
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

      <p className={`small ${Math.round(st.support) >= BUILD_MIN_SUPPORT ? "dim" : "bad"}`}>
        {Math.round(st.support) >= BUILD_MIN_SUPPORT
          ? "New installations allowed here."
          : `No new installations until support reaches +${BUILD_MIN_SUPPORT}.`}
      </p>

      <MediaControl regionId={region.id} level={g.media[region.id] ?? null} support={st.support}
        onSet={(l) => command((game) => setMediaCmd(game, region.id, l))} />
      <p className="mono dim small">{formatLatLon(selection.pos)}</p>
    </Panel>
  );
}

/** The Order's own media campaign in this region: off, or one of three levels. */
function MediaControl({ regionId, level, support, onSet }: { regionId: string; level: MediaLevel | null; support: number; onSet: (l: MediaLevel | null) => void }) {
  const perMonth = (l: MediaLevel) => mediaLevel(l).gain * mediaEffect(support);
  return (
    <section className="media">
      <h4 className="section-title">Media campaign</h4>
      <div className="media-levels">
        <button className={`choice${level === null ? " on" : ""}`} onClick={() => onSet(null)}>
          <span className="choice-title">None</span>
        </button>
        {MEDIA_LEVELS.map((m) => (
          <button key={m.level} className={`choice${level === m.level ? " on" : ""}`} title={m.description} onClick={() => onSet(m.level)}>
            <span className="choice-title">{m.name}</span>
            <span className="choice-meta">{money(mediaCost(regionId, m.level))}/mo</span>
          </button>
        ))}
      </div>
      <p className="small dim media-note">
        {level
          ? `${mediaLevel(level).description} About +${perMonth(level).toFixed(2)} support a month${mediaEffect(support) < 0.5 ? " (little left to win here)" : ""}.`
          : "Church fronts and friendly outlets push back against the bloodlines' campaigns. Paid daily."}
      </p>
    </section>
  );
}

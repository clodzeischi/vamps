import { regionById } from "../../../data/regions";
import { formatLatLon } from "../../../render/geo";
import { coveredRegions, detectionChance, sigintRates } from "../../../sim/core/commands";
import {
  MEDIA_LEVELS,
  mediaCost,
  mediaEffect,
  mediaLevel,
  setMedia as setMediaCmd,
} from "../../../sim/campaign/media";
import type { MediaLevel } from "../../../sim/core/state";
import {
  BUILD_MIN_SUPPORT,
  regionalContribution,
  runningCostMultiplier,
} from "../../../sim/economy/economy";
import { isReady } from "../../../sim/core/state";
import { formatDate } from "../../../sim/core/time";
import {
  accessBlocker,
  ASSET_KINDS,
  dismissAsset,
  humintRates,
  ratlineEnd,
} from "../../../sim/intel/humint";
import { Panel } from "../../components/Panel";
import { SupportBar } from "../../components/SupportBar";
import { money } from "../../format";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

const costNote = (mult: number) =>
  mult === 0
    ? "free (support +5)"
    : mult < 1
      ? "halved"
      : mult === 1
        ? "normal"
        : mult === 1.5
          ? "+50% (indifferent)"
          : "doubled (hostile)";

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
  const human = humintRates(g).get(region.id) ?? 0;
  const chance = detectionChance(rate + human) * 100;
  const pct = `${chance < 10 ? chance.toFixed(1) : Math.round(chance)}%`;
  const ownStations = g.installations.filter(
    (i) => i.kind === "sigint" && i.regionId === region.id && i.readyAt <= g.time,
  ).length;
  const here = g.installations.filter((i) => i.regionId === region.id);
  const mult = runningCostMultiplier(st.support);
  const warned = here.some((i) => i.evictionWarned);

  return (
    <Panel title={region.name} className="region-panel">
      <div className="kv">
        <span>Theatre</span>
        <span>{region.group}</span>
      </div>
      <div className="kv kv-block">
        <span>Support</span>
        <SupportBar support={st.support} />
      </div>
      <div className="kv">
        <span>Monthly contribution</span>
        <span>{money(regionalContribution(g, region.id))}</span>
      </div>
      {(st.pledge ?? 1) !== 1 && (
        <div
          className={`kv ${(st.pledge ?? 1) > 1 ? "good" : "bad"}`}
          title="Regions give more where we get results, and less where we let things happen. Reviewed at month end."
        >
          <span>Pledge</span>
          <span>{Math.round((st.pledge ?? 1) * 100)}% of the usual</span>
        </div>
      )}
      {Math.abs(st.credit ?? 0) >= 0.01 && (
        <div
          className={`kv small ${(st.credit ?? 0) > 0 ? "good" : "bad"}`}
          title="What we did here this month. It moves the pledge at the month's review."
        >
          <span>This month's record</span>
          <span>
            {(st.credit ?? 0) > 0 ? "+" : ""}
            {Math.round((st.credit ?? 0) * 100)}% at review
          </span>
        </div>
      )}
      <div className="kv">
        <span>Running costs here</span>
        <span>{costNote(mult)}</span>
      </div>
      <div className={`coverage ${covered ? "on" : rate > 0 ? "faint" : ""}`}>
        {covered
          ? `◉ Covered by SIGINT${ownStations > 1 ? ` (${ownStations} stations)` : ""}: vampire activity here surfaces as leads. Each operation: ${pct} a day.`
          : rate > 0
            ? `◎ Faint SIGINT from a neighbouring station: some vampire activity here may surface as leads. Each operation: ${pct} a day.`
            : human > 0
              ? `◉ No SIGINT, but our agents here hear things. Each operation: ${pct} a day.`
              : "○ No SIGINT coverage: we'll only hear of what happens here if someone comes forward."}
        {human > 0 && (covered || rate > 0) && " Our agents here add to it."}
      </div>
      {warned && (
        <div className="warning">
          ⚠ The authorities have threatened to evict us. Raise support before month end.
        </div>
      )}

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

      <HumintSection regionId={region.id} />

      <MediaControl
        regionId={region.id}
        level={g.media[region.id] ?? null}
        support={st.support}
        onSet={(l) => command((game) => setMediaCmd(game, region.id, l))}
      />
      <p className="mono dim small">{formatLatLon(selection.pos)}</p>
    </Panel>
  );
}

/** Our assets in this region, and whether our teams can work here at all. */
function HumintSection({ regionId }: { regionId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const assets = g.assets.filter((a) => a.regionId === regionId);
  const blocked = accessBlocker(g, regionId);
  return (
    <section className="humint">
      <h4 className="section-title">HUMINT</h4>
      {blocked && <p className="small bad">{blocked}</p>}
      {assets.length ? (
        <ul className="list compact">
          {assets.map((a) => {
            const end = a.kind === "ratline" ? ratlineEnd(g, a) : null;
            return (
              <li key={a.id} className="asset-row">
                <span className={`dot dot-asset dot-asset-${a.kind}`} />
                <span className="asset-who" title={ASSET_KINDS[a.kind].gives}>
                  {a.name}, {a.role}{" "}
                  <span className="row-note">
                    {ASSET_KINDS[a.kind].name}
                    {end ? ` → ${end.name}` : ""} · {money(a.monthly)}/mo
                  </span>
                </span>
                <button
                  className="mini"
                  onClick={() => command((s) => dismissAsset(s, a.id), `${a.name} let go.`)}
                  title="Stop paying them; they stop working for us"
                >
                  Let go
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="small dim">
          No agents here. Recruit one when a source comes forward in this region.
        </p>
      )}
    </section>
  );
}

/** The Order's own media campaign in this region: off, or one of three levels. */
function MediaControl({
  regionId,
  level,
  support,
  onSet,
}: {
  regionId: string;
  level: MediaLevel | null;
  support: number;
  onSet: (l: MediaLevel | null) => void;
}) {
  const perMonth = (l: MediaLevel) => mediaLevel(l).gain * mediaEffect(support);
  return (
    <section className="media">
      <h4 className="section-title">Media campaign</h4>
      <div className="media-levels">
        <button className={`choice${level === null ? " on" : ""}`} onClick={() => onSet(null)}>
          <span className="choice-title">None</span>
        </button>
        {MEDIA_LEVELS.map((m) => (
          <button
            key={m.level}
            className={`choice${level === m.level ? " on" : ""}`}
            title={m.description}
            onClick={() => onSet(m.level)}
          >
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

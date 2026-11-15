// The six bloodlines. A list on the left; the chosen line on the right: its
// elder, how much we know, its lair, and its chronicle, which grows by one
// entry every 20 intel (data/lore.ts).
import { useState } from "react";
import { AGNES, BLOODLINES } from "../../../data/bloodlines";
import { LORE } from "../../../data/lore";
import { ELDER_BIO_INTEL, ELDER_NAME_INTEL, ELDERS } from "../../../data/people";
import { regionById } from "../../../data/regions";
import { destroyedCount, lairLocked } from "../../../sim/bloodlines";
import { ACT_NAMES, lesserBroken, SIGILS_TO_RETURN } from "../../../sim/story";
import type { GameState } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { ActionButton } from "../../components/ActionButton";
import { Icon } from "../../components/Icon";
import { Portrait } from "../../components/Portrait";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

/** Agnes we know from the start: the fire, and who she is. */
const AGNES_KNOWN = 40;

/** What we know of a line: its intel, and whether its lair is found or it has fallen (everything is known then). */
function knowledge(g: GameState, id: string) {
  const st = g.bloodlines[id];
  const intel = Math.round(g.intel[id] ?? 0);
  const lair = st?.lairId ? g.sites.find((x) => x.id === st.lairId) ?? null : null;
  const all = !!lair || !!st?.destroyedAt;
  const level = all ? 100 : intel;
  return {
    st, intel, lair, level,
    destroyed: !!st?.destroyedAt,
    named: id === AGNES || level >= ELDER_NAME_INTEL,
    told: id === AGNES || level >= ELDER_BIO_INTEL,
  };
}

function statusWord(g: GameState, id: string) {
  const k = knowledge(g, id);
  if (k.destroyed) return `destroyed ${formatDate(k.st!.destroyedAt!)}`;
  if (k.lair) return "lair found";
  if (lairLocked(g, id) && k.intel >= 100) return "out of reach";
  return k.intel ? `${k.intel} / 100` : "unknown";
}

function LineRow({ id, selected, onPick }: { id: string; selected: boolean; onPick: () => void }) {
  const g = useGame();
  const b = BLOODLINES.find((x) => x.id === id)!;
  const k = knowledge(g, id);
  const elder = ELDERS[id]!;
  return (
    <li>
      <button className={`rlist-row sigil-row${selected ? " on" : ""}${k.destroyed ? " done" : ""}${k.lair && !k.destroyed ? " found" : ""}`} onClick={onPick}>
        <Portrait person={elder} size="xs" hidden={!k.told} />
        <span className="rlist-body">
          <span className="rlist-name">{b.name}</span>
          <span className="rlist-note">{k.named ? elder.name : "Its eldest: unknown"} · {statusWord(g, id)}</span>
          {!k.destroyed && <span className="progress"><span style={{ width: `${k.level}%` }} /></span>}
        </span>
      </button>
    </li>
  );
}

function Line({ id }: { id: string }) {
  const g = useGame();
  const close = useStore((s) => s.closeBloodlines);
  const focusOn = useStore((s) => s.focusOn);
  const selectRegion = useStore((s) => s.selectRegion);
  const b = BLOODLINES.find((x) => x.id === id)!;
  const k = knowledge(g, id);
  const elder = ELDERS[id]!;
  const locked = !k.destroyed && lairLocked(g, id);
  const homes = b.homeRegions.map((r) => regionById(r)?.name).filter(Boolean);
  const entries = LORE[id] ?? [];
  const showLair = () => {
    if (!k.lair) return;
    close();
    globe()?.flyTo(k.lair.pos, 2.2);
    selectRegion(k.lair.regionId, k.lair.pos);
    focusOn({ kind: "site", id: k.lair.id });
  };
  return (
    <section className="rdetail line-detail">
      <header className="line-head">
        <Portrait person={elder} size="md" hidden={!k.told} />
        <div className="line-head-text">
          <h2 className="facility-title">{b.name}</h2>
          <div className="elder-name">{k.named ? elder.name : "Its eldest: unknown"}</div>
          <div className="speaker-title">{k.named ? elder.title : `Their name, at ${ELDER_NAME_INTEL} intel`}</div>
          <div className="intel-track" data-tip="Intel on this line: missions, interrogations and assets add to it. At 100 we find its lair.">
            <span className="intel-fill" style={{ width: `${k.level}%` }} />
            {entries.map((e) => <span key={e.at} className={`intel-mark${k.level >= e.at ? " on" : ""}`} style={{ left: `${e.at}%` }} />)}
          </div>
          <div className="small dim">{statusWord(g, id)} · {homes.slice(0, 5).join(", ")}{homes.length > 5 ? ` and ${homes.length - 5} more` : ""}</div>
          {locked && (
            <div className="small warn-text">
              {g.story.act === 1 ? "Her lair is beyond anything we can reach." : `Out of reach until Europe reopens (${lesserBroken(g)} of ${SIGILS_TO_RETURN} sigils).`}
            </div>
          )}
          {k.lair && !k.destroyed && (
            <ActionButton primary icon="bloodlines" label={`The lair: ${k.lair.city}`} tip={[k.lair.missionId ? "A team is on the way" : "Show it on the globe, and plan the assault"]} onClick={showLair} />
          )}
        </div>
      </header>

      <h4 className="section-title"><Icon name="findings" size={14} /> What we know</h4>
      <div className="chronicle">
        {entries.map((e) =>
          k.level >= e.at || (id === AGNES && e.at <= AGNES_KNOWN) ? (
            <article key={e.at} className="chronicle-entry">
              <div className="chronicle-head">
                <span className="chronicle-title">{e.title}</span>
                <span className="chronicle-at">{e.at} intel</span>
              </div>
              <p className="prose">{e.text}</p>
            </article>
          ) : (
            <article key={e.at} className="chronicle-entry locked">
              <div className="chronicle-head">
                <span className="chronicle-title"><Icon name="locked" size={13} /> Not yet known</span>
                <span className="chronicle-at">at {e.at} intel</span>
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

export function BloodlinesScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeBloodlines);
  const fallen = destroyedCount(g);
  // Start on the line we know most about that still stands.
  const [picked, setPicked] = useState<string>(
    () => [...BLOODLINES].filter((b) => !g.bloodlines[b.id]?.destroyedAt).sort((a, c) => (g.intel[c.id] ?? 0) - (g.intel[a.id] ?? 0))[0]?.id ?? BLOODLINES[0]!.id,
  );
  return (
    <div className="base-view bloodlines-view">
      <header className="base-view-head">
        <nav className="crumbs"><span className="crumb current">The bloodlines</span></nav>
        <span className="td-dim">
          {ACT_NAMES[g.story.act]} ·{" "}
          {g.story.act === 1 && "Agnes and the Serpenta Sigil are our quarry, and far beyond us."}
          {g.story.act === 2 && `Break ${SIGILS_TO_RETURN} of the five lesser sigils to reopen Europe: ${lesserBroken(g)} so far.`}
          {g.story.act === 3 && "Europe is open. Find Agnes and end it at Montségur."}
        </span>
        <span className="base-funds">{fallen ? `${fallen} destroyed, ${BLOODLINES.length - fallen} remain` : "None destroyed yet"}</span>
        <button className="mini" onClick={close} title="Back to the globe (Esc)">Close ✕</button>
      </header>
      <div className="research-body">
        <div className="panel rlist-panel">
          <p className="small dim">Missions, interrogations and assets teach us about a line. Every 20 intel tells us more; at 100 we find its lair, and destroying the lair destroys the line.</p>
          <ul className="list">{BLOODLINES.map((b) => <LineRow key={b.id} id={b.id} selected={picked === b.id} onPick={() => setPicked(b.id)} />)}</ul>
        </div>
        <div className="panel rdetail-panel"><Line id={picked} /></div>
      </div>
    </div>
  );
}

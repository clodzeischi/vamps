// The six bloodlines. A list on the left; the chosen line on the right: its
// elder, how far up its network we have climbed (nests, den clues, dens, the
// lair: sim/networks.ts), and its chronicle, which opens a page with every
// raid, snatch or questioning (data/lore.ts).
import { useState } from "react";
import { AGNES, BLOODLINES } from "../../../data/bloodlines";
import { LORE } from "../../../data/lore";
import { ELDER_BIO_INTEL, ELDER_NAME_INTEL, ELDERS } from "../../../data/people";

const pageWord = (at: number) => (at >= 100 ? "the lair" : `raid ${at / PAGE_STEP}`);
import { regionById } from "../../../data/regions";
import { destroyedCount, lairLocked } from "../../../sim/bloodlines";
import { CLUES_PER_DEN, DENS, DENS_FOR_LAIR, densFound, densRaided, knowledgeOf, PAGE_STEP } from "../../../sim/networks";
import { ACT_NAMES, lesserBroken, SIGILS_TO_RETURN } from "../../../sim/story";
import type { GameState, NetSite } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { ActionButton } from "../../components/ActionButton";
import { Icon } from "../../components/Icon";
import { Portrait } from "../../components/Portrait";
import { globe } from "../../globe";
import { useGame, useStore } from "../../store";

/** Agnes we know from the start: the fire, and who she is. */
const AGNES_KNOWN = 40;

/** What we know of a line: how far we have climbed, and whether its lair is found or it has fallen (everything is known then). */
function knowledge(g: GameState, id: string) {
  const st = g.bloodlines[id];
  const net = g.networks[id];
  const lair = st?.lairId ? g.sites.find((x) => x.id === st.lairId) ?? null : null;
  const level = knowledgeOf(g, id);
  const dens = net ? densRaided(net) : 0;
  return {
    st, net, lair, level, dens,
    destroyed: !!st?.destroyedAt,
    named: id === AGNES || level >= ELDER_NAME_INTEL,
    told: id === AGNES || level >= ELDER_BIO_INTEL,
  };
}

function statusWord(g: GameState, id: string) {
  const k = knowledge(g, id);
  if (k.destroyed) return `destroyed ${formatDate(k.st!.destroyedAt!)}`;
  if (k.lair) return "lair found";
  if (lairLocked(g, id) && k.dens >= DENS_FOR_LAIR) return "lair out of reach";
  if (!k.net) return "untouched";
  const raided = k.net.sites.filter((x) => x.raided).length;
  if (k.dens) return `dens ${k.dens}/${DENS_FOR_LAIR}`;
  if (densFound(k.net)) return "a den found";
  if (k.net.clues) return `clues ${k.net.clues}/${CLUES_PER_DEN}`;
  return raided ? `${raided} burned` : k.level ? "a trace" : "untouched";
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

/** Segments in a row, each with its own colour class. */
function Segs({ parts, tip }: { parts: string[]; tip: string }) {
  return (
    <div className="climb-bar" data-tip={tip}>
      {parts.map((p, i) => <span key={i} className={`climb-seg ${p}`} />)}
    </div>
  );
}

/** How far up the house's network we have climbed: nests, den clues, dens, the lair. */
function Climb({ id }: { id: string }) {
  const g = useGame();
  const close = useStore((s) => s.closeBloodlines);
  const focusOn = useStore((s) => s.focusOn);
  const selectRegion = useStore((s) => s.selectRegion);
  const net = g.networks[id]!;
  const st = g.bloodlines[id];
  const nests = net.sites.filter((x) => x.kind === "nest" && (x.known || x.raided));
  const dens = net.sites.filter((x) => x.kind === "den");
  const toward = Math.max(0, net.clues - densFound(net) * CLUES_PER_DEN);
  const allDens = dens.every((x) => x.known || x.raided);
  const raidedDens = densRaided(net);
  const state = (x: NetSite) => (x.raided ? "burned" : x.known ? "known" : "unknown");
  const show = (x: NetSite) => {
    const site = g.sites.find((y) => y.netId === x.id);
    if (!site) return;
    close();
    globe()?.flyTo(site.pos, 2.2);
    selectRegion(site.regionId, site.pos);
    focusOn({ kind: "site", id: site.id });
  };
  const place = (x: NetSite) =>
    x.known ? <button className="climb-place" onClick={() => show(x)} data-tip="Show it on the globe">{x.city}</button> : x.raided ? <span className="climb-place done">{x.city}</span> : null;
  const lockedLair = lairLocked(g, id);
  return (
    <div className="climb">
      <h4 className="section-title"><Icon name="bloodlines" size={14} /> The climb</h4>
      <div className="climb-row">
        <span className="climb-label">Nests</span>
        <Segs parts={nests.length ? nests.map((x) => `nest ${state(x)}`) : ["empty"]} tip="Nests we have found: burned, or on the map. Burning one gives a den clue." />
        <span className="climb-note">{nests.length ? nests.map((x, i) => <span key={x.id}>{i ? ", " : ""}{place(x)}</span>) : "none found yet"}</span>
      </div>
      <div className="climb-row">
        <span className="climb-label">Den clues</span>
        <Segs parts={Array.from({ length: CLUES_PER_DEN }, (_, i) => (allDens ? "empty" : i < toward ? "clue" : "unknown"))} tip={`From burned nests, snatches, questioned captives and sources. Every ${CLUES_PER_DEN} find a den.`} />
        <span className="climb-note">{allDens ? "every den found" : `${toward} of ${CLUES_PER_DEN} toward the next den`}</span>
      </div>
      <div className="climb-row">
        <span className="climb-label">Dens</span>
        <Segs parts={dens.map((x) => `den ${state(x)}`)} tip={`The house's ${DENS} dens: burned, on the map, or still hidden. ${DENS_FOR_LAIR} burned find the lair.`} />
        <span className="climb-note">
          {raidedDens} of {DENS_FOR_LAIR} burned
          {dens.filter((x) => x.known || x.raided).map((x) => <span key={x.id}> · {place(x)}</span>)}
        </span>
      </div>
      <div className="climb-row">
        <span className="climb-label">Lair</span>
        <Segs parts={[st?.lairId ? "lair known" : "unknown"]} tip="Found once two dens are burned. A found lair doesn't move: the house strikes at our bases until it burns." />
        <span className={`climb-note${st?.lairId ? " warn-text" : ""}`}>
          {st?.lairId ? "found: the house may strike any of our bases it can reach" : lockedLair && raidedDens >= DENS_FOR_LAIR ? "found, but out of reach for now" : "hidden"}
        </span>
      </div>
    </div>
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
          <div className="speaker-title">{k.named ? elder.title : "Their name: after our first raid on them"}</div>
          <div className="small dim">{homes.slice(0, 5).join(", ")}{homes.length > 5 ? ` and ${homes.length - 5} more` : ""}</div>
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

      {k.net && !k.destroyed && <Climb id={id} />}

      <h4 className="section-title"><Icon name="findings" size={14} /> What we know</h4>
      <div className="chronicle">
        {entries.map((e) =>
          k.level >= e.at || (id === AGNES && e.at <= AGNES_KNOWN) ? (
            <article key={e.at} className="chronicle-entry">
              <div className="chronicle-head">
                <span className="chronicle-title">{e.title}</span>
                <span className="chronicle-at">{pageWord(e.at)}</span>
              </div>
              <p className="prose">{e.text}</p>
            </article>
          ) : (
            <article key={e.at} className="chronicle-entry locked">
              <div className="chronicle-head">
                <span className="chronicle-title"><Icon name="locked" size={13} /> Not yet known</span>
                <span className="chronicle-at">{e.at >= 100 ? "when the lair is found" : `after ${e.at / PAGE_STEP} ${e.at === PAGE_STEP ? "raid" : "raids"}`}</span>
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
    () => [...BLOODLINES].filter((b) => !g.bloodlines[b.id]?.destroyedAt).sort((a, c) => knowledgeOf(g, c.id) - knowledgeOf(g, a.id))[0]?.id ?? BLOODLINES[0]!.id,
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
          <p className="small dim">Every house is a network: nests, {DENS} dens, a lair. Burn a nest, snatch one of its people or question a captive for a den clue; {CLUES_PER_DEN} clues find a den; {DENS_FOR_LAIR} dens burned find the lair. Destroy the lair and the line dies.</p>
          <ul className="list">{BLOODLINES.map((b) => <LineRow key={b.id} id={b.id} selected={picked === b.id} onPick={() => setPicked(b.id)} />)}</ul>
        </div>
        <div className="panel rdetail-panel"><Line id={picked} /></div>
      </div>
    </div>
  );
}

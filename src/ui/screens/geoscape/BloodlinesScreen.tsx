// The six bloodlines. A list on the left; the chosen line on the right: its
// elder, how far up its network we have climbed (nests, den clues, dens, the
// lair: sim/networks.ts), and its chronicle, which opens a page with every
// raid, snatch or questioning (data/lore.ts).
import { useState } from "react";
import { LeadVia } from "../../../sim/state";
import { setStaffLead, staffAtWork, staffLead } from "../../../sim/personnel";
import { AGNES, BLOODLINES, bloodlineById } from "../../../data/bloodlines";
import { LORE } from "../../../data/lore";
import { ELDER_BIO_INTEL, ELDER_NAME_INTEL, ELDERS } from "../../../data/people";

const pageWord = (at: number) => (at >= 100 ? "the lair" : `raid ${at / PAGE_STEP}`);
import { REGIONS, regionById } from "../../../data/regions";
import { destroyedCount, isDormant, lairLocked } from "../../../sim/bloodlines";
import { CLUES_PER_DEN, DENS, DENS_FOR_LAIR, densFound, densRaided, knowledgeOf, PAGE_STEP } from "../../../sim/networks";
import { ACT_NAMES, lesserBroken, SIGILS_TO_RETURN } from "../../../sim/story";
import type { GameState, Lead, NetSite } from "../../../sim/state";
import { caseOf, collection, confidence, FIND_POINTS, FIND_TRICKLE, findOdds, findRegions, MAX_EVIDENCE, sectionPace, setFind } from "../../../sim/intel";
import { aptitude } from "../../../sim/aptitudes";
import { APTITUDES } from "../../../data/aptitudes";
import { formatDate } from "../../../sim/time";
import { timeLeft } from "./FocusPanels";
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
  const b = bloodlineById(id)!;
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
  const close = useStore((s) => s.closeOverlay);
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
  const close = useStore((s) => s.closeOverlay);
  const focusOn = useStore((s) => s.focusOn);
  const selectRegion = useStore((s) => s.selectRegion);
  const b = bloodlineById(id)!;
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

const pct = (p: number) => `${Math.round(p * 100)}%`;
const VIA_SHORT: Record<LeadVia, string> = { volunteer: "Volunteer", humint: "HUMINT", osint: "OSINT", sigint: "SIGINT" };

/** The section: who works it, what it looks for (Find), and the lead it is working (Fix). */
function SectionControls() {
  const g = useGame();
  const command = useStore((s) => s.command);
  const people = staffAtWork(g, "analyst");
  const lead = staffLead(g, "analyst");
  const pace = sectionPace(g);
  const sec = g.section;
  const fixing = sec?.fixing ? g.leads.find((l) => l.id === sec.fixing) : undefined;
  const scope = sec?.find ? `${sec.find.kind}:${sec.find.id}` : "";
  const regions = findRegions(g);
  const odds = regions.length ? regions.reduce((t, r) => t + findOdds(g, r), 0) / regions.length : 0;
  const days = pace.rate > 0 ? FIND_POINTS / (pace.rate * (fixing ? FIND_TRICKLE : 1)) : Infinity;
  const one = sec?.find?.kind === "region" ? sec.find.id : null;
  const col = one ? collection(g, one, pace) : null;
  const groups = [...new Set(REGIONS.map((r) => r.group))];
  const house = sec?.find?.kind === "house" ? sec.find.id : null;
  const quiet = house && g.bloodlines[house]?.destroyedAt ? "That house is destroyed: nothing left to find."
    : house && isDormant(g, house) ? "Agnes runs nothing while the Vatican is held: nothing stirs there now. Look at a lesser house." : null;
  return (
    <>
      <p className="small dim">
        Our analysts, at every base, work as one section. They <b>find</b> signs of the houses at work, which turn up leads, or <b>fix</b> one lead,
        building or breaking its case. Every lead shows the honest chance it is real.
      </p>
      <h4 className="section-title">Analysts <span className="tab-count">{people.length} · {pace.rate.toFixed(1)} points a day</span></h4>
      {people.length === 0 ? (
        <p className="small dim">No analysts at work. Hire some at a base (Personnel, Hiring).</p>
      ) : (
        <div className="lead-box" data-tip="The lead analyst, one for the Order: their aptitudes, over 50, multiply every other analyst's">
          <select className="lead-select" value={lead?.id ?? ""} onChange={(e) => command((s) => setStaffLead(s, "analyst", e.target.value || null))}>
            <option value="">No lead</option>
            {people.map((x) => <option key={x.id} value={x.id}>{`${x.name} (${APTITUDES.analyst.map((a) => `${a.short} ${Math.floor(aptitude(x, a.id))}`).join(", ")})`}</option>)}
          </select>
        </div>
      )}
      <h4 className="section-title">Find</h4>
      <div className="lead-box" data-tip="Where the analysts look for signs of activity. A house: all its homelands. A region: deeper, with whatever collection we have there.">
        <select className="lead-select" value={scope}
          onChange={(e) => { const [kind, id] = e.target.value.split(":"); command((s) => setFind(s, kind ? { kind: kind as "house" | "region", id: id! } : null)); }}>
          <option value="">Nowhere (fix only)</option>
          <optgroup label="A house">{BLOODLINES.filter((b) => !g.bloodlines[b.id]?.destroyedAt).map((b) => <option key={b.id} value={`house:${b.id}`}>{b.name}</option>)}</optgroup>
          {groups.map((grp) => <optgroup key={grp} label={grp}>{REGIONS.filter((r) => r.group === grp).map((r) => <option key={r.id} value={`region:${r.id}`}>{r.name}</option>)}</optgroup>)}
        </select>
      </div>
      {quiet && <p className="small warn-text">{quiet}</p>}
      {sec?.find && !quiet && (
        <>
          <div className="kv" data-tip="If anything is going on there. Where nothing is, the analysts turn up nothing.">
            <span>Pace</span><span>{Number.isFinite(days) ? `a lead every ${days < 1.5 ? "day or so" : `${Math.round(days)} days`}${fixing ? " (while fixing, a trickle)" : ""}` : "no analysts"}</span>
          </div>
          <div className="kv" data-tip="The share of what they turn up that's real: OSINT mostly noise; HUMINT (assets) better; SIGINT (stations) best">
            <span>Real, on average</span><span>{pct(odds)}</span>
          </div>
          {col && (
            <div className="kv kv-block"><span>Collection</span>
              <span>OSINT always{col.sigint > 0 ? " · SIGINT: a station hears it" : " · no SIGINT"}{col.humint > 0 ? " · HUMINT: our assets" : " · no HUMINT"}</span>
            </div>
          )}
        </>
      )}
      <h4 className="section-title">Fix</h4>
      {fixing ? (
        <div className="kv"><span>Working</span><span>{fixing.title} · {pct(confidence(g, fixing))} real · {caseOf(g, fixing)?.evidence.length ?? 0} of {MAX_EVIDENCE} pieces</span></div>
      ) : (
        <p className="small dim">No lead being worked. Choose one from the list, then Work this lead.</p>
      )}
    </>
  );
}

/** Every open lead, most likely real first. A row shows it on the globe. */
function LeadList() {
  const g = useGame();
  const close = useStore((s) => s.closeOverlay);
  const focusOn = useStore((s) => s.focusOn);
  const selectRegion = useStore((s) => s.selectRegion);
  const leads = [...g.leads].sort((a, b) => confidence(g, b) - confidence(g, a));
  const show = (l: Lead) => {
    close();
    globe()?.flyTo(l.pos, 2.2);
    selectRegion(l.regionId, l.pos);
    focusOn({ kind: "lead", id: l.id });
  };
  return (
    <>
      <h4 className="section-title">Open leads <span className="tab-count">{leads.length}</span></h4>
      {!leads.length ? (
        <p className="small dim">No leads open. Point the section at a house or a region.</p>
      ) : (
        <div className="table section-leads">
          <div className="tr"><span className="th">Lead</span><span className="th">From</span><span className="th">Real?</span><span className="th">Evidence</span><span className="th">Cold in</span></div>
          {leads.map((l) => {
            const c = confidence(g, l);
            const ev = caseOf(g, l)?.evidence ?? [];
            return (
              <button key={l.id} className={`tr row-button${g.section?.fixing === l.id ? " on" : ""}`} onClick={() => show(l)} data-tip="Show it on the globe">
                <span className="td-name">{l.title}{g.section?.fixing === l.id ? <span className="tag tag-good lead-tag">Working</span> : null}{l.missionId ? <span className="tag lead-tag">Team sent</span> : null}</span>
                <span className="td-dim">{VIA_SHORT[l.via]}</span>
                <span className="intel"><span className={`intel-bar conf${c >= 0.7 ? " high" : c < 0.35 ? " low" : ""}`}><span style={{ width: pct(c) }} /></span>{pct(c)}</span>
                <span className="td-dim">{ev.length ? `${ev.filter((e) => e.supports).length} for, ${ev.filter((e) => !e.supports).length} against` : "none yet"}</span>
                <span className="td-dim">{timeLeft(l.expiresAt - g.time)}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

export function BloodlinesScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeOverlay);
  const tab = useStore((s) => s.bloodlinesTab);
  const open = useStore((s) => s.openBloodlines);
  const fallen = destroyedCount(g);
  // Start on the line we know most about that still stands.
  const [picked, setPicked] = useState<string>(
    () => [...BLOODLINES].filter((b) => !g.bloodlines[b.id]?.destroyedAt).sort((a, c) => knowledgeOf(g, c.id) - knowledgeOf(g, a.id))[0]?.id ?? BLOODLINES[0]!.id,
  );
  return (
    <div className="base-view bloodlines-view">
      <header className="base-view-head">
        <nav className="crumbs"><span className="crumb current">Intelligence</span></nav>
        <nav className="rtabs">
          <button className={`rtab${tab === "section" ? " on" : ""}`} onClick={() => open("section")}>
            <Icon name="findings" size={18} />Section<span className="tab-count">{g.leads.length} leads</span>
          </button>
          <button className={`rtab${tab === "houses" ? " on" : ""}`} onClick={() => open("houses")}>
            <Icon name="bloodlines" size={18} />Houses<span className="tab-count">{fallen ? `${fallen} down` : "six"}</span>
          </button>
        </nav>
        {tab === "houses" && <span className="td-dim">
          {ACT_NAMES[g.story.act]} ·{" "}
          {g.story.act === 1 && "Agnes and the Serpenta Sigil are our quarry, and far beyond us."}
          {g.story.act === 2 && `Break ${SIGILS_TO_RETURN} of the five lesser sigils to reopen Europe: ${lesserBroken(g)} so far.`}
          {g.story.act === 3 && "Europe is open. Find Agnes and end it at Montségur."}
        </span>}
        <button className="mini" onClick={close} title="Back to the globe (Esc)">Close ✕</button>
      </header>
      {tab === "section" ? (
        <div className="research-body">
          <div className="panel rlist-panel"><SectionControls /></div>
          <div className="panel rdetail-panel"><LeadList /></div>
        </div>
      ) : (
      <div className="research-body">
        <div className="panel rlist-panel">
          <p className="small dim">Every house is a network: nests, {DENS} dens, a lair. Burn a nest, snatch one of its people or question a captive for a den clue; {CLUES_PER_DEN} clues find a den; {DENS_FOR_LAIR} dens burned find the lair. Destroy the lair and the line dies.</p>
          <ul className="list">{BLOODLINES.map((b) => <LineRow key={b.id} id={b.id} selected={picked === b.id} onPick={() => setPicked(b.id)} />)}</ul>
        </div>
        <div className="panel rdetail-panel"><Line id={picked} /></div>
      </div>
      )}
    </div>
  );
}

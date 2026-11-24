// Details (docs/WEB_PORT.md 3.10): the Order's books, opened from Funds and
// Secrecy in the top bar. Money line by line against last month, every
// region's support and contribution against last month, and what moved
// secrecy this month and last (sim/ledger.ts).
import { useState } from "react";
import { INSTALLATIONS } from "../../../data/installations";
import { REGIONS, regionById } from "../../../data/regions";
import {
  DEBT_MONTHS_TO_DISSOLVE, HOSTILE_LOSS, HOSTILE_WARNING, hostileRegions, isHostile, monthlyIncome, regionalContribution, runningCost, runningCostMultiplier,
} from "../../../sim/economy";
import { averageSupport, isReady, type MonthLedger, type SecrecyEntry } from "../../../sim/state";
import { formatDate } from "../../../sim/time";
import { Panel } from "../../components/Panel";
import { money, signed, supportTone, supportWord } from "../../format";
import { useGame, useStore } from "../../store";

export type DetailsTab = "funds" | "support" | "secrecy";

const tone = (d: number, eps = 0) => (d > eps ? "good" : d < -eps ? "bad" : "td-dim");
const signedMoney = (d: number) => (Math.round(d) === 0 ? "±$0" : `${d > 0 ? "+" : "−"}${money(Math.abs(d))}`);

/** A money line: this month, last month, and the change (for costs, less is better). */
function Line({ label, now, last, cost, note }: { label: string; now: number; last: number | undefined; cost?: boolean; note?: string }) {
  const d = last === undefined ? undefined : now - last;
  const better = d === undefined ? 0 : cost ? -d : d;
  return (
    <div className="tr" title={note}>
      <span>{label}</span>
      <span className="td-num">{cost && now ? "−" : ""}{money(now)}</span>
      <span className="td-num td-dim">{last === undefined ? "—" : `${cost && last ? "−" : ""}${money(last)}`}</span>
      <span className={`td-num ${tone(better, 500)}`}>{d === undefined ? "" : signedMoney(cost ? -d : d)}</span>
    </div>
  );
}

function Funds() {
  const g = useGame();
  const m = monthlyIncome(g);
  const r = g.lastReport ?? undefined;
  const lastNet = r ? r.stipend + r.regional + (r.market ?? 0) - r.running - r.upkeep - r.leases - r.staff - (r.containment ?? 0) - r.media - (r.humint ?? 0) : undefined;
  const net = m.net + g.market.earned;
  const sites = g.installations.filter((i) => isReady(g, i)).sort((a, b) => runningCost(g, b) - runningCost(g, a));
  return (
    <div className="details-grid">
      <div>
        <h4 className="section-title">This month <span className="tab-count">against {r ? r.month : "last month"}</span></h4>
        <div className="table details-money">
          <span className="th" /> <span className="th td-num">Now</span><span className="th td-num">Last</span><span className="th td-num">Change</span>
          <Line label={`Holy See stipend${g.story.act === 2 && !g.story.exposed ? " (hostage)" : g.story.exposed ? " (disowned)" : ""}`} now={m.stipend} last={r?.stipend} />
          <Line label="Regional contributions" now={m.regional} last={r?.regional} note="See Support for every region." />
          <Line label="Dark web (so far)" now={g.market.earned} last={r ? r.market ?? 0 : undefined} />
          <Line label="Installations" now={m.running} last={r?.running} cost />
          <Line label="Agent upkeep" now={m.upkeep} last={r?.upkeep} cost />
          <Line label="Aircraft" now={m.leases} last={r?.leases} cost />
          <Line label="Scientists & engineers" now={m.staff} last={r?.staff} cost />
          <Line label="Containment" now={m.containment} last={r ? r.containment ?? 0 : undefined} cost />
          <Line label="Media campaigns" now={m.media} last={r?.media} cost note="Paid day by day; this is a full month at today's campaigns." />
          <Line label="HUMINT assets" now={m.humint} last={r ? r.humint ?? 0 : undefined} cost />
          <div className="tr kv-total">
            <span>Net</span>
            <span className={`td-num ${net < 0 ? "bad" : ""}`}>{money(net)}</span>
            <span className="td-num td-dim">{lastNet === undefined ? "—" : money(lastNet)}</span>
            <span className={`td-num ${lastNet === undefined ? "" : tone(net - lastNet, 500)}`}>{lastNet === undefined ? "" : signedMoney(net - lastNet)}</span>
          </div>
        </div>
        <p className="small dim">"Now" is the month so far at today's rates: support, staff and campaigns can still move it before the month closes.</p>
        <div className="kv"><span>Treasury</span><span className={g.funds < 0 ? "bad" : ""}>{money(g.funds)}</span></div>
        {r && <div className="kv"><span>Treasury at the last review</span><span>{money(r.balance)}</span></div>}
        {g.debtMonths > 0 && <div className="kv bad"><span>Months in debt</span><span>{g.debtMonths} / {DEBT_MONTHS_TO_DISSOLVE}</span></div>}
      </div>
      <div>
        <h4 className="section-title">Installations <span className="tab-count">running costs</span></h4>
        <div className="table details-sites">
          <span className="th">Installation</span><span className="th">Region</span><span className="th td-num">Rate</span><span className="th td-num">A month</span>
          {sites.map((i) => {
            const mult = runningCostMultiplier(g.regions[i.regionId]?.support ?? 0);
            return (
              <div key={i.id} className="tr" title={`${INSTALLATIONS[i.kind].name}. Support in the region sets the rate: friendlier regions cost less.`}>
                <span className="td-name"><span className={`dot dot-${i.kind}`} /> {i.name}</span>
                <span className="td-dim">{regionById(i.regionId)?.name}</span>
                <span className={`td-num ${mult < 1 ? "good" : mult > 1 ? "bad" : "td-dim"}`}>×{mult}</span>
                <span className="td-num">{runningCost(g, i) ? `−${money(runningCost(g, i))}` : "free"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Support() {
  const g = useGame();
  const book = g.ledger.current;
  const paid = g.ledger.previous?.paid;
  const rows = REGIONS.map((r) => {
    const st = g.regions[r.id];
    const support = st?.support ?? 0;
    const now = regionalContribution(g, r.id);
    return { r, support, dSupport: support - (book?.support[r.id] ?? support), now, last: paid?.[r.id], pledge: st?.pledge ?? 1, credit: st?.credit ?? 0 };
  }).sort((a, b) => b.now - a.now || b.support - a.support);
  const avg = averageSupport(g);
  const hostile = hostileRegions(g);
  const total = rows.reduce((t, x) => t + x.now, 0);
  const lastTotal = paid ? rows.reduce((t, x) => t + (x.last ?? 0), 0) : undefined;
  return (
    <>
      <div className="details-summary">
        <div className="kv"><span>Average support</span><span className={`tone-${supportTone(avg)}-text`}>{signed(avg, 2)} <span className={tone(avg - g.monthStartSupport, 0.005)}>({signed(avg - g.monthStartSupport, 2)} this month)</span></span></div>
        <div className="kv"><span>Regional contributions</span><span>{money(total)}{lastTotal !== undefined && <span className={tone(total - lastTotal, 500)}> ({signedMoney(total - lastTotal)})</span>}</span></div>
        <div className={`kv ${hostile >= HOSTILE_WARNING ? "bad" : ""}`} title={`If ${HOSTILE_LOSS} regions turn hostile, the war is lost`}><span>Hostile regions</span><span>{hostile} / {HOSTILE_LOSS}</span></div>
      </div>
      <div className="table details-regions">
        <span className="th">Region</span>
        <span className="th">Support</span>
        <span className="th td-num" title="Since the month opened (where it stood when last month closed)">Change</span>
        <span className="th td-num">Gives a month</span>
        <span className="th td-num" title="Against what it paid last month">Change</span>
        <span className="th td-num" title="Its pledge: results in the field raise it at the month's review">Pledge</span>
        <span className="th td-num" title="This month's record, settled into the pledge at the review">Record</span>
        {rows.map((x) => (
          <div key={x.r.id} className={`tr${isHostile(x.support) ? " hostile" : ""}`}>
            <span className="td-name">{x.r.name}</span>
            <span className={`tone-${supportTone(x.support)}-text`}>{signed(x.support, 1)} <span className="td-dim">{supportWord(x.support)}</span></span>
            <span className={`td-num ${tone(x.dSupport, 0.05)}`}>{signed(x.dSupport, 1)}</span>
            <span className="td-num">{money(x.now)}</span>
            <span className={`td-num ${x.last === undefined ? "td-dim" : tone(x.now - x.last, 500)}`}>{x.last === undefined ? "—" : signedMoney(x.now - x.last)}</span>
            <span className="td-num td-dim">×{x.pledge.toFixed(2)}</span>
            <span className={`td-num ${tone(x.credit, 0.001)}`}>{x.credit ? `${x.credit > 0 ? "+" : "−"}${Math.round(Math.abs(x.credit) * 100)}%` : ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Entries({ entries, empty }: { entries: SecrecyEntry[]; empty: string }) {
  if (!entries.length) return <p className="small dim">{empty}</p>;
  const sorted = [...entries].sort((a, b) => b.time - a.time);
  return (
    <div className="table details-secrecy">
      {sorted.map((e, i) => (
        <div key={`${e.reason}-${i}`} className="tr">
          <span className="td-dim">{formatDate(e.time)}</span>
          <span>{e.reason.charAt(0).toUpperCase() + e.reason.slice(1)}{e.count > 1 && <span className="td-dim"> ×{e.count}</span>}{e.regionId && regionById(e.regionId) && <span className="td-dim"> · {regionById(e.regionId)!.name}</span>}</span>
          <span className={`td-num ${tone(e.delta, 0.005)}`}>{signed(e.delta, Math.abs(e.delta) < 1 ? 1 : 0)}</span>
        </div>
      ))}
    </div>
  );
}

function sums(book: MonthLedger) {
  const lost = book.secrecy.filter((e) => e.delta < 0).reduce((t, e) => t + e.delta, 0);
  const gained = book.secrecy.filter((e) => e.delta > 0).reduce((t, e) => t + e.delta, 0);
  return { lost, gained };
}

function Secrecy() {
  const g = useGame();
  const book = g.ledger.current;
  const prev = g.ledger.previous;
  if (g.openWar) return <p className="prose">The Masquerade is broken. There is no secret left to keep: this is open war.</p>;
  if (!book) return null;
  const now = sums(book);
  const before = prev ? sums(prev) : null;
  return (
    <div className="details-grid">
      <div>
        <h4 className="section-title">This month</h4>
        <div className="kv"><span>Secrecy</span><span>{Math.round(g.secrecy)} <span className={tone(g.secrecy - book.secrecyStart, 0.05)}>({signed(g.secrecy - book.secrecyStart, 1)} since the month opened)</span></span></div>
        <div className="kv"><span>Lost</span><span className="bad">{signed(now.lost, 1)}</span></div>
        <div className="kv"><span>Won back</span><span className="good">{signed(now.gained, 1)}</span></div>
        {before && (
          <div className="kv"><span>Net, against last month</span>
            <span className={tone((now.lost + now.gained) - (before.lost + before.gained), 0.05)}>{signed(now.lost + now.gained, 1)} vs {signed(before.lost + before.gained, 1)}</span>
          </div>
        )}
        <h4 className="section-title">What moved it <span className="tab-count">{book.secrecy.length}</span></h4>
        <Entries entries={book.secrecy} empty="Nothing yet this month." />
      </div>
      <div>
        <h4 className="section-title">Last month</h4>
        {prev ? (
          <>
            <div className="kv"><span>Secrecy</span><span>{Math.round(prev.secrecyStart)} → {Math.round(prev.secrecyEnd ?? g.secrecy)}</span></div>
            <div className="kv"><span>Lost · won back</span><span><span className="bad">{signed(before!.lost, 1)}</span> · <span className="good">{signed(before!.gained, 1)}</span></span></div>
            <h4 className="section-title">What moved it <span className="tab-count">{prev.secrecy.length}</span></h4>
            <Entries entries={prev.secrecy} empty="Nothing moved it." />
          </>
        ) : (
          <p className="small dim">The books for last month open at the first review.</p>
        )}
        <p className="small dim research-note">
          Noise in the field, sales on the market and our own media campaigns cost secrecy; quiet days and cover-ups win it back.
          At 0 the Masquerade breaks, for good.
        </p>
      </div>
    </div>
  );
}

const TABS: { id: DetailsTab; label: string }[] = [
  { id: "funds", label: "Funds" },
  { id: "support", label: "Support" },
  { id: "secrecy", label: "Secrecy" },
];

export function DetailsScreen() {
  const g = useGame();
  const close = useStore((s) => s.closeOverlay);
  const [tab, setTab] = useState<DetailsTab>(useStore.getState().detailsTab);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <Panel title="The Order's books" className="modal research-screen details-screen">
        <div className="base-head">
          <nav className="tabs market-tabs">
            {TABS.map((t) => <button key={t.id} className={`tab${tab === t.id ? " on" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
          </nav>
          <span className="td-dim">{formatDate(g.time)} · Funds {money(g.funds)} · Secrecy {g.openWar ? "broken" : Math.round(g.secrecy)}</span>
          <button className="mini" onClick={close}>Close ✕</button>
        </div>
        <div className="details-body">
          {tab === "funds" ? <Funds /> : tab === "support" ? <Support /> : <Secrecy />}
        </div>
      </Panel>
    </div>
  );
}

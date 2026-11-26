import { installationById, missionById } from "../../../sim/core/state";
import { useEffect } from "react";
import { AIRCRAFT } from "../../../data/aircraft";
import { capacityOf, carriesRemains, LOAD } from "../../../sim/base/transfers";
import { LoadBar, type LoadItem } from "../../components/LoadBar";
import type { Aircraft } from "../../../sim/core/state";
import { sfx } from "../../../audio/sfx";
import { regionById } from "../../../data/regions";
import { DEBT_MONTHS_TO_DISSOLVE, HOSTILE_LOSS, HOSTILE_WARNING } from "../../../sim/economy/economy";
import { Panel } from "../../components/Panel";
import { Portrait } from "../../components/Portrait";
import { CARDINAL, personById, SCENES } from "../../../data/people";
import { money, signed } from "../../format";
import { globe } from "../../globe";
import { focusFor, useGame, useStore } from "../../store";
import { battleOdds, dropHaul, finishHaul, haulSeats, moveHaul } from "../../../sim/missions/missions";

const HEADINGS: Partial<Record<string, string>> = {
  monthly: "Report to the Holy See",
  "game-over": "Finis",
  lead: "SIGINT intercept",
  arrival: "Orders",
  battle: "Contact",
  debrief: "Debrief",
  haul: "The haul",
  coverup: "Cover-up opportunity",
  "coverup-result": "Cover-up",
  vampire: "Bloodline activity",
  research: "Laboratories",
  debt: "The Holy See",
  site: "Lair found",
  sigil: "A sigil is broken",
  story: "The Serpenta Sigil",
};

const ODDS_WORDS = { good: "Good odds", fair: "Fair odds", poor: "Poor odds" } as const;

/** A team on the ground waits for one decision. */
function ArrivalOrders({ missionId }: { missionId: string }) {
  const g = useGame();
  const decide = useStore((s) => s.decide);
  const m = missionById(g, missionId);
  if (!m?.decision) return null;
  return (
    <>
      {m.decision.warning && <p className="prose warning"><span className="warning-mark">Something is off.</span> {m.decision.warning}</p>}
      <div className="orders">
        {m.decision.options.map((o, i) => (
          <button key={o.id} className={`action order${o.id === "abort" || o.id === "wait" ? "" : " primary"}`} onClick={() => decide(m.id, o.id)} autoFocus={i === 0} data-tip={o.detail}>
            <span className="order-head">
              <span className="action-title">{o.label}</span>
              {o.odds && <span className={`odds odds-${o.odds}`}>{ODDS_WORDS[o.odds]}</span>}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/** A fight is about to start: take command of it, or leave it to the team (the auto-combat). */
function BattleOrders({ missionId }: { missionId: string }) {
  const g = useGame();
  const command = useStore((s) => s.commandBattle);
  const auto = useStore((s) => s.autoResolve);
  const m = missionById(g, missionId);
  if (!m?.battle) return null;
  const p = battleOdds(g, m);
  const word = p >= 0.7 ? "good" : p >= 0.45 ? "fair" : "poor";
  return (
    <div className="orders">
      <button className="action order primary" onClick={() => command(m.id)} autoFocus
        data-tip="Fight it on the battlescape: our operatives as they are, what they carry, the place and the hour.">
        <span className="order-head"><span className="action-title">Take command</span></span>
      </button>
      <button className="action order" onClick={() => auto(m.id)} data-tip="The team fights it out without you; the outcome comes in the debrief.">
        <span className="order-head">
          <span className="action-title">Leave it to the team</span>
          <span className={`odds odds-${word}`}>{ODDS_WORDS[word]}</span>
        </span>
      </button>
    </div>
  );
}

/** Sensitive site exploitation: one load bar per aircraft on the ground; move bodies and captives between them, then take off. */
function HaulOrders({ missionId }: { missionId: string }) {
  const g = useGame();
  const command = useStore((s) => s.command);
  const m = missionById(g, missionId);
  if (!m?.haul) return null;
  const seats = haulSeats(g, m);
  const baseName = (a: Aircraft) => installationById(g, a.baseId)?.name ?? "?";
  const move = (from: string, to: string, captiveId?: string) => command((s) => moveHaul(s, m.id, from, to, captiveId));
  return (
    <>
      <div className="haul">
        {seats.map(({ a, people }) => {
          const others = seats.filter((x) => x.a !== a);
          const items: LoadItem[] = [
            ...Array.from({ length: people }, (_, k): LoadItem => ({ id: `p${k}`, load: LOAD.person, label: "One of ours", kind: "operative" })),
            ...(a.cargo?.captives ?? []).map((x): LoadItem => ({ id: x.id, load: LOAD.captive, label: `Captive ${x.kind}`, kind: "bio" })),
            ...Array.from({ length: a.cargo?.remains ?? 0 }, (_, k): LoadItem => ({ id: `r${k}`, load: LOAD.remains, label: "Vampire remains", kind: "bio" })),
          ];
          return (
            <div key={a.id} className="haul-craft">
              <div className="kv"><span><b>{a.name}</b> for {baseName(a)}</span><span className="td-dim">{AIRCRAFT[a.kind].name}</span></div>
              <LoadBar items={items} capacity={capacityOf(a.kind)} />
              {(a.cargo?.captives ?? []).map((x) => (
                <div key={x.id} className="kv small"><span>Captive {x.kind}</span>
                  <span>
                    {others.map((o) => <button key={o.a.id} className="mini" onClick={() => move(a.id, o.a.id, x.id)}>→ {o.a.name}</button>)}
                    <button className="mini" onClick={() => command((s) => dropHaul(s, m.id, a.id, x.id))}>{x.kind === "vampire" ? "Destroy" : "Let go"}</button>
                  </span>
                </div>
              ))}
              {(a.cargo?.remains ?? 0) > 0 && (
                <div className="kv small"><span>Vampire remains ×{a.cargo!.remains}</span>
                  <span>
                    {others.filter((o) => carriesRemains(o.a.kind)).map((o) => <button key={o.a.id} className="mini" onClick={() => move(a.id, o.a.id)}>one → {o.a.name}</button>)}
                    <button className="mini" onClick={() => command((s) => dropHaul(s, m.id, a.id))}>Burn one</button>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="modal-row">
        <button className="action primary" autoFocus onClick={() => command((s) => finishHaul(s, m.id))}>
          <span className="action-title">Take off</span>
        </button>
      </div>
    </>
  );
}

/** The oldest pending event. Time stays stopped until it is dismissed. */
export function EventModal() {
  const g = useGame();
  const dismiss = useStore((s) => s.dismissEvent);
  const selectRegion = useStore((s) => s.selectRegion);
  const focusOn = useStore((s) => s.focusOn);
  const quitToMenu = useStore((s) => s.quitToMenu);
  const e = g.events[0];
  // Each dispatch sounds its cue once, as it comes up.
  useEffect(() => {
    if (e) sfx.playEvent(e.kind);
  }, [e?.id]);
  if (!e) return null;

  const show = () => {
    // Stop the clock so the player can read what they asked to see.
    useStore.setState({ paused: true });
    if (e.pos) globe()?.flyTo(e.pos, 2.2);
    if (e.regionId && e.pos) selectRegion(e.regionId, e.pos);
    dismiss();
    const f = e.refId ? focusFor(g, e.refId) : null;
    if (f) focusOn(f);
  };

  const r = g.lastReport;
  const speaker = personById(e.speaker);
  // How a lead came in, when we have a picture for it.
  const scene = e.scene && SCENES[e.scene].file ? SCENES[e.scene] : null;
  // The cardinal speaks from a guarded room while the Vatican is held.
  const hostage = speaker?.id === CARDINAL.id && g.story.act === 2 && !g.story.exposed;
  const heading = e.heading ?? (e.kind === "game-over" && g.story.won ? "Deo gratias" : speaker?.id === CARDINAL.id ? (hostage ? "Reserve channel" : `From ${CARDINAL.short}`) : HEADINGS[e.kind] ?? "Dispatch");
  return (
    <div className="modal-backdrop">
      <Panel title={heading} className={`modal event event-${e.kind}${speaker || scene ? " has-speaker" : ""}`}>
        <div className="speaker-row">
        {scene ? (
          <div className="speaker">
            <img className="portrait portrait-md" src={`${import.meta.env.BASE_URL}assets/portraits/${scene.file}`} alt={scene.caption} draggable={false} />
            <div className="speaker-caption">
              <span className="speaker-name">{scene.caption}{e.regionId ? `, ${regionById(e.regionId)?.name}` : ""}</span>
              {speaker && <span className="speaker-title">Passed on by {speaker.short}{hostage ? ", on the reserve channel" : ""}</span>}
            </div>
          </div>
        ) : speaker && (
          <div className="speaker">
            <Portrait person={speaker} />
            <div className="speaker-caption">
              <span className="speaker-name">{speaker.name}</span>
              <span className="speaker-title">{hostage ? "Reserve channel · the Vatican is held" : speaker.title}</span>
            </div>
          </div>
        )}
        <div className="event-main">
        <h3 className="event-title">{e.kind === "monthly" && r ? `Month ending ${r.month}` : e.title}</h3>
        {e.kind === "monthly" && r ? (
          <div className="report">
            <div className="kv"><span>Holy See stipend{g.story.act === 2 && !g.story.exposed ? " (hostage)" : g.story.exposed ? " (disowned)" : ""}</span><span>{money(r.stipend)}</span></div>
            <div className="kv"><span>Regional contributions</span><span>{money(r.regional)}</span></div>
            {(r.market ?? 0) > 0 && <div className="kv"><span>Dark web</span><span>{money(r.market!)}</span></div>}
            <div className="kv"><span>Installations</span><span>−{money(r.running)}</span></div>
            <div className="kv"><span>Operative upkeep</span><span>−{money(r.upkeep ?? 0)}</span></div>
            <div className="kv"><span>Aircraft</span><span>−{money(r.leases ?? 0)}</span></div>
            <div className="kv"><span>Staff salaries</span><span>−{money(r.staff ?? 0)}</span></div>
            {(r.containment ?? 0) > 0 && <div className="kv"><span>Containment</span><span>−{money(r.containment!)}</span></div>}
            {(r.media ?? 0) > 0 && <div className="kv"><span>Media campaigns</span><span>−{money(r.media)}</span></div>}
            {(r.humint ?? 0) > 0 && <div className="kv"><span>HUMINT agents</span><span>−{money(r.humint!)}</span></div>}
            <div className="kv kv-total"><span>Treasury</span><span>{money(r.balance)}</span></div>
            {r.pledges && r.pledges.length > 0 && (
              <div className="pledges">
                <h4 className="section-title">The review</h4>
                {r.pledges.slice(0, 8).map((p) => (
                  <div key={p.regionId} className={`kv ${p.delta > 0 ? "good" : "bad"}`}>
                    <span>{regionById(p.regionId)?.name} {p.delta > 0 ? "gives more" : "gives less"}</span>
                    <span>{p.delta > 0 ? "+" : "−"}{money(Math.abs(p.delta))}/mo</span>
                  </div>
                ))}
                {r.pledges.length > 8 && <p className="small dim">and {r.pledges.length - 8} more.</p>}
              </div>
            )}
            <div className={`kv ${r.supportChange < 0 ? "bad" : "good"}`}>
              <span>Average support</span><span>{signed(r.supportChange, 2)} this month</span>
            </div>
            {r.hostile !== undefined && (
              <div className={`kv ${r.hostile >= HOSTILE_WARNING ? "bad" : ""}`}>
                <span>Hostile regions</span><span>{r.hostile} ({HOSTILE_LOSS} loses the war)</span>
              </div>
            )}
            {r.balance < 0 && (
              <p className="prose warning">
                In the red: {g.debtMonths} of {DEBT_MONTHS_TO_DISSOLVE} months before the Holy See dissolves the Order.
              </p>
            )}
            {r.supportChange < -0.1 && (
              <p className="prose dim">The bloodlines' campaigns are working. Without results in the field, regions will turn on us.</p>
            )}
          </div>
        ) : (
          e.body.split("\n\n").map((para, i) => <p key={i} className="prose event-body">{para}</p>)
        )}
        {e.effects && <p className="effects">{e.effects}</p>}
        {e.improved && e.improved.length > 0 && (
          <div className="improved">
            <span className="improved-head">Experience</span>
            {e.improved.map((l) => <span key={l} className="improved-line">{l}</span>)}
          </div>
        )}
        {e.casualties && (e.casualties.dead.length > 0 || e.casualties.wounded.length > 0) && (
          <div className="casualties">
            {e.casualties.dead.length > 0 && <div className="kv bad"><span>Fallen</span><span>{e.casualties.dead.join(", ")}</span></div>}
            {e.casualties.wounded.length > 0 && <div className="kv"><span>Wounded</span><span className="tone-warn-text">{e.casualties.wounded.join(", ")}</span></div>}
          </div>
        )}
        {e.regionId && <p className="event-region">{regionById(e.regionId)?.name}</p>}
        {e.kind === "arrival" && e.refId ? (
          <ArrivalOrders missionId={e.refId} />
        ) : e.kind === "battle" && e.refId ? (
          <BattleOrders missionId={e.refId} />
        ) : e.kind === "haul" && e.refId ? (
          <HaulOrders missionId={e.refId} />
        ) : (
        <div className="modal-row">
          {e.kind === "game-over" ? (
            <button className="action primary" onClick={quitToMenu}>
              <span className="action-title">Return to the main menu</span>
            </button>
          ) : (
            <>
              {e.kind === "research" && (
                <button className="action" onClick={() => { dismiss(); useStore.getState().openResearch(); }}>
                  <span className="action-title">Choose what's next</span>
                </button>
              )}
              {e.pos && (
                <button className={`action${e.kind === "coverup" ? " primary" : ""}`} onClick={show}>
                  <span className="action-title">{e.kind === "coverup" ? "Review the offer" : "Show on the globe"}</span>
                </button>
              )}
              <button className={`action${e.kind === "coverup" ? "" : " primary"}`} onClick={dismiss} autoFocus>
                <span className="action-title">{e.kind === "coverup" ? "Later" : "Continue"}</span>
              </button>
            </>
          )}
        </div>
        )}
        </div>
        </div>
      </Panel>
    </div>
  );
}

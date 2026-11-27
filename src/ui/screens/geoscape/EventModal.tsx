import { installationById, missionById } from "../../../sim/core/state";
import { useEffect, type ReactNode } from "react";
import type { GameState } from "../../../sim/core/state";
import { AIRCRAFT } from "../../../data/aircraft";
import { capacityOf, carriesRemains, LOAD } from "../../../sim/base/transfers";
import { LoadBar, type LoadItem } from "../../components/LoadBar";
import type { Aircraft } from "../../../sim/core/state";
import { sfx } from "../../../audio/sfx";
import { regionById } from "../../../data/regions";
import {
  DEBT_MONTHS_TO_DISSOLVE,
  HOSTILE_LOSS,
  HOSTILE_WARNING,
} from "../../../sim/economy/economy";
import { Panel } from "../../components/Panel";
import { Portrait } from "../../components/Portrait";
import { CARDINAL, personById, SCENES } from "../../../data/people";
import { money, signed } from "../../format";
import { globe } from "../../globe";
import { focusFor, useGame, useStore } from "../../store";
import { battleOdds } from "../../../sim/missions/battles";
import { dropHaul, finishHaul, haulSeats, moveHaul } from "../../../sim/missions/haul";

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
      {m.decision.warning && (
        <p className="prose warning">
          <span className="warning-mark">Something is off.</span> {m.decision.warning}
        </p>
      )}
      <div className="orders">
        {m.decision.options.map((o, i) => (
          <button
            key={o.id}
            className={`action order${o.id === "abort" || o.id === "wait" ? "" : " primary"}`}
            onClick={() => decide(m.id, o.id)}
            autoFocus={i === 0}
            data-tip={o.detail}
          >
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
      <button
        className="action order primary"
        onClick={() => command(m.id)}
        autoFocus
        data-tip="Fight it on the battlescape: our operatives as they are, what they carry, the place and the hour."
      >
        <span className="order-head">
          <span className="action-title">Take command</span>
        </span>
      </button>
      <button
        className="action order"
        onClick={() => auto(m.id)}
        data-tip="The team fights it out without you; the outcome comes in the debrief."
      >
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
  const move = (from: string, to: string, captiveId?: string) =>
    command((s) => moveHaul(s, m.id, from, to, captiveId));
  return (
    <>
      <div className="haul">
        {seats.map(({ a, people }) => {
          const others = seats.filter((x) => x.a !== a);
          const items: LoadItem[] = [
            ...Array.from({ length: people }, (_, k): LoadItem => ({
              id: `p${k}`,
              load: LOAD.person,
              label: "One of ours",
              kind: "operative",
            })),
            ...(a.cargo?.captives ?? []).map((x): LoadItem => ({
              id: x.id,
              load: LOAD.captive,
              label: `Captive ${x.kind}`,
              kind: "bio",
            })),
            ...Array.from({ length: a.cargo?.remains ?? 0 }, (_, k): LoadItem => ({
              id: `r${k}`,
              load: LOAD.remains,
              label: "Vampire remains",
              kind: "bio",
            })),
          ];
          return (
            <div key={a.id} className="haul-craft">
              <div className="kv">
                <span>
                  <b>{a.name}</b> for {baseName(a)}
                </span>
                <span className="td-dim">{AIRCRAFT[a.kind].name}</span>
              </div>
              <LoadBar items={items} capacity={capacityOf(a.kind)} />
              {(a.cargo?.captives ?? []).map((x) => (
                <div key={x.id} className="kv small">
                  <span>Captive {x.kind}</span>
                  <span>
                    {others.map((o) => (
                      <button
                        key={o.a.id}
                        className="mini"
                        onClick={() => move(a.id, o.a.id, x.id)}
                      >
                        → {o.a.name}
                      </button>
                    ))}
                    <button
                      className="mini"
                      onClick={() => command((s) => dropHaul(s, m.id, a.id, x.id))}
                    >
                      {x.kind === "vampire" ? "Destroy" : "Let go"}
                    </button>
                  </span>
                </div>
              ))}
              {(a.cargo?.remains ?? 0) > 0 && (
                <div className="kv small">
                  <span>Vampire remains ×{a.cargo!.remains}</span>
                  <span>
                    {others
                      .filter((o) => carriesRemains(o.a.kind))
                      .map((o) => (
                        <button key={o.a.id} className="mini" onClick={() => move(a.id, o.a.id)}>
                          one → {o.a.name}
                        </button>
                      ))}
                    <button
                      className="mini"
                      onClick={() => command((s) => dropHaul(s, m.id, a.id))}
                    >
                      Burn one
                    </button>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="modal-row">
        <button
          className="action primary"
          autoFocus
          onClick={() => command((s) => finishHaul(s, m.id))}
        >
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

  const speaker = personById(e.speaker);
  // How a lead came in, when we have a picture for it.
  const scene = e.scene && SCENES[e.scene].file ? SCENES[e.scene] : null;
  // The cardinal speaks from a guarded room while the Vatican is held.
  const hostage = speaker?.id === CARDINAL.id && g.story.act === 2 && !g.story.exposed;
  const report = e.kind === "monthly" ? g.lastReport : null;
  return (
    <div className="modal-backdrop">
      <Panel
        title={headingFor(g, e, speaker, hostage)}
        className={`modal event event-${e.kind}${speaker || scene ? " has-speaker" : ""}`}
      >
        <div className="speaker-row">
          {scene && <SceneCaption e={e} scene={scene} speaker={speaker} hostage={hostage} />}
          {!scene && speaker && (
            <div className="speaker">
              <Portrait person={speaker} />
              <div className="speaker-caption">
                <span className="speaker-name">{speaker.name}</span>
                <span className="speaker-title">
                  {hostage ? "Reserve channel · the Vatican is held" : speaker.title}
                </span>
              </div>
            </div>
          )}
          <div className="event-main">
            <h3 className="event-title">{report ? `Month ending ${report.month}` : e.title}</h3>
            {report ? (
              <MonthlyReport r={report} />
            ) : (
              e.body.split("\n\n").map((para, i) => (
                <p key={i} className="prose event-body">
                  {para}
                </p>
              ))
            )}
            {e.effects && <p className="effects">{e.effects}</p>}
            {e.improved && e.improved.length > 0 && (
              <div className="improved">
                <span className="improved-head">Experience</span>
                {e.improved.map((l) => (
                  <span key={l} className="improved-line">
                    {l}
                  </span>
                ))}
              </div>
            )}
            {e.casualties && <Casualties {...e.casualties} />}
            {e.regionId && <p className="event-region">{regionById(e.regionId)?.name}</p>}
            <EventActions e={e} show={show} />
          </div>
        </div>
      </Panel>
    </div>
  );
}

type Event = GameState["events"][number];
type Person = NonNullable<ReturnType<typeof personById>>;
type Report = NonNullable<GameState["lastReport"]>;

/** The window's title: the event's own, the cardinal's, or one by kind. */
function headingFor(g: GameState, e: Event, speaker: Person | undefined, hostage: boolean): string {
  if (e.heading) return e.heading;
  if (e.kind === "game-over" && g.story.won) return "Deo gratias";
  if (speaker?.id === CARDINAL.id) return hostage ? "Reserve channel" : `From ${CARDINAL.short}`;
  return HEADINGS[e.kind] ?? "Dispatch";
}

/** The picture of how a lead came in, captioned with where, and who passed it on. */
function SceneCaption({
  e,
  scene,
  speaker,
  hostage,
}: {
  e: Event;
  scene: { file?: string; caption: string };
  speaker: Person | undefined;
  hostage: boolean;
}) {
  return (
    <div className="speaker">
      <img
        className="portrait portrait-md"
        src={`${import.meta.env.BASE_URL}assets/portraits/${scene.file}`}
        alt={scene.caption}
        draggable={false}
      />
      <div className="speaker-caption">
        <span className="speaker-name">
          {scene.caption}
          {e.regionId ? `, ${regionById(e.regionId)?.name}` : ""}
        </span>
        {speaker && (
          <span className="speaker-title">
            Passed on by {speaker.short}
            {hostage ? ", on the reserve channel" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/** One line of the books: a label and an amount (spending shown with a minus). */
function Line({ label, amount, spent }: { label: ReactNode; amount: number; spent?: boolean }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span>
        {spent ? "−" : ""}
        {money(amount)}
      </span>
    </div>
  );
}

/** The month's report: what came in, what went out, the review of pledges, support. */
function MonthlyReport({ r }: { r: Report }) {
  const g = useGame();
  let stipendNote = "";
  if (g.story.act === 2 && !g.story.exposed) stipendNote = " (hostage)";
  else if (g.story.exposed) stipendNote = " (disowned)";
  const optional = (label: string, amount: number | undefined) =>
    (amount ?? 0) > 0 && <Line label={label} amount={amount!} spent />;
  return (
    <div className="report">
      <Line label={`Holy See stipend${stipendNote}`} amount={r.stipend} />
      <Line label="Regional contributions" amount={r.regional} />
      {(r.market ?? 0) > 0 && <Line label="Dark web" amount={r.market!} />}
      <Line label="Installations" amount={r.running} spent />
      <Line label="Operative upkeep" amount={r.upkeep ?? 0} spent />
      <Line label="Aircraft" amount={r.aircraft ?? 0} spent />
      <Line label="Staff salaries" amount={r.staff ?? 0} spent />
      {optional("Containment", r.containment)}
      {optional("Media campaigns", r.media)}
      {optional("HUMINT agents", r.humint)}
      <div className="kv kv-total">
        <span>Treasury</span>
        <span>{money(r.balance)}</span>
      </div>
      {r.pledges && r.pledges.length > 0 && (
        <div className="pledges">
          <h4 className="section-title">The review</h4>
          {r.pledges.slice(0, 8).map((p) => (
            <div key={p.regionId} className={`kv ${p.delta > 0 ? "good" : "bad"}`}>
              <span>
                {regionById(p.regionId)?.name} {p.delta > 0 ? "gives more" : "gives less"}
              </span>
              <span>
                {p.delta > 0 ? "+" : "−"}
                {money(Math.abs(p.delta))}/mo
              </span>
            </div>
          ))}
          {r.pledges.length > 8 && <p className="small dim">and {r.pledges.length - 8} more.</p>}
        </div>
      )}
      <div className={`kv ${r.supportChange < 0 ? "bad" : "good"}`}>
        <span>Average support</span>
        <span>{signed(r.supportChange, 2)} this month</span>
      </div>
      {r.hostile !== undefined && (
        <div className={`kv ${r.hostile >= HOSTILE_WARNING ? "bad" : ""}`}>
          <span>Hostile regions</span>
          <span>
            {r.hostile} ({HOSTILE_LOSS} loses the war)
          </span>
        </div>
      )}
      {r.balance < 0 && (
        <p className="prose warning">
          In the red: {g.debtMonths} of {DEBT_MONTHS_TO_DISSOLVE} months before the Holy See
          dissolves the Order.
        </p>
      )}
      {r.supportChange < -0.1 && (
        <p className="prose dim">
          The bloodlines' campaigns are working. Without results in the field, regions will turn on
          us.
        </p>
      )}
    </div>
  );
}

function Casualties({ dead, wounded }: { dead: string[]; wounded: string[] }) {
  if (!dead.length && !wounded.length) return null;
  return (
    <div className="casualties">
      {dead.length > 0 && (
        <div className="kv bad">
          <span>Fallen</span>
          <span>{dead.join(", ")}</span>
        </div>
      )}
      {wounded.length > 0 && (
        <div className="kv">
          <span>Wounded</span>
          <span className="tone-warn-text">{wounded.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

/** What the player can do: a team's orders, or Continue (with Show on the globe, or the research list). */
function EventActions({ e, show }: { e: Event; show: () => void }) {
  const dismiss = useStore((s) => s.dismissEvent);
  const quitToMenu = useStore((s) => s.quitToMenu);
  if (e.refId && e.kind === "arrival") return <ArrivalOrders missionId={e.refId} />;
  if (e.refId && e.kind === "battle") return <BattleOrders missionId={e.refId} />;
  if (e.refId && e.kind === "haul") return <HaulOrders missionId={e.refId} />;
  if (e.kind === "game-over")
    return (
      <div className="modal-row">
        <button className="action primary" onClick={quitToMenu}>
          <span className="action-title">Return to the main menu</span>
        </button>
      </div>
    );
  const offer = e.kind === "coverup";
  return (
    <div className="modal-row">
      {e.kind === "research" && (
        <button
          className="action"
          onClick={() => {
            dismiss();
            useStore.getState().openResearch();
          }}
        >
          <span className="action-title">Choose what's next</span>
        </button>
      )}
      {e.pos && (
        <button className={`action${offer ? " primary" : ""}`} onClick={show}>
          <span className="action-title">{offer ? "Review the offer" : "Show on the globe"}</span>
        </button>
      )}
      <button className={`action${offer ? "" : " primary"}`} onClick={dismiss} autoFocus>
        <span className="action-title">{offer ? "Later" : "Continue"}</span>
      </button>
    </div>
  );
}

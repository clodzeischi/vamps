// Arrival: the team on site, the decision put to the player, and carrying out the choice.
import { hiredFlight } from "../../data/aircraft";
import { rng } from "../core/rng";
import {
  addLog,
  post,
  type Agent,
  type Decision,
  type DecisionOption,
  type GameState,
  type LeadKind,
  type Mission,
  type SceneId,
  craftById,
  leadById,
  missionById,
  siteById,
} from "../core/state";
import { HOUR } from "../core/time";
import { missionAgents, SITE_KINDS } from "./common";
import { playsFor } from "./plays";
import { missionCraft } from "./dispatch";
import { startReturn } from "./haul";
import { recallWings } from "./missions";
import { resolve } from "./resolution";

const SITUATIONS: Record<Exclude<LeadKind, "double">, string> = {
  capture:
    "The target is where the intercepts said he would be. He finishes at two and walks home alone.",
  source: "The source has agreed to meet at a café near the cathedral at nine.",
  surveillance:
    "The building is quiet. Lights on the top floor, blinds down, and a man smoking by the side door who never seems to leave.",
  recovery: "The material is still where it was. For now.",
  rescue:
    "The signal still pings from the same block every night. If she is alive, she is in there.",
};

/** Tells that a meeting is a trap, or look like one. */
const TELLS = [
  "A van has been parked across from the café for two hours. Nobody has got out.",
  "The source chose the table furthest from the windows, and keeps glancing at the kitchen door.",
  "Two men at the bar have nursed the same drinks since we arrived. Neither has touched his phone.",
  "The source's phone has been off since this morning. They say they lost the charger.",
  "The source asked, twice, how many of us would come.",
];

function oddsWord(p: number): DecisionOption["odds"] {
  return p >= 0.7 ? "good" : p >= 0.45 ? "fair" : "poor";
}

function makeDecision(s: GameState, m: Mission): Decision {
  const r = rng(s);
  const agents = missionAgents(s, m);
  let situation: string;
  let warning: string | null = null;
  if (m.target.kind === "site") {
    const site = siteById(s, m.target.id)!;
    situation = `${SITE_KINDS[site.kind].description} SIGINT counts about ${site.thralls} thralls and ${site.vampires === 1 ? "one of them" : `${site.vampires} of them`}.`;
  } else {
    const shown = m.leadKind === "double" ? "source" : (m.leadKind ?? "source");
    situation = SITUATIONS[shown];
    if (shown === "source") {
      // A double agent may give itself away to a sharp team; an honest source is sometimes just nervous.
      const insight = Math.max(...agents.map((a) => a.aptitudes.insight));
      const p = m.leadKind === "double" ? 0.25 + m.intel * 0.35 + insight / 300 : 0.15;
      if (r.chance(p)) warning = r.pick(TELLS);
    }
  }
  return { situation, warning, options: decisionOptions(s, m, warning) };
}

/** The plays open to the team on the ground, and "wait" while another team is in the air. */
function decisionOptions(s: GameState, m: Mission, warning: string | null): DecisionOption[] {
  const agents = missionAgents(s, m);
  const options: DecisionOption[] = playsFor(m)
    .filter((p) => !p.whenWarned || warning)
    .map((p) => ({
      id: p.id,
      label: p.label,
      detail: p.detail,
      odds: p.odds ? oddsWord(p.odds(s, m, agents)) : null,
    }));
  const flying = (m.wings ?? []).filter((w) => !w.landed);
  if (flying.length) {
    const next = flying.reduce((a, b) => (a.arriveAt <= b.arriveAt ? a : b));
    const names = flying.flatMap((w) => missionCraft(s, w).map((a) => a.name)).join(", ");
    options.push({
      id: "wait",
      label: `Wait for ${names}`,
      detail: `Hold on the ground until the next team lands (${Math.max(1, Math.round((next.arriveAt - s.time) / HOUR))} h). Nothing is lost by waiting while the target is there.`,
      odds: null,
    });
  }
  return options;
}

/** New orders for a team on the ground: who is there has changed. The tell (if any) stays what it was. */
export function refreshOrders(s: GameState, m: Mission) {
  const warning = m.decision?.warning ?? null;
  const base = m.decision?.situation ?? makeDecision(s, m).situation;
  m.decision = { situation: base, warning, options: decisionOptions(s, m, warning) };
  m.waiting = false;
  s.events = s.events.filter((e) => !(e.kind === "arrival" && e.refId === m.id));
  const landed = (m.wings ?? []).filter((w) => w.landed);
  postArrival(s, m, landed.at(-1)?.aircraftId ?? m.aircraftId);
}

/** How a team got in, for the arrival picture: our jet drops it in free fall, a helicopter
 *  sets down on a roof, a hired flight (charter or airline) lands at an airport. */
function arrivalScene(s: GameState, aircraftId: string): SceneId {
  if (hiredFlight(aircraftId)) return "passport";
  return craftById(s, aircraftId)?.kind === "jet" ? "freefall" : "rooftop";
}

/** "Brother Anselm, Sister Clare and 3 others" */
function teamNames(agents: Agent[]): string {
  const names = agents.map((a) => a.name);
  if (names.length > 3) return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`;
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "The team");
}

/** The team is on the ground and waits for orders: who, where, how they got in. */
function postArrival(s: GameState, m: Mission, aircraftId: string) {
  const agents = missionAgents(s, m);
  post(s, {
    kind: "arrival",
    scene: arrivalScene(s, aircraftId),
    heading: "Begin mission?",
    title: `${teamNames(agents)} arrived in ${m.city}`,
    body: m.decision!.situation,
    regionId: m.regionId,
    pos: m.pos,
    refId: m.id,
  });
}

/** "Start mission" for a team holding on the ground: the orders again. */
export function startMission(s: GameState, missionId: string): string | null {
  const m = missionById(s, missionId);
  if (!m || m.phase !== "on-site" || !m.waiting) return "That team is not waiting.";
  refreshOrders(s, m);
  return null;
}

export function arrive(s: GameState, m: Mission) {
  const gone =
    m.target.kind === "lead"
      ? !s.leads.some((l) => l.id === m.target.id)
      : !s.sites.some((x) => x.id === m.target.id);
  if (gone) {
    post(s, {
      kind: "info",
      title: `Too late: ${m.city}`,
      body:
        m.target.kind === "lead"
          ? `By the time the team reached ${m.city}, the trail had gone cold. They are on their way home.`
          : `The team reached ${m.city} to find the place empty: they moved on. The team is on its way home.`,
      regionId: m.regionId,
      pos: m.pos,
      refId: m.id,
    });
    startReturn(s, m);
    return;
  }
  m.phase = "on-site";
  m.decision = makeDecision(s, m);
  postArrival(s, m, m.aircraftId);
}

/** The player's choice on arrival. Returns an error, or null. */
export function decide(s: GameState, missionId: string, optionId: string): string | null {
  const m = missionById(s, missionId);
  if (!m || m.phase !== "on-site" || !m.decision) return "That team is not waiting for orders.";
  if (!m.decision.options.some((o) => o.id === optionId)) return "That is not an option here.";
  s.events = s.events.filter((e) => !(e.kind === "arrival" && e.refId === m.id));
  if (optionId === "wait") {
    m.waiting = true;
    addLog(s, `${m.city}: the team holds on the ground for the others.`);
    return null;
  }
  const play = playsFor(m).find((p) => p.id === optionId);
  if (!play) return "That is not an option here.";
  m.decision = null;
  m.waiting = false;
  recallWings(s, m); // the mission starts with whoever is on the ground
  const hours = play.hours?.(s, m) ?? 0;
  if (hours > 0) {
    m.option = optionId;
    m.workUntil = s.time + hours * HOUR;
    // The target holds still while the team works it.
    const until = m.workUntil + HOUR;
    const lead = leadById(s, m.target.id);
    if (lead) {
      lead.expiresAt = Math.max(lead.expiresAt, until);
      const op = s.operations.find((o) => o.id === lead.opId);
      if (op) op.endsAt = Math.max(op.endsAt, until);
    }
    const site = siteById(s, m.target.id);
    if (site) site.expiresAt = Math.max(site.expiresAt, until);
    addLog(s, `${m.city}: the team settles in (${hours} h).`);
    return null;
  }
  resolve(s, m, play);
  return null;
}

// Advancing game time: hourly, daily and month-end ticks. Time stops as soon
// as an event is posted, so the player sees it before anything else happens.
import { hourlyTransfers } from "./transfers";
import { difficulty } from "../data/difficulty";
import { regionById } from "../data/regions";
import { dailyCoverUps, hourlyCoverUps } from "./coverups";
import { changeSupport, HOSTILE_LOSS, hostileRegions, monthEnd, settleSupport } from "./economy";
import { dailyMedia } from "./media";
import { autoResolveBattle, decide, finishHaul, hourlyMissions } from "./missions";
import { dailyOperations, hourlyOperations } from "./operations";
import { dailyPersonnel, hourlyPersonnel } from "./personnel";
import { dailyResearch } from "./research";
import { aliveBloodlines, boldness } from "./bloodlines";
import { dailyNetworks } from "./networks";
import { dailyIntel } from "./intel";
import { rng } from "./rng";
import { hourlyStory } from "./story";
import { dailyHumint, mediaDamping } from "./humint";
import { dailyMarket } from "./market";
import { post, type GameState } from "./state";
import { DAY, HOUR } from "./time";
import { noteSecrecy } from "./ledger";

function hourly(s: GameState, prev: number) {
  hourlyMissions(s);
  hourlyCoverUps(s);
  hourlyOperations(s);
  hourlyPersonnel(s);
  hourlyTransfers(s);
  hourlyStory(s);
  for (const i of s.installations)
    if (i.readyAt > prev && i.readyAt <= s.time)
      post(s, {
        kind: "construction",
        title: `${i.name} operational`,
        body: i.kind === "sigint"
          ? `${i.name} is online. Vampire activity in ${regionById(i.regionId)?.name ?? "the region"} will now surface as leads.`
          : i.kind === "fuel"
            ? `${i.name} is open. Our aircraft can refuel there and fly on to places they couldn't reach before.`
            : `${i.name} is ready to house strike teams and their aircraft.`,
        regionId: i.regionId,
        pos: i.pos,
      });
}

function daily(s: GameState) {
  const r = rng(s);
  const pressure = difficulty(s.difficulty).vampirePressure;

  dailyOperations(s);
  dailyIntel(s);
  dailyPersonnel(s);
  dailyResearch(s);
  dailyNetworks(s);
  dailyMedia(s);
  dailyHumint(s);
  dailyMarket(s);
  dailyCoverUps(s);

  // The bloodlines' media machines: a slow background erosion. Most of the
  // damage now comes from operations (sim/operations.ts) that go unanswered.
  const alive = aliveBloodlines(s);
  const bold = boldness(s);
  for (const b of alive)
    for (const id of b.homeRegions) changeSupport(s, id, -r.real(0.0005, 0.003) * b.pr * pressure * bold * mediaDamping(s, id));

  // Now and then, a campaign big enough to notice.
  if (alive.length && r.chance(0.035 * pressure * bold)) {
    const b = r.pick(alive);
    const regionId = r.pick(b.homeRegions);
    const region = regionById(regionId)!;
    const hit = r.real(0.4, 0.8) * b.pr * mediaDamping(s, regionId);
    changeSupport(s, regionId, -hit);
    const city = region.cities.length ? r.pick(region.cities.slice(0, 4)) : region.label;
    post(s, {
      kind: "vampire",
      title: `Media campaign in ${region.name}`,
      body: `A slick campaign (glamorous, sympathetic, everywhere at once) is softening opinion in ${region.name}. Our analysts trace the money to ${b.name}. Support ${(-hit).toFixed(1)}.`,
      regionId,
      pos: { lat: city.lat, lon: city.lon },
    });
  }

  // Where nobody pushes, opinion drifts back to neutral.
  settleSupport(s);

  // Quiet days let the story die down.
  if (!s.openWar) {
    const before = s.secrecy;
    s.secrecy = Math.min(100, s.secrecy + 0.1);
    noteSecrecy(s, s.secrecy - before, "quiet days: the story dies down");
  }
}

function checkGameOver(s: GameState) {
  if (s.gameOver) return;
  if (!s.installations.some((i) => i.kind === "base")) {
    s.gameOver = "The last Operational Base has fallen. The Ordo Potestatis Vera is finished.";
    post(s, { kind: "game-over", title: "The Order has fallen", body: s.gameOver });
  } else if (hostileRegions(s) >= HOSTILE_LOSS) {
    s.gameOver = `Half the world (${hostileRegions(s)} regions) has turned against the Church. The Holy See disowns the Order and makes its peace with the bloodlines.`;
    post(s, { kind: "game-over", title: "The world has turned", body: s.gameOver });
  }
}

/**
 * Advances the clock by up to `ms`. Stops early when an event is posted.
 * Returns the time actually advanced.
 */
export function advance(s: GameState, ms: number): number {
  if (s.gameOver || s.events.length || ms <= 0) return 0;
  const start = s.time;
  const end = s.time + ms;
  while (s.time < end && s.events.length === 0) {
    const prev = s.time;
    const nextHour = Math.floor(prev / HOUR) * HOUR + HOUR;
    s.time = Math.min(end, nextHour);
    if (s.time !== nextHour) break;
    hourly(s, prev);
    if (s.time % DAY === 0) daily(s);
    if (new Date(prev).getUTCMonth() !== new Date(s.time).getUTCMonth()) monthEnd(s);
    checkGameOver(s);
  }
  return s.time - start;
}

/** Dismisses the oldest event. A team waiting for orders is told to stand down; a battle nobody commands is fought by the team. */
export function dismissEvent(s: GameState) {
  const e = s.events[0];
  if (e?.kind === "arrival" && e.refId && !decide(s, e.refId, "abort")) return;
  if (e?.kind === "battle" && e.refId && !autoResolveBattle(s, e.refId)) return;
  if (e?.kind === "haul" && e.refId && !finishHaul(s, e.refId)) return; // the team's own split stands
  s.events.shift();
}

export { changeSecrecy } from "./secrecy";

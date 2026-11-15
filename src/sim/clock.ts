// Advancing game time: hourly, daily and month-end ticks. Time stops as soon
// as an event is posted, so the player sees it before anything else happens.
import { BLOODLINES } from "../data/bloodlines";
import { difficulty } from "../data/difficulty";
import { regionById } from "../data/regions";
import { dailyCoverUps, hourlyCoverUps } from "./coverups";
import { changeSupport, HOSTILE_LOSS, hostileRegions, monthEnd, settleSupport } from "./economy";
import { dailyMedia } from "./media";
import { decide, hourlyMissions } from "./missions";
import { dailyOperations, hourlyOperations } from "./operations";
import { dailyPersonnel, hourlyPersonnel } from "./personnel";
import { dailyResearch } from "./research";
import { rng } from "./rng";
import { post, type GameState } from "./state";
import { DAY, HOUR } from "./time";

function hourly(s: GameState, prev: number) {
  hourlyMissions(s);
  hourlyCoverUps(s);
  hourlyOperations(s);
  hourlyPersonnel(s);
  for (const i of s.installations)
    if (i.readyAt > prev && i.readyAt <= s.time)
      post(s, {
        kind: "construction",
        title: `${i.name} operational`,
        body: i.kind === "sigint"
          ? `${i.name} is online. Vampire activity in ${regionById(i.regionId)?.name ?? "the region"} will now surface as leads.`
          : `${i.name} is ready to house strike teams and their aircraft.`,
        regionId: i.regionId,
        pos: i.pos,
      });
}

function daily(s: GameState) {
  const r = rng(s);
  const pressure = difficulty(s.difficulty).vampirePressure;

  dailyOperations(s);
  dailyPersonnel(s);
  dailyResearch(s);
  dailyMedia(s);
  dailyCoverUps(s);

  // The bloodlines' media machines: a slow background erosion. Most of the
  // damage now comes from operations (sim/operations.ts) that go unanswered.
  for (const b of BLOODLINES)
    for (const id of b.homeRegions) changeSupport(s, id, -r.real(0.0005, 0.003) * b.pr * pressure);

  // Now and then, a campaign big enough to notice.
  if (r.chance(0.035 * pressure)) {
    const b = r.pick(BLOODLINES);
    const regionId = r.pick(b.homeRegions);
    const region = regionById(regionId)!;
    const hit = r.real(0.4, 0.8) * b.pr;
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
  if (!s.openWar) s.secrecy = Math.min(100, s.secrecy + 0.1);
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

/** Dismisses the oldest event. A team waiting for orders is told to stand down. */
export function dismissEvent(s: GameState) {
  const e = s.events[0];
  if (e?.kind === "arrival" && e.refId && !decide(s, e.refId, "abort")) return;
  s.events.shift();
}

export { changeSecrecy } from "./secrecy";

// Game time is UTC milliseconds since the Unix epoch, so it maps straight
// onto real dates, the sun's position and the calendar.

const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 1 January 2027, 00:00 UTC. */
export const CAMPAIGN_START = Date.UTC(2027, 0, 1, 0, 0, 0);

export interface LatLon {
  lat: number; // degrees, +north
  lon: number; // degrees, +east, -180..180
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export function weekday(ms: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    new Date(ms).getUTCDay()
  ]!;
}

/**
 * The point on Earth where the sun is directly overhead (NOAA approximation,
 * accurate to a fraction of a degree, which is plenty for lighting).
 */
export function subsolarPoint(ms: number): LatLon {
  const d = new Date(ms);
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((ms - startOfYear) / DAY) + 1;
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hours - 12) / 24);
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  let lon = -15 * (hours - 12 + eqTimeMin / 60);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: (decl * 180) / Math.PI, lon };
}

/** A new moon (6 January 2000, 18:14 UTC) and the mean days between two. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14),
  LUNAR_DAYS = 29.530588;
const PHASES = [
  "New moon",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full moon",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];

/** The moon: its phase (0 new, 0.5 full), name and lit share. Good to within a day. */
export function moonPhase(ms: number): { phase: number; name: string; lit: number } {
  const turns = (ms - NEW_MOON) / (LUNAR_DAYS * DAY);
  const phase = turns - Math.floor(turns);
  return {
    phase,
    name: PHASES[Math.round(phase * 8) % 8]!,
    lit: (1 - Math.cos(2 * Math.PI * phase)) / 2,
  };
}

/** The local hour at a longitude. */
function localHour(time: number, lon: number): number {
  const utc = (time % DAY) / HOUR;
  return (((utc + lon / 15) % 24) + 24) % 24;
}

/** Whether it is dark at a longitude. */
export const isNight = (time: number, lon: number) => {
  const h = localHour(time, lon);
  return h < 6 || h >= 19;
};

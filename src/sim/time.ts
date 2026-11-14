// Game time is UTC milliseconds since the Unix epoch, so it maps straight
// onto real dates, the sun's position and the calendar.

export const MINUTE = 60_000;
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
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(ms).getUTCDay()]!;
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
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqTimeMin =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  let lon = -15 * (hours - 12 + eqTimeMin / 60);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: (decl * 180) / Math.PI, lon };
}

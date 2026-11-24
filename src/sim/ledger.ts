// The month's books for the Details screen (docs/WEB_PORT.md 3.10): what moved
// secrecy and why, and where support and regional money stood when the month
// opened, kept for this month and the one before.
import { REGIONS } from "../data/regions";
import type { GameState, MonthLedger } from "./state";

/** Entries kept per month; the smallest are folded together past this. */
const MAX_ENTRIES = 120;

export function openLedger(s: GameState, contribution: (id: string) => number): MonthLedger {
  const support: Record<string, number> = {};
  const contributions: Record<string, number> = {};
  for (const r of REGIONS) {
    support[r.id] = s.regions[r.id]?.support ?? 0;
    contributions[r.id] = contribution(r.id);
  }
  return { month: s.monthIndex, secrecyStart: s.secrecy, support, contribution: contributions, secrecy: [] };
}

/** Records a change to secrecy. Repeats of one cause (quiet days, media) add up in one line. */
export function noteSecrecy(s: GameState, delta: number, reason: string, regionId?: string) {
  const book = s.ledger.current;
  if (!delta) return;
  const same = book.secrecy.find((e) => e.reason === reason);
  if (same) {
    same.delta += delta;
    same.count++;
    same.time = s.time;
    return;
  }
  book.secrecy.push({ reason, delta, count: 1, time: s.time, ...(regionId ? { regionId } : {}) });
  if (book.secrecy.length > MAX_ENTRIES) {
    // Fold the smallest into one line so the books stay short.
    book.secrecy.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
    const folded = book.secrecy.splice(0, 2);
    const rest = book.secrecy.find((e) => e.reason === "other small matters");
    const delta = folded.reduce((t, e) => t + e.delta, 0);
    const count = folded.reduce((t, e) => t + e.count, 0);
    if (rest) { rest.delta += delta; rest.count += count; }
    else book.secrecy.push({ reason: "other small matters", delta, count, time: Math.max(...folded.map((e) => e.time)) });
  }
}

/** Month end: this month's books close (with what each region paid), and new ones open. */
export function closeLedger(s: GameState, paid: Record<string, number>, contribution: (id: string) => number) {
  const closing = s.ledger.current;
  const previous: MonthLedger = { ...closing, secrecyEnd: s.secrecy, paid, supportEnd: Object.fromEntries(REGIONS.map((r) => [r.id, s.regions[r.id]?.support ?? 0])) };
  s.ledger = { current: openLedger(s, contribution), previous };
}

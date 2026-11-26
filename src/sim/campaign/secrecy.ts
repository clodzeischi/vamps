// The Masquerade: one global meter. Reaching 0 starts open war, for good.
import { addLog, post, type GameState, type Place } from "../core/state";
import { exposeOrder } from "./story";
import { noteSecrecy } from "../economy/ledger";

/**
 * Changes secrecy: the only way it moves. Every change goes in the month's
 * books (sim/economy/ledger.ts). A loss also adds to `heat` (recent noise, which makes
 * cover-up offers likelier) and, given a place, remembers it as the last
 * incident so an offer can follow it there. A `drip` (quiet days, our own
 * media campaigns: small daily amounts) is booked but not logged, and brings
 * no heat.
 */
export function changeSecrecy(s: GameState, delta: number, reason: string, where?: Place, opts: { drip?: boolean } = {}) {
  if (s.openWar || delta === 0) return;
  const before = s.secrecy;
  s.secrecy = Math.max(0, Math.min(100, s.secrecy + delta));
  noteSecrecy(s, s.secrecy - before, reason, where?.regionId);
  if (delta < 0 && !opts.drip) {
    s.heat += -delta;
    if (where) s.lastIncident = { regionId: where.regionId, city: where.city, pos: { ...where.pos } };
  }
  const shown = Math.abs(delta) < 1 ? delta.toFixed(1) : delta.toFixed(0);
  if (!opts.drip) addLog(s, `Secrecy ${delta > 0 ? "+" : ""}${shown}: ${reason}`, delta < 0 ? "bad" : "good");
  if (s.secrecy <= 0) {
    s.openWar = true;
    // With the Vatican held hostage, Agnes makes sure the secret breaks on the Church.
    if (s.story.act === 2) return exposeOrder(s);
    post(s, {
      kind: "open-war",
      title: "The Masquerade is broken",
      body: "The world knows. Eight centuries of secrecy end tonight. The Holy See acknowledges the Order, and the bloodlines stop pretending. This is open war.",
    });
  }
}

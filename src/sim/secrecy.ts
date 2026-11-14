// The Masquerade: one global meter. Reaching 0 starts open war, for good.
import { addLog, post, type GameState } from "./state";

export function changeSecrecy(s: GameState, delta: number, reason: string) {
  if (s.openWar || delta === 0) return;
  s.secrecy = Math.max(0, Math.min(100, s.secrecy + delta));
  const shown = Math.abs(delta) < 1 ? delta.toFixed(1) : delta.toFixed(0);
  addLog(s, `Secrecy ${delta > 0 ? "+" : ""}${shown}: ${reason}`, delta < 0 ? "bad" : "good");
  if (s.secrecy <= 0) {
    s.openWar = true;
    post(s, {
      kind: "open-war",
      title: "The Masquerade is broken",
      body: "The world knows. Eight centuries of secrecy end tonight. The Holy See acknowledges the Order, and the bloodlines stop pretending. This is open war.",
    });
  }
}

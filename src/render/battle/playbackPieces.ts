// How battle events are cut for playback: a shot plays as one piece with
// every round of its burst and all they did, so it lands at once.
import type { BattleEvent } from "../../tactical/battle";

/** Events that end a shot's run of results (the next thing done). */
export const NEXT_ACT: ReadonlySet<string> = new Set(["move", "throw", "door", "turn", "end"]);

/**
 * Battle events cut into what plays as one piece: a shot with every round
 * of its burst and all they did (glass, doors, a blast, hurt, deaths);
 * anything else alone. The view's play() is handed a piece at a time.
 */
export function playbackPieces<E extends BattleEvent>(events: E[]): E[][] {
  const out: E[][] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const piece = [e];
    if (e.kind === "shot")
      for (let j = i + 1; j < events.length; j++) {
        const n = events[j]!;
        if (n.kind === "shot" ? !(e.burst && n.burst && n.unit === e.unit) : NEXT_ACT.has(n.kind))
          break;
        piece.push(n);
        i = j;
      }
    out.push(piece);
  }
  return out;
}

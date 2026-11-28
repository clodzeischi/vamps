// The battle's message log: battle events as lines of text, for the
// battlescape's log (docs/design/tactical.md). Only what the team could see:
// an unseen event is never logged, so the log doesn't lift the fog.
import {
  seenByAgents,
  unitById,
  type Battle,
  type BattleEvent,
  type Side,
  type Unit,
} from "./battle";

// The screen stamps each line with the turn and side from the "turn" events as
// it plays them back (the battle's own turn has already moved on by then).

export interface BattleLogEntry {
  turn: number;
  side: Side;
  text: string;
  tone: "good" | "bad" | "neutral";
}

const GENERIC = new Set(["Thrall", "Vampire", "Civilian"]);

/** "Br. Anselm", or "a thrall" / "A thrall" for the nameless. */
function who(u: Unit | undefined, start = false): string {
  if (!u) return start ? "Someone" : "someone";
  if (!GENERIC.has(u.name)) return u.name;
  return `${start ? "A" : "a"} ${u.name.toLowerCase()}`;
}

const ours = (u: Unit | undefined) => u?.side === "agent";

/** The log line for one event, or null when there's nothing to say (or nothing seen). */
export function logLine(b: Battle, e: BattleEvent): Omit<BattleLogEntry, "turn" | "side"> | null {
  switch (e.kind) {
    case "move":
      return null;
    case "turn":
      return null;
    case "shot": {
      if (!e.seen) return null;
      const u = unitById(b, e.unit);
      const t = e.target ? unitById(b, e.target) : undefined;
      const verb = e.melee ? (u?.kind === "vampire" ? "claws at" : "strikes at") : "fires at";
      const how = e.reaction ? "Reaction fire: " : "";
      const at = t ? who(t) : "a spot";
      // Who was hit: the target, or someone else in the way (friendly fire is "bad" whoever fired).
      const parts = e.hits.map((h) => {
        const v = unitById(b, h.unit);
        const name = h.unit === e.target ? "hit" : `hits ${who(v)}`;
        return `${name}${h.crit ? " (critical)" : ""}, ${h.damage} damage`;
      });
      const result = parts.length ? parts.join("; ") : e.target ? "missed" : "no one hit";
      const harmed = e.hits.map((h) => unitById(b, h.unit));
      const tone = harmed.some((v) => ours(v) || v?.side === "neutral")
        ? "bad"
        : harmed.length
          ? ours(u)
            ? "good"
            : "bad"
          : "neutral";
      return { text: `${how}${who(u, !how)} ${verb} ${at}: ${result}`, tone };
    }
    case "door":
      return e.seen
        ? { text: `${who(unitById(b, e.unit), true)} opens a door`, tone: "neutral" }
        : null;
    case "glass":
    case "smash":
      return null;
    case "blast":
      return e.seen ? { text: `A rocket goes off`, tone: "neutral" } : null;
    case "throw":
      return { text: `${who(unitById(b, e.unit), true)} throws an incendiary`, tone: "neutral" };
    case "burn": {
      if (!e.seen) return null;
      const u = unitById(b, e.unit);
      return {
        text: `${who(u, true)} burns${e.why === "sun" ? " in the sun" : e.why === "uv" ? " in the ultraviolet" : ""}: ${e.damage} damage`,
        tone: ours(u) ? "bad" : "good",
      };
    }
    case "torpor": {
      if (!e.seen) return null;
      const u = unitById(b, e.unit);
      return ours(u) ? null : { text: `${who(u, true)} falls into torpor`, tone: "good" };
    }
    case "death": {
      const u = unitById(b, e.unit);
      if (!u || (!ours(u) && !seenByAgents(b, u, u))) return null;
      const how =
        e.text === "Finished"
          ? "is finished"
          : e.text === "Bled out"
            ? "has bled out"
            : e.text === "Shot down"
              ? "is destroyed"
              : u.kind === "vampire"
                ? "is destroyed"
                : "is dead";
      return {
        text: `${who(u, true)} ${how}`,
        tone: ours(u) || u.kind === "hostage" ? "bad" : "good",
      };
    }
    case "status": {
      if (!e.seen) return null;
      const u = unitById(b, e.unit);
      if (e.text === "Spotted!")
        return { text: "We've been spotted: concealment is broken", tone: "bad" };
      if (e.text === "Contact")
        return { text: `${who(u, true)} sees an enemy and stops`, tone: "neutral" };
      if (e.text === "Alerted") return { text: `${who(u, true)} is alerted`, tone: "neutral" };
      if (e.text === "Rises!") return { text: `${who(u, true)} rises from torpor`, tone: "bad" };
      if (e.text === "Down, bleeding")
        return { text: `${who(u, true)} is down and bleeding`, tone: "bad" };
      if (e.text.startsWith("Dominated"))
        return { text: `${who(u, true)} is dominated and loses the turn`, tone: "bad" };
      const tone =
        e.text === "Freed" || e.text === "Stabilized" || e.text === "Taken alive"
          ? "good"
          : "neutral";
      return { text: `${who(u, true)}: ${e.text.toLowerCase()}`, tone };
    }
    case "end":
      return {
        text:
          e.result === "won"
            ? "The site is clean"
            : e.result === "lost"
              ? "The team is lost"
              : "The team has withdrawn",
        tone: e.result === "won" ? "good" : "bad",
      };
  }
}

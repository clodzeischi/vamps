// Battles: a mission's fight played on the battlescape (tactical layer) or auto-resolved.
import { addStock, bringHome } from "../people/equipment";
import { winChance } from "./combat";
import { combatMods } from "../base/research";
import { type GameState, type Mission, missionById } from "../core/state";
import { HOUR } from "../core/time";
import { SITE_KINDS, missionAgents } from "./common";
import { type Play, playsFor, type TacticalOutcome } from "./plays";
import { resolve } from "./resolution";

/** What the team is walking into, for the battle event. */
export function battleBrief(s: GameState, m: Mission): string {
  const b = m.battle!;
  const foes = `${b.thralls} thrall${b.thralls === 1 ? "" : "s"}${b.vampires ? ` and ${b.vampires === 1 ? "one of them" : `${b.vampires} of them`}` : ""}`;
  const where = b.site
    ? `The ${SITE_KINDS[b.site].name.toLowerCase()} in ${m.city}`
    : `In ${m.city}, it has come to a fight`;
  return `${where}: ${foes}. ${missionAgents(s, m).length} of ours on the ground. Take command, or leave it to the team.`;
}

/** The pending battle's play, for replay. */
function battlePlay(m: Mission): Play | undefined {
  return m.battle ? playsFor(m).find((p) => p.id === m.battle!.optionId) : undefined;
}

/** Let the team fight it out (the auto-combat), and carry on. */
export function autoResolveBattle(s: GameState, missionId: string): string | null {
  const m = missionById(s, missionId);
  const play = m && battlePlay(m);
  if (!m || !play) return "No battle waiting there.";
  s.rng = m.battle!.rng;
  m.battle = undefined;
  s.events = s.events.filter((e) => !(e.kind === "battle" && e.refId === m.id));
  resolve(s, m, play, "auto");
  return null;
}

/** The player fought it: wounds and deaths as they fell, then the mission carries on with that result. */
export function finishBattle(
  s: GameState,
  missionId: string,
  outcome: TacticalOutcome,
): string | null {
  const m = missionById(s, missionId);
  const play = m && battlePlay(m);
  if (!m || !play) return "No battle waiting there.";
  for (const a of missionAgents(s, m)) {
    if (outcome.dead.includes(a.id)) a.hp = 0;
    else a.hp = Math.max(1, Math.round(a.vitality * (outcome.health[a.id] ?? 1)));
    // What they carried out comes home with them; what the kit left behind is still there.
    const fought = outcome.gear?.[a.id];
    if (fought && !outcome.dead.includes(a.id)) bringHome(s, a, m.kit, fought);
  }
  const home = s.installations.find((i) => i.id === missionAgents(s, m)[0]?.baseId);
  if (home) for (const x of outcome.recovered ?? []) addStock(home, x, 1);
  s.rng = m.battle!.rng;
  m.battle = undefined;
  s.events = s.events.filter((e) => !(e.kind === "battle" && e.refId === m.id));
  resolve(s, m, play, outcome);
  return null;
}

/** The auto-combat's odds for a waiting battle (for the event's buttons). */
export function battleOdds(s: GameState, m: Mission): number {
  const b = m.battle;
  if (!b) return 0;
  return winChance(
    missionAgents(s, m),
    m.kit,
    { thralls: b.thralls, vampires: b.vampires },
    b.advantage,
    m.agentIds.length + Math.round(m.arriveAt / HOUR),
    combatMods(s, m.kit),
  );
}

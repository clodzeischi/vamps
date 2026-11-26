// What the campaign asks of the player now, act by act (docs/design/story.md).
// Worked out from the state, never stored, and never ahead of what the player knows.
import { AGNES, BLOODLINES, bloodlineById } from "../../data/bloodlines";
import { isDestroyed } from "./bloodlines";
import { CLUES_PER_DEN, DENS_FOR_LAIR, densFound, densRaided, networkOf } from "../intel/networks";
import type { GameState } from "../core/state";
import { isEurope, lesserBroken, SIGILS_TO_RETURN } from "./story";

export interface Objective {
  text: string;
  state?: "done" | "failed";
  tip?: string;
  optional?: boolean;
}

export function objectives(s: GameState): Objective[] {
  const st = s.story;
  const out: Objective[] = [];
  const net = networkOf(s, AGNES);
  const agnes = bloodlineById(AGNES)!.short;

  if (st.act === 2) {
    out.push({
      text: `Destroy lesser bloodlines: ${lesserBroken(s)} of ${SIGILS_TO_RETURN}`,
      tip: "Climb a house's network from nests to dens to its lair, and destroy the lair. Three broken sigils reopen Europe.",
    });
    out.push(
      st.exposed
        ? { text: "Keep the Order secret", state: "failed", tip: "Agnes has exposed the Order." }
        : {
            text: "Keep the Order secret",
            tip: "If secrecy reaches 0, Agnes exposes the Order: open war, and no more stipend.",
          },
    );
    if (s.missions.some((m) => m.stranded || m.overland))
      out.push({ text: "Bring the team stranded in Europe home", optional: true });
  } else {
    const won = isDestroyed(s, AGNES);
    out.push({ text: "Destroy Agnes of Toulouse", state: won ? "done" : undefined });
    const den = s.sites.find((x) => x.bloodline === AGNES && x.kind === "den");
    const lair = s.sites.find((x) => x.bloodline === AGNES && x.kind === "lair");
    if (lair && !won) out.push({ text: `Assault the ${agnes} lair at ${lair.city}` });
    else if (!won) {
      if (st.act === 3)
        out.push({
          text: `Find her lair: ${Math.min(densRaided(net), DENS_FOR_LAIR)} of ${DENS_FOR_LAIR} dens raided`,
          tip: `Raiding ${DENS_FOR_LAIR} ${agnes} dens shows where she sleeps.`,
        });
      if (den) out.push({ text: `Raid the ${agnes} den in ${den.city}` });
      else if (st.act === 1 || densRaided(net) < DENS_FOR_LAIR)
        out.push({
          text: `Find a ${agnes} den: ${Math.max(0, Math.min(CLUES_PER_DEN, net.clues - densFound(net) * CLUES_PER_DEN))} of ${CLUES_PER_DEN} clues`,
          tip: "Den clues come from exploiting raided nests, snatching the house's people and questioning captives.",
        });
    }
  }

  const abroad = s.installations.some((i) => i.kind === "base" && !isEurope(i.regionId));
  if (st.act === 1 && st.beats.includes("where-would-we-go"))
    out.push({
      text: "Build an Operational Base outside Europe",
      state: abroad ? "done" : undefined,
      optional: true,
      tip: "So that the Order has somewhere to go if anything happens to Padua.",
    });
  const scripted = s.sites.find((x) => x.story === "boston");
  if (scripted)
    out.push({ text: `Raid the den in ${scripted.city} before it moves`, optional: true });

  // Every other house whose lair we have found.
  for (const b of BLOODLINES) {
    if (b.id === AGNES) continue;
    const lair = s.sites.find((x) => x.bloodline === b.id && x.kind === "lair");
    if (lair)
      out.push({
        text: `Assault the ${b.short} lair in ${lair.city}`,
        optional: true,
        tip: "Until it is hit, the house may strike our bases.",
      });
  }
  return out;
}

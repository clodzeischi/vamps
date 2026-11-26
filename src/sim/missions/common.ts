// What every stage of a mission shares: the kinds of vampire site, spoils, threat scaling, local time.
import { regionById } from "../../data/regions";
import { type Threat } from "./combat";
import { type GameState, type Mission, type SiteKind } from "../core/state";
import { DAY, HOUR } from "../core/time";

/** Briefing, kit and boarding before wheels-up. */
export const PREP_HOURS = 1;

/** Taking one alive from a won strike: a helicopter lifts out whoever is taken;
 *  a jet team has to carry them to extraction. Vampire remains come back only
 *  by helicopter (a jet team burns the bodies on site). */
export const CAPTURE_CHANCE = {
  helicopter: { vampire: 0.3, thrall: 0.5 },
  carried: { vampire: 0.1, thrall: 0.25 },
} as const;

export const SITE_KINDS: Record<
  SiteKind,
  { name: string; thralls: number; vampires: number; weight: number; description: string }
> = {
  nest: {
    name: "Nest",
    thralls: 3,
    vampires: 1,
    weight: 0.6,
    description: "A fledgling and its keepers: a flat, a basement, a lock-up.",
  },
  den: {
    name: "Den",
    thralls: 4,
    vampires: 2,
    weight: 0.3,
    description: "A working site of the bloodline: feeding, storage, a few of them by day.",
  },
  haven: {
    name: "Haven",
    thralls: 5,
    vampires: 3,
    weight: 0.1,
    description: "Where an elder sleeps. Guarded, and worth it.",
  },
  // Found by climbing the network (sim/intel/networks.ts). A haven is a skirmish size only.
  lair: {
    name: "Lair",
    thralls: 14,
    vampires: 6,
    weight: 0,
    description:
      "The bloodline's heart: its eldest, its guard, its sigil. Burn it and the line dies.",
  },
};

/** The bloodline's money a won strike seizes, by site (docs/design/economy.md: spoils fund the hostage years). */
export const SPOILS: Record<SiteKind, [number, number]> = {
  nest: [70_000, 130_000],
  den: [150_000, 250_000],
  haven: [250_000, 350_000],
  lair: [1_500_000, 2_000_000],
};
/** Share of the spoils a team carries out without a helicopter. */
export const SPOILS_CARRIED = 0.5;

export const ceilHour = (t: number) => Math.ceil(t / HOUR) * HOUR;
export const regionName = (id: string) => regionById(id)?.name ?? id;

/** Vampires escalate as secrecy falls and the war goes on. */
function escalation(s: GameState): number {
  return 1 + ((80 - Math.min(80, s.secrecy)) / 80) * 0.6 + s.monthIndex * 0.04;
}

export function scaled(s: GameState, t: Threat): Threat {
  const e = escalation(s);
  const sc = (n: number) => (n > 0 ? Math.max(1, Math.round(n * e)) : 0);
  return { thralls: sc(t.thralls), vampires: sc(t.vampires) };
}

/** Hours until a given local solar hour at a longitude (0 if it is that hour now). */
export function hoursUntilLocal(time: number, lon: number, hour: number): number {
  const utc = (time % DAY) / HOUR;
  const local = (((utc + lon / 15) % 24) + 24) % 24;
  return Math.ceil((((hour - local) % 24) + 24) % 24);
}

export const missionAgents = (s: GameState, m: Mission) =>
  s.agents.filter((a) => m.agentIds.includes(a.id));

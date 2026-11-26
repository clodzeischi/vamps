// Which sound each weapon makes, and how much quieter what the team doesn't see is.
import { type SoundId } from "../../audio/sfx";
import { type WeaponId } from "../../tactical/rules";

/**
 * Each gun's sound: a round (`shot`), a machine gun's whole burst (`burst`,
 * played once when the burst runs its full length), and the time between
 * rounds of a burst (seconds; the burst recordings' own rate of fire).
 * The SMG fires pistol rounds. The M110's round is the M249 recording's single shot.
 */
export const GUN_SOUND: Partial<
  Record<WeaponId, { shot: SoundId; burst?: SoundId; every: number }>
> = {
  pistol: { shot: "shot-pistol", every: 0.1 },
  "pistol-sd": { shot: "shot-pistol-sd", every: 0.1 },
  smg: { shot: "shot-pistol", every: 0.075 },
  rifle: { shot: "shot-rifle", every: 0.11 },
  "rifle-sd": { shot: "shot-rifle-sd", every: 0.11 },
  shotgun: { shot: "shot-shotgun-pump", every: 1 },
  "shotgun-semi": { shot: "shot-shotgun-semi", every: 0.3 },
  // Machine guns fire single rounds only in reaction; the M249 borrows the M240B's round.
  m249: { shot: "shot-m240b", burst: "burst-m249", every: 0.088 },
  m240b: { shot: "shot-m240b", burst: "burst-m240b", every: 0.097 },
  m110: { shot: "shot-m110", every: 0.3 },
  rpg: { shot: "rocket-launch", every: 1 },
};
/** Blows that land: a knife's stab (one of several at random) or claws tearing; a miss swishes (lower for claws). A body falling thuds (animateDeath). */
export const BLOW_SOUND: Partial<Record<WeaponId, SoundId[]>> = {
  knife: ["knife-1", "knife-2", "knife-3", "knife-4"],
  claws: ["claws"],
};
/** Gunfire out of sight: heard, further off. */
export const UNSEEN_GAIN = 0.35;

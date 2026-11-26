// Plain functions behind the battlescape screen: building a skirmish from the
// menu's setup, what the view should draw for each unit, and the damage an
// event does (so health bars drop as each hit lands during playback).
import { generateMap } from "../../../tactical/map/mapgen";
import { COVER_HALF, type Setting } from "../../../tactical/map/map";
import { coverAround } from "../../../tactical/rules";
import { traitsOf } from "../../../tactical/traits";
import {
  newSkirmish,
  seenByAgents,
  type Battle,
  type BattleEvent,
  type Unit,
} from "../../../tactical/battle";
import { SITE_KINDS } from "../../../sim/missions/missions";
import type { UnitSpec } from "../../../render/BattleView";
import { MOONLIGHT, type SkirmishSetup } from "../../settings";

/** A fresh skirmish from the main menu's setup. */
export function skirmishFromSetup(setup: SkirmishSetup, seed: number): Battle {
  const { setting, size, bloodline, winter, rain, landmark } = setup;
  const site = SITE_KINDS[size];
  let where: Setting = setting;
  if (size === "lair") where = bloodline === "carcassonne" ? "montsegur" : "lair";

  const map = generateMap({
    setting: where,
    size,
    seed,
    thralls: site.thralls + traitsOf(bloodline).extraThralls,
    vampires: site.vampires,
    civilians: size === "lair" ? 0 : 2,
    winter,
    rain,
    landmark: where === "urban" && landmark !== "none" ? landmark : undefined,
  });

  return newSkirmish(map, seed, {
    bloodline,
    night: setup.night,
    moon: MOONLIGHT[setup.moon],
    kit: setup.kit,
    arrival: setup.arrival,
    loot: 3,
    hostage: setup.hostage,
    mayhem: setup.mayhem,
  });
}

/** What the 3D view draws for each unit. */
export function unitSpecs(
  b: Battle,
  me: Unit | undefined,
  foes: Unit[],
  myTurn: boolean,
): UnitSpec[] {
  const targets = new Set(foes.map((f) => f.id));
  return b.units.map((u) => {
    // Next to low cover, people crouch (the look only).
    const canCrouch = u.kind === "agent" || u.kind === "thrall";
    const crouched = canCrouch && coverAround(b.map, u).some((c) => c === COVER_HALF);
    return {
      id: u.id,
      name: u.name,
      x: u.x,
      y: u.y,
      z: u.z,
      facing: u.facing,
      hp: u.hp,
      maxHp: u.maxHp,
      side: u.kind,
      carrying: u.carrying,
      bleeding: u.bleeding,
      stable: u.stable,
      dead: !u.alive,
      gone: u.evacuated || u.captured,
      overwatch: u.overwatch,
      torpor: u.torpor,
      dominated: u.dominated,
      crouched,
      selected: u.id === me?.id && myTurn,
      targeted: myTurn && targets.has(u.id),
      visible: u.side === "agent" || !u.alive || seenByAgents(b, u, u),
    };
  });
}

/** The damage an event deals, unit by unit. */
export function harmOf(e: BattleEvent): { id: string; n: number }[] {
  if (e.kind === "shot") return e.hits.map((h) => ({ id: h.unit, n: h.damage }));
  if (e.kind === "burn") return [{ id: e.unit, n: e.damage }];
  return [];
}

/** Agents first, then a freed prisoner: the squad column, numbered. */
export const squadOf = (b: Battle) =>
  b.units.filter((u) => u.kind === "agent" || (u.kind === "hostage" && u.side === "agent"));

// Doors and glass: opening doors, shattering panes.
import { breakable, E, edgeAt, edgeFree, edgeSkinAt, setEdge, walkable, type Pt3 } from "./map/map";
import { type Crossing } from "./rules";
import { type Battle, type Unit, type BattleEvent, seenByAgents, TU_COST } from "./battle";
import { type CommandError, holding, short } from "./commands";
import { face, wakeWhoSpots } from "./movement";


/** The same edge, named from its west or north tile (dx, dy ≥ 0). */
export const canonical = (c: Crossing): Crossing =>
  c.dx < 0 || c.dy < 0
    ? { x: c.x + c.dx, y: c.y + c.dy, z: c.z, dx: Math.abs(c.dx), dy: Math.abs(c.dy) }
    : { x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy };

/** Opens a closed door for good (no one shuts it again). The team sees it open if an agent sees either side. */
export function openDoor(b: Battle, u: Unit, c: Crossing): BattleEvent[] {
  setEdge(b.map, c.x, c.y, c.z, c.dx, c.dy, E.DOOR, edgeSkinAt(b.map, c.x, c.y, c.z, c.dx, c.dy));
  const far = { x: c.x + c.dx, y: c.y + c.dy, z: c.z };
  const seen = u.side === "agent" || seenByAgents(b, c) || seenByAgents(b, far);
  return [{ kind: "door", unit: u.id, at: canonical(c), seen }];
}

/**
 * Closed doors this unit can open where it stands: one on an edge of its
 * own tile, or, posted up beside a doorway against the wall, one on the
 * next tile along the wall (on the same side).
 */
export function doorsInReach(b: Battle, u: Pt3): Crossing[] {
  const m = b.map;
  const out = new Map<string, Crossing>();
  for (const [ox, oy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const t = { x: u.x + ox, y: u.y + oy, z: u.z };
    if ((ox || oy) && (!walkable(m, t.x, t.y, t.z) || !edgeFree(m, u.x, u.y, u.z, ox, oy)))
      continue;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (dx * ox + dy * oy !== 0) continue; // beside it: the door faces across the way stepped
      if (edgeAt(m, t.x, t.y, t.z, dx, dy) !== E.SHUT) continue;
      const c = canonical({ ...t, dx, dy });
      out.set(`${c.x},${c.y},${c.z},${c.dx},${c.dy}`, c);
    }
  }
  return [...out.values()];
}

export function commandOpenDoor(b: Battle, u: Unit, c: Crossing): BattleEvent[] | CommandError {
  if (b.result) return "The battle is over";
  const tired = holding(u) ?? short(u, TU_COST.door);
  if (tired) return tired;
  const k = canonical(c);
  if (
    !doorsInReach(b, u).some(
      (d) => d.x === k.x && d.y === k.y && d.z === k.z && d.dx === k.dx && d.dy === k.dy,
    )
  )
    return "No closed door within reach";
  u.tu -= TU_COST.door;
  face(u, { x: k.x + k.dx / 2, y: k.y + k.dy / 2, z: k.z });
  const events = openDoor(b, u, k);
  if (u.side === "agent") events.push(...wakeWhoSpots(b, u));
  return events;
}

/**
 * Shatters panes (a shot through them, a fire against them), struck from
 * `from`: a glass wall leaves an open frame, a window its sill.
 */
export function shatter(b: Battle, panes: Crossing[], from: Pt3): BattleEvent[] {
  if (!panes.length) return [];
  for (const c of panes) {
    const window = edgeAt(b.map, c.x, c.y, c.z, c.dx, c.dy) === E.WINDOW;
    setEdge(
      b.map,
      c.x,
      c.y,
      c.z,
      c.dx,
      c.dy,
      window ? E.SILL : E.NONE,
      edgeSkinAt(b.map, c.x, c.y, c.z, c.dx, c.dy),
    );
  }
  return [
    { kind: "glass", panes: panes.map(canonical), from: { x: from.x, y: from.y, z: from.z } },
  ];
}

/** The panes (glass walls, windows) on the sides of these tiles. */
export function glassAround(b: Battle, tiles: Pt3[]): Crossing[] {
  const out = new Map<string, Crossing>();
  for (const q of tiles)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      if (breakable(edgeAt(b.map, q.x, q.y, q.z, dx, dy))) {
        const c = canonical({ ...q, dx, dy });
        out.set(`${c.x},${c.y},${c.z},${c.dx},${c.dy}`, c);
      }
  return [...out.values()];
}

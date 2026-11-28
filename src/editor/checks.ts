// What the block editor flags as you work: a block that would break a map or
// read wrong. Each issue names its tile when it has one (click to go there).
import { blockedDoorways } from "../gallery/checks";
import {
  doorUnit,
  E,
  edgeAt,
  edgeOpen,
  flightEnds,
  reachable,
  skinAt,
  T,
  tileAt,
  walkable,
  furnitureCover,
  furnitureSkin,
  type BattleMap,
} from "../tactical/map/map";
import { pieceLabel } from "../tactical/map/pieces";
import { type BlockMeta, type BlockNode, type Side } from "../tactical/map/blocks";

export interface BlockIssue {
  text: string;
  x?: number;
  y?: number;
  z?: number;
}

const SIDE_NAME: Record<Side, string> = { n: "north", e: "east", s: "south", w: "west" };

export function blockIssues(m: BattleMap, meta: BlockMeta, nodes: BlockNode[]): BlockIssue[] {
  const out: BlockIssue[] = [];
  const g = m.ground;
  // Reached from the street: from the front (the south row, on the road) at street level. Not
  // from the other sides: what's next door there may be a hedge or a wall.
  const seen = new Uint8Array(m.tiles.length);
  const front = Array.from({ length: m.w }, (_, x) => ({ x, y: m.h - 1 }));
  for (const p of front) {
    const i = (g * m.h + p.y) * m.w + p.x;
    if (seen[i] || !walkable(m, p.x, p.y, g)) continue;
    const r = reachable(m, { ...p, z: g });
    for (let k = 0; k < r.length; k++) if (r[k]) seen[k] = 1;
  }
  let lost = 0;
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (!walkable(m, x, y, z) || seen[(z * m.h + y) * m.w + x]) continue;
        // A roof with no stair up is out of reach by design.
        if (skinAt(m, x, y, z) === "roof") continue;
        if (lost++ < 6) out.push({ text: "Can't be reached from the street", x, y, z });
      }
  if (lost > 6) out.push({ text: `…and ${lost - 6} more tiles out of reach` });
  // The street level is all ground: a tile with none is a hole (but the open air over a cellar's stair).
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++)
      if (tileAt(m, x, y, g) === T.VOID && !(g > 0 && tileAt(m, x, y, g - 1) === T.FLIGHT))
        out.push({ text: "No ground here: a hole at street level", x, y, z: g });
  // Stairs: a floor to step on at the foot and off at the head, nothing in the way.
  for (const f of m.flights ?? [])
    for (const { foot, head } of flightEnds(f)) {
      if (!walkable(m, foot.x, foot.y, foot.z) || !edgeOpen(m, foot.x, foot.y, foot.z, f.dx, f.dy))
        out.push({ text: "Stairs: nowhere to step on at the foot", ...foot });
      if (
        !walkable(m, head.x, head.y, head.z) ||
        !edgeOpen(m, head.x, head.y, head.z, -f.dx, -f.dy)
      )
        out.push({ text: "Stairs lead nowhere (no floor at the head, a level up)", ...head });
    }
  for (const f of m.furniture) {
    // A piece with no cover is dressing: nothing to break, nothing to get to.
    const cover = furnitureCover(f.kind),
      name = pieceLabel(f.kind).toLowerCase();
    if (cover === "none") continue;
    let whole = true;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++)
        if (
          tileAt(m, x, y, f.z) !== (cover === "high" ? T.HIGH : T.LOW) ||
          skinAt(m, x, y, f.z) !== furnitureSkin(f.kind)
        )
          whole = false;
    if (!whole) out.push({ text: `The ${name} is broken`, x: f.x, y: f.y, z: f.z });
    let open = false;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) {
        const fx = x + f.dx,
          fy = y + f.dy;
        const front = fx < f.x || fy < f.y || fx >= f.x + f.w || fy >= f.y + f.h;
        // Facing off the block: onto whatever is next door (the road, on the front).
        const off = fx < 0 || fy < 0 || fx >= m.w || fy >= m.h;
        if (
          front &&
          (off || walkable(m, fx, fy, f.z)) &&
          edgeAt(m, x, y, f.z, f.dx, f.dy) === E.NONE
        )
          open = true;
      }
    if (!open)
      out.push({
        text: `Nobody can get to the ${name} (its front is blocked)`,
        x: f.x,
        y: f.y,
        z: f.z,
      });
  }
  for (const p of windowsAtJunctions(m))
    out.push({ text: "A window at a corner or where an inside wall meets it", ...p });
  for (const p of blockedRollerDoors(m)) out.push(p);
  // Roller and sliding doors come two tiles wide (the model is one door over both).
  for (const d of m.doorStyles ?? [])
    if (doorUnit(m, d.x, d.y, d.z, d.dx, d.dy).w !== 2)
      out.push({
        text: `A ${d.style === "slide" ? "sliding" : "roller"} door one tile wide: they come two wide`,
        x: d.x,
        y: d.y,
        z: d.z,
      });
  // (Lamps by a door are fine in a block: they are fittings, not posts.)
  for (const p of blockedDoorways(m))
    if (p.text.startsWith("prop"))
      out.push({ text: "A prop stands in a doorway", x: p.x, y: p.y, z: p.z });
  for (const n of nodes)
    if (!walkable(m, n.x, n.y, n.z))
      out.push({ text: `A ${n.role} node on a tile nobody can stand on`, x: n.x, y: n.y, z: n.z });
  // Entrances: the front (south) always, out onto the street level; any other side ticked likewise.
  if (!meta.entrances.includes("s"))
    out.push({ text: "The front (south, on the road) must be an entrance: tick it" });
  for (const s of meta.entrances) {
    const along = s === "n" || s === "s" ? m.w : m.h;
    const at = (k: number) => ({
      x: s === "n" || s === "s" ? k : s === "w" ? 0 : m.w - 1,
      y: s === "e" || s === "w" ? k : s === "n" ? 0 : m.h - 1,
    });
    if (
      !Array.from({ length: along }, (_, k) => at(k)).some(
        (p) => walkable(m, p.x, p.y, g) && seen[(g * m.h + p.y) * m.w + p.x],
      )
    )
      out.push({
        text: `Its ${SIDE_NAME[s]} side is an entrance, but nobody can walk out there at street level`,
      });
  }
  if (!meta.terrains.length) out.push({ text: "No terrain: no map will use it" });
  const strikes = meta.targets.filter((t) => ["nest", "den", "haven", "feeding"].includes(t));
  if (strikes.length && !nodes.some((n) => n.role === "vampire" || n.role === "elder"))
    out.push({ text: `A ${strikes[0]} target needs a vampire node` });
  if (meta.targets.includes("haven") && !nodes.some((n) => n.role === "elder"))
    out.push({ text: "A haven needs an elder node" });
  if (meta.targets.includes("rescue") && !nodes.some((n) => n.role === "prisoner"))
    out.push({ text: "A rescue target needs a prisoner node" });
  if (meta.targets.length && !nodes.some((n) => n.role === "thrall"))
    out.push({ text: "A target block needs thrall nodes" });
  return out;
}

/** A wall of some kind on this edge (a wall, a door, a window, glass). */
const walled = (m: BattleMap, x: number, y: number, z: number, dx: number, dy: number) => {
  const e = edgeAt(m, x, y, z, dx, dy);
  return e !== E.NONE && e !== E.RAIL;
};

/**
 * Windows whose frame meets another wall at an end: a corner of the building,
 * or an inside wall butting into it (half the window behind its end).
 */
export function windowsAtJunctions(m: BattleMap): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ] as const) {
          if (edgeAt(m, x, y, z, dx, dy) !== E.WINDOW) continue;
          // From the room's side only (the tile with a floor or roof over it), so each window once.
          if (
            tileAt(m, x, y, z) === T.VOID ||
            z + 1 >= m.levels ||
            tileAt(m, x, y, z + 1) === T.VOID
          )
            continue;
          // Along the wall: the two ends of this edge. At each, the walls running away from it on this side.
          const [ax, ay] = [dy ? 1 : 0, dx ? 1 : 0];
          for (const s of [-1, 1]) {
            const ex = x + ax * s,
              ey = y + ay * s;
            // The edge between this tile and its neighbour along the wall, and the same edge one tile out.
            const inner = walled(m, x, y, z, ax * s, ay * s);
            const outer = walled(m, x + dx, y + dy, z, ax * s, ay * s);
            // A corner: the wall along doesn't go on past this end.
            const along = walled(m, ex, ey, z, dx, dy);
            if (inner || outer || !along) {
              out.push({ x, y, z });
              break;
            }
          }
        }
  return out;
}

/**
 * Roller doors whose way is blocked: something standing between the door and
 * the vehicle inside, or on the three tiles of the drive outside it.
 */
export function blockedRollerDoors(m: BattleMap): BlockIssue[] {
  const out: BlockIssue[] = [];
  const vehicleAt = (x: number, y: number, z: number) =>
    m.vehicles.some((v) => v.z === z && x >= v.x && x < v.x + v.w && y >= v.y && y < v.y + v.h);
  const solid = (x: number, y: number, z: number) => {
    const t = tileAt(m, x, y, z);
    return t === T.LOW || t === T.HIGH;
  };
  const roofed = (x: number, y: number, z: number) =>
    z + 1 < m.levels && tileAt(m, x, y, z + 1) !== T.VOID;
  for (const d of m.doorStyles ?? []) {
    if (d.style !== "garage") continue;
    const a = { x: d.x, y: d.y },
      b = { x: d.x + d.dx, y: d.y + d.dy };
    const [inside, outside, nx, ny] = roofed(a.x, a.y, d.z)
      ? [a, b, -d.dx, -d.dy]
      : [b, a, d.dx, d.dy];
    // Inward to the first vehicle (or a wall): nothing in the way.
    for (let k = 0, x = inside.x, y = inside.y; k < 8; k++, x += nx, y += ny) {
      if (tileAt(m, x, y, d.z) === T.VOID || vehicleAt(x, y, d.z)) break;
      if (solid(x, y, d.z)) {
        out.push({
          text: "Something stands between a roller door and what drives out of it",
          x,
          y,
          z: d.z,
        });
        break;
      }
      if (walled(m, x, y, d.z, nx, ny)) break;
    }
    for (let k = 0, x = outside.x, y = outside.y; k < 3; k++, x -= nx, y -= ny)
      if (solid(x, y, d.z) && !vehicleAt(x, y, d.z)) {
        out.push({ text: "Something blocks the drive outside a roller door", x, y, z: d.z });
        break;
      }
  }
  return out;
}

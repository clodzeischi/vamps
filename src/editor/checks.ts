// What the block editor flags as you work: a block that would break a map or
// read wrong. Each issue names its tile when it has one (click to go there).
import { blockedDoorways } from "../gallery/checks";
import { E, edgeAt, edgeOpen, flightEnds, reachable, skinAt, T, tileAt, walkable, furnitureCover, furnitureSkin, type BattleMap } from "../tactical/map/map";
import { pieceLabel } from "../tactical/map/pieces";
import { BLOCK, ROAD_PROFILE, type BlockMeta, type BlockNode, type Side } from "../tactical/map/blocks";

export interface BlockIssue { text: string; x?: number; y?: number; z?: number }

const SIDE_NAME: Record<Side, string> = { n: "north", e: "east", s: "south", w: "west" };

export function blockIssues(m: BattleMap, meta: BlockMeta, nodes: BlockNode[]): BlockIssue[] {
  const out: BlockIssue[] = [];
  const g = m.ground;
  // Reached from the street: from every walkable tile on the block's rim, on the street level.
  const seen = new Uint8Array(m.tiles.length);
  const rim: { x: number; y: number }[] = [];
  for (let x = 0; x < m.w; x++) rim.push({ x, y: 0 }, { x, y: m.h - 1 });
  for (let y = 1; y < m.h - 1; y++) rim.push({ x: 0, y }, { x: m.w - 1, y });
  for (const p of rim) {
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
        if (lost++ < 6) out.push({ text: "Can't be reached from the street", x, y, z });
      }
  if (lost > 6) out.push({ text: `…and ${lost - 6} more tiles out of reach` });
  // Stairs: a floor to step on at the foot and off at the head, nothing in the way.
  for (const f of m.flights ?? [])
    for (const { foot, head } of flightEnds(f)) {
      if (!walkable(m, foot.x, foot.y, foot.z) || !edgeOpen(m, foot.x, foot.y, foot.z, f.dx, f.dy)) out.push({ text: "Stairs: nowhere to step on at the foot", ...foot });
      if (!walkable(m, head.x, head.y, head.z) || !edgeOpen(m, head.x, head.y, head.z, -f.dx, -f.dy)) out.push({ text: "Stairs lead nowhere (no floor at the head, a level up)", ...head });
    }
  for (const f of m.furniture) {
    // A piece with no cover is dressing: nothing to break, nothing to get to.
    const cover = furnitureCover(f.kind), name = pieceLabel(f.kind).toLowerCase();
    if (cover === "none") continue;
    let whole = true;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) if (tileAt(m, x, y, f.z) !== (cover === "high" ? T.HIGH : T.LOW) || skinAt(m, x, y, f.z) !== furnitureSkin(f.kind)) whole = false;
    if (!whole) out.push({ text: `The ${name} is broken`, x: f.x, y: f.y, z: f.z });
    let open = false;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) {
        const fx = x + f.dx, fy = y + f.dy;
        const front = fx < f.x || fy < f.y || fx >= f.x + f.w || fy >= f.y + f.h;
        if (front && walkable(m, fx, fy, f.z) && edgeAt(m, x, y, f.z, f.dx, f.dy) === E.NONE) open = true;
      }
    if (!open) out.push({ text: `Nobody can get to the ${name} (its front is blocked)`, x: f.x, y: f.y, z: f.z });
  }
  // (Lamps by a door are fine in a block: they are fittings, not posts.)
  for (const p of blockedDoorways(m)) if (p.text.startsWith("prop")) out.push({ text: "A prop stands in a doorway", x: p.x, y: p.y, z: p.z });
  for (const n of nodes) if (!walkable(m, n.x, n.y, n.z)) out.push({ text: `A ${n.role} node on a tile nobody can stand on`, x: n.x, y: n.y, z: n.z });
  // Entrances: a block needs a way in, out onto its side at street level; a corridor's road leaves the standard way.
  if (meta.type !== "corridor" && !meta.entrances.length) out.push({ text: "No entrance: tick the sides with a way in (a door, a drive, a gate)" });
  for (const s of meta.entrances) {
    const along = s === "n" || s === "s" ? m.w : m.h;
    const at = (k: number) => ({ x: s === "n" || s === "s" ? k : s === "w" ? 0 : m.w - 1, y: s === "e" || s === "w" ? k : s === "n" ? 0 : m.h - 1 });
    if (meta.type === "corridor") {
      for (let k = 0; k < along; k++) {
        const j = k % BLOCK, road = j >= ROAD_PROFILE.pavement && j < ROAD_PROFILE.pavement + ROAD_PROFILE.road;
        const { x, y } = at(k);
        if (road !== (tileAt(m, x, y, g) === T.FLOOR && skinAt(m, x, y, g) === "road")) {
          out.push({ text: `Its road leaves by its ${SIDE_NAME[s]} side, so it must meet it the standard way: pavement ${ROAD_PROFILE.pavement}, road ${ROAD_PROFILE.road}, pavement ${ROAD_PROFILE.pavement} in each ${BLOCK} tiles`, x, y, z: g });
          break;
        }
      }
    } else if (!Array.from({ length: along }, (_, k) => at(k)).some((p) => walkable(m, p.x, p.y, g) && seen[(g * m.h + p.y) * m.w + p.x])) {
      out.push({ text: `Its ${SIDE_NAME[s]} side is an entrance, but nobody can walk out there at street level` });
    }
  }
  if (!meta.terrains.length) out.push({ text: "No terrain: no map will use it" });
  const strikes = meta.targets.filter((t) => ["nest", "den", "haven", "feeding"].includes(t));
  if (strikes.length && !nodes.some((n) => n.role === "vampire" || n.role === "elder")) out.push({ text: `A ${strikes[0]} target needs a vampire node` });
  if (meta.targets.includes("haven") && !nodes.some((n) => n.role === "elder")) out.push({ text: "A haven needs an elder node" });
  if (meta.targets.includes("rescue") && !nodes.some((n) => n.role === "prisoner")) out.push({ text: "A rescue target needs a prisoner node" });
  if (meta.targets.length && !nodes.some((n) => n.role === "thrall")) out.push({ text: "A target block needs thrall nodes" });
  return out;
}

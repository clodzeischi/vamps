// What the block editor flags as you work: a block that would break a map or
// read wrong. Each issue names its tile when it has one (click to go there).
import { blockedDoorways } from "../gallery/checks";
import { E, edgeAt, reachable, skinAt, T, tileAt, walkable, furnitureSkin, type BattleMap } from "../tactical/map";
import type { BlockMeta, BlockNode } from "../tactical/blocks";

export interface BlockIssue { text: string; x?: number; y?: number; z?: number }

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
  for (let z = 0; z < m.levels; z++)
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++)
        if (tileAt(m, x, y, z) === T.STAIRS && !walkable(m, x, y, z + 1)) out.push({ text: "Stairs lead nowhere (no floor above)", x, y, z });
  for (const f of m.furniture) {
    let whole = true;
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (tileAt(m, x, y, f.z) !== T.LOW || skinAt(m, x, y, f.z) !== furnitureSkin(f.kind)) whole = false;
    if (!whole) out.push({ text: `The ${f.kind} is broken`, x: f.x, y: f.y, z: f.z });
    let open = false;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) {
        const fx = x + f.dx, fy = y + f.dy;
        const front = fx < f.x || fy < f.y || fx >= f.x + f.w || fy >= f.y + f.h;
        if (front && walkable(m, fx, fy, f.z) && edgeAt(m, x, y, f.z, f.dx, f.dy) === E.NONE) open = true;
      }
    if (!open) out.push({ text: `Nobody can get to the ${f.kind} (its front is blocked)`, x: f.x, y: f.y, z: f.z });
  }
  // (Lamps by a door are fine in a block: they are fittings, not posts.)
  for (const p of blockedDoorways(m)) if (p.text.startsWith("prop")) out.push({ text: "A prop stands in a doorway", x: p.x, y: p.y, z: p.z });
  for (const n of nodes) if (!walkable(m, n.x, n.y, n.z)) out.push({ text: `A ${n.role} node on a tile nobody can stand on`, x: n.x, y: n.y, z: n.z });
  if (meta.kind === "building" && !meta.fronts.length) out.push({ text: "A building needs a front (the side on the street)" });
  if (!meta.terrains.length) out.push({ text: "No terrain: no map will use it" });
  const strikes = meta.targets.filter((t) => ["nest", "den", "haven", "feeding"].includes(t));
  if (strikes.length && !nodes.some((n) => n.role === "vampire" || n.role === "elder")) out.push({ text: `A ${strikes[0]} target needs a vampire node` });
  if (meta.targets.includes("haven") && !nodes.some((n) => n.role === "elder")) out.push({ text: "A haven needs an elder node" });
  if (meta.targets.includes("rescue") && !nodes.some((n) => n.role === "prisoner")) out.push({ text: "A rescue target needs a prisoner node" });
  if (meta.targets.length && !nodes.some((n) => n.role === "thrall")) out.push({ text: "A target block needs thrall nodes" });
  return out;
}

// Top-down drawing of a battle map level for the gallery (a dev tool, not the
// game's renderer). One canvas, `s` pixels a tile.
import { E, edgeAt, edgeSkinAt, LIGHT_RADIUS, skinAt, T, tileAt, type BattleMap, type EdgeKind, type Skin } from "../tactical/map";
import type { Issue } from "./checks";

export interface Overlays {
  lights: boolean;
  lz: boolean;
  spawns: boolean;
  issues: boolean;
  grid: boolean;
}

export const SKIN_COLOUR: Record<Skin, string> = {
  none: "#000000", grass: "#4d6b3a", road: "#38383c", pavement: "#76736c", indoor: "#a38c6b", dirt: "#7a6040",
  wood: "#8a5a2b", stone: "#8f8d86", roof: "#6b5452", brick: "#9b4a35", plaster: "#d8cfb8", car: "#3f74b8",
  crate: "#b8863f", tree: "#24521f", hedge: "#3f7a35", hay: "#d8bb5a", fence: "#a1805a", bin: "#5d6a6e",
  table: "#6e4826", bench: "#8a6a40", planks: "#7a5a38", parapet: "#b0aaa0", tarmac: "#2c2d31", grave: "#bdbdb4",
  rock: "#6a6560", sarcophagus: "#c4b28e", pillar: "#d4d0c4", altar: "#e6d48c", rubble: "#8a7f70", crypt: "#4e4640", truck: "#4f6f9a",
  bed: "#d8dce0", shelf: "#a0a8b0", counter: "#6a5040", fridge: "#e8ecee", pump: "#d84030", rack: "#4a6a9a",
  tile: "#c8ccc8", concrete: "#9a9a96", metal: "#7a8890", clinic: "#e4e8e4", sofa: "#5a6e48", tv: "#2a2624",
};

const BG = "#121214";
const WALL = "#120e0b";
const WINDOW = "#8fd3ff";
const DOOR = "#f0b848";
const SHUT = "#9a5a28";
const GLASS = "#cfeeff";
const ROUND = new Set<Skin>(["tree", "rock", "pillar", "bin"]);
const ORTHO = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;

/** The floor a prop stands on: the commonest floor skin beside it. */
function floorUnder(m: BattleMap, x: number, y: number, z: number): string {
  const n = new Map<Skin, number>();
  for (const [dx, dy] of ORTHO) {
    const t = tileAt(m, x + dx, y + dy, z);
    if (t === T.FLOOR || t === T.DOOR) {
      const k = skinAt(m, x + dx, y + dy, z);
      n.set(k, (n.get(k) ?? 0) + 1);
    }
  }
  let best: Skin | null = null;
  for (const [k, c] of n) if (!best || c > n.get(best)!) best = k;
  return best ? SKIN_COLOUR[best] : "#2a2a2c";
}

function drawTiles(c: CanvasRenderingContext2D, m: BattleMap, z: number, s: number) {
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const t = tileAt(m, x, y, z);
      if (t === T.VOID) continue;
      const sk = skinAt(m, x, y, z);
      const px = x * s, py = y * s;
      if (t === T.LOW || t === T.HIGH) {
        c.fillStyle = floorUnder(m, x, y, z);
        c.fillRect(px, py, s, s);
        c.fillStyle = SKIN_COLOUR[sk];
        c.strokeStyle = "rgba(0,0,0,0.55)";
        c.lineWidth = Math.max(1, s * 0.07);
        if (ROUND.has(sk)) {
          c.beginPath();
          c.arc(px + s / 2, py + s / 2, s * (t === T.HIGH ? 0.46 : 0.34), 0, Math.PI * 2);
          c.fill();
          if (s >= 6) c.stroke();
        } else {
          const d = s * (t === T.HIGH ? 0.04 : 0.16);
          c.fillRect(px + d, py + d, s - 2 * d, s - 2 * d);
          if (s >= 6) c.strokeRect(px + d, py + d, s - 2 * d, s - 2 * d);
        }
        continue;
      }
      c.fillStyle = t === T.WALL ? WALL : SKIN_COLOUR[sk];
      c.fillRect(px, py, s, s);
      if (t === T.STAIRS) {
        c.fillStyle = "rgba(255,240,210,0.55)";
        for (let k = 1; k <= 3; k++) c.fillRect(px + s * 0.15, py + (k * s) / 4 - s * 0.05, s * 0.7, Math.max(1, s * 0.1));
      }
      if (t === T.WINDOW) {
        c.fillStyle = WINDOW;
        c.fillRect(px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6);
      }
    }
}

function edgeLine(c: CanvasRenderingContext2D, k: EdgeKind, x0: number, y0: number, x1: number, y1: number, s: number) {
  if (k === E.NONE) return;
  c.beginPath();
  if (k === E.DOOR || k === E.SHUT) {
    // A short brass bar in the middle of the gap.
    const ix = (x1 - x0) * 0.2, iy = (y1 - y0) * 0.2;
    c.moveTo(x0 + ix, y0 + iy);
    c.lineTo(x1 - ix, y1 - iy);
    c.strokeStyle = k === E.SHUT ? SHUT : DOOR;
    c.lineWidth = Math.max(1.5, s * 0.16);
  } else {
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.strokeStyle = k === E.WALL ? WALL : k === E.GLASS ? GLASS : k === E.SILL ? SHUT : WINDOW;
    c.lineWidth = k === E.WALL ? Math.max(1.5, s * 0.22) : Math.max(1.5, s * 0.16);
  }
  c.stroke();
}

function drawEdges(c: CanvasRenderingContext2D, m: BattleMap, z: number, s: number) {
  c.lineCap = "square";
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      edgeLine(c, edgeAt(m, x, y, z, 1, 0), (x + 1) * s, y * s, (x + 1) * s, (y + 1) * s, s);
      edgeLine(c, edgeAt(m, x, y, z, 0, 1), x * s, (y + 1) * s, (x + 1) * s, (y + 1) * s, s);
      if (x === 0) edgeLine(c, edgeAt(m, x, y, z, -1, 0), 0, y * s, 0, (y + 1) * s, s);
      if (y === 0) edgeLine(c, edgeAt(m, x, y, z, 0, -1), x * s, 0, (x + 1) * s, 0, s);
    }
  c.lineCap = "butt";
}

/** The edge kind and skin on each side of a tile, for the hover readout. */
export function edgesOf(m: BattleMap, x: number, y: number, z: number): string {
  const names = ["E", "S", "W", "N"];
  const kinds = ["", "wall", "window", "door"];
  return ORTHO.map(([dx, dy], i) => {
    const k = edgeAt(m, x, y, z, dx, dy);
    return k ? `${names[i]} ${kinds[k]} (${edgeSkinAt(m, x, y, z, dx, dy)})` : "";
  }).filter(Boolean).join(", ");
}

/** One level of a map, with the ground level faint beneath an upper floor or roof. */
export function drawLevel(c: CanvasRenderingContext2D, m: BattleMap, z: number, s: number, ov: Overlays, issues: Issue[]) {
  c.fillStyle = BG;
  c.fillRect(0, 0, m.w * s, m.h * s);
  if (z > m.ground) {
    c.globalAlpha = 0.22;
    drawTiles(c, m, m.ground, s);
    c.globalAlpha = 1;
  }
  drawTiles(c, m, z, s);
  drawEdges(c, m, z, s);

  if (ov.grid && s >= 10) {
    c.strokeStyle = "rgba(255,255,255,0.06)";
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 1; x < m.w; x++) c.moveTo(x * s + 0.5, 0), c.lineTo(x * s + 0.5, m.h * s);
    for (let y = 1; y < m.h; y++) c.moveTo(0, y * s + 0.5), c.lineTo(m.w * s, y * s + 0.5);
    c.stroke();
  }

  if (ov.lights)
    for (const l of m.lights) {
      if (l.z !== z) continue;
      const cx = (l.x + 0.5) * s, cy = (l.y + 0.5) * s;
      c.fillStyle = "rgba(255,214,110,0.07)";
      c.beginPath();
      c.arc(cx, cy, LIGHT_RADIUS * s, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffe08a";
      c.strokeStyle = "#3a2a00";
      c.lineWidth = Math.max(1, s * 0.06);
      c.beginPath();
      c.arc(cx, cy, Math.max(1.8, s * 0.2), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

  if (ov.lz && m.lz.length && m.lz[0]!.z === z) {
    const xs = m.lz.map((p) => p.x), ys = m.lz.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs) + 1, y1 = Math.max(...ys) + 1;
    c.fillStyle = "rgba(90,230,160,0.18)";
    c.fillRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
    c.strokeStyle = "#5fe0a0";
    c.lineWidth = Math.max(1.5, s * 0.12);
    c.setLineDash([Math.max(2, s * 0.4), Math.max(2, s * 0.25)]);
    c.strokeRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
    c.setLineDash([]);
  }

  if (ov.spawns)
    for (const p of m.spawns) {
      if (p.z !== z) continue;
      c.fillStyle = p.side === "vampire" ? "#b060ff" : p.side === "thrall" ? "#e05040" : "#e8e8e8";
      c.strokeStyle = p.elder ? "#ffd700" : "#000";
      c.lineWidth = p.elder ? Math.max(2, s * 0.14) : Math.max(1, s * 0.06);
      c.beginPath();
      c.arc((p.x + 0.5) * s, (p.y + 0.5) * s, Math.max(2, s * 0.3), 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

  if (ov.issues)
    for (const p of issues) {
      if (p.z !== z) continue;
      c.strokeStyle = "#ff3b3b";
      c.lineWidth = Math.max(1.5, s * 0.16);
      const d = Math.max(0.5, s * 0.02);
      c.strokeRect(p.x * s - d, p.y * s - d, s + 2 * d, s + 2 * d);
    }
}

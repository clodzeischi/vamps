// What the block editor draws over the battle view: the grid of the level being
// edited, the pointer (a tile, a wall, a rectangle, a piece's footprint and the
// way it faces), the checks' problems, the nodes, and the sides a block opens
// onto. Flat shapes just over the floor; the pointer shows through walls.
import * as THREE from "three";
import { LEVEL_H, SLAB, TILE } from "../render/battle/scale";
import type { BlockNode, Side } from "../tactical/map/blocks";

/** Where the pointer is, as the overlay draws it. */
export type Cursor =
  | { kind: "tile"; x: number; y: number; colour: number }
  | { kind: "edge"; x: number; y: number; dx: number; dy: number; colour: number }
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number; colour: number }
  | {
      kind: "footprint";
      x: number;
      y: number;
      w: number;
      h: number;
      dx: number;
      dy: number;
      colour: number;
    }
  | { kind: "point"; x: number; y: number; colour: number };

export const OK = 0x7ad08a,
  BAD = 0xff6b5b,
  AIM = 0xf0b848,
  ERASE = 0xff6b5b;

const floorY = (z: number) => z * LEVEL_H + SLAB + 0.03;

function basic(colour: number, opacity: number, onTop: boolean) {
  return new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity,
    depthTest: !onTop,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** A flat rectangle on a level, x0…x1 by y0…y1 in tiles. */
function flat(x0: number, y0: number, x1: number, y1: number, y: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * TILE, (y1 - y0) * TILE), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(((x0 + x1) / 2) * TILE, y, ((y0 + y1) / 2) * TILE);
  return m;
}

/** A rectangle's outline (strips `t` tiles wide just inside it), and a faint fill. */
function outline(
  g: THREE.Group,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  y: number,
  colour: number,
  t = 0.06,
  fill = 0.16,
) {
  const line = basic(colour, 0.95, true);
  g.add(flat(x0, y0, x1, y0 + t, y, line), flat(x0, y1 - t, x1, y1, y, line));
  g.add(flat(x0, y0 + t, x0 + t, y1 - t, y, line), flat(x1 - t, y0 + t, x1, y1 - t, y, line));
  if (fill) g.add(flat(x0, y0, x1, y1, y - 0.005, basic(colour, fill, true)));
}

function label(text: string, colour: string) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  c.fillStyle = colour;
  c.beginPath();
  c.arc(32, 32, 30, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#111";
  c.font = "bold 36px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, fog: false, toneMapped: false }),
  );
  s.scale.set(0.7, 0.7, 1);
  s.renderOrder = 12;
  return s;
}

function dispose(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material & { map?: THREE.Texture };
    mat?.map?.dispose();
    mat?.dispose?.();
  });
  g.clear();
}

export class EditorOverlay {
  readonly root = new THREE.Group();
  private grid = new THREE.Group();
  private marks = new THREE.Group();
  private cursor = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.root.add(this.grid, this.marks, this.cursor);
    this.root.renderOrder = 10;
    scene.add(this.root);
  }

  /** The level's grid: a line every tile, brighter every 8 (a unit), the block's edge. */
  setGrid(w: number, h: number, z: number) {
    dispose(this.grid);
    const y = floorY(z) - 0.01;
    const pts: number[] = [],
      unit: number[] = [];
    for (let x = 0; x <= w; x++) (x % 8 ? pts : unit).push(x * TILE, y, 0, x * TILE, y, h * TILE);
    for (let v = 0; v <= h; v++) (v % 8 ? pts : unit).push(0, y, v * TILE, w * TILE, y, v * TILE);
    for (const [list, opacity] of [
      [pts, 0.16],
      [unit, 0.5],
    ] as const) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
      this.grid.add(
        new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({
            color: 0xf0e6c8,
            transparent: true,
            opacity,
            depthWrite: false,
            fog: false,
            toneMapped: false,
          }),
        ),
      );
    }
  }

  /** Problems on this level, the nodes (when shown), and the sides that open onto the next lot. */
  setMarks(o: {
    z: number;
    ground: number;
    w: number;
    h: number;
    issues: { x: number; y: number }[];
    nodes: BlockNode[] | null;
    roleColour: Record<string, string>;
    entrances: Side[] | null;
  }) {
    dispose(this.marks);
    const y = floorY(o.z);
    const seen = new Set<string>();
    for (const i of o.issues) {
      const k = `${i.x},${i.y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      outline(this.marks, i.x + 0.08, i.y + 0.08, i.x + 0.92, i.y + 0.92, y, BAD, 0.07, 0.22);
    }
    for (const n of o.nodes ?? []) {
      if (n.z !== o.z) continue;
      const s = label(n.role[0]!.toUpperCase(), o.roleColour[n.role] ?? "#fff");
      s.position.set((n.x + 0.5) * TILE, y + 0.9, (n.y + 0.5) * TILE);
      this.marks.add(s);
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.45 * TILE, 24),
        basic(new THREE.Color(o.roleColour[n.role] ?? "#fff").getHex(), 0.55, true),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set((n.x + 0.5) * TILE, y, (n.y + 0.5) * TILE);
      this.marks.add(disc);
    }
    if (o.entrances && o.z === o.ground) {
      const t = 0.18;
      for (const s of o.entrances) {
        const [x0, y0, x1, y1] =
          s === "n"
            ? [0, -t, o.w, 0]
            : s === "s"
              ? [0, o.h, o.w, o.h + t]
              : s === "w"
                ? [-t, 0, 0, o.h]
                : [o.w, 0, o.w + t, o.h];
        this.marks.add(flat(x0, y0, x1, y1, y, basic(AIM, 0.9, true)));
      }
    }
  }

  /** Where the pointer is (nothing: null). */
  setCursor(c: Cursor | null, z: number) {
    dispose(this.cursor);
    if (!c) return;
    const y = floorY(z) + 0.01;
    if (c.kind === "tile") outline(this.cursor, c.x, c.y, c.x + 1, c.y + 1, y, c.colour);
    else if (c.kind === "rect")
      outline(this.cursor, c.x0, c.y0, c.x1 + 1, c.y1 + 1, y, c.colour, 0.08, 0.2);
    else if (c.kind === "edge") {
      // A pane standing on the wall's line, the height of a storey.
      const along = c.dy !== 0;
      const ex = c.x + (c.dx > 0 ? 1 : 0),
        ey = c.y + (c.dy > 0 ? 1 : 0);
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(along ? TILE : 0.22, LEVEL_H - SLAB, along ? 0.22 : TILE),
        basic(c.colour, 0.45, true),
      );
      pane.position.set(
        along ? (c.x + 0.5) * TILE : ex * TILE,
        y + (LEVEL_H - SLAB) / 2,
        along ? ey * TILE : (c.y + 0.5) * TILE,
      );
      this.cursor.add(pane);
      outline(this.cursor, c.x, c.y, c.x + 1, c.y + 1, y, c.colour, 0.04, 0.06);
    } else if (c.kind === "point") {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.22 * TILE, 20),
        basic(c.colour, 0.9, true),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(c.x * TILE, y, c.y * TILE);
      this.cursor.add(disc);
    } else {
      const { x, y: ty, w, h, dx, dy } = c;
      outline(this.cursor, x, ty, x + w, ty + h, y, c.colour, 0.06, 0.12);
      // The front: a bar along the side it faces.
      const b = 0.16;
      if (dx > 0)
        this.cursor.add(flat(x + w - b, ty, x + w, ty + h, y + 0.01, basic(c.colour, 1, true)));
      if (dx < 0) this.cursor.add(flat(x, ty, x + b, ty + h, y + 0.01, basic(c.colour, 1, true)));
      if (dy > 0)
        this.cursor.add(flat(x, ty + h - b, x + w, ty + h, y + 0.01, basic(c.colour, 1, true)));
      if (dy < 0) this.cursor.add(flat(x, ty, x + w, ty + b, y + 0.01, basic(c.colour, 1, true)));
    }
    this.cursor.traverse((o) => (o.renderOrder = 11));
  }

  dispose() {
    for (const g of [this.grid, this.marks, this.cursor]) dispose(g);
    this.root.removeFromParent();
  }
}

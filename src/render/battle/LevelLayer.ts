// The map's static geometry: floors, walls and their edges, furniture and props, signs, stairs. Rebuilt when the map or the level shown changes; walls in front of the camera are cut away.
import * as THREE from "three";
import {
  DECOR_AT,
  E,
  edgeOpen,
  furnitureAnchor,
  furnitureCover,
  furnitureSize,
  furnitureSkin,
  indoors,
  isTown,
  SKINS,
  skinAt,
  T,
  tileAt,
  type BattleMap,
  type Furniture,
  type Sign,
  type Skin,
} from "../../tactical/map/map";
import { litByLamps } from "../shaders/lamps";
import { makeMaterial, surfaceFor, type MaterialKey } from "../shaders/materials";
import {
  DOOR_LINTEL,
  HIGH,
  HIGH_PROP,
  KERB,
  LEVEL_H,
  lowProp,
  SILL,
  SLAB,
  TILE,
  TREE,
  WALL_T,
  wc,
  WINDOW_LINTEL,
} from "./scale";
import { cornerGeometry, roadTop, runBox } from "./kerbs";
import { vehicleBoxes, vehicleModel, vehiclePaint } from "./vehicles";
import { cornerTurn, facing, hasModel, place, PropBatch, propsReady, type PropName } from "./props";
import { pieceParts } from "../../tactical/map/pieces";
import { PALETTE, SKIN_INDEX, KERB_STONE } from "./palette";
import { highProp, flight } from "./fittings";
import { BattleView, type Edge } from "./BattleView";

/** Doors: painted wood. */
const DOOR_COLOUR = 0x5a3a26;
/** A door leaf's hinge: the inner face of the door frame's jamb, from the doorway's centre (the door_frame model). */
const DOOR_HINGE = 0.7;
/** A deterministic scramble of a tile's coordinates, for choosing among looks. */
const hash = (a: number, b: number, c: number) =>
  (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;

/** One box to draw: centre, size, colour. */
/** An upright box; `rx`/`rz` tilt it about x or z (radians), e.g. a handrail along a flight. */
export interface Box {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: number;
  rx?: number;
  rz?: number;
}

/** The map's static geometry: floors, walls and their edges, furniture and props, signs, stairs. Rebuilt when the map or the level shown changes; walls in front of the camera are cut away. */
export class LevelLayer {
  constructor(readonly view: BattleView) {}

  readonly world = new THREE.Group();

  /** The scenery's materials (render/shaders/materials.ts), made as the map needs them. */
  readonly mats = new Map<MaterialKey, THREE.MeshStandardMaterial>();

  /** Materials for one-off meshes (the kerb corners), coloured: key → material. */
  solidMats = new Map<string, THREE.MeshStandardMaterial>();

  readonly glassMat = litByLamps(
    new THREE.MeshStandardMaterial({
      color: 0x9cc4e0,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      depthWrite: false,
    }),
  );

  /** Sign faces by text and colours (kept across rebuilds). */
  signMats = new Map<string, THREE.MeshStandardMaterial>();
  readonly signGeo = new THREE.PlaneGeometry(1, 1);

  mat(key: MaterialKey) {
    return this.mats.get(key) ?? this.mats.set(key, makeMaterial(key)).get(key)!;
  }

  /** Index of an edge (dx, dy ≥ 0) in shownEw or shownNs. */
  edgeIndex(c: Edge) {
    const m = this.view.map!;
    return c.dx ? (c.z * m.h + c.y) * (m.w + 1) + c.x + 1 : (c.z * (m.h + 1) + c.y + 1) * m.w + c.x;
  }

  shownEdge(c: Edge) {
    return (c.dx ? this.view.shownEw : this.view.shownNs)[this.edgeIndex(c)]!;
  }

  showEdges(edges: Edge[], kind: number) {
    if (!this.view.map || !edges.length) return;
    for (const c of edges) (c.dx ? this.view.shownEw : this.view.shownNs)[this.edgeIndex(c)] = kind;
    this.rebuild();
  }

  tileCentre(x: number, y: number, z: number) {
    return new THREE.Vector3(wc(x), z * LEVEL_H, wc(y));
  }

  clearWorld() {
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
      else if (c instanceof THREE.Mesh && c.geometry !== this.signGeo) c.geometry.dispose();
    }
  }

  /** A lit shop sign on a wall's outer face, above the doors. */
  signMesh(sg: Sign, base: number): THREE.Mesh {
    const key = `${sg.text}|${sg.bg}|${sg.fg}|${sg.w}`;
    let mat = this.signMats.get(key);
    if (!mat) {
      const cv = document.createElement("canvas");
      cv.width = 128 * sg.w;
      cv.height = 96;
      const g = cv.getContext("2d")!;
      g.fillStyle = sg.bg;
      g.fillRect(0, 0, cv.width, cv.height);
      g.strokeStyle = sg.fg;
      g.lineWidth = 4;
      g.strokeRect(6, 6, cv.width - 12, cv.height - 12);
      g.fillStyle = sg.fg;
      g.textAlign = "center";
      g.textBaseline = "middle";
      let size = 58;
      g.font = `bold ${size}px "Arial Black", Arial, sans-serif`;
      while (g.measureText(sg.text).width > cv.width - 40 && size > 20)
        g.font = `bold ${(size -= 4)}px "Arial Black", Arial, sans-serif`;
      g.fillText(sg.text, cv.width / 2, cv.height / 2 + 3);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.55,
        roughness: 0.4,
      });
      this.signMats.set(key, mat);
    }
    const mesh = new THREE.Mesh(this.signGeo, mat);
    const out = WALL_T / 2 + 0.03;
    mesh.position.set(
      wc(sg.x) + sg.dx * (TILE / 2 + out),
      base + LEVEL_H - 0.42,
      wc(sg.y) + sg.dy * (TILE / 2 + out),
    );
    mesh.rotation.y = Math.atan2(sg.dx, sg.dy);
    mesh.scale.set(sg.w * TILE * 0.92, 0.62, 1);
    return mesh;
  }

  solid(geo: THREE.BufferGeometry, key: MaterialKey, colour: number) {
    const id = `${key}:${colour}`;
    const mat =
      this.solidMats.get(id) ?? this.solidMats.set(id, makeMaterial(key, colour)).get(id)!;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  rebuild() {
    const m = this.view.map;
    if (!m) return;
    this.view.atmosphere.shadowsMoved();
    this.clearWorld();
    const glass: Box[] = [];
    // Boxes by material (render/shaders/materials.ts): one instanced mesh each.
    const buckets = new Map<MaterialKey, Box[]>();
    const to = (key: MaterialKey) => buckets.get(key) ?? buckets.set(key, []).get(key)!;
    const floorOf = (skin: Skin) => to(surfaceFor(skin, "floor"));
    const wallOf = (skin: Skin) => to(surfaceFor(skin, "wall"));
    const propOf = (skin: Skin) => to(surfaceFor(skin, "prop"));
    // The prop kit's models (render/battle/props.ts), once it has loaded.
    const kit = propsReady() ? new PropBatch() : null;
    const H = LEVEL_H;
    for (let z = 0; z <= this.view.level; z++) {
      const base = z * H;
      // Walls stand their full storey on every level shown, the one looked at too (XCOM): the levels above are cut away.
      const wallH = H;
      // Each tile's floor colour (−1: no slab), and its tile-wide prop (fence, parapet), merged into big boxes below.
      const floor = new Int32Array(m.w * m.h).fill(-1);
      const wide = new Int32Array(m.w * m.h).fill(-1);
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const t = tileAt(m, x, y, z);
          if (t === T.VOID) continue;
          const skin = skinAt(m, x, y, z);
          const cx = wc(x),
            cy = wc(y);
          // What a prop stands on: the floor, or the road's height in a car park or on the road.
          const top =
            z === m.ground && this.view.kerb?.low[y * m.w + x] ? roadTop(base) : base + SLAB;
          const below = tileAt(m, x, y, z - 1);
          // The floor slab (none over a stairwell, so the stairs come up through it).
          // (A lot's corner rounded with the kerb: drawn by the corner's pieces instead.)
          if (below !== T.STAIRS && !(z === m.ground && this.view.kerb?.lotCut[y * m.w + x]))
            floor[y * m.w + x] = SKIN_INDEX[this.floorSkin(m, x, y, z)];
          switch (t) {
            case T.WALL:
              // Full walls stop just under the next floor's slab (no z-fighting with the roof).
              wallOf(skin).push({
                x: cx,
                y: base + SLAB + (wallH === H ? H - SLAB : wallH) / 2,
                z: cy,
                sx: TILE,
                sy: wallH === H ? H - SLAB : wallH,
                sz: TILE,
                c: PALETTE[skin],
              });
              break;
            case T.WINDOW: {
              const near = this.wallNear(m, x, y, z),
                wall = PALETTE[near];
              const sill = SILL;
              wallOf(near).push({
                x: cx,
                y: base + SLAB + sill / 2,
                z: cy,
                sx: TILE,
                sy: sill,
                sz: TILE,
                c: wall,
              });
              if (wallH === H) {
                const lintel = WINDOW_LINTEL;
                wallOf(near).push({
                  x: cx,
                  y: base + H - lintel / 2,
                  z: cy,
                  sx: TILE,
                  sy: lintel,
                  sz: TILE,
                  c: wall,
                });
                glass.push({
                  x: cx,
                  y: base + SLAB + sill + (H - SLAB - sill - lintel) / 2,
                  z: cy,
                  sx: TILE - 0.03,
                  sy: H - SLAB - sill - lintel,
                  sz: TILE - 0.03,
                  c: 0,
                });
              }
              break;
            }
            case T.DOOR:
              if (wallH === H)
                wallOf(this.wallNear(m, x, y, z)).push({
                  x: cx,
                  y: base + H - DOOR_LINTEL / 2,
                  z: cy,
                  sx: TILE,
                  sy: DOOR_LINTEL,
                  sz: TILE,
                  c: PALETTE[this.wallNear(m, x, y, z)],
                });
              break;
            case T.LOW: {
              if (skin === "car") break; // vehicles are drawn whole, below
              if (this.view.furnitureTile.has((z * m.h + y) * m.w + x)) break; // and furniture
              if (kit && this.tileProp(kit, m, skin, x, y, z, top)) break;
              if (skin === "bed") {
                // A metal frame, a white mattress, a blanket over the foot half.
                to("streetMetal").push({
                  x: cx,
                  y: top + 0.2,
                  z: cy,
                  sx: 0.9 * TILE,
                  sy: 0.4,
                  sz: 0.85 * TILE,
                  c: 0x8a9098,
                });
                to("plain").push({
                  x: cx,
                  y: top + 0.48,
                  z: cy,
                  sx: 0.86 * TILE,
                  sy: 0.16,
                  sz: 0.8 * TILE,
                  c: 0xeef0f2,
                });
                to("plain").push({
                  x: cx + 0.2 * TILE,
                  y: top + 0.5,
                  z: cy,
                  sx: 0.48 * TILE,
                  sy: 0.17,
                  sz: 0.82 * TILE,
                  c: 0x5a7aa8,
                });
                break;
              }
              const c = PALETTE[skin];
              const { h, s } = lowProp(skin);
              if (s >= TILE) {
                wide[y * m.w + x] = SKIN_INDEX[skin];
                break;
              }
              propOf(skin).push({ x: cx, y: top + h / 2, z: cy, sx: s, sy: h, sz: s, c });
              break;
            }
            case T.HIGH:
              if (skin === "truck") break;
              if (this.view.furnitureTile.has((z * m.h + y) * m.w + x)) break; // furniture draws itself
              if (skin === "tree") {
                to("bark").push({
                  x: cx,
                  y: top + TREE.trunkH / 2,
                  z: cy,
                  sx: TREE.trunk,
                  sy: TREE.trunkH,
                  sz: TREE.trunk,
                  c: 0x4a3626,
                });
                const ch = TREE.canopyY1 - TREE.canopyY0;
                propOf("tree").push({
                  x: cx,
                  y: top + TREE.canopyY0 + ch / 2,
                  z: cy,
                  sx: TREE.canopy,
                  sy: ch,
                  sz: TREE.canopy,
                  c: PALETTE.tree,
                });
              } else if (HIGH_PROP[skin]) highProp(skin, cx, cy, top, propOf, to);
              else
                propOf(skin).push({
                  x: cx,
                  y: top + HIGH.h / 2,
                  z: cy,
                  sx: HIGH.s,
                  sy: HIGH.h,
                  sz: HIGH.s,
                  c: PALETTE[skin],
                });
              break;
            case T.STAIRS: {
              // Four steps climbing toward whichever way leads to open floor above.
              const dir = this.stairDir(m, x, y, z);
              for (let i = 0; i < 4; i++) {
                const h = ((i + 1) / 4) * H;
                const off = (-0.375 + i * 0.25) * TILE;
                propOf("wood").push({
                  x: cx + dir.x * off,
                  y: base + SLAB + h / 2,
                  z: cy + dir.y * off,
                  sx: (dir.x ? 0.25 : 0.9) * TILE,
                  sy: h,
                  sz: (dir.y ? 0.25 : 0.9) * TILE,
                  c: PALETTE.wood,
                });
              }
              break;
            }
          }
        }
      this.merge(m, floor, (x0, y0, w, h, k) => {
        const skin = SKINS[k]!;
        // Town roads and car parks sit a kerb's height down.
        const drop =
          z === m.ground && (skin === "road" || skin === "tarmac") && isTown(m.setting) ? KERB : 0;
        floorOf(skin).push({
          x: (x0 + w / 2) * TILE,
          y: base + SLAB / 2 - drop,
          z: (y0 + h / 2) * TILE,
          sx: w * TILE,
          sy: SLAB,
          sz: h * TILE,
          c: PALETTE[skin],
        });
      });
      if (z === m.ground && this.view.kerb) {
        for (const k of this.view.kerb.runs)
          to("coping").push({ ...runBox(k, base), c: KERB_STONE });
        for (const c of this.view.kerb.corners) {
          const g = cornerGeometry(c, base);
          this.world.add(
            this.solid(g.pavement, "pavement", PALETTE.pavement),
            this.solid(g.kerb, "coping", KERB_STONE),
          );
          if (g.lot && c.lot)
            this.world.add(this.solid(g.lot, surfaceFor(c.lot, "floor"), PALETTE[c.lot]));
        }
      }
      for (const v of m.vehicles ?? []) {
        if (v.z !== z) continue;
        const floorY =
          this.view.kerb?.low[v.y * m.w + v.x] && z === m.ground ? roadTop(base) : base + SLAB;
        // The model (its front along its length, the way it faces), or until that's in, boxes.
        const model = vehicleModel(v);
        if (kit && model && hasModel(model)) {
          const along = v.w > v.h;
          kit.add(
            model,
            place(
              (v.x + v.w / 2) * TILE,
              floorY,
              (v.y + v.h / 2) * TILE,
              facing(along ? v.front : 0, along ? 0 : v.front),
            ),
            v.wrecked ? undefined : vehiclePaint(v),
          );
        } else for (const b of vehicleBoxes(v, floorY)) to(b.key).push(b);
      }
      for (const f of m.furniture ?? [])
        if (f.z === z)
          this.furniture(
            f,
            z === m.ground && this.view.kerb?.low[f.y * m.w + f.x] ? roadTop(base) : base + SLAB,
            kit,
            to,
          );
      for (const f of m.flights ?? []) if (f.z === z) flight(f, base + SLAB, propOf);
      // Street dressing: on a corner (a sign, a bollard) or a tile (a manhole), on the floor there.
      if (kit)
        for (const d of m.decor ?? []) {
          if (d.z !== z) continue;
          const tx = Math.min(m.w - 1, Math.floor(d.x)),
            ty = Math.min(m.h - 1, Math.floor(d.y));
          const low =
            z === m.ground && this.view.kerb?.low[ty * m.w + tx] && DECOR_AT[d.kind] === "tile";
          kit.add(
            d.kind,
            place(d.x * TILE, low ? roadTop(base) : base + SLAB, d.y * TILE, facing(d.dx, d.dy)),
          );
        }
      // Forecourt canopies: shown with the level above (a roof, like the rest).
      for (const c of m.canopies ?? []) {
        if (c.z !== z - 1) continue;
        const cb = c.z * H + SLAB,
          x0 = c.x0 * TILE,
          x1 = (c.x1 + 1) * TILE,
          z0 = c.y0 * TILE,
          z1 = (c.y1 + 1) * TILE;
        to("plain").push({
          x: (x0 + x1) / 2,
          y: cb + c.h + 0.25,
          z: (z0 + z1) / 2,
          sx: x1 - x0,
          sy: 0.5,
          sz: z1 - z0,
          c: 0xe8e8e4,
        });
        to("plain").push({
          x: (x0 + x1) / 2,
          y: cb + c.h + 0.32,
          z: (z0 + z1) / 2,
          sx: x1 - x0 + 0.04,
          sy: 0.22,
          sz: z1 - z0 + 0.04,
          c: 0xc83a2c,
        });
        for (const px of [x0 + 0.5, x1 - 0.5])
          for (const pz of [z0 + 0.5, z1 - 0.5])
            to("streetMetal").push({
              x: px,
              y: cb + c.h / 2,
              z: pz,
              sx: 0.3,
              sy: c.h,
              sz: 0.3,
              c: 0xd8d8d4,
            });
      }
      for (const sg of m.signs ?? []) if (sg.z === z) this.world.add(this.signMesh(sg, base));
      this.merge(m, wide, (x0, y0, w, h, k) => {
        const skin = SKINS[k]!,
          ph = lowProp(skin).h;
        propOf(skin).push({
          x: (x0 + w / 2) * TILE,
          y: base + SLAB + ph / 2,
          z: (y0 + h / 2) * TILE,
          sx: w * TILE,
          sy: ph,
          sz: h * TILE,
          c: PALETTE[skin],
        });
      });
      this.edgeBoxes(m, z, base, wallH, wallOf, glass, kit);
      if (kit) this.dressLevel(m, z, base, kit);
    }
    for (const [key, boxes] of buckets) this.world.add(this.instanced(boxes, this.mat(key), true));
    const kitMeshes = kit?.meshes() ?? [];
    if (kitMeshes.length) this.world.add(...kitMeshes); // (add() with nothing complains)
    this.world.add(this.instanced(glass, this.glassMat, false));
  }

  /**
   * Tiles of one kind (−1: none) as few rectangles as it takes (greedy), so a
   * floor or a fence is one surface with no seams between its tiles.
   */
  merge(
    m: BattleMap,
    floor: Int32Array,
    emit: (x: number, y: number, w: number, h: number, key: number) => void,
  ) {
    const done = new Uint8Array(floor.length);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const i = y * m.w + x,
          c = floor[i]!;
        if (c < 0 || done[i]) continue;
        let w = 1;
        while (x + w < m.w && floor[i + w] === c && !done[i + w]) w++;
        let h = 1;
        grow: while (y + h < m.h) {
          for (let k = 0; k < w; k++) {
            const j = (y + h) * m.w + x + k;
            if (floor[j] !== c || done[j]) break grow;
          }
          h++;
        }
        for (let dy = 0; dy < h; dy++) done.fill(1, (y + dy) * m.w + x, (y + dy) * m.w + x + w);
        emit(x, y, w, h, c);
      }
  }

  /** Walls, windows and doorways on the edges between tiles: thin boxes along the grid lines. */
  edgeBoxes(
    m: BattleMap,
    z: number,
    base: number,
    wallH: number,
    into: (skin: Skin) => Box[],
    glass: Box[],
    kit: PropBatch | null,
  ) {
    const H = LEVEL_H;
    const full = wallH === H;
    const wallTop = full ? H - SLAB : wallH;
    const colour = (skin: Skin) => PALETTE[skin === "none" ? "plaster" : skin];
    /** A box on a grid line: centred at (cx, cy), `len` metres along it. */
    const box = (
      cx: number,
      cy: number,
      along: "x" | "y",
      len: number,
      y0: number,
      h: number,
      c: number,
      into: Box[],
      thin = WALL_T,
    ) =>
      into.push({
        x: cx,
        y: base + SLAB + y0 + h / 2,
        z: cy,
        sx: along === "x" ? len : thin,
        sy: h,
        sz: along === "y" ? len : thin,
        c,
      });
    /** A window or doorway: one tile long, flush with the walls either side. */
    const opening = (kind: number, skin: Skin, cx: number, cy: number, along: "x" | "y") => {
      const c = colour(skin),
        solid = into(skin);
      const framed = kit && full && m.setting !== "lair" && m.setting !== "montsegur";
      if (framed && (kind === E.SILL || kind === E.WINDOW)) {
        // The frame stays when the glass goes; blinds in some lived-in rooms.
        const { rot, inside } = this.edgeFront(m, cx, cy, along, z);
        const at = place(cx, base + SLAB, cy, rot);
        kit.add(
          skin === "metal" || skin === "clinic" || m.setting === "industrial"
            ? "window_modern"
            : "window_casement",
          at,
        );
        if (inside && hash(Math.round(cx * 2), Math.round(cy * 2), z) % 5 < 2)
          kit.add("window_blinds", at);
      }
      if (kind === E.SILL) {
        // A broken window: the sill and the wall over it, the glass gone.
        box(cx, cy, along, TILE, 0, SILL, c, solid);
        if (full) box(cx, cy, along, TILE, H - SLAB - WINDOW_LINTEL, WINDOW_LINTEL, c, solid);
      } else if (kind === E.WINDOW) {
        box(cx, cy, along, TILE, 0, SILL, c, solid);
        if (full) {
          box(cx, cy, along, TILE, H - SLAB - WINDOW_LINTEL, WINDOW_LINTEL, c, solid);
          box(cx, cy, along, TILE, SILL, H - SLAB - SILL - WINDOW_LINTEL, 0, glass, WALL_T * 0.4);
        }
      } else if (kind === E.RAIL) {
        // A railing: a top rail at sill height, a mid rail, posts at each end.
        const metal = into("metal"),
          mc = PALETTE.metal;
        box(cx, cy, along, TILE, SILL - 0.05, 0.05, mc, metal, 0.06);
        box(cx, cy, along, TILE, SILL / 2, 0.03, mc, metal, 0.04);
        for (const e of [-1, 1]) {
          const px = along === "x" ? cx + e * (TILE / 2 - 0.03) : cx,
            py = along === "y" ? cy + e * (TILE / 2 - 0.03) : cy;
          box(px, py, along, 0.06, 0, SILL, mc, metal, 0.06);
        }
      } else if (kind === E.GLASS) {
        // Floor-to-ceiling: a metal rail top and bottom, the pane between.
        const frame = into("metal"),
          fc = PALETTE.metal,
          rail = 0.08;
        box(cx, cy, along, TILE, 0, rail, fc, frame, WALL_T * 0.7);
        box(cx, cy, along, TILE, wallTop - rail, rail, fc, frame, WALL_T * 0.7);
        box(cx, cy, along, TILE, rail, wallTop - 2 * rail, 0, glass, WALL_T * 0.3);
      } else if (kind === E.DOOR || kind === E.SHUT) {
        if (full) box(cx, cy, along, TILE, H - SLAB - DOOR_LINTEL, DOOR_LINTEL, c, solid);
        // A building's door (not a bare gap in a lair): the leaf in the frame, or swung open indoors.
        if (m.setting === "lair" || m.setting === "montsegur") return;
        const leafH = H - SLAB - DOOR_LINTEL,
          wood = into("wood"),
          dc = DOOR_COLOUR;
        if (framed) {
          // A frame and two leaves, shut in the frame or swung back into the room.
          const { rot } = this.edgeFront(m, cx, cy, along, z);
          const at = place(cx, base + SLAB, cy, rot);
          kit.add("door_frame", at);
          const leaf: PropName =
            skin === "metal" || skin === "clinic" || m.setting === "industrial"
              ? "door_steel"
              : "door_wood";
          const open = kind === E.DOOR,
            hinge = DOOR_HINGE - (open ? 0.025 : 0),
            back = open ? -WALL_T / 2 : 0;
          kit.add(leaf, at.clone().multiply(place(-hinge, 0, back, open ? Math.PI / 2 : 0)));
          kit.add(leaf, at.clone().multiply(place(hinge, 0, back, open ? Math.PI / 2 : Math.PI)));
          return;
        }
        if (kind === E.SHUT)
          return void box(cx, cy, along, TILE - 0.04, 0, leafH, dc, wood, WALL_T * 0.45);
        // Open: hinged at one end of the frame, standing out on the indoor side.
        const [ax, ay] =
          along === "y"
            ? [Math.round(cx / TILE) - 1, Math.floor(cy / TILE)]
            : [Math.floor(cx / TILE), Math.round(cy / TILE) - 1];
        const [bx, by] = along === "y" ? [ax + 1, ay] : [ax, ay + 1];
        const side = indoors(m, { x: bx, y: by, z }) || !indoors(m, { x: ax, y: ay, z }) ? 1 : -1;
        const len = TILE - 0.12,
          hinge = -TILE / 2 + 0.05;
        if (along === "y")
          into("wood").push({
            x: cx + side * (len / 2 + WALL_T / 2),
            y: base + SLAB + leafH / 2,
            z: cy + hinge,
            sx: len,
            sy: leafH,
            sz: 0.06,
            c: dc,
          });
        else
          into("wood").push({
            x: cx + hinge,
            y: base + SLAB + leafH / 2,
            z: cy + side * (len / 2 + WALL_T / 2),
            sx: 0.06,
            sy: leafH,
            sz: len,
            c: dc,
          });
      }
    };
    /**
     * One grid line: plain walls in runs of one skin become one box each
     * (half a wall's thickness past each end, to close the corners);
     * openings are drawn tile by tile.
     */
    const line = (
      n: number,
      edge: (k: number) => { kind: number; skin: Skin },
      at: (k: number) => [number, number],
      along: "x" | "y",
    ) => {
      for (let k = 0; k < n;) {
        const e = edge(k);
        if (e.kind !== E.WALL) {
          if (e.kind !== E.NONE) opening(e.kind, e.skin, ...at(k), along);
          k++;
          continue;
        }
        let j = k + 1;
        while (j < n && edge(j).kind === E.WALL && edge(j).skin === e.skin) j++;
        const [ax, ay] = at(k),
          [bx, by] = at(j - 1);
        box(
          (ax + bx) / 2,
          (ay + by) / 2,
          along,
          (j - k) * TILE + WALL_T,
          0,
          wallTop,
          colour(e.skin),
          into(e.skin),
        );
        k = j;
      }
    };
    // West edges, down each grid line x (between tile x − 1 and x).
    for (let x = 0; x <= m.w; x++) {
      const i = (y: number) => (z * m.h + y) * (m.w + 1) + x;
      line(
        m.h,
        (y) => ({ kind: this.view.shownEw[i(y)]!, skin: SKINS[m.ewSkin[i(y)]!]! }),
        (y) => [x * TILE, wc(y)],
        "y",
      );
    }
    // North edges, along each grid line y (between tile y − 1 and y).
    for (let y = 0; y <= m.h; y++) {
      const i = (x: number) => (z * (m.h + 1) + y) * m.w + x;
      line(
        m.w,
        (x) => ({ kind: this.view.shownNs[i(x)]!, skin: SKINS[m.nsSkin[i(x)]!]! }),
        (x) => [wc(x), y * TILE],
        "x",
      );
    }
  }

  /** A tile in a building: on the map, not empty, under a roof or a floor. */
  inside(m: BattleMap, x: number, y: number, z: number) {
    return (
      x >= 0 &&
      y >= 0 &&
      x < m.w &&
      y < m.h &&
      tileAt(m, x, y, z) !== T.VOID &&
      indoors(m, { x, y, z })
    );
  }

  /**
   * An edge piece's turn: its front (the street side) away from the room, as
   * a door swings into the room; and whether there is a room either side.
   */
  edgeFront(m: BattleMap, cx: number, cy: number, along: "x" | "y", z: number) {
    const [ax, ay] =
      along === "y"
        ? [Math.round(cx / TILE) - 1, Math.floor(cy / TILE)]
        : [Math.floor(cx / TILE), Math.round(cy / TILE) - 1];
    const [bx, by] = along === "y" ? [ax + 1, ay] : [ax, ay + 1];
    const ia = this.inside(m, ax, ay, z),
      ib = this.inside(m, bx, by, z);
    const side = ib || !ia ? 1 : -1;
    const [nx, nz] = along === "y" ? [1, 0] : [0, 1];
    return { rot: facing(-side * nx, -side * nz), inside: ia || ib };
  }

  /** A piece of furniture over its footprint: the model, or (before the kit is in) a box. */
  furniture(f: Furniture, floorY: number, kit: PropBatch | null, to: (k: MaterialKey) => Box[]) {
    const cx = (f.x + f.w / 2) * TILE,
      cz = (f.y + f.h / 2) * TILE;
    const parts = f.kind === "tv" ? ([["tv_stand", 0, 0, 0, 0]] as const) : pieceParts(f.kind);
    if (kit && parts.every(([name]) => hasModel(name))) {
      // A piece on a wall stands on the edge behind its footprint, its front away from the wall.
      const back = furnitureAnchor(f.kind) === "back" ? (furnitureSize(f.kind)[1] * TILE) / 2 : 0;
      const at = place(cx - f.dx * back, floorY, cz - f.dy * back, facing(f.dx, f.dy));
      for (const [name, x, y, z, turn] of parts)
        kit.add(name, x || y || z || turn ? at.clone().multiply(place(x, y, z, turn)) : at);
      return;
    }
    // Until its model is in: a box the size of the cover it gives (dressing: nothing).
    const cover = furnitureCover(f.kind),
      skin = furnitureSkin(f.kind);
    if (cover === "none") return;
    const h = cover === "high" ? (HIGH_PROP[skin]?.h ?? HIGH.h) : lowProp(skin).h;
    to(surfaceFor(skin, "prop")).push({
      x: cx,
      y: floorY + h / 2,
      z: cz,
      sx: f.w * TILE * 0.9,
      sy: h,
      sz: f.h * TILE * 0.9,
      c: PALETTE[skin],
    });
  }

  /** The ways off a tile someone could stand: onto bare floor (or stairs) with nothing on the edge between. In a per-tile order. */
  openSides(m: BattleMap, x: number, y: number, z: number): { x: number; y: number }[] {
    const dirs = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const;
    const k = hash(x, y, z) % 4,
      out: { x: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = dirs[(k + i) % 4]!;
      const t = tileAt(m, x + dx, y + dy, z);
      if ((t === T.FLOOR || t === T.STAIRS) && edgeOpen(m, x, y, z, dx, dy))
        out.push({ x: dx, y: dy });
    }
    return out;
  }

  /** The way a prop faces: onto open floor, its back to a wall where it can (else south). */
  openSide(m: BattleMap, x: number, y: number, z: number): { x: number; y: number } {
    const open = this.openSides(m, x, y, z);
    const backed = open.find((d) => !open.some((o) => o.x === -d.x && o.y === -d.y));
    return backed ?? open[0] ?? { x: 0, y: 1 };
  }

  /**
   * A low prop drawn as a model in place of its box: crates, bins (a
   * dumpster), park benches, tables (a desk with a computer and a chair on
   * office floors, a table and two chairs elsewhere). False: draw the box.
   */
  tileProp(
    kit: PropBatch,
    m: BattleMap,
    skin: Skin,
    x: number,
    y: number,
    z: number,
    floorY: number,
  ): boolean {
    const cx = wc(x),
      cz = wc(y),
      h = hash(x, y, z);
    const open = () => this.openSide(m, x, y, z);
    switch (skin) {
      case "crate":
        // Squared to the grid, give or take a few degrees.
        kit.add(
          "crate",
          place(cx, floorY, cz, ((h % 4) * Math.PI) / 2 + (((h >> 4) % 7) - 3) * 0.04, 1.06),
        );
        return true;
      case "bin": {
        const d = open();
        kit.add("dumpster", place(cx, floorY, cz, facing(d.x, d.y), 0.86));
        return true;
      }
      case "bench": {
        if (indoors(m, { x, y, z })) return false; // pews
        const d = open();
        kit.add("bench", place(cx, floorY, cz, facing(d.x, d.y)));
        return true;
      }
      case "table": {
        // Faced onto open floor, its back to a wall if it has one: chairs only where someone could get to them.
        const open = this.openSides(m, x, y, z);
        const d = this.openSide(m, x, y, z),
          at = place(cx, floorY, cz, facing(d.x, d.y));
        const backOpen = open.some((o) => o.x === -d.x && o.y === -d.y);
        const jitter = (((h >> 6) % 9) - 4) * 0.06;
        if (["tile", "concrete"].includes(this.floorSkin(m, x, y, z))) {
          kit.add("desk", at);
          kit.add("desk_computer", at.clone().multiply(place(-0.2, 0.75, 0.05, 0)));
          if (open.length)
            kit.add(
              "office_chair",
              at.clone().multiply(place(-0.15, 0, 0.45, Math.PI + jitter * 2)),
            );
        } else {
          kit.add("table", at);
          if (!open.length) return true;
          if (backOpen) {
            kit.add("chair", at.clone().multiply(place(-0.3, 0, 0.45, Math.PI + jitter)));
            kit.add("chair", at.clone().multiply(place(0.3, 0, -0.45, -jitter)));
          } else
            for (const sx of [-0.33, 0.33])
              kit.add(
                "chair",
                at.clone().multiply(place(sx, 0, 0.45, Math.PI + jitter * (sx < 0 ? 1 : -1))),
              );
        }
        return true;
      }
    }
    return false;
  }

  /**
   * A level's dressing, which the rules don't see: outside walls in brick,
   * plaster or stone get a plinth at the foot, a band course at each floor,
   * a cornice at the top, with corner pieces, quoins on brick corners and
   * now and then a downpipe or an air-conditioning unit; town roads get
   * manholes and drains.
   */
  dressLevel(m: BattleMap, z: number, base: number, kit: PropBatch) {
    if (m.setting === "lair" || m.setting === "montsegur") return;
    const H = LEVEL_H;
    const styled = (k: Skin) =>
      k === "brick" || k === "plaster" || k === "clinic" || k === "stone" || k === "none";
    /** An outside wall's edge: its trim, or null. `ew`: a west edge (along z) at grid x; else a north edge at grid y. */
    const edge = (ew: boolean, gx: number, gy: number) => {
      if (
        ew ? gx < 0 || gx > m.w || gy < 0 || gy >= m.h : gx < 0 || gx >= m.w || gy < 0 || gy > m.h
      )
        return null;
      const at = (lz: number) =>
        ew ? (lz * m.h + gy) * (m.w + 1) + gx : (lz * (m.h + 1) + gy) * m.w + gx;
      const shown = ew ? this.view.shownEw : this.view.shownNs;
      const kind = shown[at(z)]!;
      const skin = SKINS[(ew ? m.ewSkin : m.nsSkin)[at(z)]!]!;
      if (kind === E.NONE || kind === E.GLASS || !styled(skin)) return null;
      const [ax, ay, bx, by] = ew ? [gx - 1, gy, gx, gy] : [gx, gy - 1, gx, gy];
      const ia = this.inside(m, ax, ay, z),
        ib = this.inside(m, bx, by, z);
      if (ia === ib) return null;
      const above = z + 1 < m.levels ? shown[at(z + 1)]! : E.NONE;
      const [rx, ry] = ia ? [ax, ay] : [bx, by];
      // Over the room: a roof (cap its slab) or open sky (cap the wall).
      const roofed = z + 1 < m.levels && tileAt(m, rx, ry, z + 1) !== T.VOID;
      const out = ia ? 1 : -1; // toward the street along the edge's normal
      return {
        skin,
        kind,
        rot: ew ? facing(out, 0) : facing(0, out),
        x: ew ? gx * TILE : wc(gx),
        z: ew ? wc(gy) : gy * TILE,
        plinth: z === m.ground && kind !== E.DOOR && kind !== E.SHUT,
        band: above !== E.NONE && above !== E.GLASS,
        cornice: above === E.NONE,
        corniceY: base + H + (roofed ? SLAB : 0),
      };
    };
    type Trim = NonNullable<ReturnType<typeof edge>>;
    const dress = (t: Trim) => {
      if (t.plinth) kit.add("plinth", place(t.x, base + SLAB, t.z, t.rot));
      if (t.band) kit.add("band_course", place(t.x, base + SLAB / 2, t.z, t.rot));
      if (t.cornice) kit.add("cornice", place(t.x, t.corniceY, t.z, t.rot));
      // An air-conditioner on one plain wall in a dozen, above the street.
      if (
        t.kind === E.WALL &&
        t.skin !== "stone" &&
        z > m.ground - 1 &&
        hash(Math.round(t.x * 2), Math.round(t.z * 2), z + 7) % 12 === 0
      )
        kit.add("ac_unit", place(t.x, base + SLAB, t.z, t.rot));
    };
    for (let gy = 0; gy < m.h; gy++)
      for (let gx = 0; gx <= m.w; gx++) {
        const t = edge(true, gx, gy);
        if (t) dress(t);
      }
    for (let gy = 0; gy <= m.h; gy++)
      for (let gx = 0; gx < m.w; gx++) {
        const t = edge(false, gx, gy);
        if (t) dress(t);
      }
    // Outside corners: the one tile of four round a grid point that's in the building.
    for (let vy = 0; vy <= m.h; vy++)
      for (let vx = 0; vx <= m.w; vx++) {
        const rooms = [
          [vx - 1, vy - 1],
          [vx, vy - 1],
          [vx - 1, vy],
          [vx, vy],
        ].filter(([x, y]) => this.inside(m, x!, y!, z));
        if (rooms.length !== 1) continue;
        const [tx, ty] = rooms[0]! as [number, number];
        const a = edge(true, vx, ty),
          b = edge(false, tx, vy);
        if (!a || !b) continue;
        const bx = tx === vx ? 1 : -1,
          bz = ty === vy ? 1 : -1;
        const x = vx * TILE,
          zz = vy * TILE,
          rot = cornerTurn(bx, bz);
        if (a.plinth && b.plinth) kit.add("plinth_corner", place(x, base + SLAB, zz, rot));
        if (a.band && b.band) kit.add("band_corner", place(x, base + SLAB / 2, zz, rot));
        if (a.cornice && b.cornice)
          kit.add("cornice_corner", place(x, Math.max(a.corniceY, b.corniceY), zz, rot));
        if (a.skin === "brick" && b.skin === "brick") kit.add("quoins", place(x, base, zz, rot));
        // A downpipe down one corner in three, a little way along one of its walls.
        const hv = hash(vx, vy, 11);
        if (hv % 3 === 0 && a.skin !== "stone") {
          if (hv & 8) kit.add("downpipe", place(x, base, zz + bz * 0.3, a.rot));
          else kit.add("downpipe", place(x + bx * 0.3, base, zz, b.rot));
        }
      }
    // Town roads: a manhole now and then, a drain by the kerb.
    if (z !== m.ground || !this.view.kerb) return;
    const road = roadTop(base);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        if (
          !this.view.kerb.low[y * m.w + x] ||
          this.view.kerb.cut[y * m.w + x] ||
          this.view.vehicleTile.has(y * m.w + x)
        )
          continue;
        if (this.floorSkin(m, x, y, z) !== "road") continue;
        const h = hash(x, y, 5);
        if (h % 41 === 0) {
          kit.add("manhole", place(wc(x), road, wc(y), (h >> 8) % 6));
          continue;
        }
        if (h % 7 !== 0) continue;
        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ] as const) {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || this.view.kerb.low[ny * m.w + nx])
            continue;
          // Against the kerb, its long side along it.
          kit.add(
            "drain_grate",
            place(
              wc(x) + dx * (TILE / 2 - 0.3),
              road,
              wc(y) + dy * (TILE / 2 - 0.3),
              facing(dx, dy),
            ),
          );
          break;
        }
      }
  }

  instanced(boxes: Box[], mat: THREE.Material, colours: boolean) {
    const mesh = new THREE.InstancedMesh(this.view.boxGeo, mat, Math.max(1, boxes.length));
    mesh.count = boxes.length;
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    const q = new THREE.Quaternion(),
      e = new THREE.Euler(),
      p = new THREE.Vector3(),
      sc = new THREE.Vector3();
    boxes.forEach((b, i) => {
      if (b.rx || b.rz)
        mtx.compose(
          p.set(b.x, b.y, b.z),
          q.setFromEuler(e.set(b.rx ?? 0, 0, b.rz ?? 0)),
          sc.set(b.sx, b.sy, b.sz),
        );
      else mtx.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, mtx);
      if (colours) mesh.setColorAt(i, col.setHex(b.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = colours;
    mesh.receiveShadow = colours;
    return mesh;
  }

  /** What a tile's floor is made of (a prop's: borrowed from a neighbour). */
  floorSkin(m: BattleMap, x: number, y: number, z: number): Skin {
    if (z === m.ground) {
      const v = this.view.vehicleTile.get(y * m.w + x);
      if (v) return v.under;
      if (this.view.kerb?.cut[y * m.w + x]) return "road";
    }
    const t = tileAt(m, x, y, z);
    return t === T.FLOOR || t === T.DOOR || t === T.STAIRS
      ? skinAt(m, x, y, z)
      : this.floorUnder(m, x, y, z);
  }

  /** A street-level prop with only tarmac or road to walk beside it stands on that, else null (it keeps its own floor). */
  lotUnder(m: BattleMap, x: number, y: number): Skin | null {
    const t = tileAt(m, x, y, m.ground);
    if (t !== T.LOW && t !== T.HIGH) return null;
    let found: Skin | null = null;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n = tileAt(m, x + dx, y + dy, m.ground);
      if (n !== T.FLOOR && n !== T.DOOR) continue;
      const k = skinAt(m, x + dx, y + dy, m.ground);
      if (k !== "tarmac" && k !== "road") return null;
      found ??= k;
    }
    return found;
  }

  floorUnder(m: BattleMap, x: number, y: number, z: number): Skin {
    // A prop's floor: borrow a walkable neighbour's.
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const t = tileAt(m, x + dx, y + dy, z);
      if (t === T.FLOOR || t === T.DOOR) return skinAt(m, x + dx, y + dy, z);
    }
    if (indoors(m, { x, y, z })) return "indoor"; // hemmed in by furniture
    return m.setting === "urban" ? "pavement" : "grass";
  }

  wallNear(m: BattleMap, x: number, y: number, z: number): Skin {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      if (tileAt(m, x + dx, y + dy, z) === T.WALL) return skinAt(m, x + dx, y + dy, z);
    return "brick";
  }

  stairDir(m: BattleMap, x: number, y: number, z: number) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const up = tileAt(m, x + dx, y + dy, z + 1);
      const here = tileAt(m, x - dx, y - dy, z);
      if ((up === T.FLOOR || up === T.STAIRS) && (here === T.FLOOR || here === T.DOOR))
        return { x: dx, y: dy };
    }
    return { x: 1, y: 0 };
  }

  dispose() {
    this.clearWorld();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    this.glassMat.dispose();
  }
}

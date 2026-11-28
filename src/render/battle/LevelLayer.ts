// The map's static geometry: floors, walls and their edges, furniture and props, signs, stairs. Rebuilt when the map or the level shown changes; walls in front of the camera are cut away.
import * as THREE from "three";
import {
  DECOR_AT,
  doorBroken,
  doorUnit,
  E,
  edgeAt,
  underAt,
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
  WALL_T,
  wc,
  WINDOW_LINTEL,
} from "./scale";
import { cornerGeometry, roadTop, runBox } from "./kerbs";
import { vehicleBoxes, vehicleModel, vehiclePaint } from "./vehicles";
import { cornerTurn, facing, hasModel, place, PropBatch, propsReady } from "./props";
import { pieceParts } from "../../tactical/map/pieces";
import { PALETTE, SKIN_INDEX, KERB_STONE } from "./palette";
import { highProp, flight } from "./fittings";
import { FoliageBatch } from "./trees";
import { plainDoor, rollerDoor, slidingDoor, type DoorFrame } from "./doors";
import { BattleView, type Edge } from "./BattleView";

/** Bark, and a winter hedge's dead leaves. */
const BARK_COLOUR = 0x4a3626;
const DRY_LEAVES = 0x6a5840;
/** A deterministic scramble of a tile's coordinates, for choosing among looks. */
const hash = (a: number, b: number, c: number) =>
  (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;

/**
 * How far a tree's crown on (x, y, z) may spread (metres from the trunk):
 * short of anything built in the two storeys above within three tiles (an
 * upper floor, a roof, a canopy) and of the map's edge.
 */
function crownReach(m: BattleMap, x: number, y: number, z: number): number {
  const R = 3;
  let d = Math.min(x + 0.5, m.w - x - 0.5, y + 0.5, m.h - y - 0.5);
  const built = (tx: number, ty: number) =>
    tileAt(m, tx, ty, z + 1) !== T.VOID ||
    tileAt(m, tx, ty, z + 2) !== T.VOID ||
    (m.canopies ?? []).some(
      (c) => c.z === z && tx >= c.x0 && tx <= c.x1 && ty >= c.y0 && ty <= c.y1,
    );
  for (let ty = y - R; ty <= y + R; ty++)
    for (let tx = x - R; tx <= x + R; tx++) {
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || !built(tx, ty)) continue;
      // To the nearest point of that tile's square.
      const gx = Math.max(0, Math.abs(tx - x) - 0.5),
        gy = Math.max(0, Math.abs(ty - y) - 0.5);
      d = Math.min(d, Math.hypot(gx, gy));
    }
  return d * TILE - 0.3;
}

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

/** Boxes collected for one rebuild, by material: each list becomes one instanced mesh. */
class BoxSet {
  readonly buckets = new Map<MaterialKey, Box[]>();
  readonly glass: Box[] = [];
  to = (key: MaterialKey) => this.buckets.get(key) ?? this.buckets.set(key, []).get(key)!;
  floor = (skin: Skin) => this.to(surfaceFor(skin, "floor"));
  wall = (skin: Skin) => this.to(surfaceFor(skin, "wall"));
  prop = (skin: Skin) => this.to(surfaceFor(skin, "prop"));
}

/** One level being drawn. */
interface Level {
  m: BattleMap;
  z: number;
  /** The level's floor height. */
  base: number;
  kit: PropBatch | null;
  boxes: BoxSet;
  /** Trees and bushes (render/battle/trees.ts). */
  foliage: FoliageBatch;
}

type Along = "x" | "y";
/** One edge on a grid line: its kind (E), its skin, and its centre. */
interface GridEdge {
  kind: number;
  skin: Skin;
  at: [number, number];
}
/** How high a full wall stands: just under the next floor's slab. */
const WALL_TOP = LEVEL_H - SLAB;
const wallColour = (skin: Skin) => PALETTE[skin === "none" ? "plaster" : skin];

/** A box on a grid line: centred at (cx, cy), `len` metres along it, from `y0` to `y0 + h` above the floor. */
function edgeBox(
  { base }: Level,
  into: Box[],
  cx: number,
  cy: number,
  along: Along,
  len: number,
  y0: number,
  h: number,
  c: number,
  thin = WALL_T,
) {
  into.push({
    x: cx,
    y: base + SLAB + y0 + h / 2,
    z: cy,
    sx: along === "x" ? len : thin,
    sy: h,
    sz: along === "y" ? len : thin,
    c,
  });
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

  /** Draws the map again, every level up to the one shown. */
  rebuild() {
    const m = this.view.map;
    if (!m) return;
    this.view.atmosphere.shadowsMoved();
    this.clearWorld();
    const boxes = new BoxSet();
    // The prop kit's models (render/battle/props.ts), once it has loaded.
    const kit = propsReady() ? new PropBatch() : null;
    const foliage = new FoliageBatch();
    for (let z = 0; z <= this.view.level; z++) {
      const lv: Level = { m, z, base: z * LEVEL_H, kit, boxes, foliage };
      const { floor, wide } = this.tiles(lv);
      this.floorSlabs(lv, floor);
      this.kerbs(lv);
      this.vehicles(lv);
      for (const f of m.furniture ?? [])
        if (f.z === z) this.furniture(f, this.standY(lv, f.x, f.y), kit, boxes.to);
      for (const f of m.flights ?? []) if (f.z === z) flight(f, lv.base + SLAB, boxes.prop);
      this.decor(lv);
      this.canopies(lv);
      for (const sg of m.signs ?? []) if (sg.z === z) this.world.add(this.signMesh(sg, lv.base));
      this.wideProps(lv, wide);
      // Walls stand their full storey on every level shown, the one looked at too (XCOM): the levels above are cut away.
      this.edgeBoxes(lv);
      if (kit) this.dressLevel(m, z, lv.base, kit);
    }
    for (const [key, list] of boxes.buckets)
      this.world.add(this.instanced(list, this.mat(key), true));
    const kitMeshes = kit?.meshes() ?? [];
    if (kitMeshes.length) this.world.add(...kitMeshes); // (add() with nothing complains)
    const plants = foliage.meshes((k) => this.mat(k));
    if (plants.length) this.world.add(...plants);
    this.world.add(this.instanced(boxes.glass, this.glassMat, false));
  }

  /** What a prop stands on: the floor, or the road's height in a car park or on the road. */
  standY({ m, z, base }: Level, x: number, y: number): number {
    return z === m.ground && this.view.kerb?.low[y * m.w + x] ? roadTop(base) : base + SLAB;
  }

  /**
   * Tile by tile: walls, windows, door lintels, props and stairs go straight
   * into boxes; floors and tile-wide props (fences, parapets) are only noted,
   * to be merged into big boxes after.
   */
  tiles(lv: Level): { floor: Int32Array; wide: Int32Array } {
    const { m, z } = lv;
    // Each tile's floor colour (−1: no slab), and its tile-wide prop.
    const floor = new Int32Array(m.w * m.h).fill(-1);
    const wide = new Int32Array(m.w * m.h).fill(-1);
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        const t = tileAt(m, x, y, z);
        if (t === T.VOID) continue;
        const i = y * m.w + x;
        // The floor slab (none over a stairwell, so the stairs come up through it).
        // (A lot's corner rounded with the kerb: drawn by the corner's pieces instead.)
        const lotCut = z === m.ground && this.view.kerb?.lotCut[i];
        if (tileAt(m, x, y, z - 1) !== T.STAIRS && !lotCut)
          floor[i] = SKIN_INDEX[this.floorSkin(m, x, y, z)];
        const skin = skinAt(m, x, y, z);
        const furnished = this.view.furnitureTile.has((z * m.h + y) * m.w + x);
        if (t === T.WALL) this.wallTile(lv, x, y, skin);
        else if (t === T.WINDOW) this.windowTile(lv, x, y);
        else if (t === T.DOOR) this.doorLintel(lv, x, y);
        else if (t === T.LOW && skin !== "car" && !furnished) {
          // Vehicles and furniture are drawn whole, elsewhere.
          if (this.lowTile(lv, x, y, skin)) wide[i] = SKIN_INDEX[skin];
        } else if (t === T.HIGH && skin !== "truck" && !furnished) this.highTile(lv, x, y, skin);
        else if (t === T.STAIRS) this.stairs(lv, x, y);
      }
    return { floor, wide };
  }

  /** A full wall stops just under the next floor's slab (no z-fighting with the roof). */
  wallTile({ base, boxes }: Level, x: number, y: number, skin: Skin) {
    const h = LEVEL_H - SLAB;
    boxes.wall(skin).push({
      x: wc(x),
      y: base + SLAB + h / 2,
      z: wc(y),
      sx: TILE,
      sy: h,
      sz: TILE,
      c: PALETTE[skin],
    });
  }

  /** A window tile: a sill, a lintel, and the glass between. */
  windowTile(lv: Level, x: number, y: number) {
    const { m, z, base, boxes } = lv;
    const near = this.wallNear(m, x, y, z);
    const c = PALETTE[near];
    const cx = wc(x),
      cy = wc(y);
    boxes
      .wall(near)
      .push({ x: cx, y: base + SLAB + SILL / 2, z: cy, sx: TILE, sy: SILL, sz: TILE, c });
    boxes.wall(near).push({
      x: cx,
      y: base + LEVEL_H - WINDOW_LINTEL / 2,
      z: cy,
      sx: TILE,
      sy: WINDOW_LINTEL,
      sz: TILE,
      c,
    });
    const glassH = LEVEL_H - SLAB - SILL - WINDOW_LINTEL;
    boxes.glass.push({
      x: cx,
      y: base + SLAB + SILL + glassH / 2,
      z: cy,
      sx: TILE - 0.03,
      sy: glassH,
      sz: TILE - 0.03,
      c: 0,
    });
  }

  /** Over a door: the lintel, in the wall's skin. */
  doorLintel({ m, z, base, boxes }: Level, x: number, y: number) {
    const near = this.wallNear(m, x, y, z);
    boxes.wall(near).push({
      x: wc(x),
      y: base + LEVEL_H - DOOR_LINTEL / 2,
      z: wc(y),
      sx: TILE,
      sy: DOOR_LINTEL,
      sz: TILE,
      c: PALETTE[near],
    });
  }

  /** A low prop on a tile. Returns true for a tile-wide one (a fence), to be merged with its neighbours. */
  lowTile(lv: Level, x: number, y: number, skin: Skin): boolean {
    const { m, z, kit, boxes } = lv;
    const top = this.standY(lv, x, y);
    if (kit && this.tileProp(kit, m, skin, x, y, z, top)) return false;
    const cx = wc(x),
      cy = wc(y);
    if (skin === "bed") {
      // A metal frame, a white mattress, a blanket over the foot half.
      boxes.to("streetMetal").push({
        x: cx,
        y: top + 0.2,
        z: cy,
        sx: 0.9 * TILE,
        sy: 0.4,
        sz: 0.85 * TILE,
        c: 0x8a9098,
      });
      boxes.to("plain").push({
        x: cx,
        y: top + 0.48,
        z: cy,
        sx: 0.86 * TILE,
        sy: 0.16,
        sz: 0.8 * TILE,
        c: 0xeef0f2,
      });
      boxes.to("plain").push({
        x: cx + 0.2 * TILE,
        y: top + 0.5,
        z: cy,
        sx: 0.48 * TILE,
        sy: 0.17,
        sz: 0.82 * TILE,
        c: 0x5a7aa8,
      });
      return false;
    }
    const { h, s } = lowProp(skin);
    if (s >= TILE) return true;
    boxes.prop(skin).push({ x: cx, y: top + h / 2, z: cy, sx: s, sy: h, sz: s, c: PALETTE[skin] });
    return false;
  }

  /** A high prop on a tile: a tree, a bush, shop fittings, or a plain block. */
  highTile(lv: Level, x: number, y: number, skin: Skin) {
    const { m, z, boxes, foliage } = lv;
    const top = this.standY(lv, x, y);
    const cx = wc(x),
      cy = wc(y);
    const winter = !!m.winter;
    if (skin === "tree")
      foliage.tree(
        cx,
        top,
        cy,
        {
          seed: hash(x, y, z),
          winter,
          // The crown is the storey above (XCOM): shown with it.
          crown: this.view.level > z,
          reach: crownReach(m, x, y, z),
          cut: LEVEL_H - SLAB,
        },
        PALETTE.tree,
        BARK_COLOUR,
      );
    else if (skin === "hedge")
      foliage.bush(cx, top, cy, hash(x, y, z + 7), winter, PALETTE.hedge, DRY_LEAVES, BARK_COLOUR);
    else if (HIGH_PROP[skin]) highProp(skin, cx, cy, top, boxes.prop, boxes.to);
    else
      boxes.prop(skin).push({
        x: cx,
        y: top + HIGH.h / 2,
        z: cy,
        sx: HIGH.s,
        sy: HIGH.h,
        sz: HIGH.s,
        c: PALETTE[skin],
      });
  }

  /** Four steps climbing toward whichever way leads to open floor above. */
  stairs({ m, z, base, boxes }: Level, x: number, y: number) {
    const dir = this.stairDir(m, x, y, z);
    for (let i = 0; i < 4; i++) {
      const h = ((i + 1) / 4) * LEVEL_H;
      const off = (-0.375 + i * 0.25) * TILE;
      boxes.prop("wood").push({
        x: wc(x) + dir.x * off,
        y: base + SLAB + h / 2,
        z: wc(y) + dir.y * off,
        sx: (dir.x ? 0.25 : 0.9) * TILE,
        sy: h,
        sz: (dir.y ? 0.25 : 0.9) * TILE,
        c: PALETTE.wood,
      });
    }
  }

  /** The floor slabs, merged into as few boxes as it takes. Town roads and car parks sit a kerb's height down. */
  floorSlabs({ m, z, base, boxes }: Level, floor: Int32Array) {
    this.merge(m, floor, (x0, y0, w, h, k) => {
      const skin = SKINS[k]!;
      const sunk = z === m.ground && (skin === "road" || skin === "tarmac") && isTown(m.setting);
      boxes.floor(skin).push({
        x: (x0 + w / 2) * TILE,
        y: base + SLAB / 2 - (sunk ? KERB : 0),
        z: (y0 + h / 2) * TILE,
        sx: w * TILE,
        sy: SLAB,
        sz: h * TILE,
        c: PALETTE[skin],
      });
    });
  }

  /** The town's kerbs on the ground level: straight runs, and rounded corners. */
  kerbs({ m, z, base, boxes }: Level) {
    const kerb = this.view.kerb;
    if (z !== m.ground || !kerb) return;
    for (const k of kerb.runs) boxes.to("coping").push({ ...runBox(k, base), c: KERB_STONE });
    for (const c of kerb.corners) {
      const g = cornerGeometry(c, base);
      this.world.add(
        this.solid(g.pavement, "pavement", PALETTE.pavement),
        this.solid(g.kerb, "coping", KERB_STONE),
      );
      if (g.lot && c.lot)
        this.world.add(this.solid(g.lot, surfaceFor(c.lot, "floor"), PALETTE[c.lot]));
    }
  }

  /** Vehicles: the model (its front along its length, the way it faces), or until that's in, boxes. */
  vehicles(lv: Level) {
    const { m, z, kit, boxes } = lv;
    for (const v of m.vehicles ?? []) {
      if (v.z !== z) continue;
      const floorY = this.standY(lv, v.x, v.y);
      const model = vehicleModel(v);
      if (!kit || !model || !hasModel(model)) {
        for (const b of vehicleBoxes(v, floorY)) boxes.to(b.key).push(b);
        continue;
      }
      const along = v.w > v.h;
      const at = place(
        (v.x + v.w / 2) * TILE,
        floorY,
        (v.y + v.h / 2) * TILE,
        facing(along ? v.front : 0, along ? 0 : v.front),
      );
      kit.add(model, at, v.wrecked ? undefined : vehiclePaint(v));
    }
  }

  /** Street dressing: on a corner (a sign, a bollard) or a tile (a manhole), on the floor there. */
  decor({ m, z, base, kit }: Level) {
    if (!kit) return;
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
  }

  /** Forecourt canopies: a white roof with a red band on four posts, shown with the level above (a roof, like the rest). */
  canopies({ m, z, boxes }: Level) {
    for (const c of m.canopies ?? []) {
      if (c.z !== z - 1) continue;
      const cb = c.z * LEVEL_H + SLAB,
        x0 = c.x0 * TILE,
        x1 = (c.x1 + 1) * TILE,
        z0 = c.y0 * TILE,
        z1 = (c.y1 + 1) * TILE;
      const mid = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
      boxes
        .to("plain")
        .push({ ...mid, y: cb + c.h + 0.25, sx: x1 - x0, sy: 0.5, sz: z1 - z0, c: 0xe8e8e4 });
      boxes.to("plain").push({
        ...mid,
        y: cb + c.h + 0.32,
        sx: x1 - x0 + 0.04,
        sy: 0.22,
        sz: z1 - z0 + 0.04,
        c: 0xc83a2c,
      });
      for (const px of [x0 + 0.5, x1 - 0.5])
        for (const pz of [z0 + 0.5, z1 - 0.5])
          boxes
            .to("streetMetal")
            .push({ x: px, y: cb + c.h / 2, z: pz, sx: 0.3, sy: c.h, sz: 0.3, c: 0xd8d8d4 });
    }
  }

  /** Tile-wide props (fences, parapets), merged into long boxes. */
  wideProps({ m, base, boxes }: Level, wide: Int32Array) {
    this.merge(m, wide, (x0, y0, w, h, k) => {
      const skin = SKINS[k]!;
      const ph = lowProp(skin).h;
      boxes.prop(skin).push({
        x: (x0 + w / 2) * TILE,
        y: base + SLAB + ph / 2,
        z: (y0 + h / 2) * TILE,
        sx: w * TILE,
        sy: ph,
        sz: h * TILE,
        c: PALETTE[skin],
      });
    });
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
  edgeBoxes(lv: Level) {
    const { m, z } = lv;
    // West edges, down each grid line x (between tile x − 1 and x).
    for (let x = 0; x <= m.w; x++) {
      const i = (y: number) => (z * m.h + y) * (m.w + 1) + x;
      this.gridLine(lv, m.h, "y", (y) => ({
        kind: this.view.shownEw[i(y)]!,
        skin: SKINS[m.ewSkin[i(y)]!]!,
        at: [x * TILE, wc(y)],
      }));
    }
    // North edges, along each grid line y (between tile y − 1 and y).
    for (let y = 0; y <= m.h; y++) {
      const i = (x: number) => (z * (m.h + 1) + y) * m.w + x;
      this.gridLine(lv, m.w, "x", (x) => ({
        kind: this.view.shownNs[i(x)]!,
        skin: SKINS[m.nsSkin[i(x)]!]!,
        at: [wc(x), y * TILE],
      }));
    }
  }

  /**
   * One grid line: plain walls in runs of one skin become one box each;
   * openings are drawn tile by tile. A run's end reaches half a wall's
   * thickness on, to close a corner, unless more wall (another skin) carries
   * on along the line: there the two meet flush. Runs along x reach a hair
   * further than runs along y, so at a corner no two faces lie in one plane
   * (they'd flicker, each drawn over the other in turn).
   */
  gridLine(lv: Level, n: number, along: Along, edge: (k: number) => GridEdge) {
    const reach = WALL_T / 2 + (along === "x" ? 0.002 : -0.002);
    for (let k = 0; k < n;) {
      const e = edge(k);
      if (e.kind !== E.WALL) {
        if (e.kind !== E.NONE) this.opening(lv, e, along);
        k++;
        continue;
      }
      let j = k + 1;
      while (j < n && edge(j).kind === E.WALL && edge(j).skin === e.skin) j++;
      const [ax, ay] = e.at,
        [bx, by] = edge(j - 1).at;
      const s0 = k > 0 && edge(k - 1).kind === E.WALL ? 0 : reach,
        s1 = j < n && edge(j).kind === E.WALL ? 0 : reach;
      const shift = (s1 - s0) / 2;
      edgeBox(
        lv,
        lv.boxes.wall(e.skin),
        (ax + bx) / 2 + (along === "x" ? shift : 0),
        (ay + by) / 2 + (along === "y" ? shift : 0),
        along,
        (j - k) * TILE + s0 + s1,
        0,
        WALL_TOP,
        wallColour(e.skin),
      );
      k = j;
    }
  }

  /** A window, railing, glass wall or doorway: one tile long, flush with the walls either side. */
  opening(lv: Level, e: GridEdge, along: Along) {
    const { m, kit } = lv;
    const [cx, cy] = e.at;
    const framed = !!kit && m.setting !== "lair" && m.setting !== "montsegur";
    if (framed && (e.kind === E.SILL || e.kind === E.WINDOW)) this.windowFrame(lv, e, along);
    if (e.kind === E.SILL || e.kind === E.WINDOW) {
      // A broken window (SILL) keeps the sill and the wall over it; the glass is gone.
      const c = wallColour(e.skin),
        solid = lv.boxes.wall(e.skin);
      edgeBox(lv, solid, cx, cy, along, TILE, 0, SILL, c);
      edgeBox(lv, solid, cx, cy, along, TILE, WALL_TOP - WINDOW_LINTEL, WINDOW_LINTEL, c);
      if (e.kind === E.WINDOW) {
        const paneH = WALL_TOP - SILL - WINDOW_LINTEL;
        edgeBox(lv, lv.boxes.glass, cx, cy, along, TILE, SILL, paneH, 0, WALL_T * 0.4);
      }
    } else if (e.kind === E.RAIL) this.railing(lv, cx, cy, along);
    else if (e.kind === E.GLASS) this.glassWall(lv, cx, cy, along);
    else if (e.kind === E.DOOR || e.kind === E.SHUT) {
      const lintelAt = WALL_TOP - DOOR_LINTEL;
      edgeBox(
        lv,
        lv.boxes.wall(e.skin),
        cx,
        cy,
        along,
        TILE,
        lintelAt,
        DOOR_LINTEL,
        wallColour(e.skin),
      );
      // A building's door (not a bare gap in a lair).
      if (m.setting === "lair" || m.setting === "montsegur") return;
      this.door(lv, e, along);
    }
  }

  /** The window's frame (it stays when the glass goes), and blinds in some lived-in rooms. */
  windowFrame({ m, z, base, kit }: Level, e: GridEdge, along: Along) {
    const [cx, cy] = e.at;
    const { rot, inside } = this.edgeFront(m, cx, cy, along, z);
    const at = place(cx, base + SLAB, cy, rot);
    const modern = e.skin === "metal" || e.skin === "clinic" || m.setting === "industrial";
    kit!.add(modern ? "window_modern" : "window_casement", at);
    if (inside && hash(Math.round(cx * 2), Math.round(cy * 2), z) % 5 < 2)
      kit!.add("window_blinds", at);
  }

  /** A railing: a top rail at sill height, a mid rail, posts at each end. */
  railing(lv: Level, cx: number, cy: number, along: Along) {
    const metal = lv.boxes.wall("metal"),
      mc = PALETTE.metal;
    edgeBox(lv, metal, cx, cy, along, TILE, SILL - 0.05, 0.05, mc, 0.06);
    edgeBox(lv, metal, cx, cy, along, TILE, SILL / 2, 0.03, mc, 0.04);
    for (const end of [-1, 1]) {
      const px = along === "x" ? cx + end * (TILE / 2 - 0.03) : cx,
        py = along === "y" ? cy + end * (TILE / 2 - 0.03) : cy;
      edgeBox(lv, metal, px, py, along, 0.06, 0, SILL, mc, 0.06);
    }
  }

  /** Floor-to-ceiling glass: a metal rail top and bottom, the pane between. */
  glassWall(lv: Level, cx: number, cy: number, along: Along) {
    const frame = lv.boxes.wall("metal"),
      fc = PALETTE.metal,
      rail = 0.08;
    edgeBox(lv, frame, cx, cy, along, TILE, 0, rail, fc, WALL_T * 0.7);
    edgeBox(lv, frame, cx, cy, along, TILE, WALL_TOP - rail, rail, fc, WALL_T * 0.7);
    edgeBox(lv, lv.boxes.glass, cx, cy, along, TILE, rail, WALL_TOP - 2 * rail, 0, WALL_T * 0.3);
  }

  /**
   * A door (render/battle/doors.ts): plain, roller or sliding, by its style;
   * one two tiles wide is drawn with its first edge.
   */
  door(lv: Level, e: GridEdge, along: Along) {
    const { m, z, base, boxes } = lv;
    const [cx, cy] = e.at;
    // The edge, named from its west or north tile.
    const [tx, ty, dx, dy] =
      along === "y"
        ? [Math.round(cx / TILE) - 1, Math.floor(cy / TILE), 1, 0]
        : [Math.floor(cx / TILE), Math.round(cy / TILE) - 1, 0, 1];
    const u = doorUnit(m, tx, ty, z, dx, dy);
    if (u.x !== tx || u.y !== ty) return;
    const room =
      indoors(m, { x: tx + dx, y: ty + dy, z }) || !indoors(m, { x: tx, y: ty, z }) ? 1 : -1;
    const f: DoorFrame =
      along === "x"
        ? { x: tx * TILE, z: cy, y: base + SLAB, along: "x", room }
        : { x: cx, z: ty * TILE, y: base + SLAB, along: "y", room };
    const look = {
      width: u.w * TILE,
      height: WALL_TOP - DOOR_LINTEL,
      wallColour: wallColour(e.skin),
      open: e.kind === E.DOOR,
      broken: e.kind === E.DOOR && doorBroken(m, tx, ty, z, dx, dy),
      pick: hash(tx, ty, z) % 97,
    };
    if (u.style === "garage") rollerDoor(f, look, boxes.to);
    else if (u.style === "slide") slidingDoor(f, look, boxes.to, boxes.glass);
    else {
      const steel = e.skin === "metal" || e.skin === "clinic" || m.setting === "industrial";
      plainDoor(f, look, boxes.to, boxes.wall(e.skin), steel);
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
        // On concrete (an office, a workshop) a desk; on boards or a kitchen's tiles, a table and chairs.
        if (this.floorSkin(m, x, y, z) === "concrete") {
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
    // Below the street: no facade (a cellar's coping would show through the floor over it).
    if (z < m.ground) return;
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
      // A stairwell (the open air over a flight) is indoors: no facade on the wall beside it.
      const well = (x: number, y: number) =>
        z > 0 && tileAt(m, x, y, z) === T.VOID && tileAt(m, x, y, z - 1) === T.FLIGHT;
      const ia = this.inside(m, ax, ay, z) || well(ax, ay),
        ib = this.inside(m, bx, by, z) || well(bx, by);
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
      : (underAt(m, x, y, z) ?? this.floorUnder(m, x, y, z));
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
    // A prop's floor: borrow a walkable neighbour's in the same room (none across a wall:
    // a sofa against an outside wall isn't on the lawn).
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const t = tileAt(m, x + dx, y + dy, z);
      const e = edgeAt(m, x, y, z, dx, dy);
      if ((t === T.FLOOR || t === T.DOOR) && (e === E.NONE || e === E.RAIL))
        return skinAt(m, x + dx, y + dy, z);
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

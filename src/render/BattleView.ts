// The battlescape renderer (docs/WEB_PORT.md 3.11): crude on purpose. Every
// tile is drawn from boxes (one instanced mesh for everything solid, one for
// glass), units are boxes with a smaller box for the weapon. The camera
// orbits the map; levels above the one being looked at are cut away.
//
// Controls: right-drag rotates, middle-drag or WASD pans, wheel zooms, Q / E
// turn 45°, the hovered tile is outlined at the current level.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { skinAt, T, tileAt, type BattleMap, type Pt3, type Skin } from "../tactical/map";

/** World height of one level; a tile is 1 × 1. */
export const LEVEL_H = 1.5;
const SLAB = 0.08;

const PALETTE: Record<Skin, number> = {
  none: 0x777777, grass: 0x3d5a34, road: 0x34363b, pavement: 0x6b6a66, indoor: 0x7a6650, dirt: 0x6a5338,
  wood: 0x8a6a44, stone: 0x777a80, roof: 0x4c4642, brick: 0x8a4a3a, plaster: 0xb8ae98, car: 0x5a6f8a,
  crate: 0x9a7a4a, tree: 0x2f5a2a, hedge: 0x335f30, hay: 0xc9a55a, fence: 0x8a7550, bin: 0x3f4a40,
  table: 0x6a4a30, bench: 0x6a5036, planks: 0x7a5a3a, parapet: 0x6a625a, tarmac: 0x2c2d31,
};
const CAR_COLOURS = [0x5a6f8a, 0x8a2f2f, 0xc8c4b8, 0x2f3a46, 0x6a7a52, 0x9a8a5a];

export interface UnitSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  side: "agent" | "thrall" | "vampire" | "civilian";
  /** Radians; 0 faces +x. */
  facing?: number;
  selected?: boolean;
}

const SIDE_COLOURS: Record<UnitSpec["side"], number> = { agent: 0x8fb4e0, thrall: 0xc0784a, vampire: 0xc8243a, civilian: 0xc8c0a8 };

/** One box to draw: centre, size, colour. */
interface Box { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number }

export class BattleView {
  onHover?: (p: Pt3 | null) => void;
  onPick?: (p: Pt3) => void;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly world = new THREE.Group();
  private readonly unitGroup = new THREE.Group();
  private readonly hover: THREE.LineSegments;
  private readonly lz: THREE.Mesh;
  private readonly boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private readonly solidMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
  private readonly glassMat = new THREE.MeshStandardMaterial({ color: 0x9cc4e0, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false });
  private readonly moon: THREE.DirectionalLight;
  private map: BattleMap | null = null;
  private level = 0;
  private frame = 0;
  private keys = new Set<string>();
  private turn = 0;
  private hovered: Pt3 | null = null;
  private down: { x: number; y: number } | null = null;
  private last = performance.now();

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0c0e14);
    this.scene.fog = new THREE.Fog(0x0c0e14, 45, 110);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 70;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.2;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };

    // Night, but readable: a cool sky, a moon that casts shadows, warm bounce.
    this.scene.add(new THREE.HemisphereLight(0x9aa8c8, 0x3a3028, 1.5));
    const moon = (this.moon = new THREE.DirectionalLight(0xc8d4f0, 1.6));
    moon.position.set(-30, 50, 20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -40;
    moon.shadow.camera.right = 40;
    moon.shadow.camera.top = 40;
    moon.shadow.camera.bottom = -40;
    moon.shadow.bias = -0.0008;
    this.scene.add(moon, moon.target);
    this.scene.add(this.world, this.unitGroup);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.05, 1));
    this.hover = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xe8c987 }));
    this.hover.visible = false;
    this.scene.add(this.hover);
    this.lz = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x8fd39a, transparent: true, opacity: 0.22, depthWrite: false }));
    this.lz.rotation.x = -Math.PI / 2;
    this.scene.add(this.lz);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ----- Public API -----

  setMap(m: BattleMap) {
    this.map = m;
    this.level = m.levels - 1;
    this.rebuild();
    // Look at the landing zone from the south-west, at a comfortable height.
    const c = m.lz[4] ?? m.lz[0]!;
    // Between the landing zone and the middle of the map, far enough back to see most of it.
    const target = this.tileCentre(c.x, c.y, m.ground).lerp(this.tileCentre(m.w / 2, m.h / 2, m.ground), 0.4);
    this.controls.target.copy(target);
    const back = new THREE.Vector3(m.w / 2 - c.x, 0, m.h / 2 - c.y).normalize().multiplyScalar(-1);
    if (!Number.isFinite(back.x)) back.set(-1, 0, 1).normalize();
    this.camera.position.copy(target).add(back.multiplyScalar(m.w * 0.55)).add(new THREE.Vector3(0, m.w * 0.75, 0));
    this.moon.target.position.set(m.w / 2, 0, m.h / 2);
    this.moon.position.set(m.w / 2 - 30, 50, m.h / 2 + 20);
    this.lz.visible = true;
    this.lz.scale.set(3, 3, 1);
    this.lz.position.set(c.x + 0.5, m.ground * LEVEL_H + SLAB + 0.01, c.y + 0.5);
  }

  /** Show levels up to and including `z` (the cutaway). */
  setLevel(z: number) {
    if (!this.map) return;
    const next = Math.max(0, Math.min(this.map.levels - 1, z));
    if (next === this.level) return;
    this.level = next;
    this.rebuild();
    this.lz.visible = next >= this.map.ground;
    this.hover.visible = false;
    this.hovered = null;
  }

  getLevel() {
    return this.level;
  }

  setUnits(units: UnitSpec[]) {
    for (const c of [...this.unitGroup.children]) {
      this.unitGroup.remove(c);
      c.traverse((o) => o instanceof THREE.Mesh && (o.material as THREE.Material).dispose());
    }
    for (const u of units) {
      if (u.z > this.level) continue;
      const g = new THREE.Group();
      const colour = SIDE_COLOURS[u.side];
      const tall = u.side === "vampire" ? 1.05 : 0.95;
      const body = new THREE.Mesh(this.boxGeo, new THREE.MeshStandardMaterial({ color: colour, roughness: 0.6, emissive: colour, emissiveIntensity: u.side === "vampire" ? 0.25 : 0.08 }));
      body.scale.set(0.46, tall, 0.34);
      body.position.y = tall / 2;
      const head = new THREE.Mesh(this.boxGeo, body.material);
      head.scale.set(0.26, 0.26, 0.26);
      head.position.y = tall + 0.15;
      g.add(body, head);
      if (u.side !== "civilian") {
        // The weapon: a smaller box held out in front (claws for a vampire: two short ones).
        const gun = new THREE.MeshStandardMaterial({ color: u.side === "vampire" ? 0xe8e0d0 : 0x1c1c1e, roughness: 0.4, metalness: 0.4 });
        if (u.side === "vampire") {
          for (const side of [-1, 1]) {
            const claw = new THREE.Mesh(this.boxGeo, gun);
            claw.scale.set(0.24, 0.06, 0.06);
            claw.position.set(0.3, tall * 0.55, side * 0.2);
            g.add(claw);
          }
        } else {
          const w = new THREE.Mesh(this.boxGeo, gun);
          w.scale.set(u.side === "agent" ? 0.55 : 0.4, 0.08, 0.08);
          w.position.set(0.32, tall * 0.62, 0.2);
          g.add(w);
        }
      }
      if (u.selected) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xe8c987, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        g.add(ring);
      }
      g.traverse((o) => (o.castShadow = true));
      g.rotation.y = -(u.facing ?? 0);
      g.position.set(u.x + 0.5, u.z * LEVEL_H + SLAB, u.y + 0.5);
      this.unitGroup.add(g);
    }
  }

  /** Turn the camera 45° about its target (+1 clockwise). */
  turnCamera(dir: number) {
    this.turn += (dir * Math.PI) / 4;
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    this.controls.dispose();
    this.clearWorld();
    this.setUnits([]);
    this.boxGeo.dispose();
    this.solidMat.dispose();
    this.glassMat.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ----- Building the scene -----

  private tileCentre(x: number, y: number, z: number) {
    return new THREE.Vector3(x + 0.5, z * LEVEL_H, y + 0.5);
  }

  private clearWorld() {
    for (const c of [...this.world.children]) {
      this.world.remove(c);
      if (c instanceof THREE.InstancedMesh) c.dispose();
    }
  }

  private rebuild() {
    const m = this.map;
    if (!m) return;
    this.clearWorld();
    const solid: Box[] = [];
    const glass: Box[] = [];
    const H = LEVEL_H;
    let carIndex = 0;
    for (let z = 0; z <= this.level; z++) {
      const base = z * H;
      const top = z === this.level; // walls on the cut level are drawn short, to see in
      const wallH = top && z < m.levels - 1 && this.level < m.levels - 1 ? H * 0.55 : H;
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const t = tileAt(m, x, y, z);
          if (t === T.VOID) continue;
          const skin = skinAt(m, x, y, z);
          const cx = x + 0.5, cy = y + 0.5;
          const below = tileAt(m, x, y, z - 1);
          const floorSkin = t === T.FLOOR || t === T.DOOR || t === T.STAIRS ? skin : this.floorUnder(m, x, y, z);
          // The floor slab (none over a stairwell, so the stairs come up through it).
          if (below !== T.STAIRS) solid.push({ x: cx, y: base + SLAB / 2, z: cy, sx: 0.98, sy: SLAB, sz: 0.98, c: PALETTE[floorSkin] });
          switch (t) {
            case T.WALL:
              solid.push({ x: cx, y: base + SLAB + wallH / 2, z: cy, sx: 1, sy: wallH, sz: 1, c: PALETTE[skin] });
              break;
            case T.WINDOW: {
              const wall = PALETTE[this.wallNear(m, x, y, z)];
              const sill = 0.45;
              solid.push({ x: cx, y: base + SLAB + sill / 2, z: cy, sx: 1, sy: sill, sz: 1, c: wall });
              if (wallH === H) {
                const lintel = 0.2;
                solid.push({ x: cx, y: base + H - lintel / 2 + SLAB, z: cy, sx: 1, sy: lintel, sz: 1, c: wall });
                glass.push({ x: cx, y: base + SLAB + sill + (H - sill - lintel) / 2, z: cy, sx: 0.98, sy: H - sill - lintel, sz: 0.98, c: 0 });
              }
              break;
            }
            case T.DOOR:
              if (wallH === H) solid.push({ x: cx, y: base + H - 0.1 + SLAB, z: cy, sx: 1, sy: 0.2, sz: 1, c: PALETTE[this.wallNear(m, x, y, z)] });
              break;
            case T.LOW: {
              if (skin === "car") {
                // A car is two tiles: drawn once, from its first tile.
                const car = (dx: number, dy: number) => tileAt(m, x + dx, y + dy, z) === T.LOW && skinAt(m, x + dx, y + dy, z) === "car";
                if (car(0, -1) || (!car(0, 1) && car(-1, 0))) break;
                const along = car(0, 1) ? { x: 0, y: 1 } : car(1, 0) ? { x: 1, y: 0 } : { x: 0, y: 0 };
                const mx = cx + along.x / 2, my = cy + along.y / 2;
                const lx = 0.86 + along.x, ly = 0.86 + along.y;
                const c = CAR_COLOURS[(x * 7 + y * 13 + carIndex++) % CAR_COLOURS.length]!;
                solid.push({ x: mx, y: base + SLAB + 0.3, z: my, sx: lx, sy: 0.6, sz: ly, c });
                solid.push({ x: mx, y: base + SLAB + 0.78, z: my, sx: lx * (along.x ? 0.55 : 0.8), sy: 0.36, sz: ly * (along.y ? 0.55 : 0.8), c: 0x22262c });
                break;
              }
              const c = PALETTE[skin];
              const h = skin === "fence" ? 0.5 : skin === "parapet" ? 0.45 : skin === "bench" ? 0.35 : 0.5;
              const s = skin === "fence" || skin === "parapet" ? 1 : 0.8;
              solid.push({ x: cx, y: base + SLAB + h / 2, z: cy, sx: s, sy: h, sz: s, c });
              break;
            }
            case T.HIGH:
              if (skin === "tree") {
                solid.push({ x: cx, y: base + SLAB + 0.6, z: cy, sx: 0.22, sy: 1.2, sz: 0.22, c: 0x4a3626 });
                solid.push({ x: cx, y: base + SLAB + 1.7, z: cy, sx: 1.05, sy: 1.1, sz: 1.05, c: PALETTE.tree });
              } else solid.push({ x: cx, y: base + SLAB + 0.8, z: cy, sx: 0.85, sy: 1.6, sz: 0.85, c: PALETTE[skin] });
              break;
            case T.STAIRS: {
              // Four steps climbing toward +x... or whichever way leads to open floor above.
              const dir = this.stairDir(m, x, y, z);
              for (let i = 0; i < 4; i++) {
                const h = ((i + 1) / 4) * H;
                const off = -0.375 + i * 0.25;
                solid.push({ x: cx + dir.x * off, y: base + SLAB + h / 2, z: cy + dir.y * off, sx: dir.x ? 0.25 : 0.9, sy: h, sz: dir.y ? 0.25 : 0.9, c: PALETTE.wood });
              }
              break;
            }
          }
        }
    }
    this.world.add(this.instanced(solid, this.solidMat, true), this.instanced(glass, this.glassMat, false));
  }

  private instanced(boxes: Box[], mat: THREE.Material, colours: boolean) {
    const mesh = new THREE.InstancedMesh(this.boxGeo, mat, Math.max(1, boxes.length));
    mesh.count = boxes.length;
    const mtx = new THREE.Matrix4();
    const col = new THREE.Color();
    boxes.forEach((b, i) => {
      mtx.makeScale(b.sx, b.sy, b.sz).setPosition(b.x, b.y, b.z);
      mesh.setMatrixAt(i, mtx);
      if (colours) mesh.setColorAt(i, col.setHex(b.c));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = colours;
    mesh.receiveShadow = colours;
    return mesh;
  }

  private floorUnder(m: BattleMap, x: number, y: number, z: number): Skin {
    // A prop's floor: borrow a walkable neighbour's.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const t = tileAt(m, x + dx, y + dy, z);
      if (t === T.FLOOR || t === T.DOOR) return skinAt(m, x + dx, y + dy, z);
    }
    return m.setting === "urban" ? "pavement" : "grass";
  }

  private wallNear(m: BattleMap, x: number, y: number, z: number): Skin {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (tileAt(m, x + dx, y + dy, z) === T.WALL) return skinAt(m, x + dx, y + dy, z);
    return "brick";
  }

  private stairDir(m: BattleMap, x: number, y: number, z: number) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const up = tileAt(m, x + dx, y + dy, z + 1);
      const here = tileAt(m, x - dx, y - dy, z);
      if ((up === T.FLOOR || up === T.STAIRS) && (here === T.FLOOR || here === T.DOOR)) return { x: dx, y: dy };
    }
    return { x: 1, y: 0 };
  }

  // ----- Input -----

  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  /** The tile under the cursor: on the cut level, else the first level down with something there. */
  private pickTile(e: PointerEvent): Pt3 | null {
    const m = this.map;
    if (!m) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = new THREE.Vector3();
    for (let z = this.level; z >= 0; z--) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(z * LEVEL_H + SLAB));
      if (!this.ray.ray.intersectPlane(plane, hit)) continue;
      const x = Math.floor(hit.x), y = Math.floor(hit.z);
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      if (tileAt(m, x, y, z) !== T.VOID) return { x, y, z };
    }
    return null;
  }

  private onMove = (e: PointerEvent) => {
    const p = this.pickTile(e);
    const same = p && this.hovered && p.x === this.hovered.x && p.y === this.hovered.y && p.z === this.hovered.z;
    if (same || (!p && !this.hovered)) return;
    this.hovered = p;
    this.hover.visible = !!p;
    if (p) this.hover.position.set(p.x + 0.5, p.z * LEVEL_H + SLAB + 0.03, p.y + 0.5);
    this.onHover?.(p);
  };

  private onDown = (e: PointerEvent) => {
    if (e.button === 0) this.down = { x: e.clientX, y: e.clientY };
  };

  private onUp = (e: PointerEvent) => {
    if (e.button !== 0 || !this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved > 5) return;
    const p = this.pickTile(e);
    if (p) this.onPick?.(p);
  };

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if ("wasd".includes(k) && k.length === 1) this.keys.add(k);
    if (k === "q") this.turnCamera(-1);
    if (k === "e") this.turnCamera(1);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  // ----- Loop -----

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // WASD pans on the ground, relative to where the camera faces.
    if (this.keys.size) {
      const fwd = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
      const v = new THREE.Vector3();
      if (this.keys.has("w")) v.add(fwd);
      if (this.keys.has("s")) v.sub(fwd);
      if (this.keys.has("d")) v.add(right);
      if (this.keys.has("a")) v.sub(right);
      v.multiplyScalar(dt * 18);
      this.controls.target.add(v);
      this.camera.position.add(v);
    }
    // Q / E: ease the camera round its target.
    if (Math.abs(this.turn) > 1e-3) {
      const step = this.turn * Math.min(1, dt * 8);
      this.turn -= step;
      const off = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), step);
      this.camera.position.copy(this.controls.target).add(off);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}

// Battle effects (docs/design/tactical.md, "Effects"): what flies and fades
// (sparks, chips, splinters, shards, blood, smoke, embers, a blast's
// fireball), the fire on burning tiles, a blast's shake of the camera, and
// the marks left for the rest of the fight (blood, scorches, bullet holes,
// glass and splinters on the floor). Only the look: none of it is in the
// rules or the save, so a battle loaded again starts clean but for the
// scorches under fires still burning and the pools under bodies (UnitLayer).
//
// Bits are boxes sharing a material (they shrink away at the end) or sprites
// with one each (they fade). Marks are instanced planes, one mesh a kind,
// hidden on levels cut away.
import * as THREE from "three";
import { E, edgeAt, T, tileAt, type Skin } from "../../tactical/map/map";
import { litByLamps } from "../shaders/lamps";
import { LEVEL_H, SILL, SLAB, TILE, wc } from "./scale";
import type { BattleView } from "./BattleView";

type V = THREE.Vector3;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** A random direction, roughly within `cone` of `dir` (both unit vectors; cone 1 is a hemisphere). */
const scatter = (dir: V, cone: number) =>
  dir
    .clone()
    .add(v3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(cone))
    .normalize();

/** What a surface throws up when struck. */
export type Surface = "metal" | "stone" | "wood" | "soft";

const METAL = new Set<Skin>(["car", "truck", "bin", "fridge", "pump", "rack", "metal", "tv"]);
const WOOD = new Set<Skin>([
  "wood",
  "crate",
  "table",
  "bench",
  "planks",
  "fence",
  "tree",
  "counter",
  "shelf",
]);
const SOFT = new Set<Skin>(["grass", "dirt", "hay", "hedge", "sofa", "bed", "none"]);
export const surfaceOf = (skin: Skin): Surface =>
  METAL.has(skin) ? "metal" : WOOD.has(skin) ? "wood" : SOFT.has(skin) ? "soft" : "stone";

/** The colour of a surface's dust and chips. */
const DUST: Partial<Record<Skin, number>> = {
  brick: 0x9a5a48,
  plaster: 0xd8d2c4,
  clinic: 0xe0ddd6,
  tile: 0xc8c4bc,
  roof: 0x6e4c40,
  grass: 0x5d6b3c,
  hedge: 0x4a6a32,
  tree: 0x6a5238,
  dirt: 0x6a5038,
  hay: 0xc8a860,
  wood: 0x8a6440,
  planks: 0x8a6440,
  crate: 0x9a7448,
  fence: 0x7a5a3a,
};

const BLOOD = { human: 0x6e0808, vampire: 0x260404 };

// ----- Textures, drawn once on canvases -----

function canvas(size: number, draw: (x: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft white dot: smoke, flashes, embers, mist. */
const softTex = () =>
  canvas(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });

/** A puff of smoke: a few soft lobes, so it isn't a perfect disc. */
const puffTex = () =>
  canvas(128, (x, s) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2,
        r = i ? s * 0.18 : 0;
      const cx = s / 2 + Math.cos(a) * r,
        cy = s / 2 + Math.sin(a) * r,
        R = s * (i ? 0.22 : 0.3);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    }
  });

/** A tongue of flame: white at a round root, tapering up; nothing cut at the edges. */
const flameTex = () =>
  canvas(128, (x, s) => {
    const root = s * 0.7,
      r = s * 0.26;
    // Above the root a tall ellipse, below it a round bottom.
    for (const [y0, y1, tall] of [
      [0, root, 2.5],
      [root, s, 1],
    ] as const) {
      x.save();
      x.beginPath();
      x.rect(0, y0, s, y1 - y0);
      x.clip();
      x.translate(s / 2, root);
      x.scale(1, tall);
      const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,255,255,0.85)");
      g.addColorStop(0.65, "rgba(255,255,255,0.3)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(-s, -s, 2 * s, 2 * s);
      x.restore();
    }
  });

/** A splash: a blob, smaller blobs round it, a few flung drops. White; tinted by the material. */
const splatTex = () =>
  canvas(128, (x, s) => {
    x.fillStyle = "#fff";
    const blob = (cx: number, cy: number, r: number) => {
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fill();
    };
    blob(s / 2, s / 2, s * 0.16);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2,
        d = s * rnd(0.08, 0.2);
      blob(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * rnd(0.04, 0.09));
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2,
        d = s * rnd(0.22, 0.46);
      blob(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * rnd(0.008, 0.025));
    }
  });

/** A pool: an uneven round spread, its edge a little soft. */
export const poolTex = () =>
  canvas(128, (x, s) => {
    x.filter = "blur(2px)";
    x.fillStyle = "#fff";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rnd(-0.2, 0.2),
        d = i ? s * rnd(0.1, 0.22) : 0;
      x.beginPath();
      x.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * rnd(0.14, 0.24), 0, Math.PI * 2);
      x.fill();
    }
  });

/** Soot: a flat stain, darkest at the middle, its edge uneven (layered hard-edged dabs, so it reads as a mark, not smoke). Colour baked in. */
const scorchTex = () =>
  canvas(256, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.32);
    g.addColorStop(0, "rgba(12,10,8,0.45)");
    g.addColorStop(1, "rgba(12,10,8,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    x.fillStyle = "rgba(14,11,9,0.08)";
    x.filter = "blur(4px)";
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2,
        d = s * 0.3 * Math.sqrt(Math.random());
      x.beginPath();
      x.arc(s / 2 + Math.cos(a) * d, s / 2 + Math.sin(a) * d, s * rnd(0.05, 0.14), 0, Math.PI * 2);
      x.fill();
    }
  });

/** A bullet hole: a dark centre in a ring of chipped, paler surface. Colour baked in. */
const holeTex = () =>
  canvas(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(10,9,8,1)");
    g.addColorStop(0.22, "rgba(20,18,16,1)");
    g.addColorStop(0.3, "rgba(150,145,135,0.55)");
    g.addColorStop(0.7, "rgba(60,56,50,0.25)");
    g.addColorStop(1, "rgba(60,56,50,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });

/** Bits strewn over the floor: shards of glass, or splinters. Colour baked in. */
const strewnTex = (glass: boolean) =>
  canvas(128, (x, s) => {
    for (let i = 0; i < (glass ? 70 : 40); i++) {
      const r = Math.sqrt(Math.random()) * s * 0.45,
        a = Math.random() * Math.PI * 2;
      x.save();
      x.translate(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
      x.rotate(Math.random() * Math.PI);
      if (glass) {
        x.fillStyle = `rgba(${200 + Math.random() * 55},${225 + Math.random() * 30},255,${rnd(0.35, 0.9).toFixed(2)})`;
        const k = rnd(1, 4);
        x.beginPath();
        x.moveTo(-k, -k * 0.6);
        x.lineTo(k, -k * 0.2);
        x.lineTo(k * 0.3, k);
        x.closePath();
        x.fill();
      } else {
        const t = rnd(0.7, 1.2);
        x.fillStyle = `rgb(${Math.round(120 * t)},${Math.round(86 * t)},${Math.round(52 * t)})`;
        x.fillRect(-rnd(3, 9), -0.8, rnd(6, 18), rnd(1, 2.2));
      }
      x.restore();
    }
  });

// ----- Bits in flight -----

interface Bit {
  obj: THREE.Mesh | THREE.Sprite;
  v: V;
  age: number;
  life: number;
  /** Down (m/s²); negative rises (smoke). */
  g: number;
  /** Speed lost a second (share). */
  drag: number;
  spin?: V;
  /** Lands at this height. */
  floor?: number;
  /** Share of its speed kept on landing; 0 sticks. */
  bounce?: number;
  landed?: boolean;
  onLand?: (at: V) => void;
  /** Sprites: scale from, to; peak opacity, reached this share of the way through its life (0.1). */
  size?: [number, number];
  peak?: number;
  rise?: number;
  /** Sprites: colour from, to over its life. */
  tint?: [THREE.Color, THREE.Color];
  /** Drawn as a streak along its flight, at most this long (sparks). */
  streak?: number;
  /** Boxes: their scale, shrunk away over the last quarter of life. */
  base?: V;
}

/** Instanced marks of one kind on floors and walls: a ring of so many, the oldest replaced. */
class Marks {
  readonly mesh: THREE.InstancedMesh;
  readonly items: { m: THREE.Matrix4; z: number }[] = [];
  next = 0;
  static readonly HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    geo: THREE.PlaneGeometry,
    readonly mat: THREE.MeshStandardMaterial,
    readonly cap: number,
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1; // on the floor: under every flame, puff and spark
    // In shadow like the floor under it.
    this.mesh.receiveShadow = true;
  }

  add(at: V, n: V, size: number, z: number, level: number) {
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), Math.random() * Math.PI * 2));
    // Off the surface a hair, each a little more than the last, so marks laid over one another don't flicker.
    const lift = 0.006 + (this.next % 40) * 0.0004;
    const m = new THREE.Matrix4().compose(
      at.clone().addScaledVector(n, lift),
      q,
      v3(size, size, 1),
    );
    const i = this.next % this.cap;
    this.items[i] = { m, z };
    this.mesh.setMatrixAt(i, z <= level ? m : Marks.HIDDEN);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.next++;
    this.mesh.count = Math.min(this.cap, this.next);
  }

  showLevel(level: number) {
    this.items.forEach((it, i) => this.mesh.setMatrixAt(i, it.z <= level ? it.m : Marks.HIDDEN));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.next = 0;
    this.mesh.count = 0;
  }
}

/** How many bits may be in flight at once; past it, new ones are left out. */
const MAX_BITS = 1400;

export class Effects {
  constructor(readonly view: BattleView) {
    view.scene.add(this.group, this.fireGroup);
  }

  readonly group = new THREE.Group();
  /** The flames on burning tiles. */
  readonly fireGroup = new THREE.Group();
  readonly bits: Bit[] = [];
  /** Effects stand still (the scene preview, for a screenshot mid-effect). */
  frozen = false;

  readonly tex = {
    soft: softTex(),
    puff: puffTex(),
    flame: flameTex(),
    splat: splatTex(),
    pool: poolTex(),
    scorch: scorchTex(),
    hole: holeTex(),
    glass: strewnTex(true),
    splinters: strewnTex(false),
  };

  readonly plane = new THREE.PlaneGeometry(1, 1);
  readonly markMat = (map: THREE.Texture, colour: number, roughness: number) =>
    litByLamps(
      new THREE.MeshStandardMaterial({
        map,
        color: colour,
        roughness,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );

  readonly marks = {
    blood: new Marks(this.plane, this.markMat(this.tex.splat, BLOOD.human, 0.25), 900),
    vampireBlood: new Marks(this.plane, this.markMat(this.tex.splat, BLOOD.vampire, 0.3), 500),
    scorch: new Marks(this.plane, this.markMat(this.tex.scorch, 0xffffff, 1), 160),
    hole: new Marks(this.plane, this.markMat(this.tex.hole, 0xffffff, 0.9), 400),
    glass: new Marks(this.plane, this.markMat(this.tex.glass, 0xffffff, 0.05), 120),
    splinters: new Marks(this.plane, this.markMat(this.tex.splinters, 0xffffff, 0.8), 80),
  };
  readonly marksAdded = (() => {
    for (const k of Object.values(this.marks)) this.group.add(k.mesh);
    return true;
  })();

  /** Lit materials shared by the boxes that fly. */
  readonly lit = (colour: number, roughness = 0.8, emissive = 0) => {
    const m = litByLamps(new THREE.MeshStandardMaterial({ color: colour, roughness }));
    if (emissive) {
      m.emissive.setHex(colour);
      m.emissiveIntensity = emissive;
    }
    return m;
  };
  readonly mats = {
    spark: new THREE.MeshBasicMaterial({
      color: 0xffa040,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    tracer: new THREE.MeshBasicMaterial({
      color: 0xfff0c8,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xd8ecff,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.75,
      emissive: 0x6a8aa0,
      emissiveIntensity: 0.35,
      depthWrite: false,
    }),
    blood: this.lit(BLOOD.human, 0.3, 0.15),
    vampireBlood: this.lit(BLOOD.vampire, 0.3, 0.1),
    wood: [this.lit(0x8a6440), this.lit(0xa47c50), this.lit(0x6a4a2c)],
    debris: this.lit(0x3a3632, 0.95),
    steel: this.lit(0x6a6c70, 0.4),
  };
  /** Chips of a colour, made the first time one is struck. */
  readonly chipMats = new Map<number, THREE.MeshStandardMaterial>();
  chipMat(colour: number) {
    let m = this.chipMats.get(colour);
    if (!m) this.chipMats.set(colour, (m = this.lit(colour, 0.9)));
    return m;
  }

  // ----- The bits -----

  box(mat: THREE.Material, at: V, scale: V, b: Omit<Bit, "obj" | "age" | "base">) {
    if (this.bits.length >= MAX_BITS) return;
    const o = new THREE.Mesh(this.view.boxGeo, mat);
    o.position.copy(at);
    o.scale.copy(scale);
    o.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
    this.group.add(o);
    this.bits.push({ ...b, obj: o, age: 0, base: scale.clone() });
  }

  sprite(
    map: THREE.Texture,
    colour: number | [number, number],
    at: V,
    b: Omit<Bit, "obj" | "age" | "tint"> & { size: [number, number]; additive?: boolean },
  ) {
    if (this.bits.length >= MAX_BITS) return;
    const [c0, c1] = typeof colour === "number" ? [colour, colour] : colour;
    const mat = new THREE.SpriteMaterial({
      map,
      color: c0,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      blending: b.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.rotation = Math.random() * Math.PI * 2;
    const o = new THREE.Sprite(mat);
    o.position.copy(at);
    o.scale.setScalar(b.size[0]);
    this.group.add(o);
    this.bits.push({
      ...b,
      obj: o,
      age: 0,
      tint: [new THREE.Color(c0), new THREE.Color(c1)],
    });
  }

  /** A spark: a hot streak that falls and bounces. */
  spark(at: V, v: V, floor: number, life = rnd(0.25, 0.6), streak = 0.25, width = 0.02) {
    this.box(this.mats.spark, at, v3(width, width, 0.1), {
      v,
      life,
      g: 9.8,
      drag: 0.8,
      floor,
      bounce: 0.4,
      streak,
    });
  }

  /** Where a bit falling from `at` lands: the floor of the storey it's in, or the first one below with a floor. */
  floorUnder(at: V): number {
    const m = this.view.map;
    if (!m) return at.y - 1;
    const x = Math.floor(at.x / TILE),
      y = Math.floor(at.z / TILE);
    let z = Math.min(m.levels - 1, Math.max(0, Math.floor((at.y - SLAB + 0.05) / LEVEL_H)));
    while (z > m.ground && tileAt(m, x, y, z) === T.VOID) z--;
    return z * LEVEL_H + SLAB - this.view.drop({ x, y, z });
  }

  /** The storey a point is on (for hiding its marks with the levels cut away). */
  levelOf(at: V) {
    return Math.max(0, Math.floor((at.y - SLAB + 0.05) / LEVEL_H));
  }

  /** A mark on the floor where something landed. */
  markFloor(kind: keyof Effects["marks"], at: V, size: number) {
    const p = v3(at.x, this.floorUnder(at.clone().setY(at.y + 0.05)), at.z);
    this.marks[kind].add(p, v3(0, 1, 0), size, this.levelOf(p), this.view.level);
  }

  // ----- What the playback calls -----

  /** A gun's flash at the muzzle, and a wisp of smoke after it. */
  muzzle(at: V, dir: V, suppressed: boolean) {
    const ahead = at.clone().addScaledVector(dir, 0.25);
    this.sprite(this.tex.soft, [0xfff2c0, 0xff9a40], ahead, {
      v: dir.clone().multiplyScalar(2),
      life: 0.07,
      g: 0,
      drag: 0,
      size: suppressed ? [0.25, 0.35] : [0.7, 1.1],
      peak: suppressed ? 0.5 : 1,
      additive: true,
    });
    this.sprite(this.tex.puff, 0x9a958c, ahead, {
      v: dir.clone().multiplyScalar(0.6).setY(0.3),
      life: 0.9,
      g: -0.3,
      drag: 1.5,
      size: [0.15, 0.6],
      peak: suppressed ? 0.12 : 0.22,
    });
  }

  /**
   * A round striking a surface: what flies off depends on what it is.
   * Metal sparks and may send the round whining off; stone puffs dust and
   * chips; wood splinters; earth and grass throw up clods. Hard surfaces
   * keep a hole. `dir`: the way the round flew.
   */
  impact(at: V, n: V, dir: V, skin: Skin) {
    const kind = surfaceOf(skin);
    const winter = this.view.map?.winter && (skin === "grass" || skin === "dirt");
    const colour = winter ? 0xf0f2f6 : (DUST[skin] ?? (kind === "metal" ? 0x8a8a88 : 0x8e8a82));
    const floor = this.floorUnder(at);
    const off = at.clone().addScaledVector(n, 0.03);
    // The round glancing off: a streak on, mirrored about the surface.
    const grazing = Math.abs(dir.dot(n)) < 0.6;
    const ricochet =
      (kind === "metal" && Math.random() < 0.6) ||
      (kind === "stone" && grazing && Math.random() < 0.35);
    if (ricochet) {
      const r = dir
        .clone()
        .addScaledVector(n, -2 * dir.dot(n))
        .add(v3(rnd(-0.2, 0.2), rnd(0, 0.25), rnd(-0.2, 0.2)))
        .normalize();
      this.box(this.mats.tracer, off.clone(), v3(0.018, 0.018, 1), {
        v: r.multiplyScalar(90),
        life: 0.1,
        g: 0,
        drag: 0,
        streak: 2.4,
      });
    }
    const sparks = kind === "metal" ? Math.round(rnd(10, 16)) : kind === "stone" ? 3 : 0;
    for (let i = 0; i < sparks; i++)
      this.spark(
        off.clone(),
        scatter(n, 0.9).multiplyScalar(rnd(2, 7)),
        floor,
        undefined,
        0.35,
        0.03,
      );
    if (kind === "metal")
      this.sprite(this.tex.soft, 0xfff0c0, off, {
        v: v3(),
        life: 0.05,
        g: 0,
        drag: 0,
        size: [0.5, 0.8],
        peak: 0.9,
        additive: true,
      });
    // Dust: stone and earth most, wood a little, metal a whiff.
    const puffs = { metal: 1, stone: 3, wood: 2, soft: 3 }[kind];
    for (let i = 0; i < puffs; i++)
      this.sprite(this.tex.puff, colour, off.clone(), {
        v: scatter(n, 0.6).multiplyScalar(rnd(0.6, 1.8)),
        life: rnd(0.9, 1.6),
        g: -0.2,
        drag: 2.2,
        size: [0.2, rnd(0.9, 1.5)],
        peak: kind === "metal" ? 0.2 : 0.5,
      });
    // Chips, splinters, clods.
    const chips = { metal: 0, stone: Math.round(rnd(6, 10)), wood: Math.round(rnd(5, 8)), soft: 6 }[
      kind
    ];
    for (let i = 0; i < chips; i++) {
      const wood = kind === "wood";
      const s = rnd(0.03, 0.065);
      this.box(
        wood ? this.mats.wood[i % 3]! : this.chipMat(colour),
        off.clone(),
        wood ? v3(s * 0.6, s * 0.6, s * rnd(3, 6)) : v3(s, s, s),
        {
          v: scatter(n, 0.8).multiplyScalar(rnd(1.5, 4.5)),
          life: rnd(0.8, 1.6),
          g: 9.8,
          drag: 0.4,
          spin: v3(rnd(-15, 15), rnd(-15, 15), rnd(-15, 15)),
          floor,
          bounce: 0.3,
        },
      );
    }
    if (kind !== "soft")
      this.marks.hole.add(at, n, rnd(0.14, 0.2), this.levelOf(at), this.view.level);
  }

  /**
   * A round or a blow drawing blood: a red mist, drops flung on the way it
   * went (a few back), spattering the floor where they land and a wall close
   * behind. A vampire's is darker, near black. `heavy`: a critical, or a
   * blow that dropped it.
   */
  blood(at: V, dir: V, vampire: boolean, heavy: boolean) {
    const colour = vampire ? BLOOD.vampire : BLOOD.human;
    const mark = vampire ? "vampireBlood" : "blood";
    const floor = this.floorUnder(at);
    const flat = v3(dir.x, 0, dir.z).normalize();
    for (let i = 0; i < (heavy ? 3 : 2); i++)
      this.sprite(this.tex.puff, colour, at.clone(), {
        v: scatter(dir, 0.4).multiplyScalar(rnd(0.8, 2)),
        life: rnd(0.3, 0.5),
        g: 0.5,
        drag: 3,
        size: [0.15, heavy ? 1 : 0.7],
        peak: 0.75,
      });
    const n = heavy ? 30 : 16;
    for (let i = 0; i < n; i++) {
      const back = i < n * 0.2;
      const s = rnd(0.014, 0.032);
      this.box(vampire ? this.mats.vampireBlood : this.mats.blood, at.clone(), v3(s, s, s), {
        streak: 0.14,
        v: scatter(back ? flat.clone().negate() : dir, 0.45)
          .multiplyScalar(back ? rnd(0.8, 1.8) : rnd(2, heavy ? 6.5 : 5))
          .add(v3(0, rnd(0.3, 2.2), 0)),
        life: 1.2,
        g: 9.8,
        drag: 0.3,
        floor,
        bounce: 0,
        onLand: (p) => this.markFloor(mark, p, rnd(0.1, heavy ? 0.4 : 0.3)),
      });
    }
    this.splashWall(at, flat, mark, heavy);
  }

  /** Blood on a wall within a metre and a half behind where it was shed, at the height it flew. */
  splashWall(at: V, flat: V, mark: "blood" | "vampireBlood", heavy: boolean) {
    const m = this.view.map;
    if (!m || !flat.lengthSq()) return;
    const z = this.levelOf(at);
    let px = Math.floor(at.x / TILE),
      py = Math.floor(at.z / TILE);
    for (let d = 0.1; d <= 1.6; d += 0.1) {
      const p = at.clone().addScaledVector(flat, d);
      const x = Math.floor(p.x / TILE),
        y = Math.floor(p.z / TILE);
      if (x === px && y === py) continue;
      const dx = x - px,
        dy = y - py;
      if (dx && dy) return; // through a corner: let it go
      const k = edgeAt(m, px, py, z, dx, dy);
      if (k === E.WALL || k === E.SHUT) {
        // On the face of the wall, on our side of it.
        const face = v3(-dx, 0, -dy);
        const hit = p.clone();
        if (dx) hit.x = (dx > 0 ? x : px) * TILE + face.x * 0.07;
        else hit.z = (dy > 0 ? y : py) * TILE + face.z * 0.07;
        hit.y -= d * 0.25;
        this.marks[mark].add(hit, face, rnd(0.35, heavy ? 0.8 : 0.55), z, this.view.level);
        return;
      }
      if (k !== E.NONE && k !== E.DOOR) return; // a window, a rail: it flies on through
      px = x;
      py = y;
    }
  }

  /**
   * A blast: a flash, a fireball rolling up into smoke, debris and sparks
   * flung out, a ring along the ground, soot left on it, and the camera
   * shaken. `radius` in tiles; a rocket's is bigger and harder than an
   * incendiary's.
   */
  explosion(at: V, radius: number, rocket: boolean) {
    const floor = this.floorUnder(at);
    const ground = v3(at.x, floor, at.z);
    const r = radius * TILE;
    this.sprite(this.tex.soft, [0xfff0d0, 0xff9040], at.clone(), {
      v: v3(),
      life: 0.12,
      g: 0,
      drag: 0,
      size: [r * 1.2, r * 2],
      peak: 0.8,
      additive: true,
    });
    for (let i = 0; i < (rocket ? 12 : 8); i++)
      this.sprite(
        this.tex.puff,
        [0xffb040, 0x7a1a04],
        at.clone().add(v3(rnd(-0.6, 0.6), rnd(0, 0.6), rnd(-0.6, 0.6))),
        {
          v: v3(rnd(-1, 1), rnd(0.5, 2.5), rnd(-1, 1)).multiplyScalar(rocket ? 2.2 : 1.4),
          life: rnd(0.5, 0.9),
          g: -1.5,
          drag: 2.5,
          size: [0.6, rnd(2, 3.4) * (rocket ? 1 : 0.8)],
          peak: 0.7,
          additive: true,
        },
      );
    for (let i = 0; i < (rocket ? 14 : 9); i++)
      this.sprite(
        this.tex.puff,
        [0x4a4238, 0x2a2622],
        at.clone().add(v3(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1))),
        {
          v: v3(rnd(-0.8, 0.8), rnd(1, 2.4), rnd(-0.8, 0.8)),
          life: rnd(2.6, 4.2),
          g: -0.2,
          drag: 0.6,
          size: [1, rnd(3, 5)],
          peak: rocket ? 0.6 : 0.45,
        },
      );
    for (let i = 0; i < (rocket ? 26 : 10); i++) {
      const s = rnd(0.05, 0.16);
      this.box(this.mats.debris, at.clone(), v3(s, s * rnd(0.4, 1), s * rnd(0.6, 1.4)), {
        v: v3(rnd(-1, 1), rnd(0.3, 1.4), rnd(-1, 1))
          .normalize()
          .multiplyScalar(rnd(4, rocket ? 13 : 7)),
        life: rnd(1.5, 2.6),
        g: 9.8,
        drag: 0.2,
        spin: v3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)),
        floor,
        bounce: 0.3,
      });
    }
    for (let i = 0; i < (rocket ? 36 : 20); i++)
      this.spark(
        at.clone(),
        v3(rnd(-1, 1), rnd(0.1, 1.3), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 14)),
        floor,
        rnd(0.4, 1.1),
        0.45,
        0.022,
      );
    // The shock along the ground.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffc080,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(ground).setY(floor + 0.08);
    this.group.add(ring);
    let t = 0;
    this.after((dt) => {
      t += dt / 0.35;
      ring.scale.setScalar(0.5 + t * r);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.max(0, 1 - t);
      if (t < 1) return false;
      this.group.remove(ring);
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      return true;
    });
    this.marks.scorch.add(ground, v3(0, 1, 0), r * 1.7, this.levelOf(ground), this.view.level);
    this.shake(rocket ? 0.45 : 0.22);
  }

  /** A flashbang's white burst, a strobe's flicker, a UV flare's violet bloom. */
  flash(at: V, colour: number, size: number, times = 1) {
    for (let i = 0; i < times; i++) {
      const k = i;
      this.later(k * 0.12, () =>
        this.sprite(this.tex.soft, colour, at.clone(), {
          v: v3(),
          life: 0.12,
          g: 0,
          drag: 0,
          size: [size, size * 1.6],
          peak: 1,
          additive: true,
        }),
      );
    }
    for (let i = 0; i < 4; i++)
      this.sprite(this.tex.puff, 0xb8b4ac, at.clone(), {
        v: v3(rnd(-1, 1), rnd(0.3, 1), rnd(-1, 1)),
        life: rnd(1.5, 2.5),
        g: -0.3,
        drag: 1,
        size: [0.5, 2],
        peak: 0.3,
      });
  }

  /**
   * A pane bursting: shards fly on the way the blow went and fan out, a
   * glitter of tiny bits catches the light, and they fall and skitter; glass
   * is left strewn on the floor, most of it on the far side.
   */
  shatter(lo: V, hi: V, along: V, dir: V) {
    const side = v3(-dir.z, 0, dir.x);
    const floor = this.floorUnder(lo.clone().addScaledVector(dir, 0.3));
    const height = hi.y - lo.y;
    const n = Math.round(14 + height * 10);
    for (let i = 0; i < n; i++) {
      const at = lo
        .clone()
        .addScaledVector(along, rnd(-0.5, 0.5))
        .setY(lo.y + Math.random() * height);
      const big = rnd(0.04, 0.16);
      this.box(this.mats.glass, at, v3(big, 0.012, big * rnd(0.4, 1.2)), {
        v: dir
          .clone()
          .multiplyScalar(rnd(1.5, 5.4))
          .addScaledVector(side, rnd(-1.1, 1.1))
          .setY(rnd(0.2, 1.8)),
        life: rnd(1.6, 2.6),
        g: 9.8,
        drag: 0.2,
        spin: v3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8)),
        floor,
        bounce: 0.25,
      });
    }
    for (let i = 0; i < 16; i++)
      this.sprite(
        this.tex.soft,
        0xe8f4ff,
        lo
          .clone()
          .addScaledVector(along, rnd(-0.5, 0.5))
          .setY(lo.y + Math.random() * height),
        {
          v: dir
            .clone()
            .multiplyScalar(rnd(1, 4))
            .addScaledVector(side, rnd(-1, 1))
            .setY(rnd(-0.5, 1)),
          life: rnd(0.2, 0.45),
          g: 4,
          drag: 0.5,
          size: [0.12, 0.04],
          peak: 1,
          additive: true,
        },
      );
    const far = lo.clone().addScaledVector(dir, 0.9);
    const near = lo.clone().addScaledVector(dir, -0.35);
    this.markFloor("glass", far.setY(lo.y), 1.5);
    this.markFloor("glass", near.setY(lo.y), 0.7);
  }

  /**
   * A door blown in: splinters and a plank or two flung on the way the blow
   * went, a puff of dust, and wood strewn on the floor past it. A garage's
   * steel door throws sparks and scraps instead.
   */
  splinter(mid: V, along: V, dir: V, height: number, steel: boolean) {
    const side = v3(-dir.z, 0, dir.x);
    const floor = this.floorUnder(mid);
    const start = () =>
      mid
        .clone()
        .addScaledVector(along, rnd(-0.5, 0.5))
        .setY(floor + Math.random() * height);
    for (let i = 0; i < (steel ? 10 : 30); i++) {
      const long = rnd(0.12, 0.5);
      this.box(
        steel ? this.mats.steel : this.mats.wood[i % 3]!,
        start(),
        steel
          ? v3(rnd(0.08, 0.2), 0.01, rnd(0.08, 0.2))
          : v3(rnd(0.015, 0.04), rnd(0.015, 0.03), long),
        {
          v: dir
            .clone()
            .multiplyScalar(rnd(2, 6.5))
            .addScaledVector(side, rnd(-1.6, 1.6))
            .setY(rnd(0.3, 2.4)),
          life: rnd(2.4, 3.6),
          g: 9.8,
          drag: 0.25,
          spin: v3(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10)),
          floor,
          bounce: 0.25,
        },
      );
    }
    if (!steel)
      for (let i = 0; i < 2; i++)
        this.box(this.mats.wood[i]!, start(), v3(0.12, 0.035, rnd(0.6, 0.9)), {
          v: dir.clone().multiplyScalar(rnd(2, 3.5)).setY(rnd(0.5, 1.5)),
          life: 3.6,
          g: 9.8,
          drag: 0.3,
          spin: v3(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)),
          floor,
          bounce: 0.2,
        });
    else
      for (let i = 0; i < 18; i++)
        this.spark(start(), scatter(dir, 0.8).multiplyScalar(rnd(3, 8)), floor);
    for (let i = 0; i < 5; i++)
      this.sprite(this.tex.puff, steel ? 0x8a8a88 : 0xa08a6a, start(), {
        v: dir.clone().multiplyScalar(rnd(0.5, 1.6)).setY(rnd(0, 0.5)),
        life: rnd(1, 1.8),
        g: -0.1,
        drag: 1.6,
        size: [0.4, rnd(1.2, 1.8)],
        peak: 0.4,
      });
    if (!steel) this.markFloor("splinters", mid.clone().addScaledVector(dir, 1).setY(floor), 1.6);
  }

  /** Smoke and sparks shed along a rocket's flight. */
  trail(at: V) {
    this.sprite(this.tex.puff, [0xb0a898, 0x5a5650], at.clone(), {
      v: v3(rnd(-0.3, 0.3), rnd(0.2, 0.6), rnd(-0.3, 0.3)),
      life: rnd(1.2, 2),
      g: -0.2,
      drag: 1,
      size: [0.25, rnd(0.9, 1.4)],
      peak: 0.45,
    });
  }

  // ----- Fire -----

  /** Tiles that have had a fire on them (scorched once). */
  readonly scorched = new Set<string>();
  /** Each burning tile's emitters: when it next sheds an ember, and smoke. */
  readonly burning = new Map<string, { at: V; ember: number; smoke: number }>();

  /**
   * Burning tiles: tongues of flame, a glow low on the ground, embers and
   * smoke rising; the tile scorched the first time it burns. Only tiles on
   * the levels shown are drawn (they all light the map: Atmosphere).
   */
  setFire(tiles: { x: number; y: number; z: number }[]) {
    for (const c of [...this.fireGroup.children]) {
      this.fireGroup.remove(c);
      ((c as THREE.Sprite).material as THREE.Material).dispose();
    }
    this.burning.clear();
    for (const p of tiles) {
      const key = `${p.x},${p.y},${p.z}`;
      const floor = p.z * LEVEL_H + SLAB - this.view.drop(p);
      const at = v3(wc(p.x), floor, wc(p.y));
      if (!this.scorched.has(key)) {
        this.scorched.add(key);
        this.marks.scorch.add(at, v3(0, 1, 0), TILE * rnd(1.1, 1.4), p.z, this.view.level);
      }
      if (p.z > this.view.level) continue;
      this.burning.set(key, { at, ember: Math.random() * 0.3, smoke: Math.random() * 0.4 });
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.tex.soft,
          color: 0xff6a18,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.position.copy(at).setY(floor + 0.35);
      glow.scale.setScalar(TILE * 1.3);
      glow.userData = { phase: Math.random() * 6, glow: true };
      this.fireGroup.add(glow);
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.tex.flame,
            color: i % 2 ? 0xff8a28 : 0xffb848,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        const h = rnd(0.8, 1.6);
        f.position.set(at.x + rnd(-0.5, 0.5), floor + h * 0.42, at.z + rnd(-0.5, 0.5));
        f.scale.set(h * 0.6, h, 1);
        f.userData = { phase: Math.random() * 6, h, x: f.position.x, floor };
        this.fireGroup.add(f);
      }
    }
  }

  /** The flames flicker; burning tiles shed embers and smoke. */
  updateFire(dt: number, now: number) {
    const t = now / 1000;
    for (const f of this.fireGroup.children as THREE.Sprite[]) {
      const u = f.userData;
      const k = 0.5 + 0.5 * Math.sin(t * 9 + u.phase) * Math.sin(t * 5.3 + u.phase * 2);
      if (u.glow) {
        f.material.opacity = 0.32 + 0.16 * k;
        continue;
      }
      const h = u.h * (0.75 + 0.45 * k);
      f.scale.set(u.h * 0.6 * (1.1 - 0.3 * k), h, 1);
      f.position.y = u.floor + h * 0.42;
      f.position.x = u.x + Math.sin(t * 3 + u.phase) * 0.06;
      f.material.opacity = 0.55 + 0.4 * k;
    }
    for (const b of this.burning.values()) {
      b.ember -= dt;
      b.smoke -= dt;
      const at = b.at.clone().add(v3(rnd(-0.5, 0.5), 0.3, rnd(-0.5, 0.5)));
      if (b.ember <= 0) {
        b.ember = rnd(0.08, 0.3);
        this.sprite(this.tex.soft, [0xffd070, 0xff4a10], at, {
          v: v3(rnd(-0.4, 0.4), rnd(1.5, 3), rnd(-0.4, 0.4)),
          life: rnd(0.8, 1.6),
          g: -0.4,
          drag: 0.6,
          size: [0.09, 0.03],
          peak: 1,
          additive: true,
        });
      }
      if (b.smoke <= 0) {
        b.smoke = rnd(0.3, 0.55);
        // Thin, and thickening only once it's above the flames.
        this.sprite(this.tex.puff, [0x5a524a, 0x2a2622], at.setY(at.y + 2), {
          v: v3(rnd(-0.2, 0.2) + 0.25, rnd(0.9, 1.5), rnd(-0.2, 0.2)),
          life: rnd(2.5, 3.8),
          g: -0.1,
          drag: 0.3,
          size: [0.8, rnd(2.2, 3)],
          peak: 0.14,
          rise: 0.4,
        });
      }
    }
  }

  // ----- Timing, the shake, levels -----

  readonly pending: ((dt: number) => boolean)[] = [];
  /** Runs `step` every frame until it returns true. */
  after(step: (dt: number) => boolean) {
    this.pending.push(step);
  }
  /** Runs `fn` once, `s` seconds from now. */
  later(s: number, fn: () => void) {
    let t = s;
    this.after((dt) => ((t -= dt), t <= 0 ? (fn(), true) : false));
  }

  shakeAmp = 0;
  readonly shakeOff = v3();
  shake(amp: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
  }
  /** This frame's shake of the camera (added before drawing, taken off after). */
  shakeNow(dt: number): V {
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.1);
    const a = this.shakeAmp * this.shakeAmp * 2;
    return this.shakeOff.set(rnd(-a, a), rnd(-a, a) * 0.6, rnd(-a, a));
  }

  /** Marks on levels cut away are hidden, and the flames redrawn for the levels shown. */
  showLevel(level: number) {
    for (const k of Object.values(this.marks)) k.showLevel(level);
    this.setFire(this.view.fires);
  }

  /** A new map: everything gone. */
  reset() {
    for (const b of this.bits) this.drop(b);
    this.bits.length = 0;
    this.pending.length = 0;
    for (const k of Object.values(this.marks)) k.clear();
    this.scorched.clear();
    this.shakeAmp = 0;
  }

  drop(b: Bit) {
    this.group.remove(b.obj);
    if (b.obj instanceof THREE.Sprite) b.obj.material.dispose();
  }

  /** Each frame: the bits fly, fall, land and fade. */
  update(dt: number, now: number) {
    if (this.frozen) return;
    this.updateFire(dt, now);
    for (let i = this.pending.length - 1; i >= 0; i--)
      if (this.pending[i]!(dt)) this.pending.splice(i, 1);
    const tmp = v3();
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i]!;
      b.age += dt;
      if (b.age >= b.life) {
        this.drop(b);
        this.bits.splice(i, 1);
        continue;
      }
      const o = b.obj;
      if (!b.landed || b.v.lengthSq() > 0) {
        b.v.y -= b.g * dt;
        b.v.multiplyScalar(Math.max(0, 1 - b.drag * dt));
        tmp.copy(o.position);
        o.position.addScaledVector(b.v, dt);
        if (b.floor !== undefined) this.walls(tmp, o.position, b.v);
      }
      if (b.floor !== undefined && o.position.y < b.floor + 0.01) {
        o.position.y = b.floor + 0.01;
        if (!b.landed) {
          b.landed = true;
          b.onLand?.(o.position);
        }
        if (!b.bounce || Math.abs(b.v.y) < 0.6) {
          // Lying: a skid that dies away, flat on the floor.
          b.v.set(b.v.x * 0.8, 0, b.v.z * 0.8);
          if (b.v.lengthSq() < 0.01) b.v.set(0, 0, 0);
          if (!b.bounce) b.v.set(0, 0, 0);
          if (b.spin) b.spin.multiplyScalar(0.5);
          o.rotation.x *= 0.7;
          o.rotation.z *= 0.7;
        } else b.v.set(b.v.x * 0.6, -b.v.y * b.bounce, b.v.z * 0.6);
      }
      const f = b.age / b.life;
      if (o instanceof THREE.Sprite) {
        const [s0, s1] = b.size!;
        const e = 1 - (1 - f) * (1 - f);
        o.scale.setScalar(s0 + (s1 - s0) * e);
        const peak = b.peak ?? 1,
          rise = b.rise ?? 0.1;
        o.material.opacity = peak * (f < rise ? f / rise : 1 - (f - rise) / (1 - rise));
        if (b.tint) o.material.color.copy(b.tint[0]).lerp(b.tint[1], f);
        continue;
      }
      if (b.streak) {
        // Along its flight, longer the faster it goes.
        const speed = b.v.length();
        o.scale.z = Math.max(0.04, Math.min(b.streak, speed * 0.03));
        if (speed > 0.01) o.lookAt(tmp.copy(o.position).add(b.v));
        if (f > 0.6) {
          const k = 1 - (f - 0.6) / 0.4;
          o.scale.x = b.base!.x * k;
          o.scale.y = b.base!.y * k;
        }
        continue;
      }
      if (b.spin) {
        o.rotation.x += b.spin.x * dt;
        o.rotation.y += b.spin.y * dt;
        o.rotation.z += b.spin.z * dt;
      }
      if (f > 0.75) o.scale.copy(b.base!).multiplyScalar(1 - (f - 0.75) / 0.25);
    }
  }

  /**
   * What falls doesn't fly through walls: moving from `was` to `now` across
   * a wall, a shut door, a whole window (or a sill or a rail below its top),
   * it stays on its side, its speed across turned back and mostly lost.
   */
  walls(was: V, now: V, v: V) {
    const m = this.view.map;
    if (!m) return;
    const x0 = Math.floor(was.x / TILE),
      y0 = Math.floor(was.z / TILE),
      x1 = Math.floor(now.x / TILE),
      y1 = Math.floor(now.z / TILE);
    if (x0 === x1 && y0 === y1) return;
    const z = this.levelOf(was),
      h = was.y - (z * LEVEL_H + SLAB);
    const blocks = (dx: number, dy: number) => {
      const k = edgeAt(m, x0, y0, z, dx, dy);
      return (
        k === E.WALL ||
        k === E.SHUT ||
        k === E.WINDOW ||
        ((k === E.SILL || k === E.RAIL) && h < SILL)
      );
    };
    if (x1 !== x0 && blocks(x1 - x0, 0)) {
      now.x = was.x;
      v.x *= -0.25;
    }
    if (y1 !== y0 && blocks(0, y1 - y0)) {
      now.z = was.z;
      v.z *= -0.25;
    }
  }

  dispose() {
    this.reset();
    this.setFire([]);
    for (const t of Object.values(this.tex)) t.dispose();
    for (const k of Object.values(this.marks)) {
      k.mesh.dispose();
      k.mat.dispose();
    }
    this.plane.dispose();
    for (const m of Object.values(this.mats)) for (const x of [m].flat()) x.dispose();
    for (const m of this.chipMats.values()) m.dispose();
  }
}

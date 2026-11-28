// Trees and bushes, semi-procedural. A handful of shapes are grown once from
// fixed seeds: lumpy canopy layers (clumps of displaced spheres), forked
// winter branch clusters, trunks. Each tree or bush on the map then stacks
// a few of them in its own order, each turned, tilted, scaled and nudged by
// a hash of its tile, and tinted a little, so a wood of thirty trees built
// from three layers doesn't repeat. Drawn as one instanced mesh per shape.
//
// Summer: a trunk and three canopy layers. Winter: a taller trunk and three
// or four bare branch clusters round its top (the snow shader lays snow on
// what faces up). Bushes (hedges) are canopy clumps; in winter a browner,
// thinner mass (a beech hedge keeps its dead leaves) with twigs poking out.
//
// Looks only: the rules still see one tile of high cover.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MaterialKey } from "../shaders/materials";
import { HIGH, TILE } from "./scale";

/** A small seeded generator (mulberry32). */
function rand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const span = (r: Rand, a: number, b: number) => a + (b - a) * r();

/** Keeps only the position and normal (so shapes merge). */
function bare(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes))
    if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}

/**
 * A lump: a sphere pushed in and out by a few random waves, so it bulges in
 * lobes; flattened underneath, like a crown's shaded underside.
 */
function lump(r: Rand, radius: number, detail = 2): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  g = mergeVertices(g);
  const waves = Array.from({ length: 5 }, () => ({
    d: new THREE.Vector3(span(r, -1, 1), span(r, -1, 1), span(r, -1, 1)).normalize(),
    k: span(r, 2, 4.5),
    p: span(r, 0, Math.PI * 2),
    a: span(r, 0.05, 0.11),
  }));
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let s = 1;
    for (const w of waves) s += w.a * Math.sin(w.k * v.dot(w.d) + w.p);
    v.multiplyScalar(s * radius);
    if (v.y < 0) v.y *= 0.65;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return bare(g);
}

/** A layer of canopy: a few lumps round a centre, `w` across and about `h` high (metres). */
function layer(seed: number, w: number, h: number, lumps = 4): THREE.BufferGeometry {
  const r = rand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2 + span(r, -0.4, 0.4);
    const out = i === 0 ? 0 : span(r, 0.18, 0.3) * w;
    const rad = span(r, 0.26, 0.36) * w;
    const g = lump(r, 1, 1);
    m.compose(
      new THREE.Vector3(Math.cos(a) * out, span(r, -0.12, 0.12) * h, Math.sin(a) * out),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)),
      new THREE.Vector3(rad, rad * (h / w) * 1.5, rad),
    );
    parts.push(g.applyMatrix4(m));
  }
  return mergeGeometries(parts)!;
}

/** A tapered limb from `a` to `b` (radii ra, rb): a prism, open-ended unless `capped`. */
function limb(
  a: THREE.Vector3,
  b: THREE.Vector3,
  ra: number,
  rb: number,
  sides = 5,
  capped = false,
) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(rb, ra, d.length(), sides, 1, !capped);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
  );
  g.translate(a.x, a.y, a.z);
  return bare(g);
}

/** A direction turned away from `d` by `ang`, about a random axis across it. */
function bend(r: Rand, d: THREE.Vector3, ang: number) {
  const side = new THREE.Vector3(span(r, -1, 1), span(r, -1, 1), span(r, -1, 1))
    .cross(d)
    .normalize();
  return d.clone().applyAxisAngle(side, ang).normalize();
}

/**
 * A bare branch cluster, grown up +Y from the origin: a bough forking two or
 * three times into thinner, shorter limbs, each fork bending away a little
 * and, with gravity, a little down at the tips.
 */
function branches(seed: number, len: number, r0: number, depth = 3): THREE.BufferGeometry {
  const r = rand(seed);
  const parts: THREE.BufferGeometry[] = [];
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, l: number, rad: number, n: number) => {
    // Two segments with a kink, so no limb is dead straight.
    const mid = from.clone().addScaledVector(dir, l * 0.5);
    const dir2 = bend(r, dir, span(r, 0.1, 0.3));
    const to = mid.clone().addScaledVector(dir2, l * 0.5);
    const rm = rad * 0.82,
      rt = rad * 0.65;
    parts.push(limb(from, mid, rad, rm), limb(mid, to, rm, rt));
    if (n === 0) return;
    const kids = n === depth ? 3 : 2 + (r() < 0.4 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const at = k === 0 ? to : from.clone().lerp(to, span(r, 0.45, 0.85));
      const d = bend(r, dir2, span(r, 0.35, 0.75));
      d.y -= 0.08 * (depth - n + 1);
      grow(at, d.normalize(), l * span(r, 0.55, 0.72), rt * span(r, 0.6, 0.8), n - 1);
    }
  };
  grow(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), len, r0, depth);
  return mergeGeometries(parts)!;
}

/**
 * A trunk: one continuous tapered tube from 0 to `h`, kinking a little as it
 * rises, its top capped (where it's cut). The rings share one orientation and
 * the sides smooth normals, so it reads as one stem, not stacked lengths.
 */
function trunk(seed: number, h: number, r0: number, r1: number): THREE.BufferGeometry {
  const r = rand(seed);
  const SIDES = 10,
    RINGS = 6;
  // The stem's line: drifting a few centimetres off true, more higher up.
  const centre: THREE.Vector3[] = [new THREE.Vector3()];
  for (let i = 1; i <= RINGS; i++) {
    const prev = centre[i - 1]!;
    centre.push(
      new THREE.Vector3(
        prev.x + span(r, -0.02, 0.02),
        (h * i) / RINGS,
        prev.z + span(r, -0.02, 0.02),
      ),
    );
  }
  const pos: number[] = [],
    nor: number[] = [],
    index: number[] = [];
  centre.forEach((c, i) => {
    // Tapering, with a slight flare at the foot.
    const t = i / RINGS;
    const rad = r1 + (r0 - r1) * (1 - t) + (i === 0 ? 0.04 : 0);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      // A little out of round, so the bark doesn't look turned on a lathe.
      const bump = 1 + 0.06 * Math.sin(a * 3 + seed);
      const nx = Math.cos(a),
        nz = Math.sin(a);
      pos.push(c.x + nx * rad * bump, c.y, c.z + nz * rad * bump);
      nor.push(nx, 0, nz);
    }
  });
  for (let i = 0; i < RINGS; i++)
    for (let k = 0; k < SIDES; k++) {
      const a = i * SIDES + k,
        b = i * SIDES + ((k + 1) % SIDES),
        c = a + SIDES,
        d = b + SIDES;
      index.push(a, c, b, b, c, d);
    }
  // The cut top: a fan round its centre.
  const top = centre[RINGS]!;
  const mid = pos.length / 3;
  pos.push(top.x, top.y, top.z);
  nor.push(0, 1, 0);
  const rim = pos.length / 3;
  for (let k = 0; k < SIDES; k++) {
    const j = RINGS * SIDES + k;
    pos.push(pos[j * 3]!, pos[j * 3 + 1]!, pos[j * 3 + 2]!);
    nor.push(0, 1, 0);
  }
  for (let k = 0; k < SIDES; k++) index.push(mid, rim + ((k + 1) % SIDES), rim + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(index);
  return g.toNonIndexed();
}

/** The shapes, grown on first use and shared by every map. */
let shapes: {
  canopy: THREE.BufferGeometry[];
  bush: THREE.BufferGeometry[];
  bough: THREE.BufferGeometry[];
  /** Some of each bough's points (every few vertices), to measure its spread as placed. */
  boughPts: THREE.Vector3[][];
  twigs: THREE.BufferGeometry[];
  trunk: THREE.BufferGeometry[];
} | null = null;

function grown() {
  if (shapes) return shapes;
  const bough = [71, 83, 97, 101].map((s) => branches(s, 1.0, 0.1));
  return (shapes = {
    canopy: [11, 23, 37].map((s) => unit(layer(s, 1.0, 0.8, 5))),
    bush: [41, 53, 67].map((s) => layer(s, 1.0, 0.8, 5)),
    bough,
    boughPts: bough.map((g) => {
      const p = g.getAttribute("position");
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < p.count; i += 5) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
      return out;
    }),
    twigs: [113, 127].map((s) => branches(s, 1.0, 0.05, 2)),
    trunk: [131, 137].map((s) => trunk(s, 1.0, 0.3, 0.17)),
  });
}

/** A canopy layer scaled to 1 across (its widest, any way it's turned) and 1 high, centred. */
function unit(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  let rad = 0;
  for (let i = 0; i < pos.count; i++) rad = Math.max(rad, Math.hypot(pos.getX(i), pos.getZ(i)));
  const cy = (b.min.y + b.max.y) / 2;
  g.translate(0, -cy, 0);
  g.scale(0.5 / rad, 1 / (b.max.y - b.min.y), 0.5 / rad); // (normals follow)
  return g;
}

/** Colour, a little off: lightness and hue nudged by up to `l` and `h`. */
function tint(r: Rand, hex: number, l: number, h: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.setHSL(hsl.h + span(r, -h, h), hsl.s, hsl.l * (1 + span(r, -l, l))).getHex();
}

/**
 * Foliage gathered while a level is built, then drawn as one instanced mesh
 * per shape.
 */
export class FoliageBatch {
  private readonly at = new Map<
    THREE.BufferGeometry,
    { key: MaterialKey; list: { m: THREE.Matrix4; c: number }[] }
  >();

  private put(g: THREE.BufferGeometry, key: MaterialKey, m: THREE.Matrix4, c: number) {
    (this.at.get(g) ?? this.at.set(g, { key, list: [] }).get(g)!).list.push({ m, c });
  }

  /** A shape at p, turned yaw about the vertical then tipped by (pitch, roll), scaled s. */
  private static mtx(p: THREE.Vector3, yaw: number, pitch: number, roll: number, s: THREE.Vector3) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
    return new THREE.Matrix4().compose(p, q, s);
  }

  /**
   * A tree on the floor at (x, y top, z); `seed` from its tile. Its crown (or
   * winter boughs) fills the storey above, spreading at most `reach` metres
   * from the trunk (clear of buildings); with `crown` false (the storey above
   * isn't shown) only the trunk stands, cut at the walls' height.
   */
  tree(
    x: number,
    top: number,
    z: number,
    o: { seed: number; winter: boolean; crown: boolean; reach: number; cut: number },
    leaf: number,
    bark: number,
  ) {
    const { winter } = o;
    const r = rand(o.seed);
    const S = grown();
    const tall = span(r, 0.9, 1.12);
    const yaw0 = r() * Math.PI * 2;
    const barkC = tint(r, bark, 0.15, 0.01);
    const trunkH = (winter ? 3.9 : 3.4) * tall;
    const girth = span(r, 1.0, 1.2);
    const lx = span(r, -0.05, 0.05),
      lz = span(r, -0.05, 0.05);
    const base = new THREE.Vector3(x, top, z);
    this.put(
      S.trunk[Math.floor(r() * S.trunk.length)]!,
      "bark",
      FoliageBatch.mtx(
        base,
        yaw0,
        lx,
        lz,
        new THREE.Vector3(girth, o.crown ? trunkH : Math.min(trunkH, o.cut), girth),
      ),
      barkC,
    );
    if (!o.crown) return;
    // Where a height up the (leaning) trunk is.
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(lx, yaw0, lz, "YXZ"));
    const on = (h: number) => new THREE.Vector3(0, h, 0).applyQuaternion(lean).add(base);
    // The crown's radius: about two metres, less where a building is near.
    const R = Math.max(0.6, Math.min(span(r, 1.9, 2.3), o.reach));
    if (!winter) {
      // Three layers, widest in the middle, in this tree's own order.
      const order = [0, 1, 2].sort(() => r() - 0.5);
      const c = tint(r, leaf, 0.14, 0.025);
      const D = 2 * R;
      const y0 = 2.4 * tall;
      const slots = [
        { y: y0 + 0.7, w: D * 0.85, h: 1.5 },
        { y: y0 + 1.7, w: D, h: 1.7 },
        { y: y0 + 2.7, w: D * 0.7, h: 1.4 },
      ];
      slots.forEach((sl, i) => {
        const g = S.canopy[order[i]!]!;
        const sw = sl.w * span(r, 0.9, 1.0);
        const p = on(sl.y).add(new THREE.Vector3(span(r, -0.1, 0.1), 0, span(r, -0.1, 0.1)));
        this.put(
          g,
          "leaves",
          FoliageBatch.mtx(
            p,
            r() * Math.PI * 2,
            span(r, -0.12, 0.12),
            span(r, -0.12, 0.12),
            new THREE.Vector3(sw, sl.h * span(r, 0.85, 1.12), sw),
          ),
          tint(r, c, 0.06, 0.01),
        );
      });
      return;
    }
    // Winter: four or five boughs round the trunk's top half, and a leader.
    const n = 4 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const yaw = yaw0 + (i / n) * Math.PI * 2 + span(r, -0.4, 0.4);
      this.bough(base, on(trunkH * span(r, 0.6, 0.9)), r, R, span(r, 1.3, 1.7) * tall, barkC, {
        yaw,
        pitch: span(r, 0.45, 0.85),
        roll: span(r, -0.15, 0.15),
      });
    }
    this.bough(base, on(trunkH * 0.95), r, R, span(r, 0.8, 1.05) * tall, barkC, {
      yaw: r() * 6.3,
      pitch: span(r, -0.2, 0.2),
      roll: span(r, -0.2, 0.2),
    });
  }

  /** A bough at `at`, its size `want` but shrunk to spread no more than R from the trunk's foot (horizontally). */
  private bough(
    foot: THREE.Vector3,
    at: THREE.Vector3,
    r: Rand,
    R: number,
    want: number,
    c: number,
    turn: { yaw: number; pitch: number; roll: number },
  ) {
    const S = grown();
    const k = Math.floor(r() * S.bough.length);
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(turn.pitch, turn.yaw, turn.roll, "YXZ"),
    );
    const ox = at.x - foot.x,
      oz = at.z - foot.z;
    // Its spread at size 1, turned as placed; then the size that keeps it within R.
    let s = want;
    const v = new THREE.Vector3();
    for (const p of S.boughPts[k]!) {
      v.copy(p).applyQuaternion(q);
      const len = Math.hypot(v.x, v.z);
      if (len * s + Math.hypot(ox, oz) > R) s = Math.max(0.3, (R - Math.hypot(ox, oz)) / len);
    }
    this.put(
      S.bough[k]!,
      "bark",
      new THREE.Matrix4().compose(at, q, new THREE.Vector3(s, s, s)),
      c,
    );
  }

  /** A bush (a tile of hedge) on the floor at (x, y top, z). */
  bush(
    x: number,
    top: number,
    z: number,
    seed: number,
    winter: boolean,
    leaf: number,
    dry: number,
    bark: number,
  ) {
    const r = rand(seed);
    const S = grown();
    const W = TILE * 1.08;
    const H = HIGH.h;
    const c = winter ? tint(r, dry, 0.16, 0.012) : tint(r, leaf, 0.12, 0.02);
    const order = [0, 1, 2].sort(() => r() - 0.5);
    // Two layers, the upper a little narrower; the winter mass thinner.
    const slots = [
      { y: H * 0.3, w: W, h: H * 0.62 },
      { y: H * 0.7, w: W * 0.9, h: H * 0.5 },
    ];
    const thin = winter ? 0.85 : 1;
    slots.forEach((sl, i) => {
      const sw = sl.w * thin * span(r, 0.9, 1.08);
      this.put(
        S.bush[order[i]!]!,
        "hedge",
        FoliageBatch.mtx(
          new THREE.Vector3(x + span(r, -0.1, 0.1), top + sl.y, z + span(r, -0.1, 0.1)),
          r() * Math.PI * 2,
          span(r, -0.12, 0.12),
          span(r, -0.12, 0.12),
          new THREE.Vector3(sw, sl.h * thin * span(r, 0.9, 1.1), sw),
        ),
        tint(r, c, 0.05, 0.01),
      );
    });
    if (!winter) return;
    // Twigs up through the top.
    for (let i = 0; i < 2; i++) {
      const s = span(r, 0.55, 0.8);
      this.put(
        S.twigs[i]!,
        "bark",
        FoliageBatch.mtx(
          new THREE.Vector3(x + span(r, -0.3, 0.3), top + H * 0.45, z + span(r, -0.3, 0.3)),
          r() * Math.PI * 2,
          span(r, -0.4, 0.4),
          span(r, -0.4, 0.4),
          new THREE.Vector3(s, s, s),
        ),
        tint(r, bark, 0.1, 0.01),
      );
    }
  }

  /** One instanced mesh per shape; `mat` gives each material. Shapes are shared: dispose only the instances. */
  meshes(mat: (key: MaterialKey) => THREE.Material): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    const col = new THREE.Color();
    for (const [g, { key, list }] of this.at) {
      const mesh = new THREE.InstancedMesh(g, mat(key), list.length);
      list.forEach(({ m, c }, i) => (mesh.setMatrixAt(i, m), mesh.setColorAt(i, col.setHex(c))));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  }
}

// The glowing overlays on the battlescape: the move range's outlines (blue: time for a shot; yellow: the TU run out), the path ribbon, the pin over a unit's head.
import * as THREE from "three";
import { type V3 } from "../../tactical/map/path";

export const BLUE = 0x4aa8ff,
  YELLOW = 0xffc23a,
  RED = 0xff4a3a;

/**
 * Glow: a ribbon brightest along its middle line and fading out to its
 * sides, added onto whatever is behind it, unlit (it glows in the dark).
 * `flow` sends pulses along it (the path).
 */
export function glowMaterial(colour: number, flow = false, ghost = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      colour: { value: new THREE.Color(colour) },
      time: { value: 0 },
      flow: { value: flow ? 1 : 0 },
      strength: { value: ghost ? 0.3 : 1 },
    },
    vertexShader: `
      attribute float side;
      attribute float along;
      varying float vSide;
      varying float vAlong;
      void main() {
        vSide = side;
        vAlong = along;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 colour;
      uniform float time;
      uniform float flow;
      uniform float strength;
      varying float vSide;
      varying float vAlong;
      void main() {
        float d = abs(vSide);
        float core = exp(-d * d * 36.0);
        float halo = exp(-d * d * 3.5) * 0.55;
        float pulse = mix(1.0, 0.6 + 0.4 * sin(vAlong * 3.3 - time * 7.0), flow);
        vec3 c = colour * (halo + core * 0.9) + vec3(core * 0.55);
        gl_FragColor = vec4(c * pulse * strength, (halo + core) * pulse * strength);
      }`,
    transparent: true,
    depthWrite: false,
    // The ghost copy shows through walls, faintly, where the line runs behind them.
    depthTest: !ghost,
    blending: THREE.AdditiveBlending,
  });
}

/** A flat ribbon along a polyline on the floor (closed: a loop). Vertices carry their side (−1 to 1) and distance along. */
export function ribbon(pts: THREE.Vector3[], width: number, closed: boolean): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [],
    side: number[] = [],
    along: number[] = [],
    index: number[] = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!,
      b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    let tx = b.x - a.x,
      tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    if (i > 0) dist += p.distanceTo(pts[i - 1]!);
    const w = width / 2;
    pos.push(p.x - tz * w, p.y, p.z + tx * w, p.x + tz * w, p.y, p.z - tx * w);
    side.push(-1, 1);
    along.push(dist, dist);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    index.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute("along", new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(index);
  return g;
}

/** One unit edge of an outline: from (x, y), one step (dx, dy), the region on its right (y down). */
interface Step {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * The outline of a set of tiles on one level: closed loops of unit edges
 * along the tile sides, the tiles on their inside (to the right, y down).
 * Each loop is walked keeping to the region, so tiles touching only at a
 * corner make separate loops.
 */
export function outlines(tiles: Set<string>): Step[][] {
  const has = (x: number, y: number) => tiles.has(`${x},${y}`);
  const out = new Map<string, Step[]>();
  const add = (x: number, y: number, dx: number, dy: number) => {
    const k = `${x},${y}`;
    (out.get(k) ?? out.set(k, []).get(k)!).push({ x, y, dx, dy });
  };
  for (const key of tiles) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    if (!has(x, y - 1)) add(x, y, 1, 0);
    if (!has(x + 1, y)) add(x + 1, y, 0, 1);
    if (!has(x, y + 1)) add(x + 1, y + 1, -1, 0);
    if (!has(x - 1, y)) add(x, y + 1, 0, -1);
  }
  const loops: Step[][] = [];
  for (const [, list] of out)
    while (list.length) {
      const first = list.pop()!;
      const loop: Step[] = [first];
      let cur = first;
      for (let guard = 0; guard < 100000; guard++) {
        const nx = cur.x + cur.dx,
          ny = cur.y + cur.dy;
        if (nx === first.x && ny === first.y) break;
        const next = out.get(`${nx},${ny}`);
        if (!next?.length) break;
        // At a corner shared by two loops: turn toward the region first.
        const turn = (e: Step) => cur.dx * e.dy - cur.dy * e.dx;
        next.sort((p, q) => turn(p) - turn(q));
        cur = next.pop()!;
        loop.push(cur);
      }
      loops.push(loop);
    }
  return loops;
}

/** The inside of a unit edge (to its right, y down). */
const inward = (e: Step) => ({ x: -e.dy, y: e.dx });

/** The inset corner between two edges meeting at the end of `a`: where their lines, each pulled in by `d`, cross. */
function insetCorner(a: Step, b: Step, d: number): { x: number; y: number } | null {
  if (a.dx === b.dx && a.dy === b.dy) return null; // straight on: no corner
  const na = inward(a),
    nb = inward(b);
  return { x: a.x + a.dx + (na.x + nb.x) * d, y: a.y + a.dy + (na.y + nb.y) * d };
}

/** A closed outline as its inset corner points. */
export function insetLoop(loop: Step[], d: number): V3[] {
  const pts: V3[] = [];
  loop.forEach((e, i) => {
    const c = insetCorner(e, loop[(i + 1) % loop.length]!, d);
    if (c) pts.push({ x: c.x, y: c.y, z: 0 });
  });
  return pts;
}

/**
 * The yellow line only where it isn't the blue one: a yellow loop cut into
 * runs of edges whose tile inside isn't blue. Each run's ends sit on the
 * blue line, inset the same, so the yellow carries straight on from it.
 */
export function yellowRuns(
  loop: Step[],
  blue: Set<string>,
  d: number,
): { pts: V3[]; closed: boolean }[] {
  const n = loop.length;
  // The tile inside each edge.
  const shared = loop.map((e) => {
    const t =
      e.dx === 1
        ? [e.x, e.y]
        : e.dy === 1
          ? [e.x - 1, e.y]
          : e.dx === -1
            ? [e.x - 1, e.y - 1]
            : [e.x, e.y - 1];
    return blue.has(`${t[0]},${t[1]}`);
  });
  if (shared.every((x) => !x)) return [{ pts: insetLoop(loop, d), closed: true }];
  const runs: { pts: V3[]; closed: boolean }[] = [];
  const start = shared.findIndex((x) => x);
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (shared[i] || !shared[(i - 1 + n) % n]) continue;
    // A run begins at edge i, after a shared edge.
    const prev = loop[(i - 1 + n) % n]!;
    const run: Step[] = [];
    for (let j = i; !shared[j % n] && run.length < n; j++) run.push(loop[j % n]!);
    const next = loop[(i + run.length) % n]!;
    const first = run[0]!,
      last = run.at(-1)!;
    const np = inward(prev),
      nf = inward(first),
      nn = inward(next),
      nl = inward(last);
    // Where it leaves the blue: the blue line's corner if the yellow goes straight on, else where the two inset lines cross.
    const head =
      prev.dx === first.dx && prev.dy === first.dy
        ? { x: first.x + (np.x - prev.dx) * d, y: first.y + (np.y - prev.dy) * d }
        : { x: first.x + (np.x + nf.x) * d, y: first.y + (np.y + nf.y) * d };
    const end = { x: last.x + last.dx, y: last.y + last.dy };
    const tail =
      last.dx === next.dx && last.dy === next.dy
        ? { x: end.x + (nn.x + next.dx) * d, y: end.y + (nn.y + next.dy) * d }
        : { x: end.x + (nl.x + nn.x) * d, y: end.y + (nl.y + nn.y) * d };
    const pts: V3[] = [{ ...head, z: 0 }];
    for (let j = 0; j < run.length - 1; j++) {
      const c = insetCorner(run[j]!, run[j + 1]!, d);
      if (c) pts.push({ ...c, z: 0 });
    }
    pts.push({ ...tail, z: 0 });
    runs.push({ pts, closed: false });
  }
  return runs;
}

/** The pin for an enemy above the level shown: red, with a white up arrow. */
export function abovePinTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  // A map pin: a disc with a point at the bottom.
  x.beginPath();
  x.arc(64, 52, 40, Math.PI * 0.8, Math.PI * 2.2);
  x.lineTo(64, 122);
  x.closePath();
  x.fillStyle = "#d8282e";
  x.fill();
  x.lineWidth = 6;
  x.strokeStyle = "#1a0306";
  x.stroke();
  // The arrow.
  x.beginPath();
  x.moveTo(64, 22);
  x.lineTo(90, 52);
  x.lineTo(74, 52);
  x.lineTo(74, 78);
  x.lineTo(54, 78);
  x.lineTo(54, 52);
  x.lineTo(38, 52);
  x.closePath();
  x.fillStyle = "#fff4ec";
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

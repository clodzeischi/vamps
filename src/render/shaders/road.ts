// Asphalt: roads and car parks, painted per pixel on the ground slabs.
//
// * Base: large patches of older and newer asphalt, polished wheel tracks
//   with an oil line between them, rectangular repairs with sealed seams,
//   aggregate grit and the odd pale stone.
// * Cracks: long wandering cracks in patches, and fatigue (alligator)
//   cracking where the road has worn; they cut through the paint.
// * Markings (roads only, worn): a dashed centre line, solid near a
//   junction; edge lines; a zebra crossing on the tile next to a junction
//   and a stop line across the inbound lane before it (traffic keeps right).
// * A small relief (cracks sunk, paint raised) tilts the normal.
//
// Where markings go comes from roadMap(): one texel a ground tile saying
// which way the road runs, where its strip starts and how wide it is, and
// how far a junction is.
import * as THREE from "three";
import type { BattleMap } from "../../tactical/map";
import type { Feature } from "./patch";

/** Tile kinds in the road map's red channel. */
export const ROAD = { none: 0, alongZ: 1, alongX: 2, junction: 3, plain: 4 } as const;
/** Alpha bits: a junction one tile back or ahead along the road, or two. */
const NEAR_BACK = 1, NEAR_AHEAD = 2, NEXT_BACK = 4, NEXT_AHEAD = 8;

/**
 * The road map for a map's ground level. `surface(x, y)` says what the
 * ground tile is paved with ("road" for marked roads, "plain" for asphalt
 * without markings, null for anything else).
 */
export function roadMap(m: BattleMap, surface: (x: number, y: number) => "road" | "plain" | null): THREE.DataTexture {
  const data = new Uint8Array(m.w * m.h * 4);
  const road = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && surface(x, y) === "road";
  const run = (x: number, y: number, dx: number, dy: number) => {
    let n = 0;
    while (road(x + dx * (n + 1), y + dy * (n + 1))) n++;
    return n;
  };
  // A strip is long one way and a few tiles wide the other.
  const LONG = 4;
  const kind = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const i = (y * m.w + x) * 4;
      const s = surface(x, y);
      if (!s) continue;
      if (s === "plain") {
        kind[y * m.w + x] = data[i] = ROAD.plain;
        continue;
      }
      const left = run(x, y, -1, 0), right = run(x, y, 1, 0), up = run(x, y, 0, -1), down = run(x, y, 0, 1);
      const rx = left + right + 1, ry = up + down + 1;
      let k: number = ROAD.plain;
      if (rx > LONG && ry > LONG) k = ROAD.junction;
      else if (ry > LONG) (k = ROAD.alongZ), (data[i + 1] = x - left), (data[i + 2] = rx);
      else if (rx > LONG) (k = ROAD.alongX), (data[i + 1] = y - up), (data[i + 2] = ry);
      kind[y * m.w + x] = data[i] = k;
    }
  // Junctions close by, along the road.
  const junction = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && kind[y * m.w + x] === ROAD.junction;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const k = kind[y * m.w + x];
      if (k !== ROAD.alongZ && k !== ROAD.alongX) continue;
      const [dx, dy] = k === ROAD.alongZ ? [0, 1] : [1, 0];
      let f = 0;
      if (junction(x - dx, y - dy)) f |= NEAR_BACK;
      if (junction(x + dx, y + dy)) f |= NEAR_AHEAD;
      // Two away: only where the tile between isn't a junction already (a junction is several tiles wide).
      if (!(f & NEAR_BACK) && junction(x - 2 * dx, y - 2 * dy)) f |= NEXT_BACK;
      if (!(f & NEAR_AHEAD) && junction(x + 2 * dx, y + 2 * dy)) f |= NEXT_AHEAD;
      data[(y * m.w + x) * 4 + 3] = f;
    }
  const tex = new THREE.DataTexture(data, m.w, m.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const empty = new THREE.DataTexture(new Uint8Array(4), 1, 1);
empty.needsUpdate = true;
const uniforms = { rdMap: { value: empty as THREE.Texture } };

/** Hands the shader the current map's road map (null: none). */
export function setRoadMap(tex: THREE.Texture | null) {
  uniforms.rdMap.value = tex ?? empty;
}

export const ROAD_SURFACE: Feature = {
  name: "road",
  uniforms,
  decl: /* glsl */ `
uniform sampler2D rdMap;
`,
  color: /* glsl */ `
vec3 rdT, rdB; vec2 rdUv;
sFrame(vWN, vWPos, rdT, rdB, rdUv);
float rdH = 0.0;     // relief, metres (cracks down, paint up), for the normal step
float rdPaint = 0.0; // paint cover, for roughness
{
  vec2 p = vWPos.xz;
  ivec2 tc = clamp(ivec2(floor(p / S_TILE)), ivec2(0), textureSize(rdMap, 0) - 1);
  vec4 info = texelFetch(rdMap, tc, 0) * 255.0;
  int kind = int(info.r + 0.5);
  int flags = int(info.a + 0.5);
  float start = info.g * S_TILE, width = info.b * S_TILE;
  bool marked = kind == 1 || kind == 2;
  // Across the road from its near edge, and along it (metres).
  float across = kind == 1 ? p.x - start : p.y - start;
  float along = kind == 1 ? p.y : p.x;
  float inTile = mod(along, S_TILE);
  // A pixel's size on the ground (metres), from the continuous position: the
  // markings and patches are built per tile and per cell, and jump at the joins.
  float px = length(fwidth(p)) * 0.7 + 1e-5;

  vec3 base = diffuseColor.rgb;
  vec3 col = base * (0.84 + 0.3 * sFbm(p * 0.11, 3));

  // Wheel tracks (lighter, polished) and the oil line down the middle of each lane.
  if (marked) {
    float lane = fract(across / (width * 0.5)) - 0.5;
    float track = smoothstep(0.1, 0.18, abs(lane)) * (1.0 - smoothstep(0.3, 0.4, abs(lane)));
    float oil = (1.0 - smoothstep(0.02, 0.12, abs(lane))) * smoothstep(0.45, 0.75, sNoise(vec2(along * 0.7, across * 3.0) + 50.0));
    col *= (1.0 + 0.07 * track) * (1.0 - 0.3 * oil);
  }

  // Repairs: rectangles of newer, darker asphalt with sealed seams.
  vec2 rc = p / vec2(3.7, 2.9);
  vec2 cell = floor(rc), f = fract(rc);
  float repaired = step(sHash(cell + 3.3), 0.16);
  vec2 lo = 0.1 + 0.3 * sHash2(cell + 9.1), hi = min(lo + 0.3 + 0.35 * sHash2(cell + 4.7), vec2(0.95));
  float edge = min(min(f.x - lo.x, hi.x - f.x) * 3.7, min(f.y - lo.y, hi.y - f.y) * 2.9);
  float inPatch = repaired * sStepPx(edge, px);
  col = mix(col, base * 0.74, inPatch);
  col *= 1.0 - 0.4 * repaired * sLinePx(edge, 0.05, px);

  // Aggregate: grit, and the odd pale stone, faded out before they'd shimmer.
  vec2 g = p * 26.0;
  float grit = (sNoise(g) - 0.5) * sFade(g.x);
  vec3 st = sCells(p * 12.0);
  float stone = (1.0 - smoothstep(0.12, 0.22, st.x)) * step(0.75, st.z) * sFade(p.x * 12.0);
  col *= 1.0 + 0.2 * grit + 0.25 * stone;
  rdH += (grit * 0.6 + stone) * 0.0015;

  // Markings.
  if (marked && vWN.y > 0.5) {
    bool nearJ = (flags & 3) != 0, nextJ = (flags & 12) != 0;
    if (nearJ) {
      // Zebra: bars along the traffic, half a metre wide and apart, kept in from the ends of the tile and the kerbs.
      float bar = sStepPx(0.25 - abs(fract(across) - 0.5), px);
      float ends = sStepPx(min(inTile, S_TILE - inTile) - 0.15, px);
      float kerbs = sStepPx(min(across, width - across) - 0.3, px);
      rdPaint = bar * ends * kerbs;
    } else {
      // Centre line: dashed (3 m on, 3 m off), solid on the approach to a junction.
      float dash = nextJ ? 1.0 : sStepPx(abs(fract(along / 6.0) - 0.5) * 6.0 - 1.5, px);
      float centre = sLinePx(across - width * 0.5, 0.12, px) * dash;
      float edges = sLinePx(across - 0.35, 0.12, px) + sLinePx(across - (width - 0.35), 0.12, px);
      rdPaint = max(centre, edges);
      if (nextJ) {
        // Stop line before the crossing, across the inbound lane (traffic keeps right).
        bool ahead = (flags & 8) != 0;
        float at = ahead ? S_TILE - 0.3 : 0.3;
        bool upper = (kind == 1) != ahead;
        float lane = upper ? sStepPx(across - width * 0.5 - 0.1, px) * sStepPx(width - 0.3 - across, px) : sStepPx(width * 0.5 - 0.1 - across, px) * sStepPx(across - 0.3, px);
        rdPaint = max(rdPaint, sLinePx(inTile - at, 0.3, px) * lane);
      }
    }
    // Worn: the paint thins in patches, and the stones show through.
    rdPaint *= (0.5 + 0.5 * smoothstep(0.25, 0.6, sFbm(p * 1.8 + 80.0, 3))) * (1.0 - 0.4 * stone);
    col = mix(col, vec3(0.74, 0.74, 0.69), rdPaint);
    rdH += rdPaint * 0.002;
  }

  // Cracks, through the paint: long wandering ones in patches, and fatigue cracking in worn areas.
  vec2 w = p * 0.32 + vec2(sNoise(p * 0.45), sNoise(p * 0.45 + 7.0)) * 0.9;
  float longCrack = sLine(sFbm(w, 3) - 0.5, 0.006) * smoothstep(0.5, 0.65, sNoise(p * 0.07 + 21.0));
  vec3 al = sCells(p * 2.4);
  float fatigue = sLine(al.y, 0.012) * smoothstep(0.62, 0.78, sNoise(p * 0.22 + 33.0));
  float crack = max(longCrack, fatigue) * (1.0 - inPatch);
  col *= 1.0 - 0.65 * crack;
  rdH -= crack * 0.01;

  diffuseColor.rgb = col;
}
`,
  normal: /* glsl */ `
{
  // Relief from the screen-space slope of the height: solve for its slope along the face.
  vec2 dux = dFdx(rdUv), duy = dFdy(rdUv);
  float dhx = dFdx(rdH), dhy = dFdy(rdH);
  float det = dux.x * duy.y - dux.y * duy.x;
  if (abs(det) > 1e-10) {
    vec2 grad = vec2(dhx * duy.y - dhy * dux.y, dux.x * dhy - duy.x * dhx) / det;
    normal = sBump(vWN, rdT, rdB, clamp(grad, -2.0, 2.0));
  }
  roughnessFactor = mix(roughnessFactor, 0.55, rdPaint);
}
`,
};

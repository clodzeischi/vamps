// Masonry other than brick (brick.ts): plaster or render, cut stone in
// courses (ashlar), raw rock, and carved stone (graves, pillars, altars).
// World space.
import { BRICK_LIB } from "./brick";
import type { Feature } from "./patch";

/**
 * Plaster: a stucco texture, mottled; damp rising at the foot of each storey
 * with a tide line; streaks of dirt; hairline cracks; and patches where it
 * has fallen away to show the brick behind (recessed).
 */
export const PLASTER: Feature = {
  name: "plaster",
  bump: 1,
  decl: BRICK_LIB,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  float stucco = sFbm(sUV * 11.0, 4);
  float det = sFade(sUV.x * 11.0);
  vec3 col = base * (0.9 + 0.18 * sFbm(sUV * 0.7, 3)) * (0.95 + 0.12 * (stucco - 0.5) * det);
  // Damp: darker below a wavering tide line at the foot of the wall.
  float tide = 0.3 + 0.35 * sFbm(vec2(sUV.x * 0.7, 3.0), 3);
  float damp = 1.0 - smoothstep(tide - 0.06, tide + 0.01, sGroundY);
  col *= 1.0 - 0.25 * damp;
  col *= 1.0 - 0.18 * sLine(sGroundY - tide, 0.015);
  // Streaks of dirt running down.
  col *= 1.0 - 0.12 * smoothstep(0.55, 0.85, sNoise(vec2(sUV.x * 2.2, sUV.y * 0.15) + 70.0));
  // Fallen away: brick behind, sunk 1.5 cm, with a pale broken edge.
  float peel = sFbm(sUV * 0.42 + 60.0, 4) + damp * 0.08;
  float bare = sStep(peel - 0.7);
  vec2 bid;
  float bh = bkHeight(sUV, sPx, bid);
  vec3 brick = vec3(0.3, 0.11, 0.065) * (0.75 + 0.5 * sHash(bid));
  brick = mix(vec3(0.24, 0.23, 0.21), brick, smoothstep(0.0005, 0.005, bh));
  col = mix(col, brick, bare);
  col = mix(col, base * 1.12, sLine(peel - 0.7, 0.012) * 0.6);
  // Hairline cracks in places.
  float cr = sLine(sFbm(sUV * 0.8 + vec2(sNoise(sUV * 1.7)), 3) - 0.5, 0.0025) * smoothstep(0.5, 0.7, sNoise(sUV * 0.25 + 5.0)) * (1.0 - bare);
  col *= 1.0 - 0.55 * cr;
  diffuseColor.rgb = col;
  sH = (stucco - 0.5) * 0.002 * det * (1.0 - bare) + bare * (bh - 0.015) - cr * 0.002;
}
`,
};

interface StoneLook {
  name: string;
  /** Course height; block width range; joint (metres). */
  rowH: number;
  minW: number;
  maxW: number;
  joint: number;
  /** How rough (pitched) the faces are (0..1). */
  rough: number;
  /** Lichen and moss (0..1). */
  growth: number;
}

const f = (x: number) => x.toFixed(4);

/**
 * Ashlar: cut stone in courses, each block its own tone, faces dressed
 * rough with a smoother margin, mortar joints; lichen spots and moss low
 * down and in the joints.
 */
export function ashlar(o: StoneLook): Feature {
  return {
    name: o.name,
    bump: 1,
    color: /* glsl */ `
{
  vec2 id, loc, size;
  sRows(sUV, ${f(o.rowH)}, ${f(o.minW)}, ${f(o.maxW)}, id, loc, size);
  float e = sInside(loc, size, ${f(o.joint)});
  float face = sStepPx(e, sPx);
  vec3 base = diffuseColor.rgb;
  float h1 = sHash(id + 2.1);
  vec3 stone = base * (0.82 + 0.36 * h1) * vec3(1.0 + (sHash(id + 4.4) - 0.5) * 0.08, 1.0, 1.0 - (sHash(id + 4.4) - 0.5) * 0.08);
  // Dressed face: pitched in the middle, a smoother margin round the edge.
  float margin = smoothstep(0.02, 0.05, e);
  float pitch = sFbm(sUV * 6.0 + id * 9.0, 4) * margin * ${f(o.rough)};
  stone *= 0.92 + 0.2 * pitch + 0.1 * (sFbm(sUV * 1.5 + id, 3) - 0.5);
  vec2 g = sUV * 50.0;
  float grain = (sNoise(g) - 0.5) * sFade(g.x);
  stone *= 1.0 + 0.15 * grain;
  // Growth: lichen spots (pale grey-green, some ochre), moss low down and in joints.
  // Lichen: small, ragged rosettes, a few per block.
  vec3 lc = sCells(sUV * 5.0 + 7.0);
  float lichen = ${f(o.growth)} * step(0.8, lc.z) * (1.0 - smoothstep(0.04, 0.12 + 0.12 * sNoise(sUV * 30.0), lc.x)) * sFade(sUV.x * 20.0);
  stone = mix(stone, fract(lc.z * 13.0) > 0.7 ? vec3(0.36, 0.26, 0.08) : vec3(0.32, 0.34, 0.27), lichen * 0.55);
  float low = (1.0 - smoothstep(0.0, 0.6, sGroundY)) * (1.0 - step(0.5, abs(sN.y)));
  float moss = ${f(o.growth)} * smoothstep(0.45, 0.75, sNoise(sUV * 4.0 + 3.0) + low * 0.3);
  vec3 mortar = mix(vec3(0.27, 0.26, 0.24), vec3(0.035, 0.05, 0.02), moss);
  vec3 col = mix(mortar, stone, face);
  col = mix(col, vec3(0.04, 0.06, 0.022) * (0.8 + 0.4 * sNoise(sUV * 25.0)), moss * low * 0.8 * face);
  diffuseColor.rgb = col;
  sH = smoothstep(0.0, max(0.01, sPx * 3.0), e) * (0.008 + grain * 0.001 + pitch * 0.012);
}
`,
  };
}

/** Stone walls: chapel, castle, cellar. */
export const ASHLAR = ashlar({ name: "ashlar", rowH: 0.32, minW: 0.38, maxW: 0.85, joint: 0.014, rough: 1, growth: 0.45 });
/** Copings and parapets: long, smoother blocks. */
export const COPING = ashlar({ name: "coping", rowH: 0.25, minW: 0.6, maxW: 1.1, joint: 0.01, rough: 0.4, growth: 0.6 });

/**
 * Rock: raw stone with no courses, domain-warped and deeply rough, bedded in
 * layers on walls, cracked, damp in hollows. Catacomb walls, crags, rubble.
 */
export const ROCK: Feature = {
  name: "rock",
  bump: 1.6,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  vec2 w = sUV * 0.7 + vec2(sFbm(sUV * 0.45, 3), sFbm(sUV * 0.45 + 9.0, 3)) * 1.6;
  float n = sFbm(w * 2.2, 5);
  float beds = sin(sP.y * 7.0 + sFbm(sUV * 0.35, 2) * 5.0) * 0.5 + 0.5;
  float bedW = abs(sN.y) < 0.5 ? 1.0 : 0.0;
  vec3 col = base * (0.7 + 0.6 * n);
  col *= 1.0 - 0.12 * beds * bedW;
  col *= vec3(1.0 + (sFbm(sUV * 0.2, 2) - 0.5) * 0.2, 1.0, 1.0 - (sFbm(sUV * 0.2, 2) - 0.5) * 0.2);
  vec2 g = sUV * 40.0;
  float grit = (sNoise(g) - 0.5) * sFade(g.x);
  col *= 1.0 + 0.2 * grit;
  float crack = sLine(sFbm(w * 1.3 + 40.0, 3) - 0.5, 0.004);
  col *= 1.0 - 0.35 * crack;
  // Damp in the hollows: darker, a little glossier (see normal step).
  float hollow = 1.0 - smoothstep(0.3, 0.5, n);
  col *= 1.0 - 0.25 * hollow;
  diffuseColor.rgb = col;
  sH = n * 0.06 + beds * bedW * 0.012 + grit * 0.0015 - crack * 0.01;
}
`,
  normal: /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.6, 1.0 - smoothstep(0.3, 0.5, sH / 0.06));
`,
};

/**
 * Carved stone: fine-grained, flecked (granite-like), weathered darker in
 * patches, with lichen on what faces the sky and moss at the foot. Graves,
 * pillars, sarcophagi, the altar.
 */
export const CARVED: Feature = {
  name: "carved",
  bump: 1,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  vec3 col = base * (0.88 + 0.24 * sFbm(sUV * 1.2, 3));
  vec3 fl = sCells(sUV * 70.0);
  float fd = sFade(sUV.x * 70.0);
  float fleck = (1.0 - smoothstep(0.2, 0.45, fl.x)) * fd;
  col *= 1.0 + fleck * (fl.z > 0.6 ? 0.35 : fl.z < 0.25 ? -0.45 : 0.0);
  col *= 1.0 - 0.3 * smoothstep(0.55, 0.85, sFbm(sUV * 0.8 + 20.0, 4));
  float up = smoothstep(0.3, 0.9, sN.y);
  vec3 lc = sCells(sUV * 7.0 + 3.0);
  float lichen = (0.3 + 0.7 * up) * step(0.75, lc.z) * (1.0 - smoothstep(0.04, 0.12 + 0.12 * sNoise(sUV * 35.0), lc.x)) * sFade(sUV.x * 28.0);
  col = mix(col, fract(lc.z * 11.0) > 0.6 ? vec3(0.38, 0.27, 0.07) : vec3(0.33, 0.35, 0.28), lichen * 0.6);
  // Moss at the foot, on the sides only.
  float moss = (1.0 - smoothstep(0.0, 0.3, sGroundY)) * (1.0 - step(0.5, abs(sN.y))) * smoothstep(0.45, 0.7, sNoise(sUV * 8.0));
  col = mix(col, vec3(0.04, 0.06, 0.022), moss * 0.8);
  diffuseColor.rgb = col;
  sH = fleck * 0.0004 + lichen * 0.0008 + moss * 0.002;
}
`,
};

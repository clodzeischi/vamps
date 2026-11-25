// Wood: boards with grain, knots, gaps and end joints. One factory, tuned
// per use: floorboards, barn and shed planking (boards stand upright on
// walls), crates, furniture, fences; in the world or on an object (rifle
// stocks, crates carried).
import type { Feature } from "./patch";

interface WoodLook {
  name: string;
  /** Board width and length (0: one long board), and the gap between boards (metres). */
  board: number;
  length: number;
  gap: number;
  /** Boards stand upright on walls (barn planking); otherwise they lie along the face. */
  upright: boolean;
  /** Spread of tone between boards (0..0.5). */
  vary: number;
  /** Weathered: silvered grey, checked along the grain (0..1). */
  weather: number;
  /** Knots: the share of boards with one. */
  knots: number;
}

const f = (x: number) => x.toFixed(4);

export function wood(o: WoodLook): Feature {
  return {
    name: o.name,
    bump: 1,
    color: /* glsl */ `
{
  bool wdWall = abs(sN.y) < 0.5;
  // q.x along the board, q.y across the boards.
  vec2 q = (${o.upright} && wdWall) ? vec2(sUV.y, sUV.x) : sUV;
  float across = q.y / ${f(o.board)};
  float bi = floor(across);
  float aIn = fract(across) * ${f(o.board)};
  float along = q.x + sHash(vec2(bi, 3.1)) * 7.0;
  float len = ${f(o.length)};
  float seg = len > 0.0 ? floor(along / len) : 0.0;
  float lIn = len > 0.0 ? along - seg * len : 1.0;
  vec2 id = vec2(bi, seg);
  float h1 = sHash(id), h2 = sHash(id + 5.7), h3 = sHash(id + 11.3);
  vec3 base = diffuseColor.rgb;
  // Grain: growth rings seen edge-on, lines along the board that waver.
  float warp = sFbm(vec2(along * 0.22, aIn * 4.0) + id * 13.0, 3);
  float ringX = aIn * 30.0 + warp * 5.0 + h2 * 9.0;
  float ring = fract(ringX);
  float late = (smoothstep(0.0, 0.2, ring) - smoothstep(0.45, 0.9, ring)) * sFadeAt(30.0, sPx);
  float fibre = (sNoise(vec2(along * 3.0, aIn * 260.0)) - 0.5) * sFadeAt(260.0, sPx);
  vec3 col = base * (1.0 - ${f(o.vary)} + 2.0 * ${f(o.vary)} * h1);
  col *= 1.0 - 0.22 * late;
  col *= 1.0 + 0.18 * fibre;
  col *= 0.9 + 0.2 * sFbm(vec2(along * 0.6, aIn * 6.0) + id * 7.0, 2);
  // A knot on some boards: a dark eye, the grain darker round it.
  float kc = (len > 0.0 ? len : 2.0) * (0.2 + 0.6 * h3);
  float kl = len > 0.0 ? lIn : mod(along, 2.0);
  vec2 kd = vec2((kl - kc) / 0.045, (aIn - ${f(o.board)} * (0.25 + 0.5 * h2)) / 0.022);
  float knot = step(h3, ${f(o.knots)}) * (1.0 - smoothstep(0.6, 1.0, length(kd)));
  float halo = step(h3, ${f(o.knots)}) * (1.0 - smoothstep(1.0, 3.0, length(kd)));
  col = mix(col * (1.0 - 0.25 * halo), base * 0.35, knot);
  // Weather: silvered grey in patches, checks along the grain.
  float wx = ${f(o.weather)} * (0.6 + 0.4 * sFbm(q * 0.8 + 3.0, 3));
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  col = mix(col, vec3(lum * 0.9 + 0.06), wx);
  float check = ${f(o.weather)} * sLine(sNoise(vec2(along * 1.3, aIn * 70.0) + id) - 0.5, 0.03) * step(0.5, h2);
  col *= 1.0 - 0.5 * check;
  // Gaps between boards, and butt joints at their ends.
  float e = min(aIn, ${f(o.board)} - aIn);
  float eL = len > 0.0 ? min(lIn, len - lIn) : 1.0;
  float gapA = sLinePx(e, ${f(o.gap)}, sPx), gapL = sLinePx(eL, ${f(o.gap)} * 0.8, sPx);
  col *= 1.0 - 0.75 * max(gapA, gapL);
  diffuseColor.rgb = col;
  // Relief fades to 0 at every board's edge: per-board detail must not jump across a joint (the normal is taken from screen-space slopes).
  sH = smoothstep(0.0, max(0.004, sPx * 3.0), min(e, eL)) * (0.003 + fibre * 0.0004 - late * 0.0003 - check * 0.001 + knot * 0.0005);
}
`,
  };
}

/** Indoor floorboards: long, narrow, varnished honey to brown. */
export const FLOORBOARDS = wood({ name: "floorboards", board: 0.14, length: 2.4, gap: 0.004, upright: false, vary: 0.14, weather: 0, knots: 0.25 });
/** Barn and shed planking: wide upright boards, grey with weather. */
export const BARN_BOARDS = wood({ name: "barnboards", board: 0.22, length: 0, gap: 0.012, upright: true, vary: 0.12, weather: 0.6, knots: 0.35 });
/** Crates and pallets: rough sawn boards. */
export const CRATE_WOOD = wood({ name: "crate", board: 0.12, length: 0, gap: 0.01, upright: false, vary: 0.18, weather: 0.15, knots: 0.4 });
/** Furniture, pews, stairs: planed, darker, little weather. */
export const FURNITURE_WOOD = wood({ name: "furniture", board: 0.18, length: 0, gap: 0.003, upright: false, vary: 0.08, weather: 0, knots: 0.15 });
/** Fences: weathered rails. */
export const FENCE_WOOD = wood({ name: "fence", board: 0.15, length: 0, gap: 0.03, upright: false, vary: 0.15, weather: 0.75, knots: 0.3 });
/** On a model (stocks, grips, carried crates): fine, oiled grain. */
export const MODEL_WOOD = wood({ name: "modelwood", board: 0.06, length: 0, gap: 0.0, upright: false, vary: 0.05, weather: 0, knots: 0.1 });

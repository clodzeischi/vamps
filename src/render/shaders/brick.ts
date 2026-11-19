// Brick: running bond at real size (21.5 × 6.5 cm bricks, 1 cm joints),
// painted per pixel on any face, projected from the world (no UVs).
//
// * Colour: the material colour is the clay; each brick varies in tone, some
//   are warmer, the odd one over-burnt and dark; faces are mottled; joints
//   are mortar. Grime gathers at the foot of each storey, and faint streaks
//   run down.
// * Relief: a height field (brick faces 8 mm proud of the mortar, 6 mm
//   bevels, a slightly rough face) whose slope tilts the normal: a
//   procedural normal map, worked out from the same function per pixel.
// * Far away, where a course is under a few pixels tall, the pattern and the
//   relief fade to the brick-and-mortar average, so it never shimmers.
import type { Feature } from "./patch";

/** The brick height function, shared with plaster (brick shows where it peels). */
export const BRICK_LIB = /* glsl */ `
const vec2 BK_SIZE = vec2(0.215, 0.065);
const float BK_JOINT = 0.010;
const vec2 BK_MODULE = BK_SIZE + BK_JOINT;

// The wall's height at uv (metres, along the face and up): 0 in a joint, 8 mm
// on a brick's face, bevelled at its edges. id: which brick.
float bkHeight(vec2 uv, out vec2 id) {
  float row = floor(uv.y / BK_MODULE.y);
  float x = uv.x + mod(row, 2.0) * BK_MODULE.x * 0.5;
  id = vec2(floor(x / BK_MODULE.x), row);
  vec2 l = vec2(mod(x, BK_MODULE.x), mod(uv.y, BK_MODULE.y));
  vec2 e = min(l, BK_MODULE - l) - BK_JOINT * 0.5;
  float face = smoothstep(0.0, 0.006, min(e.x, e.y));
  float rough = (sNoise(uv * 95.0 + id * 7.0) - 0.5) * 0.0012;
  return face * (0.008 + rough);
}
`;

export const BRICK: Feature = {
  name: "brick",
  decl: BRICK_LIB,
  color: /* glsl */ `
vec3 bkT, bkB; vec2 bkUv;
sFrame(vWN, vWPos, bkT, bkB, bkUv);
vec2 bkId;
float bkH0 = bkHeight(bkUv, bkId);
// 1 while a course is several pixels tall.
float bkDetail = sFade(bkUv.y / BK_MODULE.y);
{
  vec3 clay = diffuseColor.rgb;
  float h1 = sHash(bkId), h2 = sHash(bkId + 17.0);
  vec3 brick = clay * (0.8 + 0.4 * h1);
  brick *= mix(vec3(1.0), vec3(1.1, 0.93, 0.84), step(0.8, h2));
  brick = mix(brick, clay * 0.5, step(0.94, h2));
  brick *= 0.88 + 0.24 * sNoise(bkUv * 38.0 + bkId * 3.1);
  vec3 mortar = vec3(0.30, 0.285, 0.26);
  vec3 col = mix(mortar, brick, smoothstep(0.0005, 0.005, bkH0));
  // Far off: the average of brick and mortar (bricks cover 83% of the wall).
  col = mix(mix(mortar, clay, 0.83), col, bkDetail);
  // Grime: darker at the foot of each storey, and streaks running down.
  float levelY = mod(vWPos.y, S_LEVEL);
  float grime = (1.0 - smoothstep(0.1, 0.8, levelY)) * 0.28
    + smoothstep(0.55, 0.85, sNoise(vec2(bkUv.x * 1.6, bkUv.y * 0.12) + 40.0)) * 0.14;
  diffuseColor.rgb = col * (1.0 - grime);
}
`,
  normal: /* glsl */ `
{
  // The height's slope from two more samples a couple of millimetres along and up.
  const float e = 0.002;
  vec2 bkTmp;
  float hx = bkHeight(bkUv + vec2(e, 0.0), bkTmp);
  float hy = bkHeight(bkUv + vec2(0.0, e), bkTmp);
  normal = sBump(vWN, bkT, bkB, vec2(hx - bkH0, hy - bkH0) / e * bkDetail);
}
`,
};

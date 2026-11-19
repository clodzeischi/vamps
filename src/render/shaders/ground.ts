// Open ground: grass and dirt. World space, top faces mostly.
import type { Feature } from "./patch";

/**
 * Grass: drier and lusher patches, clumps of darker clover, tufts, short
 * blades as a fine speckle, bare earth breaking through, the odd daisy.
 */
export const GRASS: Feature = {
  name: "grass",
  bump: 1.8,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  float lush = sFbm(sUV * 0.13, 3);
  vec3 col = mix(base * vec3(1.18, 1.1, 0.72), base * vec3(0.82, 1.06, 0.92), lush);
  col *= 0.85 + 0.3 * sFbm(sUV * 0.55 + 4.0, 3);
  // Tufts: little domes, lighter at their tips.
  vec3 tuft = sCells(sUV * 7.0);
  float tufts = (1.0 - smoothstep(0.1, 0.6, tuft.x)) * sFade(sUV.x * 7.0);
  col *= 0.9 + 0.22 * tufts * (0.6 + 0.4 * tuft.z);
  // Blades: fine speckle, faded out before it shimmers.
  vec2 g = sUV * 38.0;
  float blades = (sNoise(g) - 0.5) * sFade(g.x);
  col *= 1.0 + 0.3 * blades;
  // Bare earth in patches, with a ragged edge.
  float bareN = sFbm(sUV * 0.3 + 31.0, 4);
  float bare = smoothstep(0.74, 0.8, bareN);
  col = mix(col, vec3(0.16, 0.12, 0.075) * (0.85 + 0.3 * sNoise(sUV * 5.0)), bare * 0.75);
  // Worn thin round the bare patches.
  col *= 1.0 - 0.1 * smoothstep(0.66, 0.74, bareN) * (1.0 - bare);
  // Daisies: a rare white dot with a yellow eye.
  vec3 fl = sCells(sUV * 3.0 + 9.0);
  float daisy = step(0.965, fl.z) * (1.0 - smoothstep(0.03, 0.05, fl.x)) * sFade(sUV.x * 3.0 * 6.0) * (1.0 - bare);
  col = mix(col, fl.x < 0.015 ? vec3(0.8, 0.6, 0.05) : vec3(0.8), daisy);
  diffuseColor.rgb = col;
  sH = (tufts * 0.012 + blades * 0.006) * (1.0 - bare);
}
`,
};

/**
 * Dirt: earth with a crumbly tone, damp darker patches, pebbles of
 * different colours (raised), and tyre or cart ruts where it's a track.
 */
export const DIRT: Feature = {
  name: "dirt",
  bump: 1.8,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  vec3 col = base * (0.8 + 0.4 * sFbm(sUV * 0.4, 4));
  float crumbs = (sFbm(sUV * 9.0, 3) - 0.5) * sFade(sUV.x * 9.0);
  col *= 1.0 + 0.35 * crumbs;
  float damp = smoothstep(0.55, 0.8, sFbm(sUV * 0.3 + 12.0, 3));
  col *= 1.0 - 0.3 * damp;
  // Pebbles: round, a few colours, raised.
  vec3 pb = sCells(sUV * 9.0);
  float r = 0.07 + 0.14 * fract(pb.z * 31.0);
  float stone = step(0.78, pb.z) * (1.0 - smoothstep(r * 0.6, r, pb.x)) * sFade(sUV.x * 9.0);
  vec3 pc = base * mix(vec3(0.75, 0.78, 0.82), vec3(1.15, 1.0, 0.85), fract(pb.z * 7.0));
  col = mix(col, pc * (0.8 + 0.3 * sNoise(sUV * 60.0)), stone);
  diffuseColor.rgb = col;
  sH = crumbs * 0.006 + stone * (r - pb.x) * 0.06 - damp * 0.003;
}
`,
};

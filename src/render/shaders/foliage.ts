// Plants: leaves (tree crowns, hedges), bark, hay. World space.
import type { Feature } from "./patch";

const f = (x: number) => x.toFixed(4);

/**
 * Leaves: overlapping clusters (cells), each its own shade, lit on top and
 * dark in the gaps between them; a finer layer of single leaves; the
 * underside in shadow; sun-yellowed patches. `size`: clusters a metre.
 */
export function leaves(name: string, size: number): Feature {
  return {
    name,
    bump: 1.4,
    color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  // Warped, so clusters wander instead of sitting in a grid.
  vec2 q = sUV * ${f(size)};
  q += vec2(sFbm(q * 0.35, 3), sFbm(q * 0.35 + 7.0, 3)) * 1.4;
  vec3 c1 = sCells(q);
  vec3 c2 = sCells(q * 2.7 + 17.0);
  float d1 = sFade(q.x), d2 = sFade(q.x * 2.7);
  // Clusters: lit crowns, shaded on one side (the sun is up and to the side).
  float dome1 = 1.0 - smoothstep(0.0, 0.9, c1.x);
  float dome2 = 1.0 - smoothstep(0.0, 0.75, c2.x);
  vec3 col = base * mix(1.0, 0.75 + 0.5 * c1.z, d1);
  col *= mix(1.0, 0.7 + 0.45 * dome1, d1);
  col = mix(col, base * vec3(1.15, 1.22, 0.82) * (0.8 + 0.4 * c2.z), dome2 * 0.35 * d2);
  // Holes: deep shade where the foliage thins, in patches, not round every cluster.
  float hole = smoothstep(0.62, 0.78, sFbm(q * 0.55 + 3.0, 3)) * (1.0 - dome1 * 0.6);
  col *= 1.0 - 0.6 * hole * d1;
  col *= mix(0.5, 1.05, smoothstep(-0.8, 0.7, sN.y));
  col *= mix(vec3(1.0), vec3(1.18, 1.05, 0.65), smoothstep(0.55, 0.8, sFbm(sUV * 0.5, 3)) * 0.5);
  diffuseColor.rgb = col;
  sH = (dome1 * 0.04 * d1 + dome2 * 0.015 * d2) * (1.0 - hole);
}
`,
  };
}

export const TREE_LEAVES = leaves("leaves", 4.0);
export const HEDGE_LEAVES = leaves("hedge", 7.0);

/** Bark: deep vertical furrows, ridges catching the light, moss on one side. */
export const BARK: Feature = {
  name: "bark",
  bump: 1.5,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  float r = sFbm(vec2(sUV.x * 16.0, sUV.y * 1.6), 4);
  float furrow = smoothstep(0.35, 0.6, r);
  vec3 col = base * (0.5 + 0.8 * furrow);
  col *= 0.9 + 0.2 * sNoise(vec2(sUV.x * 40.0, sUV.y * 8.0));
  float moss = smoothstep(0.2, 0.9, sN.z) * smoothstep(0.4, 0.7, sNoise(sUV * 3.0));
  col = mix(col, vec3(0.06, 0.1, 0.03), moss * 0.7);
  diffuseColor.rgb = col;
  sH = furrow * 0.012;
}
`,
};

/** Hay: straw in fibres along the bale, golden with paler and greyer strands. */
export const HAY: Feature = {
  name: "hay",
  bump: 1,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  vec2 q = abs(sN.y) > 0.5 ? sUV : vec2(sUV.x, sUV.y);
  float s1 = sNoise(vec2(q.x * 3.0, q.y * 90.0)) * sFade(q.y * 90.0);
  float s2 = sNoise(vec2(q.x * 5.0 + 3.0, q.y * 40.0 + q.x * 6.0)) * sFade(q.y * 40.0);
  vec3 col = base * (0.75 + 0.45 * s1) * (0.85 + 0.3 * s2);
  col = mix(col, col * vec3(0.8, 0.8, 0.75), smoothstep(0.6, 0.8, sFbm(q * 1.5, 3)));
  diffuseColor.rgb = col;
  sH = (s1 * 0.6 + s2 * 0.4) * 0.006;
}
`,
};

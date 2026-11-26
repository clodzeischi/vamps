// Soft and synthetic materials for models: cloth, leather, polymer. Object
// space (shadedObject), so the weave rides on the unit.
import type { Feature } from "./patch";

interface ClothLook {
  name: string;
  /** Thread spacing (metres): fine wool ~0.0015, canvas ~0.003. */
  thread: number;
  /** Twill (diagonal ribs) rather than plain weave. */
  twill: boolean;
  /** Velvet: a soft sheen at grazing angles (0..1). */
  sheen: number;
  /** Wear and dust (0..1). */
  wear: number;
}

const f = (x: number) => x.toFixed(4);

/**
 * Cloth: woven threads (plain or twill) with a slubbed yarn, broad soft folds
 * and creases, wear lighter where it rubs, dust; velvet sheen if asked.
 */
export function cloth(o: ClothLook): Feature {
  return {
    name: o.name,
    bump: 1,
    color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  vec2 t = sUV / ${f(o.thread)};
  float det = sFade(t.x);
  float warp = sin(t.x * 3.14159) * 0.5 + 0.5, weft = sin(t.y * 3.14159) * 0.5 + 0.5;
  float over = ${o.twill} ? step(0.5, fract((floor(t.x) + floor(t.y)) / 4.0)) : step(0.5, fract((floor(t.x) + floor(t.y)) / 2.0));
  float weave = mix(weft, warp, over);
  float slub = sNoise(vec2(t.x * 0.05, t.y * 0.5)) * 0.5 + sNoise(vec2(t.x * 0.5, t.y * 0.05)) * 0.5;
  // Folds: soft, long, mostly hanging down; creases finer.
  float folds = sFbm(vec2(sUV.x * 5.0, sUV.y * 1.2), 3);
  vec3 col = base * (1.0 + (weave - 0.5) * 0.25 * det + (slub - 0.5) * 0.12 * det);
  col *= 0.85 + 0.3 * folds;
  float rub = ${f(o.wear)} * smoothstep(0.6, 0.8, sFbm(sUV * 2.0 + 3.0, 3));
  col = mix(col, col * 1.25 + 0.02, rub);
  col = mix(col, vec3(0.3, 0.27, 0.22), ${f(o.wear)} * 0.25 * smoothstep(0.55, 0.85, sFbm(sUV * 1.3 + 9.0, 3)));
  diffuseColor.rgb = col;
  sH = (weave - 0.5) * ${f(o.thread)} * 0.4 * det + folds * 0.01;
}
`,
    light:
      o.sheen > 0
        ? /* glsl */ `
{
  float cosV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  reflectedLight.indirectDiffuse += pow(1.0 - cosV, 3.0) * ${f(o.sheen)} * material.diffuseColor * 1.5;
}
`
        : undefined,
  };
}

/** Cassocks, habits, coats: dense wool twill. */
export const WOOL = cloth({ name: "wool", thread: 0.0018, twill: true, sheen: 0, wear: 0.4 });
/** Tactical kit, bags: coarse canvas, plain weave. */
export const CANVAS = cloth({ name: "canvas", thread: 0.003, twill: false, sheen: 0, wear: 0.6 });
/** Velvet (the elders, vestments): a soft sheen at the edges. */
export const VELVET = cloth({ name: "velvet", thread: 0.001, twill: false, sheen: 0.7, wear: 0.1 });

/** Leather: pebbled grain, creases where it bends, lighter scuffs, a little shine. */
export const LEATHER: Feature = {
  name: "leather",
  bump: 1,
  color: /* glsl */ `
float leScuff = 0.0;
{
  vec3 base = diffuseColor.rgb;
  vec3 pc = sCells(sUV * 450.0);
  float pebble = (1.0 - smoothstep(0.2, 0.7, pc.x)) * sFade(sUV.x * 450.0);
  float crease = sLine(sFbm(sUV * 14.0, 3) - 0.5, 0.012);
  leScuff = smoothstep(0.6, 0.8, sFbm(sUV * 4.0 + 2.0, 3));
  vec3 col = base * (0.85 + 0.3 * sFbm(sUV * 3.0, 3)) * (1.0 + 0.12 * (pebble - 0.5));
  col *= 1.0 - 0.3 * crease;
  col = mix(col, col * 1.4 + 0.02, leScuff * 0.5);
  diffuseColor.rgb = col;
  sH = pebble * 0.0003 - crease * 0.0006;
}
`,
  normal: /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.85, leScuff);
`,
};

/** Polymer (grips, stocks, cases): fine stipple, a satin finish, rubbed smooth in places. */
export const POLYMER: Feature = {
  name: "polymer",
  bump: 1,
  color: /* glsl */ `
float poRub = 0.0;
{
  vec3 base = diffuseColor.rgb;
  vec3 st = sCells(sUV * 600.0);
  float stip = (1.0 - smoothstep(0.1, 0.6, st.x)) * sFade(sUV.x * 600.0);
  poRub = smoothstep(0.6, 0.85, sFbm(sUV * 5.0, 3));
  vec3 col = base * (0.95 + 0.1 * sFbm(sUV * 4.0, 2)) * (1.0 + 0.1 * stip * (1.0 - poRub));
  diffuseColor.rgb = col;
  sH = stip * 0.0002 * (1.0 - poRub);
}
`,
  normal: /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.3, poRub);
`,
};

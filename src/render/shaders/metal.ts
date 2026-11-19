// Metal: painted (cars, bins, lamp posts, the helicopter), gun metal and
// brass (weapons, kit, crucifixes). Painted metal works in the world or on an
// object; gun metal and brass are meant for objects (models).
import type { Feature } from "./patch";

/**
 * There's no environment map in the battlescape, so metal (which shows
 * little but its reflections) would look black. This reflects the sky's
 * ambient light instead: dim at night, bright by day.
 */
export const SKY_SHINE = /* glsl */ `
reflectedLight.indirectSpecular += material.specularColor * irradiance * 0.3;
`;

export interface PaintLook {
  name: string;
  /** Road dirt splashed up from the ground (0..1; world only, needs a floor). */
  dirt: number;
  /** Rust breaking through (0..1). */
  rust: number;
  /** Scratches through to bare metal (0..1). */
  scratch: number;
}

const f = (x: number) => x.toFixed(4);

/**
 * Painted metal: the paint's own colour with a faint mottle; scratches to
 * bright metal; rust blooming in patches (rough, not metallic); road dirt
 * thrown up from the ground. Roughness and metalness follow what's on top.
 */
export function paint(o: PaintLook): Feature {
  return {
    name: o.name,
    bump: 1,
    color: /* glsl */ `
float ptDirt = 0.0, ptRust = 0.0, ptBare = 0.0;
{
  vec3 base = diffuseColor.rgb;
  vec3 col = base * (0.94 + 0.12 * sFbm(sUV * 1.5, 3));
  // Scratches: short thin streaks, mostly one way, to bare metal.
  vec2 sq = vec2(sUV.x * 0.9 + sUV.y * 0.3, sUV.y * 0.9 - sUV.x * 0.3);
  float sn = sNoise(vec2(sq.x * 3.0, sq.y * 110.0));
  ptBare = ${f(o.scratch)} * smoothstep(0.86, 0.93, sn) * smoothstep(0.5, 0.7, sNoise(sUV * 1.2 + 8.0)) * sFade(sq.y * 110.0);
  col = mix(col, vec3(0.42, 0.43, 0.45), ptBare * 0.8);
  // Rust: blooms with a dark rim, orange-brown and pitted.
  float rn = sFbm(sUV * 2.6 + 30.0, 4) + ptBare * 0.2;
  ptRust = ${f(o.rust)} > 0.0 ? smoothstep(0.72 - ${f(o.rust)} * 0.12, 0.76 - ${f(o.rust)} * 0.12, rn) : 0.0;
  vec3 rust = mix(vec3(0.2, 0.07, 0.02), vec3(0.35, 0.14, 0.04), sNoise(sUV * 30.0));
  col = mix(col, rust, ptRust);
  col *= 1.0 - 0.35 * ${f(o.rust)} * sLine(rn - 0.6, 0.02);
  // Dirt splashed up from the road: thick at the bottom, spattered higher.
  float splash = 0.35 + 0.25 * sNoise(sUV * 3.0) + 0.15 * sNoise(sUV * 18.0);
  ptDirt = ${f(o.dirt)} * (1.0 - smoothstep(0.05, splash, sGroundY));
  col = mix(col, vec3(0.13, 0.11, 0.08), ptDirt * 0.85);
  diffuseColor.rgb = col;
  sH = ptRust * (sNoise(sUV * 40.0) * 0.0015 + 0.0008) - ptBare * 0.0003;
}
`,
    normal: /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.95, max(ptDirt, ptRust));
roughnessFactor = mix(roughnessFactor, 0.35, ptBare);
metalnessFactor = mix(metalnessFactor, 0.0, max(ptDirt, ptRust));
metalnessFactor = mix(metalnessFactor, 0.9, ptBare);
`,
    light: SKY_SHINE,
  };
}

export const CAR_PAINT = paint({ name: "carpaint", dirt: 0.7, rust: 0.12, scratch: 0.4 });
export const STREET_METAL = paint({ name: "streetmetal", dirt: 0.5, rust: 0.25, scratch: 0.4 });
export const VEHICLE_PAINT = paint({ name: "vehiclepaint", dirt: 0, rust: 0, scratch: 0.25 });

/**
 * Gun metal: blued or parkerized steel. A fine matte grain, faint machining
 * lines along the part, handling polish where it's touched (smoother,
 * lighter), and smudges that change the shine.
 */
export const GUN_METAL: Feature = {
  name: "gunmetal",
  bump: 1,
  color: /* glsl */ `
float gmPolish = 0.0, gmSmudge = 0.0;
{
  vec3 base = diffuseColor.rgb;
  vec2 g = sUV * 160.0;
  float grain = (sNoise(g) - 0.5) * sFade(g.x);
  float mach = (sNoise(vec2(sUV.x * 4.0, sUV.y * 500.0)) - 0.5) * sFade(sUV.y * 500.0);
  gmPolish = smoothstep(0.5, 0.8, sFbm(sUV * 6.0, 3));
  gmSmudge = smoothstep(0.5, 0.75, sFbm(sUV * 9.0 + 4.0, 3));
  vec3 col = base * (1.0 + 0.25 * grain + 0.15 * mach);
  col = mix(col, base * 2.2 + 0.03, gmPolish * 0.7);
  diffuseColor.rgb = col;
  sH = grain * 0.00015 + mach * 0.0001;
}
`,
  normal: /* glsl */ `
roughnessFactor = clamp(roughnessFactor - 0.25 * gmPolish + 0.2 * gmSmudge, 0.15, 1.0);
`,
  light: SKY_SHINE,
};

/** Brass: warm and bright where handled, tarnished brown and verdigris in the recesses. */
export const BRASS: Feature = {
  name: "brass",
  bump: 1,
  color: /* glsl */ `
float bsTarnish = 0.0;
{
  vec3 base = diffuseColor.rgb;
  bsTarnish = smoothstep(0.55, 0.85, sFbm(sUV * 25.0, 4)) * 0.7;
  float verd = smoothstep(0.78, 0.9, sFbm(sUV * 30.0 + 20.0, 3)) * bsTarnish;
  vec3 col = mix(base, base * vec3(0.7, 0.6, 0.45), bsTarnish * 0.35);
  col = mix(col, vec3(0.12, 0.3, 0.22), verd * 0.7);
  vec2 g = sUV * 200.0;
  col *= 1.0 + 0.1 * (sNoise(g) - 0.5) * sFade(g.x);
  diffuseColor.rgb = col;
  sH = verd * 0.0004;
}
`,
  normal: /* glsl */ `
roughnessFactor = mix(roughnessFactor, 0.7, bsTarnish);
`,
  light: SKY_SHINE,
};

/** Glass (car windows): dark, with the sky reflected, strongest at grazing angles. */
export const GLASS: Feature = {
  name: "glass",
  light: /* glsl */ `
{
  float cosV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - cosV, 5.0);
  reflectedLight.indirectSpecular += irradiance * fres * 0.35;
}
`,
};

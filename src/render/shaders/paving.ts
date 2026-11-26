// Paved floors (slabs and flagstones, in rows) and flat roofs. World space.
import type { Feature } from "./patch";

interface PavingLook {
  /** Program name. */
  name: string;
  /** Row depth; block width range (metres); joint width. */
  rowH: number;
  minW: number;
  maxW: number;
  joint: number;
  /** Tone spread between slabs (0..0.5). */
  vary: number;
  /** Share of slabs cracked. */
  cracked: number;
  /** Moss in the joints and creeping onto edges (0..1). */
  moss: number;
  /** Wear: slabs dished and polished in the middle (0..1). */
  wear: number;
}

const f = (x: number) => x.toFixed(4);

/** Paving in rows: slabs or flagstones with joints, stains, cracks, moss, wear. */
export function paving(o: PavingLook): Feature {
  return {
    name: o.name,
    bump: 1,
    color: /* glsl */ `
{
  vec2 id, loc, size;
  sRows(sUV, ${f(o.rowH)}, ${f(o.minW)}, ${f(o.maxW)}, id, loc, size);
  float e = sInside(loc, size, ${f(o.joint)});
  float face = sStepPx(e, sPx);
  float h1 = sHash(id + 1.3), h2 = sHash(id + 8.1);
  vec3 base = diffuseColor.rgb;
  vec3 slab = base * (1.0 - ${f(o.vary)} + 2.0 * ${f(o.vary)} * h1);
  slab *= 0.88 + 0.24 * sFbm(sUV * 2.2 + id * 3.7, 3);
  vec2 g = sUV * 45.0;
  float grain = (sNoise(g) - 0.5) * sFade(g.x);
  slab *= 1.0 + 0.16 * grain;
  // Wear: the middle of each slab polished lighter and dished.
  vec2 c = (loc / size) - 0.5;
  float dish = (1.0 - dot(c, c) * 4.0) * ${f(o.wear)};
  slab *= 1.0 + 0.1 * dish;
  // Stains: dark blotches, and small dark spots.
  slab *= 1.0 - 0.28 * smoothstep(0.6, 0.85, sFbm(sUV * 0.6 + 30.0, 3));
  vec3 sp = sCells(sUV * 4.0 + 2.0);
  slab *= 1.0 - 0.35 * step(0.9, sp.z) * (1.0 - smoothstep(0.04, 0.07, sp.x)) * sFade(sUV.x * 24.0);
  // A crack across some slabs.
  float crack = step(h2, ${f(o.cracked)}) * sLine(sFbm(sUV * 1.1 + id * 5.3, 2) - 0.5, 0.004) * smoothstep(0.0, 0.03, e);
  slab *= 1.0 - 0.6 * crack;
  // Joints: dirt, and moss where it's damp.
  float mossy = ${f(o.moss)} * smoothstep(0.35, 0.65, sNoise(sUV * 1.3 + 4.0));
  vec3 joint = mix(base * 0.4, vec3(0.035, 0.05, 0.02), mossy);
  vec3 col = mix(joint, slab, face);
  col = mix(col, vec3(0.04, 0.06, 0.022) * (0.8 + 0.4 * sNoise(sUV * 30.0)), mossy * (1.0 - smoothstep(0.0, 0.06, e)) * face);
  // The slab's edges a little darker (the joint's shadow, the dirt in it).
  float rim = smoothstep(0.0, max(0.03, sPx * 4.0), e);
  col *= mix(0.78, 1.0, rim);
  diffuseColor.rgb = col;
  // Relief fades to 0 in the joints, so per-slab detail never jumps across
  // one: a 12 mm bevel at least a few pixels wide, and each slab settled a
  // little askew, so the slabs catch the light differently.
  float bevel = smoothstep(0.0, max(0.012, sPx * 3.0), e);
  vec2 tilt = vec2(sHash(id + 4.7), sHash(id + 9.2)) - 0.5;
  float settle = dot(c * size, tilt) * 0.03;
  sH = bevel * (0.012 + settle + grain * 0.0008 + dish * 0.003 - crack * 0.004);
}
`,
  };
}

/** Pavement: square 60 cm slabs in a grid, gum and stains, the odd cracked one. */
export const PAVEMENT = paving({
  name: "pavement",
  rowH: 0.6,
  minW: 0.6,
  maxW: 0.6,
  joint: 0.008,
  vary: 0.07,
  cracked: 0.1,
  moss: 0.15,
  wear: 0.2,
});
/** Stone flagstones (plaza, chapel): long, varied slabs in rows, worn. */
export const FLAGSTONE = paving({
  name: "flagstone",
  rowH: 0.75,
  minW: 0.6,
  maxW: 1.3,
  joint: 0.012,
  vary: 0.12,
  cracked: 0.15,
  moss: 0.35,
  wear: 0.5,
});
/** Crypt floor: old flagstones, dished by centuries, damp and mossy joints. */
export const CRYPT_FLOOR = paving({
  name: "cryptfloor",
  rowH: 0.6,
  minW: 0.5,
  maxW: 1.1,
  joint: 0.015,
  vary: 0.18,
  cracked: 0.3,
  moss: 0.35,
  wear: 0.9,
});

/**
 * Flat roof: bitumen felt in metre-wide strips with raised, sealed
 * overlaps, mineral granules, pale tide marks where puddles dried, and the
 * odd patch.
 */
export const ROOF: Feature = {
  name: "roof",
  bump: 1,
  color: /* glsl */ `
{
  vec3 base = diffuseColor.rgb;
  float strip = floor(sUV.y);
  float s = fract(sUV.y);
  vec3 col = base * (0.9 + 0.2 * sHash(vec2(strip, 2.0))) * (0.88 + 0.24 * sFbm(sUV * 0.5, 3));
  // The overlap: a raised lip with a dark sealed edge.
  float lip = smoothstep(0.0, 0.015, s) * (1.0 - smoothstep(0.04, 0.09, s));
  col *= 1.0 - 0.35 * sLinePx(s, 0.01, sPx);
  vec2 g = sUV * 50.0;
  float gran = (sNoise(g) - 0.5) * sFade(g.x);
  vec3 gc = sCells(sUV * 22.0);
  float pale = step(0.8, gc.z) * (1.0 - smoothstep(0.15, 0.3, gc.x)) * sFade(sUV.x * 22.0);
  col *= 1.0 + 0.25 * gran + 0.3 * pale;
  // Puddles that dried: paler inside, a tide line at the rim.
  float pud = sFbm(sUV * 0.35 + 50.0, 4);
  col = mix(col, col * 1.18 + 0.01, smoothstep(0.64, 0.7, pud));
  col *= 1.0 - 0.3 * sLine(pud - 0.64, 0.004);
  diffuseColor.rgb = col;
  sH = lip * 0.006 + gran * 0.0008;
}
`,
};

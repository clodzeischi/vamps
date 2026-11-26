// The GLSL library every patched material gets (patch.ts): hashes, value
// noise, fractal noise, cellular noise, anti-aliasing helpers, and a surface
// frame for flat, axis-aligned faces. Names start with `s` (for shader lib).
//
// Anti-aliasing: procedural patterns have no mipmaps, so anything finer than
// a pixel must fade out (sFade) or be drawn by coverage (sLine), or it
// shimmers as the camera moves.
import { LEVEL_H, TILE } from "../battle/scale";

export const GLSL_LIB = /* glsl */ `
// The battlescape's scale (render/battle/scale.ts), metres.
const float S_TILE = ${TILE.toFixed(4)};
const float S_LEVEL = ${LEVEL_H.toFixed(4)};
// Hash without sine (Dave Hoskins): stable over large coordinates.
float sHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 sHash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Value noise, 0..1, smooth.
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), u.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Fractal noise: octaves of value noise, each twice as fine and half as strong. 0..1.
float sFbm(vec2 p, int octaves) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += sNoise(p) * amp;
    norm += amp;
    p = p * 2.03 + vec2(17.1, 9.7);
    amp *= 0.5;
  }
  return sum / norm;
}

// Cellular noise: x = distance to the nearest cell point, y = distance to the
// border with the next cell (thin lines along it make cracks), z = the cell's hash.
vec3 sCells(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  vec2 mg, mr;
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + sHash2(n + g) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  float border = 8.0;
  for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + sHash2(n + g) - f;
      if (dot(mr - r, mr - r) > 0.00001) border = min(border, dot(0.5 * (mr + r), normalize(r - mr)));
    }
  return vec3(sqrt(md), border, sHash(n + mg));
}

// 1 while a pattern is coarser than a few pixels, fading to 0 as it gets finer.
// x: the pattern's coordinate (in its own repeats).
float sFade(float x) {
  return 1.0 - smoothstep(0.35, 0.8, fwidth(x));
}

// A line of width w (same units as d, the distance to its middle), drawn by
// coverage: thinner than a pixel, it gets fainter instead of breaking up.
float sLine(float d, float w) {
  float px = fwidth(d) + 1e-5;
  float ww = max(w, px);
  return (1.0 - smoothstep(ww * 0.5 - px * 0.5, ww * 0.5 + px * 0.5, abs(d))) * (w / ww);
}

// sFade for a pattern whose coordinate jumps (per board, per block): its
// frequency (repeats a metre) times a pixel's size (metres) instead.
float sFadeAt(float freq, float px) {
  return 1.0 - smoothstep(0.35, 0.8, freq * px);
}

// The same, for a pattern built piecewise (per tile, per cell), whose distance
// jumps at the joins: px, the pixel's size in d's units, comes from something
// continuous (the world position), so the joins don't smear into dots.
float sLinePx(float d, float w, float px) {
  float ww = max(w, px);
  return (1.0 - smoothstep(ww * 0.5 - px * 0.5, ww * 0.5 + px * 0.5, abs(d))) * (w / ww);
}
float sStepPx(float x, float px) {
  return smoothstep(-px, px, x);
}

// A crisp step at 0, anti-aliased.
float sStep(float x) {
  float aa = fwidth(x) + 1e-5;
  return smoothstep(-aa, aa, x);
}

// A frame on a flat, axis-aligned face: its two in-plane axes (world) and the
// position along them (metres). Floors use x and z; walls use their run and up.
void sFrame(vec3 n, vec3 p, out vec3 t, out vec3 b, out vec2 uv) {
  vec3 a = abs(n);
  if (a.y >= a.x && a.y >= a.z) { t = vec3(1.0, 0.0, 0.0); b = vec3(0.0, 0.0, 1.0); uv = p.xz; }
  else if (a.x >= a.z) { t = vec3(0.0, 0.0, 1.0); b = vec3(0.0, 1.0, 0.0); uv = vec2(p.z, p.y); }
  else { t = vec3(1.0, 0.0, 0.0); b = vec3(0.0, 1.0, 0.0); uv = vec2(p.x, p.y); }
}

// Rows of blocks (paving, ashlar): rows rowH tall, each row its own block
// width (between minW and maxW) and its own offset. id: the block; local:
// the position in it and size: its size (metres).
void sRows(vec2 uv, float rowH, float minW, float maxW, out vec2 id, out vec2 local, out vec2 size) {
  float row = floor(uv.y / rowH);
  float w = mix(minW, maxW, sHash(vec2(row, 7.3)));
  float x = uv.x + sHash(vec2(row, 1.9)) * w;
  float col = floor(x / w);
  id = vec2(col, row);
  local = vec2(x - col * w, uv.y - row * rowH);
  size = vec2(w, rowH);
}

// How far inside its block a point is (metres), joints of width j taken off.
float sInside(vec2 local, vec2 size, float j) {
  vec2 e = min(local, size - local);
  return min(e.x, e.y) - j * 0.5;
}

// Tilts a view-space normal by the slope of a height h (metres) over the
// surface at view-space position pos, from screen-space derivatives
// (Mikkelsen's surface gradient, unnormalised so it is in true metres).
// Works on any surface, in any space: a procedural normal map.
vec3 sPerturb(vec3 pos, vec3 n, float h) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  if (abs(det) < 1e-12) return n;
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - grad);
}

// Tilts the view-space normal by a height field's slope along the face (a
// procedural normal map): grad = (dh/du, dh/dv) in metres per metre.
vec3 sBump(vec3 nWorld, vec3 t, vec3 b, vec2 grad) {
  vec3 nw = normalize(nWorld - grad.x * t - grad.y * b);
  return normalize((viewMatrix * vec4(nw, 0.0)).xyz);
}
`;

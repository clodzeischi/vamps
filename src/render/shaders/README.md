# Shaders

Procedural materials for the battlescape: no image textures. Each is a
*feature* patched into three's standard material, so three's lighting,
moon shadows, fog and tone mapping still apply.

| File | What |
|---|---|
| [patch.ts](patch.ts) | `shaded(material, ...features)`: patches features in at three points (colour, normal, light); gives every feature the world position and normal |
| [noise.ts](noise.ts) | Shared GLSL: hashes, value and fractal noise, cellular noise, anti-aliased lines and steps, the face frame and `sBump` (procedural normal maps) |
| [lamps.ts](lamps.ts) | Reads the baked lamp light (`../lightVolume.ts`); on every lit material |
| [road.ts](road.ts) | Asphalt: tone, wheel tracks, oil, repairs, grit, cracks, worn markings (centre and edge lines, zebra crossings, stop lines); `roadMap()` tells it where roads run |
| [brick.ts](brick.ts) | Brick: running bond at real size, per-brick colour, grime, and relief from a height field (a procedural normal map) |

Rules of thumb:

* Work in metres (world position); the scale is `S_TILE`, `S_LEVEL`.
* Anything finer than a pixel fades (`sFade`) or is drawn by coverage
  (`sLine`); patterns built per tile or cell use `sLinePx` / `sStepPx` with
  a pixel size from the world position, or their joins smear into dots.
* Prefix a feature's locals (`rd`, `bk`, `lv`) so features don't collide.
* To add a material: write a `Feature`, route its boxes to a mesh with
  `shaded(new MeshStandardMaterial(...), FEATURE, LAMPS)` in BattleView.

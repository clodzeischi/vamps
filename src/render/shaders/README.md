# Shaders

Procedural materials for the battlescape and for models: no image textures.
Each is a *feature* patched into three's standard material, so three's
lighting, moon shadows, fog and tone mapping still apply. Preview them all
with `npm run materials` (a dev page: every material up close, day or
night, with a close-ups grid).

| File | What |
|---|---|
| [patch.ts](patch.ts) | `shaded()` (world space) and `shadedObject()` (the pattern rides on a moving model): patches features in at three points; gives every feature the surface (`sP`, `sN`, `sUV`, `sPx`, `sGroundY`) and turns its relief `sH` into a normal |
| [noise.ts](noise.ts) | Shared GLSL: hashes, value, fractal and cellular noise, rows of blocks, anti-aliased lines, steps and fades, `sPerturb` (normal from a height) |
| [materials.ts](materials.ts) | **The catalogue**: every material by name, its settings, and which one each map skin uses as a floor, a wall or a prop |
| [lamps.ts](lamps.ts) | Reads the baked lamp light (`../lightVolume.ts`); on every material |
| [road.ts](road.ts) | Asphalt: tone, wheel tracks, oil, repairs, grit, cracks, worn markings, car-park bay dividers; `roadMap()` tells it where roads run and where the bay lines go |
| [brick.ts](brick.ts) | Brick: real-size running bond, per-brick colour, grime, recessed shadowed joints, analytic normal map (bevels at least 1.5 px wide, so they read from the tactical camera) |
| [ground.ts](ground.ts) | Grass (tufts, blades, bare earth, daisies), dirt (crumbs, damp, pebbles) |
| [paving.ts](paving.ts) | Paving in rows (pavement, flagstones, crypt floor): joints, darker rims, slabs settled askew, wear, stains, cracks, moss; flat roofs (bitumen felt) |
| [wood.ts](wood.ts) | Boards: grain, knots, gaps, butt joints, weathering; floorboards, barn planks, crates, furniture, fences, model wood |
| [masonry.ts](masonry.ts) | Plaster (damp, cracks, peeling to brick), ashlar and coping (courses, dressed faces, lichen, moss), rock, carved stone |
| [foliage.ts](foliage.ts) | Leaves (tree crowns, hedges), bark, hay |
| [metal.ts](metal.ts) | Painted metal (cars, bins, posts, the helicopter: dirt, rust, scratches), gun metal, brass, car glass; a sky reflection stands in for an environment map |
| [fabric.ts](fabric.ts) | For models: cloth (wool twill, canvas, velvet with sheen), leather, polymer |

Rules of thumb:

* **Scenery is quiet** (user): `makeMaterial` adds `tone(SCENERY_CONTRAST)`
  after a scenery feature, keeping 45% of its painted colour variation
  around the base colour, so units and items read against the level. The
  relief (normals) and the lamp light are untouched; models keep all their
  colour. Paint the detail at full strength and let the tone quieten it.

* Work in metres. In the world the scale is `S_TILE`, `S_LEVEL`.
* Anything finer than a pixel fades (`sFade`, or `sFadeAt` when its
  coordinate jumps per board or block) or is drawn by coverage (`sLine`;
  `sLinePx` / `sStepPx` with `sPx` for patterns built per tile or cell).
* **Relief must be continuous**: the normal comes from the screen-space
  slope of `sH`, so per-block detail must fade to 0 at the joints over at
  least a few pixels (`smoothstep(0.0, max(w, sPx * 3.0), edge)`), or the
  joints come out dotted.
* Prefix a feature's own locals (`rd`, `bk`, `pt`…) so features don't collide.
* To add a material: write a `Feature` (or tune a factory: `wood()`,
  `paving()`, `ashlar()`, `paint()`, `cloth()`), add it to `MATERIALS`,
  and map skins to it in `surfaceFor`. A model uses
  `makeMaterial(key, colour)`.

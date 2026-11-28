# Item art: models and inventory icons

Items are modelled in code at real scale, like the props
([tooling.md](tooling.md), "Props"), and built twice from the same code: a
detailed model rendered for the transparent inventory icon, and a
low-detail model for the battle view. Every item in `data/equipment.ts` is
built. Each builder's docstring names the real item it's modelled on.

## Pipeline

* `scripts/blender_kit.py`: the palette, its one material and `Kit`,
  shared with build-props.py.
* `scripts/build-items.py` builds every item into
  `~/Documents/Blends/Vamps/battlescape/items.blend` (detailed) or, with
  `--low`, `items-low.blend` (the game's): one object per item, named by
  its `ItemId`.
* `scripts/export-items.py` exports GLBs (`--bare`: no palette images),
  renders icon masters (`--icons`, 136 px a cell) and the game's copies
  (`--ship`: half size, lossless WebP), `--sheet` a contact sheet.
  `ITEMS=a,b` limits a run; `CELL_PX=320` renders big masters for checking.
  Rebuilding overwrites the .blend: hand edits, then export only.

```
B=/Applications/Blender.app/Contents/MacOS/Blender
D=~/Documents/Blends/Vamps/battlescape
$B -b --python scripts/build-items.py -- $D/items.blend
$B -b --python scripts/build-items.py -- $D/items-low.blend --low
$B -b $D/items.blend --python scripts/export-items.py -- art/items --icons art/items/icons --ship public/assets/items/icons [--sheet sheet.png]
$B -b $D/items-low.blend --python scripts/export-items.py -- public/assets/items/models --bare
```

Game models go to `public/assets/items/models/`, icons to
`public/assets/items/icons/`; detailed GLBs and icon masters to `art/items/`
(source, not shipped). `data/item-art.test.ts` checks every item has both.

**Adding an item**: a builder in build-items.py with its view: `@item()`
(held), `view="front"` (worn), `"upright"` (magazines), `"three-quarter"`
(boxes, pouches, grenades) or `"top"` (flat things). Views stay square to
the item so icons sit rectilinear on the grid. Then its row in
`equipment.ts`, whose `size` frames the icon. Models the game doesn't have
yet use `@extra(id, view, (w, h))`. A colourway (armour levels: grey,
coyote) is the same builder with a palette map, registered with
`variant()`.

## Conventions

* **Real scale**, 1 unit = 1 m; builders work in millimetres in the gun's
  design space (`u` along the bore from the rear, `z` up, `x` to the left).
* **Held items**: Z up, muzzle toward −Y, left side toward +X, origin at
  the middle of the pistol grip. Child empties `<id>_muzzle` and, on long
  guns, `<id>_support` (underscores: three.js strips dots).
* **Worn items**: the wearer faces −Y; armour's origin the top of the
  shoulders, the helmet's the centre of its shell. Shaped as worn, so
  characters can wear the same meshes.
* **Carried items** stand as on a table, origin at the base's middle.
* **Weapons are modelled loaded**; a gun and its loose magazine share one
  shape (`MAGS`). Magazines are built along a curved spine, every section
  square to it.
* **Detailed**: up to about 1,800 triangles, flat faces, round parts
  smooth-shaded, no normal or AO maps.
* **Low detail** (`--low`): weapons, grenades, ammunition boxes and the
  IFAK have their own game builders (`@game`): a handful of boxes and
  tubes keeping the silhouette (36–156 triangles); the detailed builder
  still runs so the markers match. Everything else uses the detailed
  builder with `ItemKit(low=True)`: fewer sides and sections, and anything
  inside `with k.detail():` dropped. Things nobody tells apart on the
  ground share a model (`model` in `equipment.ts`; every magazine is
  `mag.glb`).

## Look

* **One palette**, each face on one swatch. A black arsenal separates by
  gloss and metal (polymer, paint, bare iron), not hue; a few weapons carry
  a colour that names them (the Mossberg's walnut, the M110's coyote stock,
  the M249's olive box, the M240B's brass belt).
* Detail that reads in silhouette: sights, rail teeth, left-side controls,
  grip rake, magazines curved as they are. The right side isn't modelled.
* `side()` takes a convex hull, so a concave stock is two slabs.

## Icons

* **Frame**: the item's grid size × 136 px (master); the game's copy is
  half (twice the inventory's 34 px cell), lossless WebP (lossy smears the
  hard edges). Fitted per item with a 6% margin: the grid isn't to scale.
* **Views**: held items muzzle up, left side to the camera, a little from
  above; worn items head on; magazines from the left, front and above;
  boxes and grenades from the front left and above.
* **One rig**: orthographic camera, EEVEE, Standard view transform,
  transparent film, a grey world at 0.3; per view a key from the top, a
  soft fill, and a strong rim from behind that keeps black guns off the
  dark inventory.
* **Outline**: Freestyle external contour only, about 1 px.

## Gotchas

* Call `view_layer.update()` before framing each icon, or the last item
  exported frames empty space.
* A scripted Freestyle lineset needs a line style; remove the default
  lineset first. "strokes set empty" is harmless unless the icon is empty
  (then the camera missed).

## Shapes learnt

* **Helmet (FAST)**: a squarish superellipsoid, longer behind, flaring at
  the nape; the rim low at the brow, rising steeply at the temple, high and
  flat over the ear. Check the side view: head on hides the cut.
* **Plate carrier**: the triple pouch fills the lower front panel almost
  full width; baseplates out of the top, webbing above.
* **The 416's handguard** is tall (the piston runs above the barrel); the
  top rail level with the receiver's.
* **Chassis shotgun**: pistol grip and carbine stock, so every long gun is
  held the same way.
* **EOTech**: battery housing across the front, the hood at the back.
* **Soft gear** is a `pillow`: a superquadric swelling in the middle, so
  it reads as stuffed nylon.
* **Tourniquet (CAT)**: windlass rod across as a T-handle, the clip's two
  horns, a white time strap, a red tip.
* **M240B stock**: a vertical butt, the shoulder rest folded along the top.

## In the game

* `ItemPicture` draws an item's icon in the inventory (upright) and in the
  battle's weapon well and backpack strip (lying, muzzle left).
* `render/battle/items.ts` loads models on first use with the props'
  material. Units hold their weapon at the firing hand (`HAND` in
  `UnitLayer.ts`); items on the ground are their models, up to four a
  tile. Worn armour isn't drawn on figures until there are characters.

## Open

* The 84 mm round's length is an estimate.
* Characters will set how armour sits (torso sizes, the origin).

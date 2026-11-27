# Item art: models and inventory icons

Inventory items are modelled in code, like the battlescape props
([tooling.md](tooling.md), "Props"), at real scale. Each item is built twice from the same code: a detailed
model, rendered for its transparent inventory icon, and a low-detail model
for the battle view. Every
item in `src/data/equipment.ts` is built: 12 weapons, 2 armours, the helmet
and 10 carried items. Each armour also has a second colourway.

## Pipeline

* `scripts/blender_kit.py`: the palette, its one material (`Props`) and
  `Kit`, shared with build-props.py.
* `scripts/build-items.py` builds every item into a .blend in
  `~/Documents/Blends/Vamps/battlescape/`: `items.blend` (detailed) or,
  with `--low`, `items-low.blend` (the game's). One object per item, named
  by its `ItemId`, with the custom property `item`.
* `scripts/export-items.py` exports a .blend's items as GLBs to the folder
  given; `--bare` leaves the palette images out. `--icons <dir>` renders
  the icon masters (PNG, 136 px a cell). `--ship <dir>` writes the game's
  copies: half the size (68 px a cell, twice the inventory's 34 px cell),
  each pixel the alpha-weighted average of 2 × 2, as lossless WebP.
  `--sheet` adds a contact sheet of the masters. Edit by hand in Blender,
  then export only: rebuilding overwrites the .blend. Environment:
  `ITEMS=a,b` limits the run to those items; `CELL_PX=320` renders big
  masters for checking.

| Folder | What | From |
|---|---|---|
| `public/assets/items/models/` | The game's models: low detail, no images | `items-low.blend`, `--bare` |
| `public/assets/items/icons/` | The game's icons: WebP, 68 px a cell | `items.blend`, `--ship` |
| `art/items/` | Detailed GLBs (with the palette, for viewers) and icon masters in `icons/`: source art, not shipped | `items.blend` |

```
B=/Applications/Blender.app/Contents/MacOS/Blender
D=~/Documents/Blends/Vamps/battlescape
$B -b --python scripts/build-items.py -- $D/items.blend
$B -b --python scripts/build-items.py -- $D/items-low.blend --low
$B -b $D/items.blend --python scripts/export-items.py -- art/items --icons art/items/icons --ship public/assets/items/icons [--sheet sheet.png]
$B -b $D/items-low.blend --python scripts/export-items.py -- public/assets/items/models --bare
```

To add an item, write a builder in build-items.py decorated with its view:
`@item()` (held), `@item(view="front")` (worn), `@item(view="upright")`
(magazines, rounds), `@item(view="three-quarter")` (boxes, pouches,
grenades, seen from the front and above) or `view="top"` (flat things, like
the phone). Every view is square to the item, so icons stay rectilinear on
the inventory grid; none is turned to an angle. Then add its row in
`src/data/equipment.ts`: the icon takes its frame from that row's `size`.
An item the game doesn't have yet uses `@extra(id, view, (w, h))`, which
names its grid size itself.

## Conventions

* **Real scale**: 1 unit = 1 m. Builders work in millimetres, in a gun's
  design space: `u` forward along the bore from the item's rear, `z` up,
  `x` toward the left side. Dimensions come from the real item's published
  specifications (see the table below).
* **Held items**: Z up, the muzzle (the knife's tip) toward -Y, the left
  side toward +X. The origin is the firing hand, at the middle of the
  pistol grip. Child empties: `<id>_muzzle` (the bore's end, for flashes and
  tracers) and, on long guns, `<id>_support` (where the other hand holds).
  They export as glTF nodes. Use underscores, not dots: three.js strips dots
  from node names.
* **Worn items**: the wearer faces -Y, Z up. Armour's origin is the top of
  the shoulders on the body's centre line. The torso is an ellipse, 330 ×
  230 mm for the soft vest and 340 × 240 mm for the plate carrier. The
  helmet's origin is the centre of its shell's ellipsoid, about the temples.
  They're shaped as worn, so the characters can wear the same meshes. The
  icon is the same model, with no separate inventory version.
* **Carried items** stand as they would on a table: magazines feed lips
  up, the front toward -Y. Their origin is the middle of their base.
* **Weapons are modelled loaded**: the magazine, box or belt is in. A gun
  and its loose magazine share one shape (`MAGS` and `mag()`), so they
  match.
* **Magazines** are built along a curved spine (`curved_mag`): every
  section, the base plate's too, is square to the spine, so a curved
  magazine's base is square to its curve, not level with the gun. Depth
  follows the calibre: 9 mm 32–38 mm, 5.56 64 mm, 7.62 88 mm.
* **Reference models**: each item is modelled on one real model, named in
  its builder's docstring and in the table below. Proportions come from
  that model's photographs and specifications.
* **Detailed models** (icons): up to about 1,800 triangles an item. Three
  go over: the helmet (2,560), the M240B belt (2,712) and the plate carrier
  (1,908). Faces are flat; round parts (barrels, tubes, the helmet shell)
  are smooth-shaded. No normal or AO maps.
* **Low detail** (the game), built with `--low`:
  * **Weapons**, **grenades**, the **ammunition boxes** and the **IFAK**
    have their own game builders (`GAME`, registered with `@game(...)`). Each is a handful of boxes and slabs in
    the same design space and sizes, keeping only the silhouette:
    * the stock is one slab and the grip another;
    * the receiver is one box (rail included) and the handguard or shroud
      another;
    * an optic is one slab roughly its shape;
    * barrel, gas tube and suppressor are one 5–6-sided tube each;
    * a magazine is one tapered box, its bottom square to the curve;
    * triggers, guards, sights, rails, controls and bipods are left out.

    The detailed builder still runs, its geometry thrown away, so the
    markers (grip, muzzle, support) match exactly. A new weapon needs both
    builders. Weapons come in at 36–156 triangles.
    * **Grenades** (44 triangles): a six-sided can of the grenade's own
      height and colour, and the spoon as two boxes bent over its top and
      down its side. The UV flare's lamp glows through a band.
    * **Ammunition** (36): the M249's box with its belt end, in green for
      the M249 and black for the M240B. The same model serves both, and
      the loose belt's icon still shows the folded belt.
    * **IFAK** (36): the pouch, the tourniquet on top and its red tip.
  * **Shared models**: what nobody tells apart on the ground shares one
    model, and the item's row in `equipment.ts` names it (`model`). Every
    magazine is `mag.glb`, one black box; the player reads which it is in
    the inventory. `SHARED` in build-items.py builds them.
    `src/data/item-art.test.ts` checks every item has its icon and its
    model.
  * **Everything else** uses the same builders as the detailed build, with
    `ItemKit(low=True)`:
    * Cylinders take at most 4 sides under 7 mm radius (rounds, rods), 5
      up to 15 mm, 6 up to 30 mm, 8 above.
    * Curves take about half their sections: pouches, the helmet shell (18
      × 5), magazines (2 sections, or 1 if straight), wraps.
    * Rail teeth become a flat rail, and bores, belt links and laser-cut
      webbing go.
    * Anything built inside `with k.detail():` goes too: serrations,
      rivets, vents, zips, labels.

    New detail that wouldn't read at battle scale goes in a `detail()`
    block. Results: 48 triangles (the shell carton) to 656 (the helmet);
    the vests 450–500. All 28 game models come to 0.32 MB.

## Look

* **One palette**: the props palette, each face on one swatch. Swatches the
  items use:
  * Matte black finish: `black_paint`.
  * Polymer (frames, grips, magazines): `plastic_black`.
  * Bare steel (barrels, tubes, the knife's guard): `iron`.
  * Buttpads and rubber: `rubber`.
  * Coyote fabric and furniture: `upholstery_tan`; webbing: `cardboard`.
  * Soft vest: `fabric_grey`; helmet: `olive`.
  * Wood: `walnut` (the Mossberg), `leather` and `wood_dark` (the knife's
    handle).
  * Cartridges: `brass` and `copper`; sights and bores: `paint_white` and
    `glass_dark`.
* **Variety in a black arsenal**: the black parts separate by gloss and
  metal (polymer against paint against bare iron), not by hue. A few
  weapons carry a colour that names them at a glance: the Mossberg's
  walnut, the M110's coyote stock, the M249's olive ammunition box, the
  M240B's brass belt.
* **Detail that reads in silhouette**: sights, rail teeth (a 10 mm pitch),
  controls on the left side, rake on the grips (about 22°), magazines curved
  as they really are. Detail on the right side isn't modelled.
* **Concave shapes are built from convex pieces**: `side()` takes the convex
  hull of the points it's given, so a stock with a dip in its line is two
  slabs.

## Icons

* **Frame**: the item's grid size × `CELL_PX` (136) pixels for the master,
  so a 2 × 4 rifle is 272 × 544. The game's copy is exactly half, 68 px a
  cell (twice the inventory's 34 px cell, sharp on high-density screens).
  It's lossless WebP, about 3–9 KB an icon: lossy WebP halves that again,
  but its half-resolution colour smears the small hard edges. Each item is fitted to its frame with a 6% margin. Items share
  one scale *in the world*; icons are fitted per item, because the grid's
  sizes aren't to scale (a pistol takes 1 × 2, a rifle 2 × 4).
* **Views**:
  * Held items stand muzzle up, the left side toward the camera, seen a
    little from above, so the top of the gun is to the icon's right.
  * Worn items are seen head on.
  * Magazines and rounds are seen from the left, a little from the front
    and above.
  * Boxes, pouches and grenades are seen from the front left and above.
* **One rig**: an orthographic camera, EEVEE, the Standard view transform
  (the swatches keep their colours), a transparent film, a grey world at
  0.3 for the metal to reflect. There are three sun lights per view, set in
  the camera's frame:
  * a key from the item's top;
  * a soft fill from the other side;
  * a strong rim from behind, which keeps the black guns' edges off the
    dark inventory. Head on it's softer, because it lights flat side faces
    (the helmet's rails) full on.
* **Outline**: Freestyle, external contour only, about 1 px, near black.
  Silhouette or border edges would also trace every separate solid, such as
  the vest's panel segments.

## Gotchas found

* Exporting moves each item to the origin and back, and its world matrix
  stays stale until the scene updates. The script calls
  `view_layer.update()` before framing each icon; without it, the last item
  exported frames empty space.
* A Freestyle lineset made by script needs a line style assigned. Remove the
  default lineset first, or the render fails with `'NoneType' object has no
  attribute 'use_chaining'`.
* "strokes set empty" in the log is harmless when an item is small. When the
  icon comes out empty, though, it means the camera missed the item.

## Colourways

Armour comes in levels, and each level has its own colour: grey for
level 1, coyote for level 2. A colourway is the same builder with a palette
map (`GREY`, `COYOTE` in build-items.py: main fabric, webbing, slots,
elastic), registered with `variant()`. Its icon takes its item's grid size
(the object's `size_of`). Files: `soft-vest` (grey), `soft-vest-coyote`,
`tactical-vest` (coyote), `tactical-vest-grey`. The same mechanism carries models
that aren't game items yet: `m110-sd` takes the M110's size, and the
grenades `frag`, `smoke` and `uv-flare` take the incendiary's (1 × 1). The ItemIds for the levels
aren't in the game yet: name the files after them once they are.

## Shapes learnt

* **Helmet (FAST)**: a superellipsoid, squarish, longer behind than in
  front, flaring a little at the nape. The shell rises about 13 cm above
  the brow, a 17 cm crown over the temples. The rim is a smooth table round
  the head: a low brow, the cut rising steeply at the temple, running
  high and flat over the ear, then falling to the nape. The rails follow
  the cut, a little above it. Check the side view as well as the icon: head
  on hides the cut.
* **Plate carrier**: the triple magazine pouch takes the lower half of the
  front panel and nearly its full width (three 81 mm pouches on a 270 mm
  panel). Baseplates stick out of the top, and webbing rows fill the upper
  half.
* **The 416's handguard** is tall, because the gas piston runs above the
  barrel: the bore sits a little below its middle, and the top rail runs
  level with the receiver's. A holographic sight sits on the receiver.
* **Chassis shotgun**: the pump action takes a pistol grip and a carbine
  stock on a buffer tube, so every long gun is held the same way and shares
  one set of animations.
* **EOTech**: the battery housing lies across the front, toward the
  muzzle. The hood with its window is at the back, toward the eye, with
  the buttons on its back face.
* **Soft gear** (pouches, the tourniquet's band) is a `pillow`: a
  smooth-shaded superquadric (exponent 4–6) whose front and back swell a
  little in the middle, so it reads as stuffed nylon, not a box.
* **Tourniquet (CAT)**: make it obvious by its parts. The windlass rod
  lies across the band like a T-handle, with ridged ends. Add the C-shaped
  clip's two horns, a narrow white time strap and the red tip.
* **M240B stock**: a vertical butt with the shoulder rest folded along the
  top. The top line steps down from the receiver, and the underside dishes
  as it sweeps up from the toe.

## The items

| Item | Model | Size (mm, W × L × H) | Tris |
|---|---|---|---|
| knife | KA-BAR-style, 178 mm clip-point blade, stacked leather | 24 × 302 × 44 | 500 |
| pistol | Glock 19 | 31 × 184 × 132 | 372 |
| pistol-sd | Glock 19, 190 mm can, suppressor-height sights | 38 × 388 × 137 | 588 |
| smg | Sig MPX, 8" barrel, stock collapsed, 20-round magazine | 44 × 541 × 228 | 920 |
| rifle | H&K 416, 14.5", tall quad rail, EOTech-class sight | 60 × 873 × 384 | 1,632 |
| rifle-sd | the same with a 180 mm suppressor | 60 × 1,009 × 384 | 1,740 |
| shotgun | Mossberg 590 in a chassis: pistol grip, carbine stock, OD green | 52 × 934 × 180 | 760 |
| shotgun-semi | Benelli M4, telescoping stock, ghost rings | 50 × 1,011 × 204 | 744 |
| m249 | M249, fixed stock, 200-round box, folded bipod | 113 × 1,041 × 244 | 640 |
| m240b | M240B, its stock, belt stub, carry handle, folded bipod | 137 × 1,246 × 254 | 1,248 |
| m110 | M110, 3.5–10× scope, coyote stock, short 20-round 7.62 magazine | 64 × 1,030 × 337 | 1,796 |
| m110-sd | the same with the issue suppressor over the flash hider (not a game item yet: the M110's grid size) | 64 × 1,182 × 337 | 1,992 |
| rpg | Carl Gustav M4, venturi, red dot, carry handle | 173 × 1,001 × 264 | 880 |
| soft-vest | After the FirstSpear Ragnar: slim panels, elastic cummerbund; grey (and coyote) | 351 × 262 × 427 | 912 |
| tactical-vest | After the FirstSpear Strandhögg: SAPI cut, laser-cut webbing, triple pouch; coyote (and grey) | 368 × 356 × 440 | 1,908 |
| helmet | After the Ops-Core FAST Maritime: high cut, ARC rails, vents, one-hole shroud, urban tan | 217 × 268 × 166 | 2,560 |
| mag-pistol | Glock 19 magazine, a round in the lips | 25 × 36 × 132 | 180 |
| mag-smg | MPX 20-round magazine | 29 × 55 × 160 | 180 |
| mag-rifle | 5.56 polymer 30-round magazine | 28 × 120 × 218 | 180 |
| mag-m110 | 7.62 20-round magazine | 31 × 108 × 179 | 180 |
| shells | A carton of 25 12-gauge, opened, the lid back | 108 × 155 × 151 | 1,436 |
| box-m249 | 200-round plastic box, a belt end out of its gate | 93 × 165 × 120 | 636 |
| belt-m240b | 28 linked 7.62 rounds, folded in two rows | 200 × 147 × 14 | 2,712 |
| rocket | 84 mm HE round on its case (length estimated, about 540 mm) | 90 × 90 × 541 | 680 |
| incendiary | AN-M14 TH3: grey can, red band, the M201 fuze, spoon and ring | 78 × 69 × 143 | 448 |
| frag | M67: a 64 mm olive ball, yellow band, the M213 fuze (not a game item yet) | 78 × 61 × 88 | 608 |
| smoke | AN-M8 HC: the can in light green, black band, emission holes (not a game item yet) | 78 × 69 × 143 | 560 |
| uv-flare | A black canister, the UV lamp glowing through caged windows, rubber grip rings (not a game item yet) | 73 × 57 × 143 | 728 |
| medkit | IFAK: a soft rip-away pouch, coyote, clamshell zip, red pulls; a CAT on top | 197 × 97 × 170 | 1,364 |
| biopsy-kit | After the Peli 1150: a grey hard case, black latches and handle, a yellow biohazard label, a valve (not a game item yet: research.md) | 239 × 193 × 111 | 724 |
| tissue-sample | A UN 3373 transport canister: aluminium, yellow label band, ribbed white screw cap (not a game item yet) | 49 × 48 × 125 | 696 |
| phone | A smartphone face up in a black rubber case (loot, not a game item yet) | 77 × 145 × 10 | 272 |
| stf-vest | The soft vest in black (the STF vest) | 351 × 262 × 427 | 912 |
| trauma-kit-adv | The IFAK in red with a grey panel (the advanced trauma kit) | 197 × 97 × 170 | 1,364 |
| crossbow | A compact recurve crossbow, cocked, a bolt on the rail, a scope; limbs across x | 580 × 812 × 250 | 608 |
| bolt-haemolytic | A 330 mm aluminium bolt standing on its nock, three grey vanes, a red head | 33 × 33 × 330 | 180 |
| bolt-coated | The bolt with a rust-brown coated head and a copper point | 33 × 33 × 330 | 180 |
| coated-knife | The knife with its blade rust-brown, the edge copper (the porphyrin coat) | 24 × 302 × 44 | 500 |
| flashbang | M84-style: a grey steel tube with rows of ports, a yellow band, the fuze | 50 × 75 × 144 | 1,056 |
| strobe | A black canister, cool lamp windows, a clear dome on top, a side switch | 66 × 60 × 112 | 724 |
| bolt-silencer | The bolt with a blue head (every house's silencer bolt) | 33 × 33 × 330 | 180 |
| montsegur-silencer | The bolt with a gold head and a chrome point | 33 × 33 × 330 | 180 |
| bolt-chelation | The bolt with a green head (the chelation bolt) | 33 × 33 × 330 | 180 |
| haem-serum | An autoinjector: grey pen, red caps, a window on the red dose | 17 × 17 × 152 | 264 |
| magnesium-shells | The shell carton in grey with bright heads | 108 × 200 × 151 | 1,436 |
| sparkle | A clear quartz body round a xenon tube, black base, the fuze | 66 × 60 × 134 | 500 |
| lumen-365, lumen-405 | A finned lamp head on a body with pistol grip and fore-grip; the lens pink (365) or blue (405) | 76 × 451 × 238 | 744 |
| lamp-battery | A black pack, a yellow band, two contacts | 60 × 40 × 126 | 80 |
| excimer-lance | A grey laser housing with fins, carry handle, stock, grip and capacitor; a blue optic | 70 × 1,081 × 318 | 488 |
| lance-capacitor | A grey box, a red band, a connector on top | 70 × 50 × 160 | 104 |
| lantern-suit | The plate carrier in black | as the tactical vest | 1,908 |
| night-optics | A skeleton head mount, a binocular intensifier with green lenses, worn | 210 × 330 × 300 | — |
| thermal-sight | The head mount in olive, a boxy thermal monocular | 210 × 340 × 300 | — |
| motion-tracker | A black handheld radar, a green sweep on its screen, the antenna on top | 50 × 100 × 210 | — |
| isr-drone | A quadcopter: black body, four rotors, skids, a gimbal under the nose | 400 × 400 × 94 | — |
| laptop | A 13-inch laptop open at 110°, aluminium, dark screen (loot, not a game item yet) | 304 × 290 × 214 | 144 |

## In the game

* **Icons**: `ItemPicture` (`ui/components/ItemPicture.tsx`) draws an
  item's render fitted to a box.
  * Every inventory grid's `ItemBox` shows it, upright, over the box
    coloured by kind; the name is in the tooltip.
  * The battle's weapon box (`ActiveWell`) and the backpack strip show
    weapons lying, the muzzle left.
  * The small glyphs inside text rows (gear lists, the market, the squad
    card) stay as they are.
* **Models**: `render/battle/items.ts` fetches a model the first time it's
  wanted and draws it with the props' palette material; its meshes are
  shared, so `disposeTree` leaves them.
  * Units hold their weapon (`UnitSpec.held`, from `battleSetup.ts`; a
    knife when they have none) at the firing hand, as a share of torso
    height (`HAND` in `UnitLayer.ts`). It keeps its shape when they crouch,
    lies with them when they're down, and goes with the dead (they drop
    it).
  * Items on the ground (`setFloor`) are their models, up to four a tile,
    one in each quarter. Weapons lie on their left side; everything rests
    on the floor by its bounding box.
  * A model not in yet shows the old placeholder box until it is.
  * Worn armour and helmets aren't drawn on the figures: that waits for the
    characters.

## Open

* The 84 mm round's length is an estimate; check it against a reference.
* The characters will set how armour sits: torso sizes and the origin may
  change once there's a rig.

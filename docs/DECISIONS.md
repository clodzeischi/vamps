# Decision log

One line per decision, newest last. The current rules live in the design
docs (see [WEB_PORT.md](WEB_PORT.md)); this is only the trail. Entries before
2026-11-17 are in git history (docs/WEB_PORT.md before the docs split).

* 2026-11-17: docs split into an index (WEB_PORT.md), design docs per system
  (docs/design/) and this log. Build histories, superseded designs and old
  balance findings removed.
* 2026-11-18: room for ten agents; squad cards small, the selected one grows;
  health bars over heads are HTML; an enemy's bar shows the hit chance and
  grows into its card on hover.
* 2026-11-18: inventory grid, Paradise Cracked style (docs/design/inventory.md):
  hand, armour, helmet, two 2×2 pockets, a 4×5 backpack; items by size;
  magazines needed to reload; burst fire; suppressed pistol and carbine;
  items on the ground in battle; use items from pockets or backpack. Save v8.
* 2026-11-18: battle HUD after Paradise Cracked (mouse still Wasteland 3):
  action panel bottom left around the active item; backpack strip; an item
  stays active while more of it are carried. Overwatch and hunker removed:
  reaction fire is automatic at end of turn, crouching is visual by low
  cover. Sneak toggle (1.5× move, half the spotting distance). Small squad
  cards show numbers only; no card tooltip. Inventory doubles as the
  character sheet and cycles through the squad.
* 2026-11-18: action panel buttons are icons only (name in the tooltip), in
  two styled groups: round steel agent buttons (sneak, backpack, inventory)
  and a brass weapon console (active item, fire modes, reload).
* 2026-11-18: melee and other reach actions need a clear step (no wall,
  window or prop between, no corner cut); friends block paths like foes;
  no hovered-tile outline (the move projection shows the destination).
* 2026-11-18: hit chance reworked: agent aim 50 + Combat/2, range bands
  (point blank +25 to +40, close, long); a move stops on first sight of a new
  enemy and refunds the rest; enemy "overwatch" is just reaction fire (tag
  REACT); health bars drop per hit with a white trailing ghost; battle log
  tones tint the text only.
* 2026-11-18: aim lines: hovering a reachable tile draws red lines to the enemies shootable from it, with the hit chance.
* 2026-11-18: map gallery (`npm run gallery`, `gallery.html`, `src/gallery/`): a dev-only page to page through generated maps and flag layout problems; not part of the game build.
* 2026-11-18: battlescape world units are metres: tile 1.5 × 1.5 m, level 2.5 m (2.4 m ceiling + 0.1 m slab), agents 1.78 m.
* 2026-11-18: battlescape look: plain merged surfaces (no tile seams); lamp light baked into a light volume with traced shadows (no real-time point lights; the level never changes).
* 2026-11-18: battlescape materials are procedural shaders patched into the standard material (render/shaders/): asphalt with cracks and markings, brick with a procedural normal map; textures only for what must be drawn.
* 2026-11-18: every battlescape skin and the units have procedural materials (render/shaders/materials.ts catalogue); model materials (cloth, leather, gun metal, brass, polymer, wood) ride on the object; preview page npm run materials.

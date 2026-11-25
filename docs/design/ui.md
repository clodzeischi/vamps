# UI: structure, look, controls

## Structure

Two layers (user):

* **Places** follow the objects: region › base › facility › thing. The base
  view (`BaseScreen.tsx`, H) is a full screen: facility tiles on the left
  (Overview, Personnel, Hangars, Laboratories, Workshops, Containment,
  Armoury, Stores, Construction), the chosen one beside it; a breadcrumb up
  and ◀ ▶ between bases.
  * Overview: activity and metrics only, no shortcut buttons.
  * Personnel: *Current* (agents, staff, the fallen, transfers) and *Hiring*.
  * **Building happens only in Construction** (floors stacked, top first).
  * Hangars: one card per bay; an empty bay opens the list of aircraft to
    buy or lease.
  * Containment appears only once the base has a cell.
* **Dashboards** cut across places by status: Operations (O), Research (R,
  Research and Engineering tabs, list and detail, unavailable projects
  hidden), Bloodlines (B), Covert actions (C), Market (K), and **Details**
  (F, beside Funds and Secrecy: the books for funds, support and secrecy
  against last month).
* **The dock** (bottom centre): compact icon buttons, label under, key in
  the corner. **Installations** (I) is a list above it; ↑ ↓ or the wheel
  step through, flying the globe there.
* Top bar: date, time controls, funds, secrecy, and a small **Menu** button
  (save, load, settings, quit; also Esc).
* Left column on the globe: **Under way** (everything in progress, with
  bars) and the message log (last three, click for all).
* Status words come from `ui/status.ts`.
* **Loading screen** before every battle (`components/LoadingScreen.tsx`):
  the pulsing OPV emblem, title, a sweeping bar and a controls hint. It paints
  first, then the battle mounts behind it and it fades once the view has
  compiled its shaders and drawn (`BattleView.whenDrawn`).

## Principles (user)

* One place per action; no duplicate shortcut buttons; hide what isn't
  built.
* **Buttons say only the action.** Cost, time, consequences and why it's
  blocked go in the tooltip (`TooltipLayer`). Blocked buttons stay
  hoverable.
* Visual indicators over bare numbers: segmented bars, coloured by kind.

## Look: Reliquary

Picked from three prototypes ("Reliquary is perfection"): gothic black and
gold made physical and dense, like the 1994 X-COM, menus that feel like
objects. `ui/reliquary.css` restyles the shared surfaces over `theme.css`
(which keeps layout). Materials: *plate* (panels: brushed iron in a riveted
brass frame; bad news gets a blood-red frame), *plaque* (buttons, tabs,
tiles: raised, pressing down), *brass* (the primary action or chosen tab;
pause is red enamel), *pressed* (chosen list item), *card*, *well* (gauges,
inputs). Full-screen views are one big plate. The main menu is a tabbed
console (Campaign, Archive, Skirmish, Settings, Credits; keys 1–5).

**Font**: the system monospace everywhere, titles included (`--font` in
`theme.css`; no web fonts), for the classic X-COM feel. The type scale is at
the end of `theme.css` (`--fs-read` 14, `--fs-body` 13, `--fs-small` 12,
`--fs-micro` 11). Nothing under 11 px.

**Icons**: game-icons.net (CC BY 3.0, credited), copied by
`scripts/build-icons.mjs` into `ui/icons.generated.ts`.

**The OPV emblem** (goat's skull on a sword over a cross pattée) replaces
any cross imagery: no plain crosses anywhere in the interface. Source
`art/emblem/opv-logo.png`; `scripts/build-emblem.py` splits it into alpha
masks tinted in CSS: `components/Emblem.tsx` (dark iron cross, brass
engraving, soft glow) on the main menu (left of the title) and the
loading screen; `public/favicon.png` (colour, 64 px); and the `stat-faith` icon (skull,
horns and sword solid, cross at 30%, in the text colour).

**Geoscape models**: aircraft in flight and installations are small glTF
models drawn as holograms (additive, brighter at the silhouette's edge,
glowing in the bloom). One rule for all, set in Blender and read the same
way by `render/geoModels.ts`:

* 1 Blender metre = 0.001 globe units, modelled at the size it should show
  (true scale is invisible; below about 0.05 an airliner's thin wings read
  as a cross).
* The origin is where it sits: an aircraft's centre on its flight path, an
  installation's ground centre. Nose toward -Y, Z up.
* One mesh `body`, plus `*_rotor` parts that spin about their own Z (origin
  at the hub) while the aircraft flies and the clock runs (main 14, tail 32
  rad/s, slower than life so they read), winding up and down over about a
  second.
* The material's name picks the palette: "Holo Gold" (aircraft), "Holo
  Blue" (SIGINT), "Holo Brass" (bases; paler than the gold, so a jet leaving
  stands out), "Holo Green" (HUMINT assets). Installations are dimmer: their big overlapping faces
  otherwise burn to white.

Aircraft replace the flight's dot while in the air (on the ground the dot
returns); hired flights pick the model by their id, our own aircraft by
their kind (missions, teams joining one, ferries). Installations replace
their disc inside the pulsing ring, at a quarter brightness while being
built. Built so far: airliner (commercial, 50 m), business jet (charter,
40 m), military transport (our leased jet, 50 m), helicopter (35 m), SIGINT
radio tower (29 m footprint), base compound (50 m footprint), and the
HUMINT asset, an OSS spearhead medallion lying flat (20 m; one model for
every kind of asset, in place of their per-kind glyphs). The .blend
files live outside the repo (`~/Documents/Blends/Vamps/geoscape/`); see
[tooling.md](tooling.md) for the export.

## Keys

`ui/keys.ts`, rebindable in Settings, one set per screen (so R is Research
on the globe and level up in battle). Stored as `KeyboardEvent.code`; taking
a key in use swaps the two. Esc is fixed.

Geoscape defaults: Space pause, 1–5 speeds, I installations, H home base,
O R B C K F the screens, M support map. Battlescape keys are in
[tactical.md](tactical.md).

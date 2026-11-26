# UI: structure, look, controls

## Structure

Two layers (user):

* **Places** follow the objects: region › base › facility › thing. The base
  view (`BaseScreen.tsx`, H) is a full screen: facility tiles on the left
  (Overview, Personnel, Hangars, Workshops, Containment,
  Armoury, Stores, Construction), the chosen one beside it; a breadcrumb up
  and ◀ ▶ between bases.
  * Overview: activity and metrics only, no shortcut buttons.
  * Personnel: *Current* (operatives, staff, the fallen, transfers) and *Hiring*.
  * **Building happens only in Construction** (floors stacked, top first).
  * Hangars: one card per bay; an empty bay opens the list of aircraft to
    buy or lease.
  * Containment appears only once the base has a cell.
* **Control** (`ui/control.ts`, `screens/geoscape/ControlScreen.tsx`) holds
  every dashboard as numbered tabs, each with its key; a gold dot marks one
  that wants attention, its tooltip says why: 1 Bases (a card each for bases,
  SIGINT and refuelling stations, all the same height, **Build** in the
  card's title row; a row flies there, a base opens), 2 Operations
  (operatives, aircraft and bases, work under way, and covert actions: offers,
  cover-ups under way, our agents), 3 Research (the Order's research;
  engineering is in each base's Workshops), 4 Intelligence, 5 Dark web, 6 Ledger (funds, support and secrecy
  against last month; Funds shows Now and Change, last month in the row's
  tooltip; Support sorts by any column, its heading clicked again reverses). A tab's own sub-tabs sit under it at a fixed height,
  and the area below them keeps its size whatever the sub-tab holds. The
  Control button opens on the last tab used.
* **Labels only** on tabs, nav tiles and buttons ("Ledger", "Operations",
  "Build"): counts, notes and explanations go in the tooltip.
* **Closing** is one ✕ in the top right corner (`components/CloseX.tsx`),
  everywhere: Control, bases, the inventory, detail panes.
* **Dark web** rows: equipment and research look the same (name on the left,
  price, the button on the right), in their own groups; the details are in
  the tooltip.
* Top bar, one panel across the screen: funds and secrecy at the left;
  **Control** in the middle, the only gold on the bar, with a count of the
  tabs that want attention; then the **map overlay** drop-down and **Menu**
  (save, load, settings, quit; also Esc) at the right, as in battle.
* **Map overlays** (`ui/overlays.ts`) colour the regions only; every marker
  stays as it is. One at a time: None, Support, SIGINT coverage, HUMINT
  coverage, Access (closed to us, or open through an access agent), IO (our
  PR campaigns and influence agents), and Vampire activity (our assessment:
  `sim/intel/activity.ts`, leads true or false, sites found and the houses' media
  campaigns, halving each month; never what the houses really do). A colour
  key shows under the top bar; the hover label gives the region's value.
* **Objectives** under it at the top right, the same shadowed text as in
  battle (`components/Objectives.tsx`): the act, the difficulty, then its
  goals (`sim/campaign/objectives.ts`, worked out from the campaign, never ahead of
  what the player knows).
* Left column on the globe: what's selected (region, base, lead, team) and
  the leads. **Under way** (everything in progress, with bars) is bottom
  right, under the time dial.
* **Messages** are plain shadowed text at the bottom centre, as in battle
  (`components/FloatingLog.tsx`): the last three; "All messages" opens them
  in place, by day.
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
  hoverable. A tooltip sits over what is hovered; a grid row with
  `display: contents` is measured by its cells.
* Buttons whose label changes (Add / In cart) keep a fixed width, so the
  table doesn't shift.
* Internal mechanics (rates, thresholds, odds behind the scenes) stay
  hidden: the player sees state, not the formula.
* No browser menu on a right click, except in text fields.
* Visual indicators over bare numbers: segmented bars, coloured by kind.

## Look: the console

On trial (2026-11-25), in place of Reliquary's brass frames: common ground
between Phoenix Point's techno polish, the Inquisition's purple and gold,
and the 1994 X-COM's bevelled consoles. `ui/reliquary.css` restyles the
shared surfaces over `theme.css` (which keeps layout). Materials: *plate*
(panels: gunmetal with a hint of aubergine, clear scan lines, a thin edge, top right and
bottom left corners cut; bad news gets a blood-red edge), *key* (buttons,
tabs, tiles: raised, pressing down, corners rounded 6 px; tabs joined to
a rail only at the top), *lit* (the chosen tab or mode: brighter,
underlined in gold), *gold* (the primary action; pause is red enamel),
*pressed* (chosen list item), *card*, *well* (gauges, inputs). **Gold is for
headings, icons, what is chosen and the main button, never for frames.**
Panels are clipped, so a pop-up must not hang out of a `.panel`. The main
menu is a tabbed console (New, Load, Skirmish, Settings, Credits;
keys 1–5).

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
way by `render/globe/geoModels.ts`:

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
  stands out), "Holo Green" (HUMINT agents). Installations are dimmer: their big overlapping faces
  otherwise burn to white.

Aircraft replace the flight's dot while in the air (on the ground the dot
returns); hired flights pick the model by their id, our own aircraft by
their kind (missions, teams joining one, ferries). Installations replace
their disc inside the pulsing ring, at a quarter brightness while being
built. Built so far: airliner (commercial, 50 m), business jet (charter,
40 m), military transport (our leased jet, 50 m), helicopter (35 m), SIGINT
radio tower (29 m footprint), base compound (50 m footprint), and the
HUMINT agent, an OSS spearhead medallion lying flat (20 m; one model for
every kind of agent, in place of their per-kind glyphs). The .blend
files live outside the repo (`~/Documents/Blends/Vamps/geoscape/`); see
[tooling.md](tooling.md) for the export.

## Keys

`ui/keys.ts`, rebindable in Settings, one set per screen (so 3 is Research
on the globe and the third operative in battle). Stored as `KeyboardEvent.code`; taking
a key in use swaps the two. Esc is fixed.

Geoscape defaults: Space pause, + − step the interval, 1–6 Control's tabs
(the open tab's own number closes it), M the next map overlay. Keys saved
for actions since retired are dropped. Battlescape keys are in
[tactical.md](tactical.md).

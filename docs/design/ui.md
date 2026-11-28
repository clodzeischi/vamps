# UI: structure, look, controls

## Principles (user)

* One place per action; no duplicate shortcut buttons; hide what isn't
  built.
* **Labels only** on tabs, tiles and buttons; cost, time, consequences and
  why it's blocked go in the tooltip (`TooltipLayer`). Blocked buttons
  stay hoverable. Buttons whose label changes keep a fixed width.
* **Closing** is one ✕ in the top right corner, everywhere.
* Internal mechanics (rates, thresholds, odds) stay hidden: the player
  sees state, not the formula.
* Visual indicators over bare numbers: segmented bars, coloured by kind.
* No browser menu on right click, except in text fields.

## Structure

* **Places** follow the objects: region › base › facility › thing. The base
  view (H) is full screen: facility tiles on the left (Overview,
  Personnel, Hangars, Workshops, Containment once there's a cell, Armoury,
  Stores, Construction), the chosen one beside it; ◀ ▶ between bases.
  Overview has activity and metrics only; **building happens only in
  Construction**.
* **Control** holds every dashboard as numbered tabs (1 Bases, 2
  Operations, 3 Research, 4 Intelligence, 5 Dark web, 6 Ledger); a gold dot
  marks one that wants attention. Sub-tabs at a fixed height, the area
  below a fixed size. Opens on the last tab used.
* **Top bar**: funds and secrecy left; **Control** in the middle (the only
  gold on the bar); the map overlay and **Menu** (also Esc) right.
* **Map overlays** colour the regions only, one at a time: Support, SIGINT,
  HUMINT, Access, IO, Vampire activity (our assessment, never the truth),
  with a key under the bar.
* **Objectives** top right, the same as in battle (never ahead of what
  the player knows). Left column: what's selected and the leads. **Under
  way** bottom right. **Messages** bottom centre: the last three, "All
  messages" opens them.
* **Loading screen** before each battle: the emblem pulsing until the view
  has compiled and drawn.

## Look: the console

On trial since 2026-11-25: between Phoenix Point's polish, the
Inquisition's purple and gold, and 1994 X-COM's bevelled consoles.
`ui/reliquary.css` restyles over `theme.css`. Materials: *plate* (panels:
gunmetal with a hint of aubergine, scan lines, two corners cut; bad news a
blood-red edge), *key* (raised buttons and tabs), *lit* (the chosen tab),
*gold* (the primary action), *pressed*, *card*, *well*. **Gold is for
headings, icons, what's chosen and the main button, never frames.** The
main menu is a tabbed console (New, Load, Skirmish, Settings, Credits).

* **Font**: system monospace everywhere, no web fonts; type scale at the
  end of `theme.css`, nothing under 11 px.
* **Icons**: game-icons.net (CC BY 3.0, credited), via
  `scripts/build-icons.mjs`.
* **The OPV emblem** (a goat's skull on a sword over a cross pattée)
  replaces any cross imagery: no plain crosses anywhere. Alpha masks from
  `art/emblem/opv-logo.png` tinted in CSS (`Emblem.tsx`), the favicon, the
  Faith icon.

## Geoscape models

Aircraft in flight and installations are small glTF models drawn as
holograms (additive, bright at the edge, in the bloom), by
`render/globe/geoModels.ts`. One rule for all (in Blender):

* 1 m = 0.001 globe units, modelled at the size it should show; origin
  where it sits (an aircraft's centre on its path), nose −Y, Z up.
* One mesh `body`, plus `*_rotor` parts that spin about their Z while it
  flies and the clock runs.
* The material name picks the palette: Holo Gold (aircraft), Blue (SIGINT),
  Brass (bases), Green (HUMINT agents). Installations are dimmer.

Built: airliner, business jet, military transport, helicopter, SIGINT
tower, base compound, the HUMINT medallion. Sources outside the repo;
export in [tooling.md](tooling.md).

## Keys

`ui/keys.ts`, rebindable in Settings, one set per screen (3 is Research on
the globe and the third operative in battle); taking a key in use swaps
the two; Esc is fixed. Geoscape: Space pause, + − the interval, 1–6
Control's tabs, M the next overlay. Battle keys: [tactical.md](tactical.md).

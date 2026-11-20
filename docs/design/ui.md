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

**Fonts**: Cinzel for titles and headings only. UI and prose are the system
monospace (an experiment since 2026-11-16: "it immediately gives off that
1994 vibe"); the type scale is at the end of `theme.css` (`--fs-read` 14,
`--fs-body` 13, `--fs-small` 12, `--fs-micro` 11). If the experiment ends,
go back to Inter (UI) and Crimson Pro (prose). Nothing under 11 px.

**Icons**: game-icons.net (CC BY 3.0, credited), copied by
`scripts/build-icons.mjs` into `ui/icons.generated.ts`.

**The OPV emblem** (goat's skull on a sword over a cross pattée) replaces
any cross imagery: no plain crosses anywhere in the interface. Source
`art/emblem/opv-logo.png`; `scripts/build-emblem.py` splits it into alpha
masks tinted in CSS: `components/Emblem.tsx` (dark iron cross, brass
engraving, soft glow) on the main menu (left of the title) and the
loading screen; `public/favicon.png` (colour, 64 px); and the `stat-faith` icon (skull,
horns and sword solid, cross at 30%, in the text colour).

**Geoscape models**: aircraft in flight are small glTF models drawn as
golden holograms (additive, brighter at the silhouette's edge, glowing in
the bloom) in place of the flight's dot; on the ground the dot returns.
Authored in metres in Blender (nose toward -Y, Z up), each kind fitted to
its own size on the globe in `render/geoModels.ts`: true scale is
invisible, and below about 0.05 globe units an airliner's thin wings read
as a cross. Hired flights pick the model by their id, our own aircraft by their kind
(missions, teams joining one, ferries). Built so far: the airliner
(commercial, 0.05), the business jet (charter, 0.04), the military
transport (our leased jet, 0.05) and the helicopter (0.035). Parts named
`*_rotor` spin about their hub while the aircraft flies and the clock runs
(main 14, tail 32 rad/s, slower than life so they read), winding up and
down over about a second. The .blend
files live outside the repo (`~/Documents/Blends/Vamps/geoscape/`); see
[tooling.md](tooling.md) for the export.

## Keys

`ui/keys.ts`, rebindable in Settings, one set per screen (so R is Research
on the globe and level up in battle). Stored as `KeyboardEvent.code`; taking
a key in use swaps the two. Esc is fixed.

Geoscape defaults: Space pause, 1–5 speeds, I installations, H home base,
O R B C K F the screens, M support map. Battlescape keys are in
[tactical.md](tactical.md).

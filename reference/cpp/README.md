# VAMPS: Cathar Protocol

A turn-based strategy game built on the structure of the 1994 X-COM: a
real-time Geoscape, bases, research, manufacturing and funding nations, plus
a turn-based battlescape with Time Units, reaction fire, line of sight,
morale, destructible terrain and permadeath. Written in C++17 and played in
the terminal.

Since 1244 six vampire bloodlines have hidden in plain sight. You run a
clandestine agency: keep it **secret**, keep the public on your **side**, and
remember that bullets only put a vampire down. Fire finishes it.

## Build and run

Requires CMake 3.16+ and a C++17 compiler (Apple clang works). The first
configure downloads FTXUI v6.1.9.

```sh
cmake -S . -B build
cmake --build build -j8
./build/vamps            # run from the project folder so it finds data/
./build/vamps_smoke      # headless test: maps, 120-day campaigns, battles, save/load, every screen
```

Use a terminal at least **120 x 40** with true colour and mouse support
(iTerm2, kitty, WezTerm, Alacritty and recent Terminal.app all work).

## Controls

Every button shows its key in `[brackets]`, and everything can be clicked.

| Where | Keys |
|---|---|
| Geoscape | `1`-`6` time speed, `Space` pause, arrows rotate, `+`/`-` zoom, wheel zoom, click to select, right-click to centre |
| Lists | arrows or `j`/`k`, `Enter` (or click the selected row) to activate, `Tab` switches between lists |
| Battlescape cursor | arrows or `h j k l` plus `y u b n` diagonals; click a tile, click again to act |
| Battlescape actions | `Enter` move/confirm, `f` fire (`1` snap `2` aimed `3` auto), `t` throw, `s` strike, `r` reload, `c` kneel, `i` inventory, `m` medkit, `p` prime grenade, `x` scanner, `>`/`<` stairs, `PgUp`/`PgDn` view level, `Tab` next soldier, `e` end turn, `a` abort |
| Battlescape mouse | left-click select / aim / confirm, right-click turn to face, wheel changes level |

## Project layout

```
src/
  core/       maths, calendar and sun position, RNG, string helpers
  data/       game content as plain tables: items, enemy ranks and bloodlines,
              research tree, facilities, aircraft, difficulty, world map, inventory rules
  strategy/   the campaign: GameState, simulation clock, bloodline AI, economy,
              politics (secrecy and support), research and manufacturing,
              interception, save/load
  tactical/   the battlescape: map blocks, LOS and lighting, pathfinding,
              actions, combat, enemy AI, debriefing
  ui/         FTXUI shell (screen stack, widgets, cell grid), the software globe,
              and one file per group of screens in ui/screens/
data/maps/    hand-made 10x10 map blocks (plain text, see data/maps/README.txt)
docs/DESIGN.md  rules, numbers, deviations from the original, and what is missing
tests/        headless smoke test
```

Design notes and the "where do I change X" index are in
[docs/DESIGN.md](docs/DESIGN.md).

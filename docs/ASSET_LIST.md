# Asset list: what's left to model

**Items**: what's modelled is in [item-art.md](design/item-art.md); new
items come from the research tree ([research.md](design/research.md)). Each
needs a low-poly mesh and an icon from the shared rig.

**Level props built** (`scripts/build-props.py`, placed as pieces from
`tactical/map/pieces.ts`): the architecture kit (window frames, plinths,
cornices, quoins, downpipes, lamps), street furniture, offices, flats,
kitchens and bathrooms, run-down tenement dressing (fire escapes,
graffiti, junk), petrol station and convenience store, coffee shop, fast
food, car park and park, church and graveyard, suburban house and
backyard, small clinic, warehouse, works, data centre, container yard,
farm and machinery, both lair tastes (old money, modern), and four vehicle
models with wrecks. Doors are built in code (`render/battle/doors.ts`).

## Still to model

Cover classes: **full** (walls, cars, counters, vending machines), **half**
(tables, crates, low walls, beds).

| For | Props | Pri |
|---|---|---|
| Blocks in the bank | office (cubicles, reception, copier, water cooler, meeting table); bar (back shelf, stools, booths, pool table, DJ booth, neon); hospital (curtain rails, vending machine, signs); church (stained glass, lychgate); street (bus stop, traffic lights, road signs, phone box); a van and a container | P1 |
| Engine pieces | decals (graffiti, stains, road paint, blood pools and smears, drag marks), pitched roofs, interior skins (wallpaper, tile, carpet, lino), balcony railings | P1 |
| Morgue | autopsy table, body drawers, sheet-covered corpse, instrument trays | P1 |
| Police station | front desk behind glass, cells, interrogation room with one-way mirror, evidence shelves, patrol cars | P2 |
| Crypt | sarcophagi, ossuary niches, iron gate, sconces | P2 |
| Blood farm | chained cots, IV rigs, bags on racks, cages, tarp walls (in a barn or warehouse) | P2 |
| Lab | benches, fume hood, centrifuge, freezers, a glass containment cell | P2 |
| Hotel, airport, station, convent, school, mine | as the gameplays need them | P3 |
| Vampire dressing | blackout-taped windows, soil crates, a thrall shrine, bloodline sigils as decals | P2 |

## The base building (for base views and raids)

A 3 × 3 × 3 office block ([base.md](design/base.md)): a basement and two
floors, a core of lift and stairs in the centre, a ring of eight rooms a
floor, a helipad on the roof, a hangar beside it; shown as a cutaway.

* **Shell**: core per floor (lift, stairs, fire door), basement ring,
  facade panels (edge and corner; glass, brick, concrete), slabs and
  ceilings, inner walls (solid and open, so a wing reads as one space),
  roof plant, helipad, the hangar (must stand alone on a raid map), SIGINT
  mast (P2), street front (P2).
* **Each room**: an office state (cover staff at desks), under
  construction (sheeting, ladders), built, and an icon. Lobby and security
  checkpoint, quarters, laboratory, workshop, containment (cells, UV bars,
  restraint chair), SIGINT centre (levels 1 and 2). Most dressing reuses
  the level props.
* **People**: office staff as cover, scientists, engineers (the operative
  rig in other clothes).

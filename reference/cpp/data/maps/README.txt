MAP BLOCKS
==========

Every .txt file in this folder is a terrain set (the file name is the set
name). A battlescape is a 4x4 grid of 10x10 blocks picked from the sets that
fit the mission (see src/tactical/MapBlocks.cpp, setsFor()).

    block <name> [weight]     weight = relative chance of being picked (default 1)
    level 0                   ground floor: exactly 10 rows of 10 characters
    ..........
    level 1                   optional upper floor / roof (spaces = open air)
    end

Lines outside a block that start with # are comments.

LEGEND
  (space) ground on level 0, open air on level 1
  .   ground (grass / sand / snow / cave floor, depending on the terrain)
  d   dirt               ,   road / tarmac          _   indoor floor
  #   wall               w   window (see-through)   +   door (closed)
  '   doorway (open)     T   tree (rock in deserts) *   bush (soft cover)
  ~   water              =   low wall (cover)       o   crate / car (cover)
  H   stairs up to the level above
  %   aircraft hull      r   rubble                 g   gravestone (cover)
  p   pew (cover)        R   cave rock              I   pillar
  E   transport ramp: soldiers start here and leave from here when aborting
  X / x   enemy start position (ground / indoor floor)
  C / c   civilian start position (ground / indoor floor)

The "special" set holds the fixed blocks: the transport (kestrel), the two
wrecks, the lair entrance and the Progenitor's hall.

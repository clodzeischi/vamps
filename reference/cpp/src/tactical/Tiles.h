#pragma once
// Battlescape terrain. One tile = one map cell. Walls occupy whole tiles
// (the original used edge walls; whole tiles read far better in ASCII).

#include <cstdint>

#include "core/Color.h"

namespace vamps {

enum class TileType : uint8_t {
    Void,       // open air (upper levels only)
    Grass, Dirt, Sand, Snow, Road, Floor, CraftFloor,
    Wall, Window, DoorClosed, DoorOpen, Hull, Rock, Pillar,
    Tree, Bush, Water, LowWall, Crate, Stairs, Rubble, Grave, Pew,
    Count
};

struct TileDef {
    const char* name;
    const char* glyph;   // two characters (tiles are drawn 2 columns wide)
    Rgb fg, bg;
    bool walkable;
    bool blocksSight;
    bool blocksShots;    // stops projectiles completely
    double coverHeight;  // 0..1: projectiles passing below this height are stopped
    int armor;           // damage needed to destroy (0 = indestructible)
    TileType destroyedInto;
    bool flammable;
    int moveMult;        // 1 normal, 2 slow
    bool isFloor;        // something to stand on when on an upper level
};

const TileDef& tileDef(TileType t);

} // namespace vamps

#pragma once
// The battlescape grid: width x height x levels of tiles. Level 0 is the
// ground; level 1 is upper floors and rooftops.

#include <vector>

#include "data/Inventory.h"
#include "tactical/Tiles.h"

namespace vamps {

struct Point3 {
    int x = 0, y = 0, z = 0;
    bool operator==(const Point3& o) const { return x == o.x && y == o.y && z == o.z; }
    bool operator!=(const Point3& o) const { return !(*this == o); }
};

struct Tile {
    TileType type = TileType::Void;
    int hp = 0;              // remaining armour
    uint8_t fire = 0;        // turns of fire left
    uint8_t smoke = 0;       // turns of smoke left
    bool explored = false;   // seen at least once by the player
    bool visible = false;    // currently seen by the player
    bool lit = false;        // in light (day, fire, flare)
    bool sunlit = false;     // in direct daylight (outdoors, daytime)
    std::vector<ItemInstance> items;

    const TileDef& def() const { return tileDef(type); }
};

class BattleMap {
public:
    BattleMap() = default;
    BattleMap(int w, int h, int levels);

    int width() const { return w_; }
    int height() const { return h_; }
    int levels() const { return d_; }

    bool inside(int x, int y, int z) const { return x >= 0 && y >= 0 && z >= 0 && x < w_ && y < h_ && z < d_; }
    bool inside(const Point3& p) const { return inside(p.x, p.y, p.z); }
    Tile& at(int x, int y, int z) { return tiles_[(z * h_ + y) * w_ + x]; }
    const Tile& at(int x, int y, int z) const { return tiles_[(z * h_ + y) * w_ + x]; }
    Tile& at(const Point3& p) { return at(p.x, p.y, p.z); }
    const Tile& at(const Point3& p) const { return at(p.x, p.y, p.z); }

    void set(int x, int y, int z, TileType t);

    // Can a unit stand here (ignoring other units)?
    bool standable(int x, int y, int z) const;
    // Is there anything overhead (a floor on any higher level)?
    bool roofed(int x, int y, int z) const;

    void recomputeLighting(bool daytime);

    std::vector<Point3> playerSpawns, enemySpawns, civilianSpawns;

private:
    int w_ = 0, h_ = 0, d_ = 0;
    std::vector<Tile> tiles_;
};

} // namespace vamps

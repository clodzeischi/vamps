#include "tactical/BattleMap.h"

#include <cmath>

namespace vamps {

BattleMap::BattleMap(int w, int h, int levels) : w_(w), h_(h), d_(levels), tiles_(w * h * levels) {
    for (int y = 0; y < h; ++y)
        for (int x = 0; x < w; ++x) set(x, y, 0, TileType::Grass);
}

void BattleMap::set(int x, int y, int z, TileType t) {
    if (!inside(x, y, z)) return;
    Tile& tile = at(x, y, z);
    tile.type = t;
    tile.hp = tileDef(t).armor;
}

bool BattleMap::standable(int x, int y, int z) const {
    if (!inside(x, y, z)) return false;
    const TileDef& d = at(x, y, z).def();
    return d.walkable && d.isFloor;
}

bool BattleMap::roofed(int x, int y, int z) const {
    for (int zz = z + 1; zz < d_; ++zz)
        if (at(x, y, zz).type != TileType::Void) return true;
    return false;
}

void BattleMap::recomputeLighting(bool daytime) {
    for (int z = 0; z < d_; ++z)
        for (int y = 0; y < h_; ++y)
            for (int x = 0; x < w_; ++x) {
                Tile& t = at(x, y, z);
                t.sunlit = daytime && !roofed(x, y, z);
                t.lit = daytime;
            }
    if (daytime) return;
    // Fires light radius 4; flares on the ground light radius 6.
    auto lightAround = [&](int cx, int cy, int cz, int radius) {
        for (int z = std::max(0, cz - 1); z < std::min(d_, cz + 2); ++z)
            for (int y = cy - radius; y <= cy + radius; ++y)
                for (int x = cx - radius; x <= cx + radius; ++x)
                    if (inside(x, y, z) && (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius)
                        at(x, y, z).lit = true;
    };
    for (int z = 0; z < d_; ++z)
        for (int y = 0; y < h_; ++y)
            for (int x = 0; x < w_; ++x) {
                const Tile& t = at(x, y, z);
                if (t.fire > 0) lightAround(x, y, z, 4);
                for (const auto& it : t.items)
                    if (it.id == "flare" && it.fuse == -2) lightAround(x, y, z, 6); // -2 = lit flare
            }
}

} // namespace vamps

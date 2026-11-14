// Line of sight, field of view and lighting rules.
//
//  * Units see in a ~100-degree cone in front of them (adjacent tiles always).
//  * Daylight: 20 tiles. Night: humans see 9 tiles (14 with night optics)
//    unless the target stands in light (fire, flare); vampires see 20.
//  * Each smoke tile on the line costs 3 tiles of range.
//  * Floors between levels block sight unless the line passes open air.
#include <cmath>

#include "tactical/Battle.h"

namespace vamps {

bool Battle::lineOfSight(const Point3& from, double fromH, const Point3& to, double toH, int* smoke) const {
    double ax = from.x + 0.5, ay = from.y + 0.5, az = from.z + fromH;
    double bx = to.x + 0.5, by = to.y + 0.5, bz = to.z + toH;
    double dx = bx - ax, dy = by - ay, dz = bz - az;
    double len = std::sqrt(dx * dx + dy * dy + dz * dz);
    int steps = std::max(1, (int)std::ceil(len * 4));
    Point3 prev = from;
    int smokeCount = 0;
    for (int i = 1; i < steps; ++i) {
        double t = (double)i / steps;
        double px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
        Point3 c{(int)std::floor(px), (int)std::floor(py), (int)std::floor(pz)};
        if (c == prev) continue;
        if (!map.inside(c)) return false;
        if (c.z != prev.z) {
            // Crossing between levels: the upper tile must be open air.
            int upper = std::max(c.z, prev.z);
            if (map.at(c.x, c.y, upper).type != TileType::Void && !(c == to)) return false;
        }
        prev = c;
        if (c == to) break;
        const Tile& tile = map.at(c);
        if (tile.def().blocksSight) return false;
        if (tile.smoke > 0) ++smokeCount;
    }
    if (smoke) *smoke = smokeCount;
    return true;
}

int Battle::sightRange(const BattleUnit& viewer, const Point3& target, const BattleUnit* targetUnit) const {
    int range = 20;
    bool nightVision = viewer.vampiric || viewer.rank == EnemyRank::Thrall;
    if (!daytime() && !nightVision && !map.at(target).lit)
        range = (viewer.faction == Faction::Player && setup.nightOptics) ? 14 : 9;
    if (viewer.faction == Faction::Player && targetUnit && targetUnit->faction == Faction::Enemy)
        range -= bloodline(targetUnit->bloodline).stealthTiles;
    return range;
}

bool Battle::canSeeTile(const BattleUnit& viewer, const Point3& tile) const {
    if (!viewer.active()) return false;
    int dx = tile.x - viewer.pos.x, dy = tile.y - viewer.pos.y, dz = tile.z - viewer.pos.z;
    double dist = std::sqrt((double)dx * dx + dy * dy + 2.25 * dz * dz);
    const BattleUnit* occupant = unitAt(tile);
    int range = sightRange(viewer, tile, occupant);
    if (dist > range) return false;
    if (std::max(std::abs(dx), std::abs(dy)) > 1 || std::abs(dz) > 0) {
        // Field of view cone.
        double fx = kDirX[viewer.facing], fy = kDirY[viewer.facing];
        double fl = std::sqrt(fx * fx + fy * fy);
        double dl = std::sqrt((double)dx * dx + dy * dy);
        if (dl > 0 && (dx * fx + dy * fy) / (dl * fl) < 0.64) return false;
    }
    double h = occupant ? occupant->bodyHeight() * 0.7 : 0.5;
    int smoke = 0;
    if (!lineOfSight(viewer.pos, viewer.eyeHeight(), tile, h, &smoke)) return false;
    return dist + smoke * 3 <= range;
}

bool Battle::canSee(const BattleUnit& viewer, const BattleUnit& target) const {
    if (target.gone() || &viewer == &target) return false;
    return canSeeTile(viewer, target.pos);
}

void Battle::updateVisibility() {
    for (int z = 0; z < map.levels(); ++z)
        for (int y = 0; y < map.height(); ++y)
            for (int x = 0; x < map.width(); ++x) map.at(x, y, z).visible = false;
    playerSees.clear();
    enemySees.clear();

    for (const auto& u : units) {
        if (u.faction != Faction::Player || !u.active()) continue;
        const int r = 20;
        for (int z = 0; z < map.levels(); ++z)
            for (int y = std::max(0, u.pos.y - r); y <= std::min(map.height() - 1, u.pos.y + r); ++y)
                for (int x = std::max(0, u.pos.x - r); x <= std::min(map.width() - 1, u.pos.x + r); ++x) {
                    Tile& t = map.at(x, y, z);
                    if (t.visible) continue;
                    if (canSeeTile(u, {x, y, z})) t.visible = t.explored = true;
                }
    }

    for (const auto& o : units) {
        if (o.gone() || o.faction == Faction::Player) continue;
        if (map.at(o.pos).visible) { playerSees.insert(o.id); continue; }
        // A motion tracker shows moving bodies within 15 tiles of any soldier.
        if (trackerTurns > 0 && o.active())
            for (const auto& u : units)
                if (u.faction == Faction::Player && u.active() &&
                    std::abs(u.pos.x - o.pos.x) <= 15 && std::abs(u.pos.y - o.pos.y) <= 15) {
                    playerSees.insert(o.id);
                    break;
                }
    }

    for (const auto& e : units) {
        if (e.faction != Faction::Enemy || !e.active()) continue;
        for (const auto& o : units)
            if (o.faction != Faction::Enemy && o.active() && canSee(e, o)) enemySees.insert(o.id);
    }
}

} // namespace vamps

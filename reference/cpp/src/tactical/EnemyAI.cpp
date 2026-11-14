// The enemy's turn, one unit at a time.
//
//  1. Elders (and Perfecti vampires) try a pheromone burst on the soldier
//     with the weakest Will within 8 tiles.
//  2. Pick the nearest visible target (vampires also go after civilians).
//  3. Armed units shoot; clawed units close in and strike.
//  4. With no target: sun-sensitive units in daylight run for cover,
//     everyone else patrols, converging on the squad as turns pass.
#include <algorithm>
#include <climits>
#include <cmath>

#include "core/Random.h"
#include "tactical/Battle.h"

namespace vamps {

namespace {

int manhattan(const Point3& a, const Point3& b) {
    return std::abs(a.x - b.x) + std::abs(a.y - b.y) + 2 * std::abs(a.z - b.z);
}

const CarriedItem* firearmInHand(const BattleUnit& u, Slot* hand) {
    for (Slot s : {Slot::RightHand, Slot::LeftHand})
        if (const CarriedItem* c = u.inSlot(s); c && item(c->item.id).kind == ItemKind::Firearm) {
            if (hand) *hand = s;
            return c;
        }
    return nullptr;
}

} // namespace

BattleUnit* Battle::aiPickTarget(BattleUnit& u) {
    BattleUnit* best = nullptr;
    int bestD = INT_MAX;
    bool huntsCivilians = u.rank != EnemyRank::Familiar;
    for (auto& o : units) {
        if (!o.active() || o.faction == Faction::Enemy) continue;
        if (o.faction == Faction::Neutral && !huntsCivilians) continue;
        // Shared knowledge: anything any vampire can see this turn.
        if (!enemySees.count(o.id) && !canSee(u, o)) continue;
        int d = manhattan(u.pos, o.pos) + (o.faction == Faction::Neutral ? 4 : 0);
        if (d < bestD) { bestD = d; best = &o; }
    }
    return best;
}

bool Battle::aiShoot(BattleUnit& u, BattleUnit& target) {
    bool fired = false;
    for (int i = 0; i < 3 && u.active() && target.active(); ++i) {
        Slot hand = Slot::RightHand;
        const CarriedItem* gun = firearmInHand(u, &hand);
        if (!gun) return fired;
        if (gun->item.ammo <= 0 && !reload(u, hand)) return fired;
        if (!canSee(u, target)) return fired;
        int dist = std::max(std::abs(target.pos.x - u.pos.x), std::abs(target.pos.y - u.pos.y));
        ShotMode order[3] = {ShotMode::Snap, ShotMode::Aimed, ShotMode::Auto};
        if (dist <= 6) order[0] = ShotMode::Auto, order[2] = ShotMode::Snap;
        else if (dist > 10) order[0] = ShotMode::Aimed, order[1] = ShotMode::Snap;
        bool shot = false;
        for (ShotMode m : order)
            if (ShotPreview pv = previewShot(u, hand, m, target.pos); pv.possible && !pv.friendlyInLine) {
                shot = shoot(u, hand, m, target.pos);
                break;
            }
        if (!shot) return fired;
        fired = true;
    }
    return fired;
}

bool Battle::aiMelee(BattleUnit& u, BattleUnit& target) {
    Slot hand = u.clawDamage > 0 ? Slot::Ground : Slot::RightHand;
    auto adjacent = [&] {
        return std::max(std::abs(target.pos.x - u.pos.x), std::abs(target.pos.y - u.pos.y)) <= 1 &&
               target.pos.z == u.pos.z;
    };
    if (!adjacent()) {
        // Find the cheapest free tile next to the target.
        Path best;
        for (int d = 0; d < 8; ++d) {
            Point3 p{target.pos.x + kDirX[d], target.pos.y + kDirY[d], target.pos.z};
            if (!map.inside(p) || !map.standable(p.x, p.y, p.z)) continue;
            Path path = findPath(u, p);
            if (path.found && (!best.found || path.tuCost < best.tuCost)) best = path;
        }
        if (!best.found) return false;
        move(u, best.steps.back());
        if (!u.active()) return true;
    }
    bool struck = false;
    while (u.active() && target.active() && adjacent() && u.tu >= meleeTuCost(u, hand)) {
        if (!melee(u, hand, target)) break;
        struck = true;
    }
    return struck;
}

void Battle::aiSeekShelter(BattleUnit& u) {
    // Nearest roofed tile we can reach.
    Point3 best = u.pos;
    int bestD = INT_MAX;
    for (int z = 0; z < map.levels(); ++z)
        for (int y = std::max(0, u.pos.y - 12); y <= std::min(map.height() - 1, u.pos.y + 12); ++y)
            for (int x = std::max(0, u.pos.x - 12); x <= std::min(map.width() - 1, u.pos.x + 12); ++x) {
                if (!map.standable(x, y, z) || map.at(x, y, z).sunlit) continue;
                Point3 p{x, y, z};
                if (const BattleUnit* o = unitAt(p); o && o != &u && o->active()) continue;
                int d = manhattan(u.pos, p);
                if (d < bestD) { bestD = d; best = p; }
            }
    if (!(best == u.pos)) move(u, best);
}

void Battle::aiWander(BattleUnit& u) {
    Random& r = rng();
    // Later in the battle the enemy hunts the squad down.
    if (turn > 4 || r.percent(30)) {
        const BattleUnit* nearest = nullptr;
        int bestD = INT_MAX;
        for (const auto& o : units)
            if (o.faction == Faction::Player && o.active()) {
                int d = manhattan(u.pos, o.pos);
                if (d < bestD) { bestD = d; nearest = &o; }
            }
        if (nearest) {
            u.aiDest = freeTileNear(u, nearest->pos);
            u.aiHasDest = true;
        }
    }
    if (!u.aiHasDest || u.pos == u.aiDest || r.percent(20)) {
        for (int tries = 0; tries < 20; ++tries) {
            Point3 p{u.pos.x + r.range(-8, 8), u.pos.y + r.range(-8, 8), u.pos.z};
            if (map.inside(p) && map.standable(p.x, p.y, p.z)) { u.aiDest = p; u.aiHasDest = true; break; }
        }
    }
    if (!u.aiHasDest) return;
    Path path = findPath(u, u.aiDest);
    if (!path.found) {
        u.aiHasDest = false; // unreachable: pick something else next turn
        return;
    }
    // move() walks as far as TU allows.
    if (!path.steps.empty()) move(u, path.steps.back());
}

void Battle::runAi(BattleUnit& u) {
    Random& r = rng();
    // 1. Pheromone domination.
    if (u.canDominate && u.tu >= 25 && r.percent(60)) {
        BattleUnit* victim = nullptr;
        for (auto& o : units)
            if (o.faction == Faction::Player && o.active() && !o.dominated &&
                std::max(std::abs(o.pos.x - u.pos.x), std::abs(o.pos.y - u.pos.y)) <= 8 &&
                std::abs(o.pos.z - u.pos.z) <= 1 && (!victim || o.totalWill() < victim->totalWill()))
                victim = &o;
        if (victim) dominate(u, *victim);
    }

    // 2. Engage.
    BattleUnit* target = aiPickTarget(u);
    if (target) {
        turnTo(u, target->pos);
        Slot hand;
        bool armed = firearmInHand(u, &hand) != nullptr;
        int dist = std::max(std::abs(target->pos.x - u.pos.x), std::abs(target->pos.y - u.pos.y));
        bool preferClaws = u.clawDamage > 0 && (dist <= 3 || !armed || r.percent(40));
        if (preferClaws) {
            if (!aiMelee(u, *target) && armed) aiShoot(u, *target);
        } else if (armed) {
            if (!aiShoot(u, *target) && u.clawDamage > 0) aiMelee(u, *target);
        } else {
            aiMelee(u, *target);
        }
        if (u.active() && u.sunSensitive && map.at(u.pos).sunlit && u.tu > 8) aiSeekShelter(u);
        return;
    }

    // 3. No target: move, then engage anything that came into view.
    if (u.sunSensitive && map.at(u.pos).sunlit) aiSeekShelter(u);
    else aiWander(u);
    if (!u.active()) return;
    updateVisibility();
    if (BattleUnit* spotted = aiPickTarget(u)) {
        turnTo(u, spotted->pos);
        Slot hand;
        if (firearmInHand(u, &hand)) aiShoot(u, *spotted);
        else if (u.clawDamage > 0) aiMelee(u, *spotted);
        return;
    }
    // Face somewhere new so the patrol actually looks around.
    if (u.tu > 0) u.facing = r.range(0, 7);
}

void Battle::runCivilian(BattleUnit& u) {
    Random& r = rng();
    // Run from the nearest visible threat, otherwise mill about.
    const BattleUnit* threat = nullptr;
    int bestD = INT_MAX;
    for (const auto& o : units)
        if (o.faction == Faction::Enemy && o.active() && o.rank != EnemyRank::Familiar) {
            int d = manhattan(u.pos, o.pos);
            if (d < bestD && d <= 12) { bestD = d; threat = &o; }
        }
    Point3 dest = u.pos;
    if (threat) {
        int dx = u.pos.x - threat->pos.x, dy = u.pos.y - threat->pos.y;
        dest.x = std::clamp(u.pos.x + (dx > 0 ? 5 : dx < 0 ? -5 : r.range(-5, 5)), 0, map.width() - 1);
        dest.y = std::clamp(u.pos.y + (dy > 0 ? 5 : dy < 0 ? -5 : r.range(-5, 5)), 0, map.height() - 1);
    } else if (r.percent(50)) {
        dest.x = std::clamp(u.pos.x + r.range(-3, 3), 0, map.width() - 1);
        dest.y = std::clamp(u.pos.y + r.range(-3, 3), 0, map.height() - 1);
    }
    if (!(dest == u.pos) && map.standable(dest.x, dest.y, dest.z)) move(u, dest);
}

} // namespace vamps

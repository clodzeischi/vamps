// A* pathfinding over Time Unit costs.
//
// Costs follow the original: 4 TU per orthogonal step, 6 per diagonal,
// doubled on rough ground (bushes, rubble, low walls), +4 to open a door,
// 8 TU to climb or descend stairs. No cutting corners past walls.
#include <algorithm>
#include <queue>

#include "tactical/Battle.h"

namespace vamps {

int Battle::stepCost(const Point3& a, const Point3& b) const {
    if (!map.standable(b.x, b.y, b.z)) return -1;
    if (b.z != a.z) {
        // Stairs: the lower tile of the pair must be a staircase.
        if (a.x != b.x || a.y != b.y || std::abs(b.z - a.z) != 1) return -1;
        int lower = std::min(a.z, b.z);
        return map.at(a.x, a.y, lower).type == TileType::Stairs ? 8 : -1;
    }
    int dx = b.x - a.x, dy = b.y - a.y;
    if (std::abs(dx) > 1 || std::abs(dy) > 1) return -1;
    bool diagonal = dx != 0 && dy != 0;
    if (diagonal && (!map.standable(a.x + dx, a.y, a.z) || !map.standable(a.x, a.y + dy, a.z))) return -1;
    const TileDef& d = map.at(b).def();
    int cost = (diagonal ? 6 : 4) * d.moveMult;
    if (map.at(b).type == TileType::DoorClosed) cost += 4;
    return cost;
}

Point3 Battle::freeTileNear(const BattleUnit& u, const Point3& target) const {
    Point3 best = u.pos;
    int bestD = 1 << 30;
    for (int dz = -1; dz <= 1; ++dz)
        for (int dy = -4; dy <= 4; ++dy)
            for (int dx = -4; dx <= 4; ++dx) {
                Point3 p{target.x + dx, target.y + dy, target.z + dz};
                if (!map.standable(p.x, p.y, p.z)) continue;
                const BattleUnit* o = unitAt(p);
                if (o && o != &u && o->active()) continue;
                int d = std::max(std::abs(dx), std::abs(dy)) * 2 + std::abs(dz) * 3;
                if (d < bestD) { bestD = d; best = p; }
            }
    return best;
}

Path Battle::findPath(const BattleUnit& u, const Point3& dest, int maxCost) const {
    Path result;
    if (!map.inside(dest) || !map.standable(dest.x, dest.y, dest.z)) return result;
    if (dest == u.pos) { result.found = true; return result; }
    const BattleUnit* blocker = unitAt(dest);
    if (blocker && blocker != &u && blocker->active()) return result;

    const int W = map.width(), H = map.height(), D = map.levels();
    auto index = [&](const Point3& p) { return (p.z * H + p.y) * W + p.x; };
    std::vector<int> cost(W * H * D, 1 << 30), parent(W * H * D, -1);
    auto heuristic = [&](const Point3& p) {
        int dx = std::abs(p.x - dest.x), dy = std::abs(p.y - dest.y);
        return 4 * std::max(dx, dy) + 2 * std::min(dx, dy) + 8 * std::abs(p.z - dest.z);
    };
    using Node = std::pair<int, int>; // f, index
    std::priority_queue<Node, std::vector<Node>, std::greater<Node>> open;
    cost[index(u.pos)] = 0;
    open.push({heuristic(u.pos), index(u.pos)});
    auto decode = [&](int i) { return Point3{i % W, (i / W) % H, i / (W * H)}; };

    while (!open.empty()) {
        auto [f, ci] = open.top();
        open.pop();
        Point3 c = decode(ci);
        if (c == dest) break;
        if (f - heuristic(c) > cost[ci]) continue; // stale
        Point3 neighbours[10];
        int n = 0;
        for (int d = 0; d < 8; ++d) neighbours[n++] = {c.x + kDirX[d], c.y + kDirY[d], c.z};
        neighbours[n++] = {c.x, c.y, c.z + 1};
        neighbours[n++] = {c.x, c.y, c.z - 1};
        for (int k = 0; k < n; ++k) {
            const Point3& nb = neighbours[k];
            if (!map.inside(nb)) continue;
            int sc = stepCost(c, nb);
            if (sc < 0) continue;
            const BattleUnit* occ = unitAt(nb);
            if (occ && occ != &u && occ->active()) continue; // bodies can be stepped over
            int nc = cost[ci] + sc;
            if (nc > maxCost) continue;
            int ni = index(nb);
            if (nc < cost[ni]) {
                cost[ni] = nc;
                parent[ni] = ci;
                open.push({nc + heuristic(nb), ni});
            }
        }
    }

    int di = index(dest);
    if (parent[di] < 0) return result;
    for (int i = di; i != index(u.pos); i = parent[i]) result.steps.push_back(decode(i));
    std::reverse(result.steps.begin(), result.steps.end());
    result.tuCost = cost[di];
    result.found = true;
    return result;
}

} // namespace vamps

#include "strategy/Base.h"

#include "data/Items.h"

namespace vamps {

const Facility* Base::facilityAt(int x, int y) const {
    for (const auto& f : facilities) {
        int s = facility(f.type).size;
        if (x >= f.x && x < f.x + s && y >= f.y && y < f.y + s) return &f;
    }
    return nullptr;
}

int Base::countFacilities(FacilityType t, bool readyOnly) const {
    int n = 0;
    for (const auto& f : facilities)
        if (f.type == t && (!readyOnly || f.ready())) ++n;
    return n;
}

int Base::capacity(FacilityType t) const { return countFacilities(t) * facility(t).capacity; }

int Base::scientistsBusy() const {
    int n = 0;
    for (const auto& r : research) n += r.scientists;
    return n;
}

int Base::engineersBusy() const {
    int n = 0;
    for (const auto& p : production) n += p.engineers;
    return n;
}

double Base::storageUsed() const {
    double used = 0;
    for (const auto& [id, n] : stores)
        if (const ItemDef* d = findItem(id)) used += d->storage * n;
    return used;
}

int Base::itemCount(const std::string& id) const {
    auto it = stores.find(id);
    return it == stores.end() ? 0 : it->second;
}

void Base::addItem(const std::string& id, int n) {
    if (n > 0) stores[id] += n;
}

bool Base::removeItem(const std::string& id, int n) {
    auto it = stores.find(id);
    if (it == stores.end() || it->second < n) return false;
    it->second -= n;
    if (it->second == 0) stores.erase(it);
    return true;
}

int Base::radarRange() const {
    int best = 0;
    for (const auto& f : facilities)
        if (f.ready() && facility(f.type).radarRangeNm > best) best = facility(f.type).radarRangeNm;
    return best;
}

int Base::monthlyUpkeep() const {
    int total = 0;
    for (const auto& f : facilities) total += facility(f.type).upkeep;
    return total;
}

bool Base::canBuild(FacilityType t, int x, int y, std::string* why) const {
    auto fail = [&](const char* msg) {
        if (why) *why = msg;
        return false;
    };
    int s = facility(t).size;
    if (x < 0 || y < 0 || x + s > kBaseGrid || y + s > kBaseGrid) return fail("Does not fit there.");
    for (int dy = 0; dy < s; ++dy)
        for (int dx = 0; dx < s; ++dx)
            if (facilityAt(x + dx, y + dy)) return fail("Space is occupied.");
    if (t == FacilityType::AccessLift && countFacilities(FacilityType::AccessLift, false) > 0)
        return fail("A base has only one access lift.");
    if (facilities.empty()) return true;
    // Must touch an existing facility on an edge (not diagonally).
    for (int dy = 0; dy < s; ++dy)
        for (int dx = 0; dx < s; ++dx) {
            int cx = x + dx, cy = y + dy;
            const int nx[] = {cx - 1, cx + 1, cx, cx};
            const int ny[] = {cy, cy, cy - 1, cy + 1};
            for (int i = 0; i < 4; ++i)
                if (facilityAt(nx[i], ny[i])) return true;
        }
    return fail("Must connect to an existing facility.");
}

} // namespace vamps

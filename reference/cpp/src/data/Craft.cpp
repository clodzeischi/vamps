#include "data/Craft.h"

namespace vamps {

const std::vector<CraftDef>& craftTypes() {
    static const std::vector<CraftDef> t = {
        //  id        name                  spd  fuel  hp sold slots  rent    radar
        {"kestrel", "Kestrel Tiltrotor",     760, 10.0, 150, 14, 0, 500000, 600,
         "Troop transport. Carries 14 soldiers and their equipment."},
        {"lancer", "Lancer Interceptor",    2100,  3.0, 100,  0, 2, 600000, 600,
         "Long-range interceptor. Forces down vampire flights over unpopulated ground."},
    };
    return t;
}

const CraftDef& craftType(const std::string& id) {
    for (const auto& c : craftTypes())
        if (c.id == id) return c;
    return craftTypes().front();
}

const std::vector<HuntCraftDef>& huntCraftTypes() {
    static const std::vector<HuntCraftDef> t = {
        //  id          name                spd   hp  crew   dmg rng rel month
        {"courier",   "Courier Jet",         520,  60, 2, 4,   0,  0,  0, 0,
         "A private business jet. Unarmed."},
        {"charter",   "Charter Flight",      480, 200, 5, 9,   0,  0,  0, 0,
         "A chartered airliner with a 'medical' cargo hold."},
        {"cargo",     "Cargo Lifter",        430, 450, 8, 12,  8,  8,  3, 2,
         "Heavy freighter carrying a defensive gun pod."},
        {"gunship",   "Escort Gunship",     1100, 350, 3, 6,  20, 25,  6, 3,
         "A converted military jet. Hunts your interceptors."},
        {"exodus",    "Exodus Heavy",        400, 1200, 12, 18, 30, 35, 5, 5,
         "A wide-body transport moving an entire coven."},
    };
    return t;
}

const HuntCraftDef& huntCraft(const std::string& id) {
    for (const auto& c : huntCraftTypes())
        if (c.id == id) return c;
    return huntCraftTypes().front();
}

} // namespace vamps

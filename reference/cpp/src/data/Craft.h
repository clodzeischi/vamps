#pragma once
// Aircraft: the agency's own (transports, interceptors) and the bloodlines'
// flights ("hunts"), the counterpart of UFO classes.

#include <string>
#include <vector>

namespace vamps {

struct CraftDef {
    std::string id;
    std::string name;
    int speed;          // knots
    double fuelHours;   // endurance
    int hp;
    int soldiers;       // passenger capacity
    int weaponSlots;
    int rent;           // monthly
    int radarRangeNm;
    std::string description;
};

struct HuntCraftDef {
    std::string id;
    std::string name;
    int speed;
    int hp;
    int crewMin, crewMax;
    int weaponDamage;     // 0 = unarmed
    int weaponRangeKm;
    int weaponReloadSec;
    int firstMonth;       // campaign month (0-based) from which it appears
    std::string description;
};

const std::vector<CraftDef>& craftTypes();
const CraftDef& craftType(const std::string& id);

const std::vector<HuntCraftDef>& huntCraftTypes();
const HuntCraftDef& huntCraft(const std::string& id);

} // namespace vamps

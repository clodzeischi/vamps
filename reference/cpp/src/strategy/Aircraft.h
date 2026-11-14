#pragma once
// The agency's aircraft as they exist in a campaign (see data/Craft.h for
// the static types).

#include <string>
#include <vector>

#include "core/Geo.h"

namespace vamps {

enum class CraftStatus { Ready, Refuelling, Repairing, Rearming, Airborne };
const char* craftStatusName(CraftStatus s);

enum class CraftTarget { None, Hunt, Site, Waypoint, Home };

struct CraftWeapon {
    std::string id; // item id of the craft weapon, "" = empty hardpoint
    int ammo = 0;
};

struct Craft {
    int id = 0;
    std::string type;       // CraftDef id
    std::string name;       // "KESTREL-1"
    int baseId = 0;
    LatLon pos;
    CraftStatus status = CraftStatus::Ready;
    double fuel = 0;        // hours of flight left
    int hp = 0;
    std::vector<CraftWeapon> weapons;

    CraftTarget target = CraftTarget::None;
    int targetId = -1;      // hunt or site id
    LatLon waypoint;
    bool lowFuelWarned = false;

    bool airborne() const { return status == CraftStatus::Airborne; }
};

} // namespace vamps

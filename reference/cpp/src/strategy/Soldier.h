#pragma once
// A soldier on the roster. Stats grow through experience in battle, like
// the original. Loadout and armour persist between missions.

#include <string>

#include "data/Inventory.h"
#include "data/Stats.h"

namespace vamps {

enum class SoldierRank { Rookie, Squaddie, Sergeant, Captain, Colonel, Commander };
const char* soldierRankName(SoldierRank r);

struct Soldier {
    int id = 0;
    std::string name;
    int nation = 0;          // nationality (index into nations())
    UnitStats stats;
    UnitStats initial;       // at recruitment, for the stat screen
    SoldierRank rank = SoldierRank::Rookie;
    int missions = 0;
    int kills = 0;
    int woundDays = 0;       // days in recovery; cannot deploy while > 0
    bool mercenary = false;  // hired off the black market
    std::string armor = "kevlar"; // item id, "" = none
    Loadout loadout;         // carried equipment (owned; not in base stores)
    int baseId = 0;
    int craftId = -1;        // assigned to a transport (-1 = none)
    bool inTransit = false;  // being transferred between bases
};

// Rolls a new recruit. Mercenaries roll higher stats.
Soldier generateSoldier(int id, int baseId, bool mercenary = false);

// Standard starting kit: rifle, two magazines, a frag grenade, a molotov.
Loadout defaultLoadout();

} // namespace vamps

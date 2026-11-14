#pragma once
// Enemy activity on the Geoscape.
//
//   Hunt        - a bloodline flight in the air (the UFO equivalent).
//   MissionSite - a place where a tactical battle can happen: a forced-down
//                 flight, a landed flight, a harvest (terror) night, a PR
//                 event, a lair, or the final assault.

#include <cstdint>
#include <string>

#include "core/Geo.h"

namespace vamps {

enum class HuntMission { Feeding, Infiltration, Harvest, Supply };
const char* huntMissionName(HuntMission m);

enum class HuntPhase { Inbound, Landed, Outbound };

struct Hunt {
    int id = 0;
    std::string craftType;  // HuntCraftDef id
    int bloodline = 0;
    HuntMission mission = HuntMission::Feeding;
    int nation = -1;
    int city = -1;
    LatLon pos, dest, exit;
    HuntPhase phase = HuntPhase::Inbound;
    int hp = 0;
    int crew = 0;
    bool detected = false;
    int64_t phaseEnds = 0;  // landed until
    int siteId = -1;        // landed-site id while on the ground
};

enum class SiteType { CrashSite, LandedHunt, Harvest, PREvent, Lair, Final };
const char* siteTypeName(SiteType t);

struct MissionSite {
    int id = 0;
    SiteType type = SiteType::CrashSite;
    std::string label;      // shown on the globe
    LatLon pos;
    int bloodline = 0;
    int nation = -1;
    int city = -1;
    int64_t expires = 0;    // 0 = never
    int crew = 0;           // enemy count hint
    std::string craftType;  // for crash / landed sites
    HuntMission mission = HuntMission::Feeding;
    int huntId = -1;
    bool detected = true;   // visible to the player
    int stage = 1;          // final mission: 1 = surface, 2 = catacombs
};

} // namespace vamps

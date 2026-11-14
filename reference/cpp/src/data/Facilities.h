#pragma once
// Base facilities. Bases are 6x6 grids; hangars take 2x2.

#include <string>

namespace vamps {

enum class FacilityType {
    AccessLift, Quarters, Laboratory, Workshop, Stores,
    ListeningPost, SigintArray, Hangar, Containment, Count
};

struct FacilityDef {
    FacilityType type;
    const char* name;
    const char* abbrev; // 4 chars for the base grid
    int size;           // 1 or 2 (square)
    int cost;
    int buildDays;
    int upkeep;         // monthly
    int capacity;       // personnel / scientists / engineers / store units / craft / captives
    int radarRangeNm;   // 0 = no radar
    int detectPercent;  // chance per 10 minutes for a flight inside the range
    const char* description;
};

const FacilityDef& facility(FacilityType t);

constexpr int kBaseGrid = 6;

} // namespace vamps

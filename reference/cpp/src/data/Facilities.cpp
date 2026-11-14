#include "data/Facilities.h"

#include <vector>

namespace vamps {

const FacilityDef& facility(FacilityType t) {
    using T = FacilityType;
    //                  type               name                   abbr  sz cost    days upkp  cap  radar det
    static const std::vector<FacilityDef> defs = {
        {T::AccessLift,    "Access Lift",          "LIFT", 1, 300000,  4,  4000,  0,   0,    0,
         "Surface access. Every base needs exactly one."},
        {T::Quarters,      "Living Quarters",      "QTRS", 1, 400000, 16, 10000, 50,   0,    0,
         "Houses 50 personnel (soldiers, scientists, engineers)."},
        {T::Laboratory,    "Laboratory",           "LAB ", 1, 750000, 26, 30000, 50,   0,    0,
         "Space for 50 scientists."},
        {T::Workshop,      "Workshop",             "WKSP", 1, 800000, 32, 35000, 50,   0,    0,
         "Space for 50 engineers."},
        {T::Stores,        "General Stores",       "STOR", 1, 150000, 10,  5000, 50,   0,    0,
         "50 units of storage."},
        {T::ListeningPost, "Listening Post",       "LSTN", 1, 500000, 12, 10000,  0, 1500, 10,
         "SIGINT intercept of air traffic. 1500 nm, 10% per 10 minutes."},
        {T::SigintArray,   "SIGINT Array",         "SGNT", 1, 800000, 25, 15000,  0, 2200, 20,
         "Wide-area signals and radar fusion. 2200 nm, 20% per 10 minutes."},
        {T::Hangar,        "Hangar",               "HNGR", 2, 200000, 25, 25000,  1,   0,    0,
         "Holds one aircraft."},
        {T::Containment,   "Containment Cells",    "CELL", 1, 400000, 18, 15000, 10,   0,    0,
         "Holds 10 captives in torpor. Without it, captives are incinerated."},
    };
    return defs[(int)t];
}

} // namespace vamps

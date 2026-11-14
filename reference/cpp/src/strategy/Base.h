#pragma once
// A base: a 6x6 grid of facilities plus everything stationed there.

#include <cstdint>
#include <map>
#include <string>
#include <vector>

#include "core/Geo.h"
#include "data/Bloodlines.h"
#include "data/Facilities.h"

namespace vamps {

struct Facility {
    FacilityType type;
    int x = 0, y = 0;   // top-left cell
    int daysLeft = 0;   // 0 = operational
    bool ready() const { return daysLeft <= 0; }
};

struct ResearchProject {
    std::string id;
    int scientists = 0;
    double progress = 0; // scientist-days done
    double cost = 0;     // scientist-days needed (randomised when started)
};

struct ProductionJob {
    std::string itemId;
    int engineers = 0;
    int quantity = 1;
    int produced = 0;
    double progress = 0; // engineer-hours into the current unit
};

struct Captive {
    EnemyRank rank = EnemyRank::Fledgling;
    int bloodline = 0;
};

enum class TransferKind { Item, Soldier, Scientist, Engineer, Captive, Craft };

// Anything on its way to a base: purchases, hires and inter-base transfers.
struct Transfer {
    TransferKind kind = TransferKind::Item;
    std::string itemId;   // item id or craft type
    int count = 1;
    int refId = -1;       // soldier / craft id
    Captive captive;
    int64_t arrival = 0;  // GameTime seconds
};

struct Base {
    int id = 0;
    std::string name;
    LatLon pos;
    std::vector<Facility> facilities;
    std::map<std::string, int> stores;
    int scientists = 0;   // total at base (busy + idle)
    int engineers = 0;
    std::vector<ResearchProject> research;
    std::vector<ProductionJob> production;
    std::vector<Captive> captives;
    std::vector<Transfer> incoming;

    // ----- queries -----
    const Facility* facilityAt(int x, int y) const;
    int countFacilities(FacilityType t, bool readyOnly = true) const;
    int capacity(FacilityType t) const;      // summed over ready facilities
    int scientistsBusy() const;
    int engineersBusy() const;
    int scientistsFree() const { return scientists - scientistsBusy(); }
    int engineersFree() const { return engineers - engineersBusy(); }
    double storageUsed() const;
    int itemCount(const std::string& id) const;
    void addItem(const std::string& id, int n = 1);
    bool removeItem(const std::string& id, int n = 1); // false if not enough

    // Best radar in this base: range in nm and detect % per 10 minutes.
    int radarRange() const;
    int monthlyUpkeep() const;

    // Building rules: in bounds, free, connected to an existing facility.
    bool canBuild(FacilityType t, int x, int y, std::string* why = nullptr) const;
};

} // namespace vamps

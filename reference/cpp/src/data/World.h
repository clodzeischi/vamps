#pragma once
// The physical world: continents (coarse coastline polygons, the way the
// original stored its globe), funding nations and cities.
//
// At startup the polygons are rasterised into a 0.5-degree land mask, and
// every land cell is assigned to the nearest nation "seed" on the same
// continent. That gives plausible borders for very little data.

#include <cstdint>
#include <string>
#include <vector>

#include "core/Geo.h"

namespace vamps {

enum class Continent : int { NorthAmerica, SouthAmerica, Europe, Africa, Asia, Oceania, Count, None = 255 };
const char* continentName(Continent c);

enum class Biome { Ocean, Temperate, Forest, Desert, Arctic, Tropical };
const char* biomeName(Biome b);

struct NationDef {
    std::string id;
    std::string name;
    Continent continent;
    std::vector<LatLon> seeds; // territory centres (Russia has two)
    int baseFunding;           // thousands of dollars per month at neutral support
};

struct CityDef {
    std::string name;
    LatLon pos;
};

struct CoastPolygon {
    Continent continent;
    std::vector<LatLon> points;
};

const std::vector<NationDef>& nations();
const std::vector<CityDef>& cities();
const std::vector<CoastPolygon>& coastlines();

// The Montsegur ruins, site of the final mission.
LatLon montsegurLocation();

class WorldMap {
public:
    static constexpr int kWidth = 720;  // 0.5 deg per cell
    static constexpr int kHeight = 360;

    WorldMap();

    bool isLand(const LatLon& p) const;
    Continent continentAt(const LatLon& p) const;
    int nationAt(const LatLon& p) const; // -1 = sea / no nation
    // Nation for gameplay purposes: if `p` is at sea, the nearest nation.
    int nearestNation(const LatLon& p) const;
    Biome biomeAt(const LatLon& p) const;

    int cityNation(int city) const { return cityNation_[city]; }
    int nearestCity(const LatLon& p, double* distNm = nullptr) const;

private:
    int cellIndex(const LatLon& p) const;

    std::vector<uint8_t> continent_; // Continent or 255
    std::vector<int8_t> nation_;     // index into nations() or -1
    std::vector<int> cityNation_;
};

const WorldMap& world();

} // namespace vamps

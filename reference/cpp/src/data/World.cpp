#include "data/World.h"

#include <cmath>
#include <limits>

namespace vamps {

const char* continentName(Continent c) {
    switch (c) {
        case Continent::NorthAmerica: return "North America";
        case Continent::SouthAmerica: return "South America";
        case Continent::Europe: return "Europe";
        case Continent::Africa: return "Africa";
        case Continent::Asia: return "Asia";
        case Continent::Oceania: return "Oceania";
        default: return "Open Sea";
    }
}

const char* biomeName(Biome b) {
    switch (b) {
        case Biome::Ocean: return "Ocean";
        case Biome::Temperate: return "Farmland";
        case Biome::Forest: return "Forest";
        case Biome::Desert: return "Desert";
        case Biome::Arctic: return "Arctic";
        case Biome::Tropical: return "Jungle";
    }
    return "?";
}

LatLon montsegurLocation() { return {42.87, 1.83}; }

// ---------------------------------------------------------------------------
// Nations. Funding in $1000s per month at neutral (0) support.
// ---------------------------------------------------------------------------
const std::vector<NationDef>& nations() {
    using C = Continent;
    static const std::vector<NationDef> t = {
        {"usa", "United States", C::NorthAmerica, {{39, -98}, {64, -150}}, 1200},
        {"can", "Canada", C::NorthAmerica, {{58, -100}, {70, -40}}, 400},
        {"mex", "Mexico", C::NorthAmerica, {{22, -101}, {15, -88}}, 250},
        {"bra", "Brazil", C::SouthAmerica, {{-10, -52}}, 400},
        {"arg", "Argentina", C::SouthAmerica, {{-36, -65}}, 250},
        {"col", "Andean Pact", C::SouthAmerica, {{2, -73}, {-12, -75}}, 200},
        {"gbr", "United Kingdom", C::Europe, {{54, -2}}, 500},
        {"fra", "France", C::Europe, {{46.5, 2}}, 500},
        {"deu", "Germany", C::Europe, {{51, 10}, {60, 15}}, 550},
        {"ita", "Italy", C::Europe, {{43, 12.5}, {44, 21}}, 400},
        {"esp", "Spain", C::Europe, {{40, -4}}, 350},
        {"rus", "Russia", C::Europe, {{56, 42}, {62, 100}, {64, 140}}, 600},
        {"chn", "China", C::Asia, {{34, 105}, {45, 88}}, 700},
        {"ind", "India", C::Asia, {{22, 79}}, 400},
        {"jpn", "Japan", C::Asia, {{37, 139}, {37, 127}}, 600},
        {"sau", "Gulf States", C::Asia, {{24, 46}, {33, 40}, {37, 35}}, 450},
        {"egy", "Egypt", C::Africa, {{26, 30}, {31, 10}}, 200},
        {"nga", "Nigeria", C::Africa, {{9, 8}, {14, -5}}, 200},
        {"zaf", "South Africa", C::Africa, {{-29, 24}}, 250},
        {"ken", "Kenya", C::Africa, {{0, 38}, {-5, 25}}, 150},
        {"aus", "Australia", C::Oceania, {{-25, 134}}, 450},
        {"nzl", "New Zealand", C::Oceania, {{-41, 173}}, 150},
        {"idn", "Indonesia", C::Oceania, {{-2, 115}, {-5, 140}, {5, 100}}, 250},
    };
    return t;
}

const std::vector<CityDef>& cities() {
    static const std::vector<CityDef> t = {
        {"New York", {40.7, -74.0}},    {"Los Angeles", {34.0, -118.2}}, {"Chicago", {41.9, -87.6}},
        {"Houston", {29.8, -95.4}},     {"Toronto", {43.7, -79.4}},      {"Vancouver", {49.3, -123.1}},
        {"Mexico City", {19.4, -99.1}}, {"Sao Paulo", {-23.5, -46.6}},   {"Rio de Janeiro", {-22.9, -43.2}},
        {"Buenos Aires", {-34.6, -58.4}}, {"Bogota", {4.7, -74.1}},      {"Lima", {-12.0, -77.0}},
        {"London", {51.5, -0.1}},       {"Paris", {48.9, 2.35}},         {"Berlin", {52.5, 13.4}},
        {"Rome", {41.9, 12.5}},         {"Madrid", {40.4, -3.7}},        {"Toulouse", {43.6, 1.44}},
        {"Moscow", {55.8, 37.6}},       {"St Petersburg", {59.9, 30.3}}, {"Novosibirsk", {55.0, 82.9}},
        {"Cairo", {30.0, 31.2}},        {"Lagos", {6.5, 3.4}},           {"Nairobi", {-1.3, 36.8}},
        {"Johannesburg", {-26.2, 28.0}}, {"Cape Town", {-33.9, 18.4}},   {"Beijing", {39.9, 116.4}},
        {"Shanghai", {31.2, 121.5}},    {"Hong Kong", {22.3, 114.2}},    {"Mumbai", {19.0, 72.8}},
        {"Delhi", {28.6, 77.2}},        {"Tokyo", {35.7, 139.7}},        {"Seoul", {37.6, 127.0}},
        {"Riyadh", {24.7, 46.7}},       {"Dubai", {25.2, 55.3}},         {"Istanbul", {41.0, 29.0}},
        {"Sydney", {-33.9, 151.2}},     {"Perth", {-31.9, 115.9}},       {"Auckland", {-36.8, 174.8}},
        {"Jakarta", {-6.2, 106.8}},
    };
    return t;
}

// ---------------------------------------------------------------------------
// Coastlines, written as (lon, lat) pairs for readability against an atlas.
// Deliberately coarse: this is a strategy map, not a navigation chart.
// ---------------------------------------------------------------------------
namespace {

CoastPolygon poly(Continent c, std::initializer_list<std::pair<double, double>> lonLat) {
    CoastPolygon p{c, {}};
    for (auto& [lon, lat] : lonLat) p.points.push_back({lat, lon});
    return p;
}

} // namespace

const std::vector<CoastPolygon>& coastlines() {
    using C = Continent;
    static const std::vector<CoastPolygon> t = {
        poly(C::NorthAmerica,
             {{-168, 66}, {-162, 70}, {-156, 71}, {-140, 70}, {-128, 70}, {-115, 68}, {-95, 72}, {-82, 73},
              {-80, 68}, {-90, 64}, {-94, 59}, {-88, 56}, {-82, 55}, {-78, 60}, {-75, 62}, {-65, 60},
              {-60, 55}, {-56, 52}, {-60, 47}, {-66, 44}, {-70, 42}, {-74, 40}, {-76, 35}, {-81, 31},
              {-80, 26}, {-82, 26}, {-85, 30}, {-90, 29}, {-97, 27}, {-97, 22}, {-92, 19}, {-87, 21},
              {-88, 16}, {-83, 15}, {-83, 10}, {-79, 9}, {-77, 8}, {-80, 7}, {-83, 8}, {-86, 12},
              {-92, 14}, {-96, 16}, {-105, 20}, {-106, 23}, {-110, 24}, {-112, 29}, {-110, 23},
              {-115, 30}, {-117, 32}, {-120, 34}, {-124, 40}, {-124, 46}, {-124, 49}, {-130, 54},
              {-135, 58}, {-140, 60}, {-150, 60}, {-155, 58}, {-162, 55}, {-165, 60}, {-166, 63}}),
        poly(C::NorthAmerica, // Greenland
             {{-55, 60}, {-45, 60}, {-40, 65}, {-22, 70}, {-20, 76}, {-18, 81}, {-35, 83}, {-60, 82},
              {-72, 78}, {-66, 75}, {-56, 72}, {-52, 67}}),
        poly(C::NorthAmerica, // Baffin & arctic islands
             {{-80, 63}, {-62, 66}, {-70, 72}, {-80, 74}, {-100, 76}, {-120, 76}, {-110, 72}, {-90, 70}}),
        poly(C::SouthAmerica,
             {{-77, 8}, {-72, 12}, {-62, 11}, {-52, 5}, {-50, 0}, {-44, -2}, {-35, -5}, {-35, -9},
              {-39, -15}, {-41, -22}, {-48, -26}, {-53, -34}, {-58, -38}, {-62, -39}, {-65, -42},
              {-66, -47}, {-69, -51}, {-68, -55}, {-72, -54}, {-75, -50}, {-74, -42}, {-72, -30},
              {-70, -18}, {-76, -14}, {-81, -6}, {-80, 0}, {-78, 3}}),
        poly(C::Europe,
             {{-10, 36}, {-9, 43}, {-1, 46}, {-4, 48}, {2, 51}, {8, 54}, {8, 57}, {11, 58}, {11, 56},
              {14, 55}, {20, 55}, {22, 60}, {18, 60}, {17, 63}, {22, 66}, {14, 66}, {5, 62}, {5, 59},
              {14, 68}, {20, 70}, {28, 71}, {40, 68}, {60, 69}, {60, 50}, {52, 46}, {48, 42}, {41, 41},
              {29, 41}, {26, 38}, {23, 36}, {20, 40}, {18, 40}, {16, 38}, {15, 40}, {12, 44}, {9, 44},
              {4, 43}, {0, 39}, {-2, 36}, {-6, 36}}),
        poly(C::Europe, // Britain
             {{-5, 50}, {1, 51}, {2, 53}, {-2, 56}, {-2, 58}, {-5, 59}, {-6, 56}, {-5, 54}, {-3, 53}, {-5, 52}}),
        poly(C::Europe, {{-10, 52}, {-6, 52}, {-6, 55}, {-8, 55}, {-10, 54}}), // Ireland
        poly(C::Europe, {{-24, 64}, {-14, 64}, {-14, 66}, {-22, 66}}),         // Iceland
        poly(C::Asia,
             {{60, 69}, {70, 73}, {80, 73}, {100, 77}, {110, 74}, {130, 71}, {150, 71}, {170, 70},
              {180, 68}, {180, 65}, {170, 60}, {163, 58}, {156, 51}, {155, 57}, {143, 59}, {140, 54},
              {135, 44}, {130, 42}, {129, 35}, {126, 35}, {125, 39}, {121, 39}, {122, 31}, {120, 25},
              {115, 22}, {108, 21}, {106, 17}, {109, 12}, {105, 9}, {100, 13}, {100, 7}, {103, 1},
              {98, 8}, {98, 16}, {94, 17}, {92, 22}, {87, 22}, {80, 15}, {77, 8}, {73, 17}, {72, 22},
              {67, 24}, {62, 25}, {57, 25}, {56, 27}, {52, 27}, {50, 30}, {48, 30}, {51, 24}, {56, 25},
              {59, 22}, {56, 18}, {52, 16}, {45, 13}, {43, 15}, {39, 22}, {35, 28}, {34, 31}, {36, 36},
              {27, 37}, {26, 40}, {29, 41}, {41, 41}, {48, 42}, {52, 46}, {60, 50}}),
        poly(C::Asia, // Japan
             {{130, 31}, {132, 34}, {136, 34}, {140, 36}, {142, 40}, {141, 43}, {145, 44}, {141, 45},
              {140, 42}, {138, 37}, {133, 35}}),
        poly(C::Asia, {{80, 10}, {82, 7}, {80, 6}}), // Sri Lanka
        poly(C::Africa,
             {{-17, 21}, {-17, 15}, {-13, 9}, {-8, 4}, {-2, 5}, {5, 6}, {9, 4}, {10, -1}, {13, -6},
              {12, -13}, {14, -22}, {17, -29}, {20, -35}, {26, -34}, {32, -29}, {35, -24}, {36, -19},
              {40, -15}, {40, -10}, {39, -5}, {42, -1}, {51, 12}, {44, 11}, {43, 13}, {39, 16},
              {35, 24}, {33, 31}, {25, 32}, {20, 31}, {15, 32}, {10, 34}, {10, 37}, {3, 37}, {-2, 35},
              {-6, 36}, {-10, 30}, {-13, 27}}),
        poly(C::Africa, {{44, -25}, {47, -25}, {50, -15}, {49, -12}, {44, -17}}), // Madagascar
        poly(C::Oceania,
             {{114, -22}, {114, -34}, {118, -35}, {124, -34}, {131, -31}, {138, -35}, {141, -38},
              {146, -39}, {150, -37}, {153, -30}, {153, -25}, {146, -19}, {142, -11}, {140, -18},
              {136, -16}, {136, -12}, {131, -11}, {126, -14}, {122, -18}}),
        poly(C::Oceania, {{145, -41}, {148, -41}, {148, -43}, {146, -43.5}}), // Tasmania
        poly(C::Oceania, {{172, -35}, {178, -38}, {174, -41}, {171, -45}, {167, -46}, {172, -41}}), // NZ
        poly(C::Oceania, {{95, 5}, {98, 4}, {106, -6}, {102, -4}}),                              // Sumatra
        poly(C::Oceania, {{106, -6}, {114, -7}, {114, -8.5}, {106, -7.5}}),                      // Java
        poly(C::Oceania, {{109, 1}, {111, -3}, {116, -4}, {119, 1}, {117, 7}, {113, 3}}),          // Borneo
        poly(C::Oceania, {{131, -1}, {141, -3}, {150, -10}, {143, -9}, {138, -8}, {133, -4}}),     // New Guinea
        poly(C::Asia, {{120, 18}, {122, 18}, {126, 7}, {124, 6}, {120, 14}}),                     // Philippines
    };
    return t;
}

// ---------------------------------------------------------------------------
// WorldMap rasterisation
// ---------------------------------------------------------------------------
namespace {

bool pointInPolygon(const std::vector<LatLon>& pts, double lat, double lon) {
    bool inside = false;
    for (size_t i = 0, j = pts.size() - 1; i < pts.size(); j = i++) {
        const auto& a = pts[i];
        const auto& b = pts[j];
        if ((a.lat > lat) != (b.lat > lat)) {
            double x = (b.lon - a.lon) * (lat - a.lat) / (b.lat - a.lat) + a.lon;
            if (lon < x) inside = !inside;
        }
    }
    return inside;
}

} // namespace

WorldMap::WorldMap()
    : continent_(kWidth * kHeight, 255), nation_(kWidth * kHeight, -1) {
    const auto& ns = nations();
    for (int y = 0; y < kHeight; ++y) {
        double lat = 90.0 - (y + 0.5) * 0.5;
        for (int x = 0; x < kWidth; ++x) {
            double lon = -180.0 + (x + 0.5) * 0.5;
            int idx = y * kWidth + x;
            if (lat < -68) { continent_[idx] = 254; continue; } // Antarctica: land, no nation
            for (const auto& p : coastlines()) {
                if (pointInPolygon(p.points, lat, lon)) {
                    continent_[idx] = (uint8_t)p.continent;
                    break;
                }
            }
            if (continent_[idx] >= 254) continue;
            // Nearest seed of a nation on the same continent.
            double best = std::numeric_limits<double>::max();
            LatLon here{lat, lon};
            for (int n = 0; n < (int)ns.size(); ++n) {
                if ((uint8_t)ns[n].continent != continent_[idx]) continue;
                for (const auto& s : ns[n].seeds) {
                    double d = angleBetween(here, s);
                    if (d < best) { best = d; nation_[idx] = (int8_t)n; }
                }
            }
        }
    }
    for (const auto& c : cities()) cityNation_.push_back(nearestNation(c.pos));
}

int WorldMap::cellIndex(const LatLon& p) const {
    int x = (int)std::floor((wrapLon(p.lon) + 180.0) * 2.0);
    int y = (int)std::floor((90.0 - p.lat) * 2.0);
    if (x < 0) x = 0; if (x >= kWidth) x = kWidth - 1;
    if (y < 0) y = 0; if (y >= kHeight) y = kHeight - 1;
    return y * kWidth + x;
}

bool WorldMap::isLand(const LatLon& p) const { return continent_[cellIndex(p)] != 255; }

Continent WorldMap::continentAt(const LatLon& p) const {
    uint8_t c = continent_[cellIndex(p)];
    return c < (uint8_t)Continent::Count ? (Continent)c : Continent::None;
}

int WorldMap::nationAt(const LatLon& p) const { return nation_[cellIndex(p)]; }

int WorldMap::nearestNation(const LatLon& p) const {
    int n = nationAt(p);
    if (n >= 0) return n;
    double best = std::numeric_limits<double>::max();
    const auto& ns = nations();
    for (int i = 0; i < (int)ns.size(); ++i)
        for (const auto& s : ns[i].seeds) {
            double d = angleBetween(p, s);
            if (d < best) { best = d; n = i; }
        }
    return n;
}

Biome WorldMap::biomeAt(const LatLon& p) const {
    uint8_t c = continent_[cellIndex(p)];
    if (c == 255) return Biome::Ocean;
    double lat = p.lat, lon = p.lon;
    if (c == 254 || std::fabs(lat) > 62) return Biome::Arctic;
    auto box = [&](double la0, double la1, double lo0, double lo1) {
        return lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1;
    };
    if (box(15, 32, -17, 35) || box(15, 33, 35, 60) || box(-32, -20, 118, 145) || box(38, 46, 90, 115) ||
        box(28, 37, -118, -105) || box(-28, -18, -71, -68))
        return Biome::Desert;
    if (std::fabs(lat) < 15) return Biome::Tropical;
    if (lat > 48) return Biome::Forest;
    return Biome::Temperate;
}

int WorldMap::nearestCity(const LatLon& p, double* distNm) const {
    int best = -1;
    double bestD = std::numeric_limits<double>::max();
    for (int i = 0; i < (int)cities().size(); ++i) {
        double d = distanceNm(p, cities()[i].pos);
        if (d < bestD) { bestD = d; best = i; }
    }
    if (distNm) *distNm = bestD;
    return best;
}

const WorldMap& world() {
    static const WorldMap instance;
    return instance;
}

} // namespace vamps

#pragma once
// Hand-made 10x10 map blocks, loaded from data/maps/*.txt and assembled
// into a 4x4 grid (a 40x40 battlescape), the way the original built its maps.
//
// File format (see data/maps/README.txt for the legend):
//
//   block farmhouse 3        <- name, optional weight (how often it is picked)
//   level 0
//   ..........               <- ten rows of ten characters
//   ...
//   level 1                  <- optional upper floor / roof
//   ...
//   end

#include <map>
#include <string>
#include <vector>

#include "tactical/BattleMap.h"

namespace vamps {

constexpr int kBlockSize = 10;

struct MapBlock {
    std::string name;
    int weight = 1;
    std::vector<std::vector<std::string>> levels; // levels[z][row]
};

class BlockLibrary {
public:
    bool load(const std::string& dir, std::string& err);
    bool loaded() const { return !sets_.empty(); }
    const std::vector<MapBlock>* set(const std::string& name) const;
    const MapBlock* find(const std::string& set, const std::string& block) const;

private:
    std::map<std::string, std::vector<MapBlock>> sets_; // file stem -> blocks
};

BlockLibrary& blockLibrary();
std::string dataDirectory(); // ./data if present, else the source tree's data/

enum class MapKind { Rural, Forest, Urban, Desert, Arctic, Jungle, Lair, Ruins, Catacombs };
const char* mapKindName(MapKind k);

struct MapRequest {
    MapKind kind = MapKind::Rural;
    bool wreck = false;         // place a downed/landed aircraft block
    bool progenitorHall = false;
};

BattleMap generateMap(const MapRequest& req);

} // namespace vamps

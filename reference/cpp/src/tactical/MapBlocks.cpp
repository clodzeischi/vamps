#include "tactical/MapBlocks.h"

#include <filesystem>
#include <fstream>
#include <sstream>

#include "core/Random.h"

namespace vamps {

namespace fs = std::filesystem;

const char* mapKindName(MapKind k) {
    switch (k) {
        case MapKind::Rural: return "Farmland";
        case MapKind::Forest: return "Forest";
        case MapKind::Urban: return "City";
        case MapKind::Desert: return "Desert";
        case MapKind::Arctic: return "Arctic";
        case MapKind::Jungle: return "Jungle";
        case MapKind::Lair: return "Lair";
        case MapKind::Ruins: return "Montsegur Ruins";
        case MapKind::Catacombs: return "Catacombs";
    }
    return "?";
}

std::string dataDirectory() {
    if (fs::exists("data/maps")) return "data";
#ifdef VAMPS_DATA_DIR
    return VAMPS_DATA_DIR;
#else
    return "data";
#endif
}

BlockLibrary& blockLibrary() {
    static BlockLibrary lib;
    return lib;
}

bool BlockLibrary::load(const std::string& dir, std::string& err) {
    sets_.clear();
    std::error_code ec;
    for (const auto& entry : fs::directory_iterator(dir + "/maps", ec)) {
        if (entry.path().extension() != ".txt" || entry.path().stem() == "README") continue;
        std::ifstream in(entry.path());
        std::string setName = entry.path().stem().string();
        std::string line;
        MapBlock* cur = nullptr;
        std::vector<std::string>* level = nullptr;
        int lineNo = 0;
        while (std::getline(in, line)) {
            ++lineNo;
            if (!line.empty() && line.back() == '\r') line.pop_back();
            std::istringstream ss(line);
            std::string word;
            ss >> word;
            if (word == "block") {
                sets_[setName].push_back({});
                cur = &sets_[setName].back();
                ss >> cur->name;
                if (!(ss >> cur->weight)) cur->weight = 1;
                level = nullptr;
            } else if (word == "level" && cur) {
                cur->levels.emplace_back();
                level = &cur->levels.back();
            } else if (word == "end") {
                cur = nullptr;
                level = nullptr;
            } else if (level && (int)level->size() < kBlockSize) {
                line.resize(kBlockSize, ' ');
                level->push_back(line);
            } else if (!word.empty() && word[0] != '#' && !cur) {
                err = entry.path().string() + ":" + std::to_string(lineNo) + ": unexpected '" + word + "'";
                return false;
            }
        }
    }
    // Pad short levels so every block is exactly 10x10.
    for (auto& [name, blocks] : sets_)
        for (auto& b : blocks)
            for (auto& lv : b.levels)
                while ((int)lv.size() < kBlockSize) lv.push_back(std::string(kBlockSize, ' '));
    if (sets_.empty()) {
        err = "No map blocks found in " + dir + "/maps";
        return false;
    }
    return true;
}

const std::vector<MapBlock>* BlockLibrary::set(const std::string& name) const {
    auto it = sets_.find(name);
    return it == sets_.end() || it->second.empty() ? nullptr : &it->second;
}

const MapBlock* BlockLibrary::find(const std::string& setName, const std::string& block) const {
    if (const auto* s = set(setName))
        for (const auto& b : *s)
            if (b.name == block) return &b;
    return nullptr;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------
namespace {

enum class Spawn { None, Player, Enemy, Civilian };

TileType groundFor(MapKind k) {
    switch (k) {
        case MapKind::Desert: return TileType::Sand;
        case MapKind::Arctic: return TileType::Snow;
        case MapKind::Jungle: return TileType::Dirt;
        case MapKind::Lair:
        case MapKind::Catacombs: return TileType::Floor;
        default: return TileType::Grass;
    }
}

// The legend. See data/maps/README.txt.
TileType charToTile(char c, int z, MapKind kind, Spawn& spawn) {
    spawn = Spawn::None;
    TileType ground = z == 0 ? groundFor(kind) : TileType::Void;
    switch (c) {
        case ' ': return ground;
        case '.': return z == 0 ? groundFor(kind) : TileType::Floor;
        case 'd': return TileType::Dirt;
        case ',': return TileType::Road;
        case '_': return TileType::Floor;
        case '#': return TileType::Wall;
        case 'w': return TileType::Window;
        case '+': return TileType::DoorClosed;
        case '\'': return TileType::DoorOpen;
        case 'T': return kind == MapKind::Desert ? TileType::Rock : TileType::Tree;
        case '*': return TileType::Bush;
        case '~': return TileType::Water;
        case '=': return TileType::LowWall;
        case 'o': return TileType::Crate;
        case 'H': return TileType::Stairs;
        case '%': return TileType::Hull;
        case 'r': return TileType::Rubble;
        case 'g': return TileType::Grave;
        case 'p': return TileType::Pew;
        case 'R': return TileType::Rock;
        case 'I': return TileType::Pillar;
        case 'E': spawn = Spawn::Player; return TileType::CraftFloor;
        case 'X': spawn = Spawn::Enemy; return z == 0 ? groundFor(kind) : TileType::Floor;
        case 'x': spawn = Spawn::Enemy; return TileType::Floor;
        case 'C': spawn = Spawn::Civilian; return z == 0 ? groundFor(kind) : TileType::Floor;
        case 'c': spawn = Spawn::Civilian; return TileType::Floor;
        default: return ground;
    }
}

const MapBlock& pickWeighted(const std::vector<MapBlock>& blocks) {
    int total = 0;
    for (const auto& b : blocks) total += b.weight;
    int roll = rng().range(1, std::max(1, total));
    for (const auto& b : blocks) {
        roll -= b.weight;
        if (roll <= 0) return b;
    }
    return blocks.front();
}

void stamp(BattleMap& map, const MapBlock& b, int bx, int by, MapKind kind) {
    for (int z = 0; z < (int)b.levels.size() && z < map.levels(); ++z)
        for (int y = 0; y < kBlockSize; ++y)
            for (int x = 0; x < kBlockSize; ++x) {
                Spawn sp;
                int mx = bx * kBlockSize + x, my = by * kBlockSize + y;
                TileType t = charToTile(b.levels[z][y][x], z, kind, sp);
                map.set(mx, my, z, t);
                Point3 p{mx, my, z};
                if (sp == Spawn::Player) map.playerSpawns.push_back(p);
                else if (sp == Spawn::Enemy) map.enemySpawns.push_back(p);
                else if (sp == Spawn::Civilian) map.civilianSpawns.push_back(p);
            }
}

std::vector<std::string> setsFor(MapKind k) {
    switch (k) {
        case MapKind::Rural: return {"rural", "rural", "forest"};
        case MapKind::Forest: return {"forest", "forest", "rural"};
        case MapKind::Urban: return {"urban"};
        case MapKind::Desert: return {"rural"};
        case MapKind::Arctic: return {"forest", "rural"};
        case MapKind::Jungle: return {"forest"};
        case MapKind::Lair: return {"lair"};
        case MapKind::Ruins: return {"ruins", "ruins", "rural"};
        case MapKind::Catacombs: return {"lair"};
    }
    return {"rural"};
}

} // namespace

BattleMap generateMap(const MapRequest& req) {
    const BlockLibrary& lib = blockLibrary();
    const bool underground = req.kind == MapKind::Lair || req.kind == MapKind::Catacombs;
    const int grid = 4;
    BattleMap map(grid * kBlockSize, grid * kBlockSize, underground ? 1 : 2);
    if (underground)
        for (int y = 0; y < map.height(); ++y)
            for (int x = 0; x < map.width(); ++x) map.set(x, y, 0, TileType::Rock);

    // Choose special cells: the landing zone on an edge, then the wreck /
    // progenitor hall away from it.
    Random& r = rng();
    int craftX, craftY;
    if (r.percent(50)) { craftX = r.percent(50) ? 0 : grid - 1; craftY = r.range(0, grid - 1); }
    else { craftY = r.percent(50) ? 0 : grid - 1; craftX = r.range(0, grid - 1); }
    int specialX = -1, specialY = -1;
    if (req.wreck || req.progenitorHall) {
        do {
            specialX = r.range(0, grid - 1);
            specialY = r.range(0, grid - 1);
        } while (std::abs(specialX - craftX) + std::abs(specialY - craftY) < (req.progenitorHall ? 4 : 2));
    }

    auto sets = setsFor(req.kind);
    for (int by = 0; by < grid; ++by)
        for (int bx = 0; bx < grid; ++bx) {
            const MapBlock* b = nullptr;
            if (bx == craftX && by == craftY)
                b = lib.find("special", underground ? "lair_entry" : "kestrel");
            else if (bx == specialX && by == specialY)
                b = lib.find("special", req.progenitorHall ? "progenitor_hall" : (r.percent(50) ? "wreck_a" : "wreck_b"));
            if (!b) {
                const auto* blocks = lib.set(sets[r.range(0, (int)sets.size() - 1)]);
                if (!blocks) blocks = lib.set("rural");
                if (blocks) b = &pickWeighted(*blocks);
            }
            if (b) stamp(map, *b, bx, by, req.kind);
        }

    // Stairs need something to arrive on.
    for (int z = 0; z + 1 < map.levels(); ++z)
        for (int y = 0; y < map.height(); ++y)
            for (int x = 0; x < map.width(); ++x)
                if (map.at(x, y, z).type == TileType::Stairs && !map.standable(x, y, z + 1))
                    map.set(x, y, z + 1, TileType::Floor);

    // Fallback if a data file is missing: a bare landing zone.
    if (map.playerSpawns.empty())
        for (int i = 0; i < 4; ++i)
            for (int j = 0; j < 4; ++j) {
                map.set(1 + i, 1 + j, 0, TileType::CraftFloor);
                map.playerSpawns.push_back({1 + i, 1 + j, 0});
            }
    return map;
}

} // namespace vamps

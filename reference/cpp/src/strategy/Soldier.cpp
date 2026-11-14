#include "strategy/Soldier.h"

#include <vector>

#include "core/Random.h"
#include "data/World.h"

namespace vamps {

const char* soldierRankName(SoldierRank r) {
    switch (r) {
        case SoldierRank::Rookie: return "Rookie";
        case SoldierRank::Squaddie: return "Squaddie";
        case SoldierRank::Sergeant: return "Sergeant";
        case SoldierRank::Captain: return "Captain";
        case SoldierRank::Colonel: return "Colonel";
        case SoldierRank::Commander: return "Commander";
    }
    return "?";
}

namespace {

const std::vector<std::string>& firstNames() {
    static const std::vector<std::string> v = {
        "Adele", "Bruno", "Camille", "Dmitri", "Elena", "Farid", "Greta", "Hiro", "Ines", "Jonas",
        "Kwame", "Lucia", "Marek", "Nadia", "Oskar", "Priya", "Quinn", "Rafael", "Sofia", "Tomas",
        "Ulla", "Viktor", "Wen", "Ximena", "Yusuf", "Zara", "Amara", "Bjorn", "Chloe", "Diego",
        "Emeka", "Freya", "Gabriel", "Hana", "Ivan", "Jade", "Kenji", "Leila", "Mateo", "Noor"};
    return v;
}

const std::vector<std::string>& lastNames() {
    static const std::vector<std::string> v = {
        "Moreau", "Kowalski", "Okafor", "Tanaka", "Silva", "Novak", "Haddad", "Lindqvist", "Reyes",
        "Becker", "Ivanova", "Mensah", "Costa", "Fischer", "Nakamura", "Duarte", "Petrov", "Laurent",
        "Osei", "Varga", "Kaur", "Brennan", "Ferreira", "Yilmaz", "Andersen", "Castillo", "Weber",
        "Sato", "Mbeki", "Rossi", "Hughes", "Delacroix", "Zhou", "Marsh", "Abara", "Kerr"};
    return v;
}

} // namespace

Soldier generateSoldier(int id, int baseId, bool mercenary) {
    Random& r = rng();
    Soldier s;
    s.id = id;
    s.baseId = baseId;
    s.name = r.pick(firstNames()) + " " + r.pick(lastNames());
    s.nation = r.range(0, (int)nations().size() - 1);
    s.mercenary = mercenary;
    int bonus = mercenary ? 12 : 0;
    // Ranges follow the original recruit spread.
    s.stats.tu = r.range(50, 60) + bonus / 2;
    s.stats.stamina = r.range(40, 70) + bonus;
    s.stats.health = r.range(25, 40) + bonus / 2;
    s.stats.bravery = r.range(1, 6) * 10 + (mercenary ? 20 : 0);
    s.stats.reactions = r.range(30, 60) + bonus;
    s.stats.firing = r.range(40, 70) + bonus;
    s.stats.throwing = r.range(50, 80);
    s.stats.strength = r.range(20, 40) + bonus / 2;
    s.stats.melee = r.range(40, 70) + bonus;
    s.stats.will = r.range(20, 80);
    s.initial = s.stats;
    if (mercenary) s.rank = SoldierRank::Squaddie;
    s.loadout = defaultLoadout();
    return s;
}

Loadout defaultLoadout() {
    Loadout l;
    l.push_back({Slot::RightHand, makeItem("rifle")});
    l.push_back({Slot::Belt, makeItem("rifle_clip")});
    l.push_back({Slot::Belt, makeItem("rifle_clip")});
    l.push_back({Slot::RightShoulder, makeItem("grenade")});
    l.push_back({Slot::LeftShoulder, makeItem("molotov")});
    return l;
}

} // namespace vamps

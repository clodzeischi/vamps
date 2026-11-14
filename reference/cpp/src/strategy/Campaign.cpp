#include "strategy/Campaign.h"

#include "core/Random.h"
#include "data/Craft.h"
#include "data/Items.h"
#include "strategy/Economy.h"

namespace vamps {

namespace {

void addStartingFacilities(Base& b) {
    using T = FacilityType;
    // Same shape as the original's starting base: three hangars on top, the
    // lift in the middle and the core facilities around it.
    b.facilities = {
        {T::Hangar, 0, 0, 0},      {T::Hangar, 2, 0, 0},     {T::Hangar, 4, 0, 0},
        {T::Laboratory, 1, 2, 0},  {T::AccessLift, 2, 2, 0}, {T::Quarters, 3, 2, 0},
        {T::Workshop, 1, 3, 0},    {T::Stores, 2, 3, 0},     {T::ListeningPost, 3, 3, 0},
    };
}

void addStartingStores(Base& b) {
    const std::pair<const char*, int> kit[] = {
        {"rifle", 4},          {"rifle_clip", 20},    {"pistol", 4},  {"pistol_clip", 12},
        {"shotgun", 2},        {"shotgun_shells", 8}, {"amr", 1},     {"amr_mag", 4},
        {"grenade", 8},        {"molotov", 12},       {"smoke_grenade", 4}, {"flare", 6},
        {"medkit", 4},         {"kevlar", 4},         {"knife", 4},
        {"cannon_rounds", 4},  {"stinger_missile", 12},
    };
    for (const auto& [id, n] : kit) b.addItem(id, n);
}

Craft makeCraft(GameState& g, const std::string& type, const std::string& name, const Base& b) {
    const CraftDef& def = craftType(type);
    Craft c;
    c.id = g.newId();
    c.type = type;
    c.name = name;
    c.baseId = b.id;
    c.pos = b.pos;
    c.fuel = def.fuelHours;
    c.hp = def.hp;
    for (int i = 0; i < def.weaponSlots; ++i) c.weapons.push_back({});
    return c;
}

} // namespace

GameState newCampaign(Difficulty d, const LatLon& basePos, const std::string& baseName) {
    GameState g;
    Random& r = rng();
    g.difficultyLevel = d;
    g.time = GameTime::fromDate(2026, 1, 1, 12);
    g.startTime = g.time;
    g.funds = g.diff().startFunds;
    g.secrecy = 80;

    for (size_t i = 0; i < nations().size(); ++i) {
        NationState n;
        n.support = r.range(10, 30);
        n.monthStartSupport = n.support;
        g.nations.push_back(n);
    }

    Base b;
    b.id = g.newId();
    b.name = baseName;
    b.pos = basePos;
    b.scientists = 10;
    b.engineers = 10;
    addStartingFacilities(b);
    addStartingStores(b);
    g.bases.push_back(b);
    Base& home = g.bases.back();

    Craft kestrel = makeCraft(g, "kestrel", "KESTREL-1", home);
    g.craft.push_back(kestrel);
    for (int i = 1; i <= 2; ++i) {
        Craft lancer = makeCraft(g, "lancer", "LANCER-" + std::to_string(i), home);
        lancer.weapons[0] = {"stinger", item("stinger").craftAmmoCapacity};
        lancer.weapons[1] = {"autocannon", item("autocannon").craftAmmoCapacity};
        g.craft.push_back(lancer);
    }

    for (int i = 0; i < 8; ++i) {
        Soldier s = generateSoldier(g.newId(), home.id);
        s.craftId = kestrel.id;
        g.soldiers.push_back(s);
    }

    // Stagger the bloodlines' first operations over the first week.
    for (auto& bl : g.bloodlines) bl.nextMission = g.time.seconds + r.range(12, 7 * 24) * GameTime::kHour;

    rotateBlackMarket(g);
    g.addLog("The agency is operational. " + baseName + " is online.");
    return g;
}

} // namespace vamps

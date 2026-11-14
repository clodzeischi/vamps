#pragma once
// Item rules: every weapon, clip, grenade, armour, piece of equipment and
// recovered artefact in the game. The table itself lives in Items.cpp.
//
// Hard sci-fi rule of thumb: ballistic weapons only put vampires into
// TORPOR; only INCENDIARY damage kills them permanently.

#include <array>
#include <string>
#include <vector>

namespace vamps {

enum class DamageType {
    Ballistic,
    Incendiary,  // the only permanent vampire kill
    Explosive,
    Melee,
    Stun,        // tasers / batons: humans only
    Haemolytic,  // anticoagulant darts: stop vampire regeneration
    Smoke,       // no damage, creates smoke
    Light,       // no damage, flare
    Count
};
const char* damageTypeName(DamageType t);

enum class ItemKind {
    Firearm,     // uses clips
    Ammo,        // clip / magazine
    Grenade,     // thrown, explodes (may be primed with a fuse)
    MeleeWeapon,
    Armor,       // worn, not carried
    Medkit,
    Equipment,   // tracker, neuro-blocker...
    Artifact,    // recovered from missions, research / sale only
    CraftWeapon,
    CraftAmmo,
};

struct FireMode {
    int tuPercent = 0; // % of max TU (0 = mode unavailable)
    int accuracy = 0;  // % base accuracy multiplier
    int shots = 1;
    bool available() const { return tuPercent > 0; }
};

struct ItemDef {
    std::string id;
    std::string name;
    ItemKind kind = ItemKind::Equipment;

    int size = 1;     // inventory cells
    int weight = 1;   // compared against Strength
    double storage = 0.1; // base store space used per unit

    // Economy. buyCost 0 = cannot be bought on the open market.
    int buyCost = 0;
    int sellPrice = 0;
    bool blackMarket = false;  // may appear in the black market's stock

    // Manufacturing (needs `research` completed first).
    std::string research;      // "" = available from the start
    int buildHours = 0;        // engineer-hours per unit; 0 = cannot be built
    int buildCost = 0;

    // Firearm
    std::vector<std::string> ammo;  // compatible clip ids
    FireMode snap, aimed, autoFire;
    bool twoHanded = false;
    int effectiveRange = 30;        // accuracy falls off beyond this many tiles

    // Ammo / grenade / melee
    int damage = 0;
    DamageType damageType = DamageType::Ballistic;
    int clipSize = 0;
    int blastRadius = 0;   // 0 = single target
    bool impactFuse = false; // explodes on landing (molotov) instead of a timer

    // Melee
    int meleeTuPercent = 0;
    int meleeAccuracy = 0;

    // Armour
    int armorFront = 0, armorSide = 0, armorRear = 0;
    int willBonus = 0;     // resistance to neurochemical domination
    int strengthBonus = 0;
    bool sealed = false;   // ignores smoke & aerosols

    // Medkit
    int healAmount = 0;
    int uses = 0;

    // Craft weapon
    int craftRangeKm = 0;
    int craftReloadSec = 0;
    int craftAmmoCapacity = 0;
    int craftAccuracy = 0;
    std::string craftAmmoItem;  // item consumed when rearming
    int craftAmmoPerItem = 1;

    std::string description;
};

const std::vector<ItemDef>& allItems();
const ItemDef* findItem(const std::string& id);
const ItemDef& item(const std::string& id); // asserts it exists

// Per-bloodline artefact ids ("sigil_0" .. "sigil_5").
std::string sigilItemId(int bloodline);

} // namespace vamps

#include "data/Bloodlines.h"

namespace vamps {

namespace {

const std::array<BloodlineDef, kBloodlineCount>& table() {
    static const std::array<BloodlineDef, kBloodlineCount> t = [] {
        std::array<BloodlineDef, kBloodlineCount> b{};

        b[0] = {0, "House Ashgrove", "Ashgrove", Continent::NorthAmerica, {44.2, -71.6},
                "White Mountains, New Hampshire",
                "Media Empire",
                "Ashgrove owns studios and publishers. Their PR campaigns move public "
                "opinion 50% more."};
        b[0].prStrength = 1.5;

        b[1] = {1, "The Huaca Line", "Huaca", Continent::SouthAmerica, {-13.4, -72.1},
                "Sacred Valley, Peru",
                "Rapid Regeneration",
                "Generations at altitude refined the strain. Their vampires rise from "
                "torpor a turn sooner and heal faster."};
        b[1].regenBonus = 1;

        b[2] = {2, "The Carcassonne Perfecti", "Perfecti", Continent::Europe, {45.6, 25.3},
                "Carpathian foothills, Romania",
                "Pheromone Mastery",
                "The oldest line. Their pheromones are refined: domination is stronger and "
                "even common vampires can use it."};
        b[2].dominationBonus = 20;
        b[2].vampiresDominate = true;

        b[3] = {3, "The Sahel Brood", "Sahel", Continent::Africa, {16.8, -3.0},
                "Niger Bend, Mali",
                "Feral Strain",
                "An aggressive mutation. Thralls and fledglings are larger and tougher "
                "(+30% health)."};
        b[3].feralHp = 1.3;

        b[4] = {4, "The Jade Court", "Jade", Continent::Asia, {31.0, 103.4},
                "Longmen Mountains, Sichuan",
                "Chromatophore Skin",
                "Adaptive skin pigmentation. Their flights are harder to detect and your "
                "soldiers spot them 4 tiles later."};
        b[4].detectionMult = 0.7;
        b[4].stealthTiles = 4;

        b[5] = {5, "The Nullarbor Kin", "Nullarbor", Continent::Oceania, {-30.6, 129.5},
                "Nullarbor Plain, South Australia",
                "Melanin Adaptation",
                "Desert-bred. Daylight harms them only half as much."};
        b[5].sunDamageMult = 0.5;
        return b;
    }();
    return t;
}

} // namespace

const BloodlineDef& bloodline(int id) { return table()[id % kBloodlineCount]; }

int bloodlineForContinent(Continent c) {
    for (const auto& b : table())
        if (b.continent == c) return b.id;
    return 0;
}

// ---------------------------------------------------------------------------
// Enemy ranks. Stats loosely mirror the original's alien progression.
// ---------------------------------------------------------------------------
//                    TU  Sta  HP  Brv Rea Fir Thr Str Mel Will

const EnemyRankDef& enemyRank(EnemyRank r) {
    static const std::vector<EnemyRankDef> ranks = {
        {EnemyRank::Familiar, "Familiar", 'f',
         {54, 60, 30, 40, 50, 55, 60, 30, 50, 40}, 8, 6, 4,
         false, false, 0, false,
         {"pistol", "rifle", "shotgun", "rifle"},
         {{"blood_ledger", 15}, {"encrypted_drive", 10}},
         5, "A human servant, paid and promised. Ordinary flesh: bullets kill."},

        {EnemyRank::Thrall, "Thrall", 't',
         {60, 90, 40, 100, 40, 10, 30, 50, 60, 10}, 4, 4, 4,
         false, true, 25, false,
         {""},
         {},
         8, "A failed conversion. Feral, fast, sun-blistered. Dies like a man."},

        {EnemyRank::Fledgling, "Fledgling", 'v',
         {60, 100, 40, 80, 55, 50, 60, 60, 65, 40}, 6, 5, 4,
         true, true, 30, false,
         {"", "pistol"},
         {{"vamp_remains", 100}, {"haem_serum", 20}},
         15, "Newly turned. Regenerates from torpor; only fire ends it."},

        {EnemyRank::Vampire, "Vampire", 'V',
         {70, 120, 65, 90, 70, 65, 70, 80, 80, 60}, 12, 10, 8,
         true, true, 45, false,
         {"", "rifle", "shotgun", "amr"},
         {{"vamp_remains", 100}, {"haem_serum", 35}, {"sigil", 25}},
         25, "A mature vampire: strong, quick, and very hard to keep down."},

        {EnemyRank::Elder, "Elder", 'E',
         {80, 150, 100, 100, 85, 75, 80, 100, 90, 90}, 20, 16, 12,
         true, true, 60, true,
         {"", "amr"},
         {{"vamp_remains", 100}, {"pheromone_gland", 100}, {"sigil", 100}, {"haem_serum", 50}},
         60, "Centuries old. Exhales engineered pheromones that break a soldier's will."},

        {EnemyRank::Progenitor, "Progenitor", 'P',
         {90, 200, 200, 100, 95, 80, 80, 140, 105, 120}, 32, 28, 24,
         true, true, 80, true,
         {""},
         {{"pheromone_gland", 100}},
         500, "One of the Perfecti of 1244. Patient zero of a bloodline."},

        {EnemyRank::Civilian, "Civilian", 'c',
         {50, 50, 25, 10, 20, 20, 30, 20, 20, 30}, 0, 0, 0,
         false, false, 0, false,
         {""},
         {},
         0, "Wrong place, wrong night."},
    };
    return ranks[(int)r];
}

const char* enemyRankName(EnemyRank r) { return enemyRank(r).name; }

double damageMultiplier(bool vampiric, DamageType t) {
    if (!vampiric) {
        switch (t) {
            case DamageType::Haemolytic: return 0.3;
            default: return 1.0;
        }
    }
    switch (t) {
        case DamageType::Ballistic: return 0.85;
        case DamageType::Incendiary: return 1.5;
        case DamageType::Explosive: return 1.0;
        case DamageType::Melee: return 0.8;
        case DamageType::Stun: return 0.0;
        case DamageType::Haemolytic: return 1.0;
        default: return 1.0;
    }
}

} // namespace vamps

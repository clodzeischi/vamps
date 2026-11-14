#pragma once
// The six ancient bloodlines (one per continent) and the shared enemy ranks.
//
// Lore: in 1244 the Cathar fortress of Montsegur fell. A handful of the
// "Perfecti" carried a retrovirus that halts cellular senescence at the cost
// of haemophagy and photosensitivity. They scattered, and their sigils, a
// notation for who infected whom, are a genealogy of the infection.

#include <array>
#include <string>
#include <vector>

#include "core/Geo.h"
#include "data/Items.h"
#include "data/Stats.h"
#include "data/World.h"

namespace vamps {

constexpr int kBloodlineCount = 6;

struct BloodlineDef {
    int id;
    const char* name;       // "The Carcassonne Perfecti"
    const char* shortName;  // "Perfecti"
    Continent continent;
    LatLon lair;            // hidden until researched
    const char* lairName;
    const char* traitName;
    const char* traitText;

    // Trait modifiers (1.0 / 0 = no change).
    double prStrength = 1.0;      // PR campaign effect on support
    int regenBonus = 0;           // torpor turns removed
    int dominationBonus = 0;
    bool vampiresDominate = false;// Vampire rank can also dominate
    double feralHp = 1.0;         // thrall / fledgling HP multiplier
    double detectionMult = 1.0;   // hunt detection chance
    int stealthTiles = 0;         // reduces how far your soldiers see them
    double sunDamageMult = 1.0;
};

const BloodlineDef& bloodline(int id);
int bloodlineForContinent(Continent c);

// ---------------------------------------------------------------------------
// Enemy ranks
// ---------------------------------------------------------------------------

enum class EnemyRank { Familiar, Thrall, Fledgling, Vampire, Elder, Progenitor, Civilian, Count };

struct LootEntry {
    std::string item; // "sigil" = this bloodline's sigil fragment
    int percent;
};

struct EnemyRankDef {
    EnemyRank rank;
    const char* name;
    char glyph;
    UnitStats stats;
    int armorFront, armorSide, armorRear;
    bool vampiric;         // torpor + regeneration, only fire kills
    bool sunSensitive;     // takes damage in direct daylight
    int clawDamage;        // 0 = no natural attack
    bool canDominate;
    std::vector<std::string> weapons; // random weapon pool ("" = unarmed)
    std::vector<LootEntry> loot;
    int score;
    const char* description;
};

const EnemyRankDef& enemyRank(EnemyRank r);
const char* enemyRankName(EnemyRank r);

// Damage multiplier for a damage type against vampiric / human bodies.
double damageMultiplier(bool vampiric, DamageType t);

} // namespace vamps

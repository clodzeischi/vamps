#pragma once
// A unit on the battlescape: soldier, vampire, familiar or civilian.

#include <string>
#include <vector>

#include "data/Bloodlines.h"
#include "data/Inventory.h"
#include "data/Items.h"
#include "data/Stats.h"
#include "tactical/BattleMap.h"

namespace vamps {

enum class Faction { Player, Enemy, Neutral };

enum class UnitStatus {
    Active,
    Unconscious, // humans: stunned
    Torpor,      // vampires: down, regenerating
    Dead,
    Incinerated, // vampires: permanently dead
    Escaped,     // left the map (aborting soldiers on the ramp)
};

// Facing: 0 = north, clockwise in 45-degree steps (2 = east, 4 = south...).
constexpr int kDirX[8] = {0, 1, 1, 1, 0, -1, -1, -1};
constexpr int kDirY[8] = {-1, -1, 0, 1, 1, 1, 0, -1};
int directionTo(int dx, int dy);

struct Experience {
    int firing = 0, throwing = 0, melee = 0, reactions = 0, bravery = 0;
};

struct BattleUnit {
    int id = 0;
    Faction faction = Faction::Enemy;
    std::string name;
    char glyph = '?';
    int soldierId = -1;              // roster id for player soldiers
    EnemyRank rank = EnemyRank::Familiar;
    int bloodline = 0;

    bool vampiric = false;           // torpor + regeneration; only fire kills
    bool sunSensitive = false;
    bool canDominate = false;
    int clawDamage = 0;

    UnitStats stats;                 // maximums
    int tu = 0, energy = 0, hp = 0, stun = 0, morale = 100;
    int fatalWounds = 0;
    Point3 pos;
    int facing = 4;
    bool kneeling = false;
    UnitStatus status = UnitStatus::Active;

    int armorFront = 0, armorSide = 0, armorRear = 0;
    std::string armorId;             // soldiers only
    int willBonus = 0;
    bool sealed = false;

    Loadout inv;

    // Vampire state
    int regenTimer = 0;              // turns until rising from torpor
    bool regenBlocked = false;       // haemolytic darts
    int sunTurns = 0;                // consecutive turns in torpor under the sun
    int burning = 0;                 // turns still on fire

    // Morale / domination
    bool dominated = false;          // goes berserk at the start of its next turn
    bool panicked = false;           // this turn

    Experience xp;
    int kills = 0;

    // AI memory
    Point3 aiDest;
    bool aiHasDest = false;
    int aiLastTargetId = -1;

    bool active() const { return status == UnitStatus::Active; }
    bool down() const { return status == UnitStatus::Unconscious || status == UnitStatus::Torpor; }
    bool gone() const { return status == UnitStatus::Dead || status == UnitStatus::Incinerated || status == UnitStatus::Escaped; }

    const CarriedItem* inSlot(Slot s) const;
    CarriedItem* inSlot(Slot s);
    int totalWill() const;
    int strengthTotal() const;
    int maxTu() const;             // after encumbrance
    double eyeHeight() const;      // within the tile, 0..1
    double bodyHeight() const;     // top of the hit box
};

} // namespace vamps

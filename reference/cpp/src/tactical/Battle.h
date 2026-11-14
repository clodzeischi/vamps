#pragma once
// One tactical battle. The class is split across several files by concern:
//
//   Battle.cpp       setup, turn flow, win/lose
//   Visibility.cpp   line of sight, field of view, what the player can see
//   Pathfinding.cpp  A* over TU costs
//   Actions.cpp      movement, facing, kneeling, inventory, medkits, levels
//   Combat.cpp       shooting, throwing, melee, damage, explosions, fire,
//                    reaction fire, domination
//   EnemyAI.cpp      the vampires' turn

#include <deque>
#include <set>
#include <string>
#include <vector>

#include "data/Difficulty.h"
#include "strategy/Hunts.h"
#include "strategy/Soldier.h"
#include "tactical/BattleMap.h"
#include "tactical/BattleUnit.h"
#include "tactical/MapBlocks.h"

namespace vamps {

enum class ShotMode { Snap, Aimed, Auto };
const char* shotModeName(ShotMode m);

enum class BattleOutcome { Ongoing, Victory, Defeat, Aborted };

struct MissionSetup {
    SiteType siteType = SiteType::CrashSite;
    MapKind mapKind = MapKind::Rural;
    bool night = true;
    int bloodline = 0;
    int enemyCount = 6;
    int monthIndex = 0;
    Difficulty difficulty = Difficulty::Normal;
    int civilians = 0;
    int stage = 1;              // final mission stage
    bool nightOptics = false;   // research: soldiers see 14 tiles at night
    std::string title;
    std::vector<Soldier> squad; // copies; results are written back in debriefing
};

struct ShotPreview {
    bool possible = false;
    int tuCost = 0;
    int accuracy = 0;   // %
    bool friendlyInLine = false; // an ally is in the way of a perfect shot
    std::string reason;
};

struct Path {
    std::vector<Point3> steps; // excluding the start
    int tuCost = 0;
    bool found = false;
};

class Battle {
public:
    explicit Battle(const MissionSetup& setup);
    // Final mission: continue into stage 2 with the surviving soldiers.
    static Battle nextStage(const Battle& previous);

    // ----- State -----
    MissionSetup setup;
    BattleMap map;
    std::vector<BattleUnit> units;
    int turn = 1;
    Faction side = Faction::Player;
    BattleOutcome outcome = BattleOutcome::Ongoing;
    std::deque<std::string> log;
    std::string lastError;
    int civiliansKilled = 0;
    int trackerTurns = 0;               // motion tracker active
    std::vector<Point3> lastTrace;      // last projectile path, for drawing
    std::set<int> playerSees;           // enemy/neutral units visible to the player
    std::set<int> enemySees;            // player/neutral units visible to the vampires

    // ----- Queries -----
    BattleUnit* unitAt(const Point3& p);
    const BattleUnit* unitAt(const Point3& p) const;
    BattleUnit* unitById(int id);
    bool playerCanSee(const BattleUnit& u) const;
    int activeCount(Faction f) const;
    bool daytime() const { return !setup.night; }

    // ----- Visibility (Visibility.cpp) -----
    void updateVisibility();
    bool canSee(const BattleUnit& viewer, const BattleUnit& target) const;
    bool canSeeTile(const BattleUnit& viewer, const Point3& tile) const;
    bool lineOfSight(const Point3& from, double fromH, const Point3& to, double toH, int* smoke = nullptr) const;
    int sightRange(const BattleUnit& viewer, const Point3& target, const BattleUnit* targetUnit) const;

    // ----- Pathfinding (Pathfinding.cpp) -----
    Path findPath(const BattleUnit& u, const Point3& dest, int maxCost = 100000) const;
    // The closest free, reachable-looking tile within 4 of `target` (for "go near X").
    Point3 freeTileNear(const BattleUnit& u, const Point3& target) const;
    int stepCost(const Point3& from, const Point3& to) const; // -1 = impassable

    // ----- Actions (Actions.cpp) -----
    bool move(BattleUnit& u, const Point3& dest);
    bool turnTo(BattleUnit& u, const Point3& target);
    bool toggleKneel(BattleUnit& u);
    bool changeLevel(BattleUnit& u, int dz);
    bool moveItem(BattleUnit& u, int invIndex, Slot to);
    bool pickUp(BattleUnit& u, int groundIndex, Slot to);
    bool useMedkit(BattleUnit& user, Slot hand, BattleUnit& target);
    bool useTracker(BattleUnit& u, Slot hand);
    bool reload(BattleUnit& u, Slot hand);
    bool primeGrenade(BattleUnit& u, Slot hand, int fuse);

    // ----- Combat (Combat.cpp) -----
    ShotPreview previewShot(const BattleUnit& u, Slot hand, ShotMode mode, const Point3& target) const;
    bool shoot(BattleUnit& u, Slot hand, ShotMode mode, const Point3& target);
    int throwRange(const BattleUnit& u, const ItemDef& d) const;
    bool throwItem(BattleUnit& u, Slot hand, const Point3& target);
    bool melee(BattleUnit& u, Slot hand, BattleUnit& target); // Slot::Ground = natural attack
    int meleeTuCost(const BattleUnit& u, Slot hand) const;
    bool dominate(BattleUnit& elder, BattleUnit& target);
    void explode(const Point3& center, int radius, int damage, DamageType type, int attackerId);
    void damageUnit(BattleUnit& target, int damage, DamageType type, int attackerId, const Point3& from);

    // ----- Turn flow (Battle.cpp) -----
    void endPlayerTurn();
    bool stepEnemyTurn(); // runs one AI unit; false when control returns to the player
    void abort();
    void addLog(const std::string& msg);
    void checkOutcome();

private:
    Battle() = default;
    void placeSquad();
    void placeEnemies();
    void placeCivilians();
    BattleUnit makeSoldierUnit(const Soldier& s, int index);
    BattleUnit makeEnemyUnit(EnemyRank r);
    std::vector<EnemyRank> rollEnemyRoster() const;

    void startSideTurn(Faction f);
    void endOfTurnEffects();
    void processVampires();     // regeneration and sunlight, at the start of the enemy turn
    void processMorale();       // panic and domination, at the start of the player turn
    void berserk(BattleUnit& u);
    void unitDown(BattleUnit& u, int attackerId);
    void dropAll(BattleUnit& u);
    void moraleShock(const BattleUnit& victim);

    // Combat internals
    struct TraceHit {
        Point3 cell;
        int unitId = -1;
        bool hitTerrain = false;
        bool outOfMap = false;
    };
    TraceHit traceProjectile(const BattleUnit& shooter, double tx, double ty, double tz, int maxTiles,
                             std::vector<Point3>* path = nullptr) const;
    bool tryReactionFire(BattleUnit& mover);
    void damageTile(const Point3& p, int damage, DamageType type);
    void igniteTile(const Point3& p, int turns);

    // Enemy AI (EnemyAI.cpp)
    void runAi(BattleUnit& u);
    void runCivilian(BattleUnit& u);
    BattleUnit* aiPickTarget(BattleUnit& u);
    bool aiShoot(BattleUnit& u, BattleUnit& target);
    bool aiMelee(BattleUnit& u, BattleUnit& target);
    void aiWander(BattleUnit& u);
    void aiSeekShelter(BattleUnit& u);

    std::vector<int> aiQueue_;
    int reactionDepth_ = 0; // stops reaction fire from chaining forever
};

} // namespace vamps

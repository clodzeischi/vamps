#pragma once
// The whole campaign in one struct. Everything that is saved lives here.
// Systems that change it (simulation, economy, politics...) are free
// functions in their own files and take a GameState&.

#include <array>
#include <cstdint>
#include <deque>
#include <set>
#include <string>
#include <vector>

#include "core/GameTime.h"
#include "data/Bloodlines.h"
#include "data/Difficulty.h"
#include "strategy/Aircraft.h"
#include "strategy/Base.h"
#include "strategy/Hunts.h"
#include "strategy/Soldier.h"

namespace vamps {

// ---------------------------------------------------------------------------
// Politics
// ---------------------------------------------------------------------------

struct NationState {
    double support = 20;      // -100 (pro-vampire) .. +100 (pro-agency)
    double infiltration = 0;  // 0..100; at 100 the government is compromised
    bool defected = false;    // no longer funds the agency
    int mediaBudget = 0;      // $ per month spent on counter-PR
    int lastFunding = 0;      // $ granted last month
    double monthStartSupport = 20;
};

struct BloodlineState {
    bool destroyed = false;
    bool lairKnown = false;
    int64_t nextMission = 0;
    int missionsLaunched = 0;
};

// ---------------------------------------------------------------------------
// Black market
// ---------------------------------------------------------------------------

struct BlackMarketOffer {
    bool mercenary = false;
    std::string itemId;
    int quantity = 1;
    int price = 0;
    Soldier merc;
};

// ---------------------------------------------------------------------------
// Events for the UI: anything that should pause time and pop up a message.
// ---------------------------------------------------------------------------

enum class GeoEventType {
    Info,
    HuntDetected,
    ContactLost,
    SiteAppeared,
    CraftAtSite,     // transport reached a mission site: offer to start battle
    Intercept,       // interceptor caught a hunt: open dogfight
    CraftReturned,
    ResearchDone,
    ProductionDone,
    FacilityDone,
    MonthlyReport,
    LairRevealed,
    GameOver,
    Victory,
};

struct GeoEvent {
    GeoEventType type = GeoEventType::Info;
    std::string title;
    std::string text;
    int refId = -1;   // craft / hunt / site id as appropriate
    int refId2 = -1;
};

// ---------------------------------------------------------------------------

struct GameState {
    Difficulty difficultyLevel = Difficulty::Normal;
    GameTime time;
    GameTime startTime;
    int64_t funds = 0;
    double secrecy = 80;      // 0..100

    std::vector<Base> bases;
    std::vector<Soldier> soldiers;
    std::vector<Craft> craft;
    std::vector<Hunt> hunts;
    std::vector<MissionSite> sites;
    std::array<BloodlineState, kBloodlineCount> bloodlines{};
    std::vector<NationState> nations;

    std::set<std::string> researched;
    std::vector<BlackMarketOffer> blackMarket;

    std::deque<GeoEvent> events;      // pending popups (not saved)
    std::deque<std::string> log;      // recent message log

    int nextId = 1;
    int monthIndex = 0;               // months since campaign start
    int negativeMonths = 0;           // consecutive months ending in debt
    int monthScore = 0;
    bool finalRevealed = false;
    bool gameOver = false;
    bool victory = false;
    std::string gameOverReason;

    // ----- lookups -----
    Base* findBase(int id);
    Craft* findCraft(int id);
    Soldier* findSoldier(int id);
    Hunt* findHunt(int id);
    MissionSite* findSite(int id);
    const DifficultyDef& diff() const { return difficulty(difficultyLevel); }

    int newId() { return nextId++; }
    bool isResearched(const std::string& id) const { return researched.count(id) > 0; }

    void post(GeoEventType type, std::string title, std::string text, int ref = -1, int ref2 = -1);
    void addLog(const std::string& msg);

    // People housed at a base (soldiers + scientists + engineers).
    int personnelAt(int baseId) const;
    int soldiersAt(int baseId) const;
    int craftAt(int baseId) const;          // including those in transit to it
    int captivesAt(int baseId) const;
    int incomingPersonnel(int baseId) const;

    double averageSupport() const;
    int defectedCount() const;
    int activeBloodlines() const;
};

} // namespace vamps

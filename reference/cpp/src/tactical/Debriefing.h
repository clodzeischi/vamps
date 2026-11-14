#pragma once
// The bridge between the Geoscape and the battlescape:
//   buildMissionSetup()  - site + transport -> battle parameters
//   applyBattleResult()  - battle -> recovered items, captives, casualties,
//                          experience, promotions, support and secrecy.

#include <string>
#include <utility>
#include <vector>

#include "strategy/GameState.h"
#include "tactical/Battle.h"

namespace vamps {

struct Debriefing {
    BattleOutcome outcome = BattleOutcome::Ongoing;
    std::string title;
    int score = 0;
    std::vector<std::pair<std::string, int>> recovered; // item name, count
    std::vector<std::string> lines;                     // politics, captives...
    std::vector<std::string> soldiers;                  // per-soldier notes
};

MissionSetup buildMissionSetup(GameState& g, const MissionSite& site, const Craft& craft);
Debriefing applyBattleResult(GameState& g, Battle& b, int craftId, int siteId);

// True when this battle was stage 1 of the final mission and was won.
bool continuesToNextStage(const Battle& b);

} // namespace vamps

#pragma once
// Research and manufacturing progress.
//
// Research: each scientist adds 1/24 scientist-day per hour. A topic's real
// cost is its listed cost x difficulty multiplier x a hidden 0.8-1.2 roll,
// so you can't predict it exactly (as in the original).
//
// Manufacturing: each engineer adds one engineer-hour per hour; difficulty
// scales the hours per unit. Money is paid as each unit starts.

#include <string>
#include <vector>

#include "data/Items.h"
#include "data/Research.h"
#include "strategy/GameState.h"

namespace vamps {

// Why a topic is not yet available ("" = it is available).
std::string researchBlocker(const GameState& g, const ResearchDef& r);
bool researchInProgress(const GameState& g, const std::string& id);
std::vector<const ResearchDef*> availableResearch(const GameState& g);

bool startResearch(GameState& g, Base& b, const std::string& id, int scientists, std::string& err);
void setResearchScientists(Base& b, int projectIndex, int scientists);
void cancelResearch(Base& b, int projectIndex);

bool canManufacture(const GameState& g, const ItemDef& d);
std::vector<const ItemDef*> manufacturableItems(const GameState& g);
bool startProduction(GameState& g, Base& b, const std::string& itemId, int qty, int engineers, std::string& err);
void setProductionEngineers(Base& b, int jobIndex, int engineers);
void cancelProduction(Base& b, int jobIndex);
double unitBuildHours(const GameState& g, const ItemDef& d);

void hourlyLabs(GameState& g);
void dailyBreakthroughs(GameState& g);

// Marks a topic researched and applies its effects (lairs, final mission...).
void completeResearch(GameState& g, Base* b, const ResearchDef& r);

} // namespace vamps

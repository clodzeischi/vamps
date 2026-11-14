#pragma once
// Money and logistics: purchases, hiring, selling, transfers between bases,
// construction, and the black market. Each action returns false and fills
// `err` with a player-facing reason when it cannot be done.

#include <string>

#include "strategy/GameState.h"

namespace vamps {

// Prices and salaries (per month).
constexpr int kSoldierHireCost = 40000, kSoldierSalary = 20000;
constexpr int kScientistHireCost = 60000, kScientistSalary = 30000;
constexpr int kEngineerHireCost = 50000, kEngineerSalary = 25000;
constexpr int kNewBaseCost = 600000;

// ----- Open market -----
bool buyItem(GameState& g, Base& b, const std::string& itemId, int qty, std::string& err);
bool sellItem(GameState& g, Base& b, const std::string& itemId, int qty, std::string& err);
bool hireSoldier(GameState& g, Base& b, std::string& err);
bool hireScientists(GameState& g, Base& b, int n, std::string& err);
bool hireEngineers(GameState& g, Base& b, int n, std::string& err);
bool buyCraft(GameState& g, Base& b, const std::string& craftType, std::string& err);
bool sackSoldier(GameState& g, int soldierId, std::string& err);

// ----- Construction -----
bool buildFacility(GameState& g, Base& b, FacilityType t, int x, int y, std::string& err);
bool dismantleFacility(GameState& g, Base& b, int x, int y, std::string& err);
bool buildBase(GameState& g, const LatLon& pos, const std::string& name, std::string& err);
int facilityCost(const GameState& g, FacilityType t); // includes secrecy surcharge

// ----- Transfers between bases -----
int64_t transferSeconds(const Base& from, const Base& to);
bool transferItem(GameState& g, Base& from, Base& to, const std::string& itemId, int qty, std::string& err);
bool transferSoldier(GameState& g, int soldierId, Base& to, std::string& err);
bool transferScientists(GameState& g, Base& from, Base& to, int n, std::string& err);
bool transferEngineers(GameState& g, Base& from, Base& to, int n, std::string& err);
bool transferCaptive(GameState& g, Base& from, Base& to, int captiveIndex, std::string& err);
bool transferCraft(GameState& g, int craftId, Base& to, std::string& err);

// Lands everything whose arrival time has passed. Called every hour.
void deliverTransfers(GameState& g);

// ----- Black market -----
void rotateBlackMarket(GameState& g);  // monthly
int blackMarketSellPrice(const GameState& g, const std::string& itemId);
bool buyBlackMarket(GameState& g, Base& b, int offerIndex, std::string& err);
bool sellBlackMarket(GameState& g, Base& b, const std::string& itemId, int qty, std::string& err);

// ----- Capacity checks -----
double storageCapacity(const Base& b);
bool hasQuartersFor(const GameState& g, const Base& b, int extra);

// Monthly costs for the funding report.
int64_t monthlySalaries(const GameState& g);
int64_t monthlyCraftRent(const GameState& g);
int64_t monthlyFacilityUpkeep(const GameState& g);
int64_t monthlyMediaSpend(const GameState& g);

} // namespace vamps

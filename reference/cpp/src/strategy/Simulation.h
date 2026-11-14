#pragma once
// Advances the campaign clock. Runs fine-grained steps for movement and
// calls the hourly / daily / monthly systems as their boundaries pass.
// Stops early as soon as something posts an event that needs the player.

#include <cstdint>

#include "strategy/GameState.h"

namespace vamps {

// Returns the number of seconds actually simulated.
int64_t advanceTime(GameState& g, int64_t seconds);

// Orders for aircraft.
bool launchCraft(GameState& g, int craftId, CraftTarget target, int targetId, const LatLon& waypoint, std::string& err);
void recallCraft(GameState& g, int craftId);

// Soldiers aboard a craft / capacity helpers.
int soldiersAboard(const GameState& g, int craftId);

} // namespace vamps

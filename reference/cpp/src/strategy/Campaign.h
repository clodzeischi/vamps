#pragma once
// Starting a new campaign.

#include <string>

#include "strategy/GameState.h"

namespace vamps {

// The first base is placed by the player on the globe; everything else
// (starting staff, aircraft, equipment, politics) is set up here.
GameState newCampaign(Difficulty d, const LatLon& basePos, const std::string& baseName);

} // namespace vamps

#pragma once
// Air combat between an interceptor and a hunt, modelled on the original's
// interception window: the distance closes according to the chosen stance,
// weapons fire when in range and reloaded, one step = one second.
//
// The hunt is FORCED DOWN when it drops to 50% hp or below (crash site with
// most survivors), and DESTROYED at 0 (crash site with few survivors, or
// nothing if over the sea).

#include <string>
#include <vector>

#include "strategy/GameState.h"

namespace vamps {

enum class Stance { Standoff, Cautious, Standard, Aggressive, Disengage };
const char* stanceName(Stance s);

enum class DogfightResult { Ongoing, HuntDowned, HuntDestroyed, CraftDestroyed, Disengaged, HuntEscaped };

struct Dogfight {
    int craftId = -1;
    int huntId = -1;
    double distanceKm = 40;
    Stance stance = Stance::Standard;
    std::vector<double> reload;    // seconds until each craft weapon can fire
    double enemyReload = 0;
    int elapsed = 0;
    DogfightResult result = DogfightResult::Ongoing;
    std::vector<std::string> log;
};

Dogfight startDogfight(GameState& g, int craftId, int huntId);
void stepDogfight(GameState& g, Dogfight& d);   // advance one second
// Applies the outcome to the campaign (crash site, craft damage...).
void finishDogfight(GameState& g, Dogfight& d);

} // namespace vamps

#pragma once
// The bloodlines' strategic planner (the counterpart of the original's alien
// mission generator).
//
// Every few days each surviving bloodline launches an operation on its own
// continent:
//   Feeding Run   - a flight lands near a city for a few hours. Undisturbed: -2 support.
//   Infiltration  - flights land near the capital. Each success: +20 infiltration.
//   Harvest       - a flight lands IN a city: a terror-style site appears.
//   Supply Run    - a flight to the lair. Shooting one down always yields a sigil.
//   PR Campaign   - no flight: a premiere/book launch appears at a city and can
//                   be disrupted by a counter-op mission. Ignored: -10 support.
// Operations become more frequent and use bigger craft as months pass.

#include "strategy/GameState.h"

namespace vamps {

void hourlyBloodlines(GameState& g);           // launch operations, expire sites
void moveHunts(GameState& g, double seconds);  // flight movement & landings

// Removes a hunt and its landed site (if any).
void removeHunt(GameState& g, int huntId);
void removeSite(GameState& g, int siteId);

// Creates a crash site where a hunt was forced down. Returns site id or -1 (at sea).
int crashHunt(GameState& g, Hunt& h, bool destroyed);

} // namespace vamps

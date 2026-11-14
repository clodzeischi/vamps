#pragma once
// The two political meters.
//
// SECRECY (0..100, global) - is the agency still clandestine?
//   >= 60  Normal.
//   30-59  Scrutiny: construction costs +25%.
//   < 30   Exposed: funding -20%, governments that lean pro-vampire deny
//          bases and missions on their soil.
//   0      The agency is exposed and shut down: game over.
//
// SUPPORT (-100..+100, per nation) - does the public favour the vampires
//   (negative) or the agency (positive)? Vampire PR pushes it down every
//   month; missions and the media budget push it back. Funding scales with
//   support. At -60 or below at month end, or at 100% infiltration, the
//   nation defects and stops funding you.

#include <string>

#include "strategy/GameState.h"

namespace vamps {

enum class SecrecyBand { Normal, Scrutiny, Exposed };
SecrecyBand secrecyBand(double secrecy);
const char* secrecyBandName(SecrecyBand b);

void changeSecrecy(GameState& g, double delta, const std::string& reason);
void changeSupport(GameState& g, int nation, double delta, const std::string& reason);
// Applies `delta` to every nation on a continent.
void changeContinentSupport(GameState& g, Continent c, double delta, const std::string& reason);

// Can the agency operate (fly a mission to) this nation?
bool airspaceOpen(const GameState& g, int nation);

int nationFunding(const GameState& g, int nation); // $ for next month

void dailyPolitics(GameState& g);   // passive secrecy recovery, random events
void monthlyPolitics(GameState& g); // funding, expenses, PR, defection, report
void checkLoseConditions(GameState& g);

} // namespace vamps

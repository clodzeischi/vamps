#pragma once
// Every screen in the game. Each one lives in its own .cpp file as a
// private class; this header only exposes the factory functions.

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "core/Geo.h"
#include "data/Difficulty.h"
#include "strategy/Aircraft.h"
#include "ui/App.h"

namespace vamps {

class Battle;
struct Debriefing;

// ----- Dialogs (Dialogs.cpp) -----
struct Choice {
    std::string key;   // hotkey, e.g. "1" or "y"
    std::string label;
    std::function<void(App&)> action; // the dialog closes itself first
};
std::unique_ptr<Screen> makeMessageBox(const std::string& title, const std::string& text);
std::unique_ptr<Screen> makeChoiceBox(const std::string& title, const std::string& text, std::vector<Choice> choices);
std::unique_ptr<Screen> makeTextInput(const std::string& title, const std::string& initial,
                                      std::function<void(App&, const std::string&)> done);
std::unique_ptr<Screen> makeGameOver(bool victory, const std::string& text);

// ----- Main menu & new game (MainMenu.cpp) -----
std::unique_ptr<Screen> makeMainMenu();
// Picks a spot on the globe for a base. Without a campaign it starts one.
std::unique_ptr<Screen> makeBasePlacement(Difficulty d);

// ----- Geoscape (Geoscape.cpp, Launch.cpp, Intercept.cpp) -----
std::unique_ptr<Screen> makeGeoscape();
std::unique_ptr<Screen> makeLaunch(CraftTarget target, int targetId, const LatLon& waypoint);
std::unique_ptr<Screen> makeIntercept(int craftId, int huntId);

// ----- Bases (BaseScreen.cpp, ...) -----
std::unique_ptr<Screen> makeBase(int baseId);
std::unique_ptr<Screen> makeResearch(int baseId);
std::unique_ptr<Screen> makeManufacture(int baseId);
std::unique_ptr<Screen> makeSoldiers(int baseId);
std::unique_ptr<Screen> makeEquip(int soldierId);
std::unique_ptr<Screen> makeCraftScreen(int baseId);
std::unique_ptr<Screen> makeMarket(int baseId);
std::unique_ptr<Screen> makeBlackMarket(int baseId);
std::unique_ptr<Screen> makeTransfer(int baseId);

// ----- Information (Politics.cpp, Archive.cpp, SaveLoad.cpp) -----
std::unique_ptr<Screen> makePolitics();
std::unique_ptr<Screen> makeArchive();
std::unique_ptr<Screen> makeSaveLoad(bool saving);

// ----- Battlescape (BattleScreen.cpp, BattleInventory.cpp, Debrief.cpp) -----
std::unique_ptr<Screen> makeBattle(std::unique_ptr<Battle> battle, int craftId, int siteId);
std::unique_ptr<Screen> makeBattleInventory(Battle& battle, int unitId);
std::unique_ptr<Screen> makeDebrief(const Debriefing& d);

// Starts the battle for a transport that has reached a site.
void beginMission(App& app, int craftId, int siteId);

} // namespace vamps

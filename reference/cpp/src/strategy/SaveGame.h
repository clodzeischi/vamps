#pragma once
// Save / load. The format is a readable whitespace-separated text file with
// section labels, written and read by the same `serialize` functions so the
// two directions can never drift apart.
//
// Saves live in ./saves/slotN.sav (created on first save).

#include <string>
#include <vector>

#include "strategy/GameState.h"

namespace vamps {

constexpr int kSaveSlots = 6;

std::string savePath(int slot);
bool saveGame(const GameState& g, int slot, std::string& err);
bool loadGame(GameState& g, int slot, std::string& err);

// One-line description of a slot ("14 Jan 2026 - Normal - $4,200,000"), or "" if empty.
std::string describeSlot(int slot);

} // namespace vamps

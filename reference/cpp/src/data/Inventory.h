#pragma once
// Paper-doll inventory, modelled on the original: two hands, belt, backpack,
// legs and shoulders. Each slot has a cell capacity; items take `size` cells.
// Moving an item costs TU = outCost(from) + inCost(to).

#include <string>
#include <vector>

namespace vamps {

enum class Slot { RightHand, LeftHand, Belt, Backpack, RightLeg, LeftLeg, RightShoulder, LeftShoulder, Ground, Count };

constexpr int kCarrySlotCount = (int)Slot::Ground; // everything except Ground

const char* slotName(Slot s);
int slotCapacity(Slot s);           // in cells (hands: one item of any size)
bool isHand(Slot s);
int slotMoveCost(Slot from, Slot to);

// One physical item. Firearms remember the clip loaded in them; grenades
// remember their fuse (-1 = not primed, 0 = explodes at end of this turn).
struct ItemInstance {
    std::string id;
    std::string ammoId;  // firearms: loaded clip type ("" = empty)
    int ammo = 0;        // rounds left (firearm) or uses left (medkit)
    int fuse = -1;
};

ItemInstance makeItem(const std::string& id); // fills clip / uses with defaults

struct CarriedItem {
    Slot slot;
    ItemInstance item;
};

using Loadout = std::vector<CarriedItem>;

int cellsUsed(const Loadout& l, Slot s);
bool canPlace(const Loadout& l, Slot s, const std::string& itemId);
int loadoutWeight(const Loadout& l);

} // namespace vamps

#include "data/Inventory.h"

#include "data/Items.h"

namespace vamps {

const char* slotName(Slot s) {
    switch (s) {
        case Slot::RightHand: return "Right Hand";
        case Slot::LeftHand: return "Left Hand";
        case Slot::Belt: return "Belt";
        case Slot::Backpack: return "Backpack";
        case Slot::RightLeg: return "Right Leg";
        case Slot::LeftLeg: return "Left Leg";
        case Slot::RightShoulder: return "R.Shoulder";
        case Slot::LeftShoulder: return "L.Shoulder";
        case Slot::Ground: return "Ground";
        default: return "?";
    }
}

int slotCapacity(Slot s) {
    switch (s) {
        case Slot::RightHand:
        case Slot::LeftHand: return 1; // one item, any size
        case Slot::Belt: return 4;
        case Slot::Backpack: return 9;
        case Slot::RightLeg:
        case Slot::LeftLeg: return 2;
        case Slot::RightShoulder:
        case Slot::LeftShoulder: return 2;
        default: return 9999;
    }
}

bool isHand(Slot s) { return s == Slot::RightHand || s == Slot::LeftHand; }

int slotMoveCost(Slot from, Slot to) {
    if (from == to) return 0;
    //                          RH LH Belt Pack RLeg LLeg RSh LSh Ground
    static const int outCost[] = {0, 0, 4,  10,  4,   4,   3,  3,  8};
    static const int inCost[] = {0, 0, 4,  12,  4,   4,   3,  3,  2};
    int c = outCost[(int)from] + inCost[(int)to];
    return c < 2 ? 2 : c;
}

ItemInstance makeItem(const std::string& id) {
    ItemInstance it;
    it.id = id;
    const ItemDef* d = findItem(id);
    if (!d) return it;
    if (d->kind == ItemKind::Firearm && !d->ammo.empty()) {
        it.ammoId = d->ammo.front();
        it.ammo = item(it.ammoId).clipSize;
    } else if (d->kind == ItemKind::Ammo) {
        it.ammo = d->clipSize;
    } else if (d->kind == ItemKind::Medkit) {
        it.ammo = d->uses;
    }
    return it;
}

int cellsUsed(const Loadout& l, Slot s) {
    int n = 0;
    for (const auto& c : l)
        if (c.slot == s) n += isHand(s) ? 1 : findItem(c.item.id)->size;
    return n;
}

bool canPlace(const Loadout& l, Slot s, const std::string& itemId) {
    const ItemDef* d = findItem(itemId);
    if (!d || d->kind == ItemKind::Armor) return false;
    if (s == Slot::Ground) return true;
    if (isHand(s)) return cellsUsed(l, s) == 0;
    if (d->size > 2 && s != Slot::Backpack) return false; // long guns only fit hands/backpack
    return cellsUsed(l, s) + d->size <= slotCapacity(s);
}

int loadoutWeight(const Loadout& l) {
    int w = 0;
    for (const auto& c : l)
        if (c.slot != Slot::Ground) w += findItem(c.item.id)->weight;
    return w;
}

} // namespace vamps

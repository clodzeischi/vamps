#include "tactical/BattleUnit.h"

#include <cmath>

namespace vamps {

int directionTo(int dx, int dy) {
    if (dx == 0 && dy == 0) return 0;
    double a = std::atan2((double)dx, (double)-dy); // 0 = north, clockwise
    int d = (int)std::lround(a / (3.14159265358979 / 4.0));
    return (d % 8 + 8) % 8;
}

const CarriedItem* BattleUnit::inSlot(Slot s) const {
    for (const auto& c : inv)
        if (c.slot == s) return &c;
    return nullptr;
}

CarriedItem* BattleUnit::inSlot(Slot s) {
    for (auto& c : inv)
        if (c.slot == s) return &c;
    return nullptr;
}

int BattleUnit::totalWill() const {
    int w = stats.will + willBonus;
    for (const auto& c : inv)
        if (const ItemDef* d = findItem(c.item.id); d && d->kind == ItemKind::Equipment) w += d->willBonus;
    return w;
}

int BattleUnit::strengthTotal() const {
    int s = stats.strength;
    if (const ItemDef* a = findItem(armorId)) s += a->strengthBonus;
    return s;
}

int BattleUnit::maxTu() const {
    // Original rule: every point of weight over Strength costs one TU.
    int over = loadoutWeight(inv) - strengthTotal();
    return std::max(10, stats.tu - std::max(0, over));
}

double BattleUnit::eyeHeight() const {
    if (!active()) return 0.15;
    return kneeling ? 0.45 : 0.75;
}

double BattleUnit::bodyHeight() const {
    if (!active()) return 0.25;
    return kneeling ? 0.6 : 0.9;
}

} // namespace vamps

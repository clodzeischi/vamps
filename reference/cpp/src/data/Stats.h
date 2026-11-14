#pragma once
// The original game's soldier attributes, with WILL in place of Psi
// (resistance to neurochemical domination) and MELEE accuracy.

namespace vamps {

struct UnitStats {
    int tu = 50;        // Time Units per turn
    int stamina = 50;   // Energy: drained by movement
    int health = 30;
    int bravery = 30;   // resists panic
    int reactions = 40; // reaction fire
    int firing = 50;    // firing accuracy
    int throwing = 50;  // throwing accuracy
    int strength = 30;  // carry weight & throw range
    int melee = 50;     // melee accuracy
    int will = 40;      // resistance to domination
};

} // namespace vamps

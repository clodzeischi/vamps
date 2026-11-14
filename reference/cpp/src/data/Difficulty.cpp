#include "data/Difficulty.h"

namespace vamps {

const DifficultyDef& difficulty(Difficulty d) {
    //                    name     funds     fund  rsrch build  +evt   brk    count stats  pr
    static const DifficultyDef defs[] = {
        {"Easy",   8000000, 0.80, 0.60, 0.75, 0.030, 0.040, 0.80, 0.90, 0.7},
        {"Normal", 5000000, 0.60, 1.00, 1.00, 0.015, 0.020, 1.00, 1.00, 1.0},
        {"Hard",   3000000, 0.45, 1.80, 1.30, 0.007, 0.005, 1.25, 1.15, 1.4},
    };
    return defs[(int)d];
}

} // namespace vamps

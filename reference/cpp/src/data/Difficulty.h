#pragma once
// Three difficulty settings. Per the design brief they affect starting and
// monthly funding, how often lucky events and breakthroughs happen, and how
// fast research goes (fast on Easy, slow and painful on Hard).

namespace vamps {

enum class Difficulty { Easy, Normal, Hard };

struct DifficultyDef {
    const char* name;
    long long startFunds;
    double fundingMult;        // applied to every nation's monthly grant
    double researchCostMult;   // multiplies research costs
    double buildTimeMult;      // multiplies manufacturing hours
    double positiveEventPerDay;
    double breakthroughPerDay;
    double enemyCountMult;
    double enemyStatMult;
    double vampPrMult;
};

const DifficultyDef& difficulty(Difficulty d);

} // namespace vamps

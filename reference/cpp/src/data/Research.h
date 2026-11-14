#pragma once
// The research tree. Four fields: Genetics, Archaeology, History and
// Engineering. Costs are in scientist-days (10 scientists = 10 per day),
// multiplied by the difficulty's research multiplier.

#include <string>
#include <vector>

#include "data/Bloodlines.h"

namespace vamps {

enum class ResearchField { Genetics, Archaeology, History, Engineering };
const char* researchFieldName(ResearchField f);

enum class CaptiveRequirement { None, AnyVampire, Elder };

struct ResearchDef {
    std::string id;
    std::string name;
    ResearchField field;
    int cost; // scientist-days at Normal difficulty
    std::vector<std::string> prereqs;   // research ids that must be complete
    std::string requiredItem;           // must be in stores (consumed on completion)
    bool anySigil = false;              // any sigil fragment satisfies requiredItem
    CaptiveRequirement captive = CaptiveRequirement::None;
    bool requiresAllLairs = false;      // every bloodline destroyed
    int revealsLair = -1;               // bloodline whose lair is revealed
    bool revealsFinal = false;
    std::string archive;                // text shown on completion
};

const std::vector<ResearchDef>& allResearch();
const ResearchDef* findResearch(const std::string& id);

} // namespace vamps

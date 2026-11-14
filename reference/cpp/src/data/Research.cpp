#include "data/Research.h"

namespace vamps {

const char* researchFieldName(ResearchField f) {
    switch (f) {
        case ResearchField::Genetics: return "Genetics";
        case ResearchField::Archaeology: return "Archaeology";
        case ResearchField::History: return "History";
        case ResearchField::Engineering: return "Engineering";
    }
    return "?";
}

namespace {

std::vector<ResearchDef> buildTree() {
    using F = ResearchField;
    std::vector<ResearchDef> t;
    t.reserve(64);
    auto add = [&](std::string id, std::string name, F field, int cost, std::vector<std::string> pre,
                   std::string archive) -> ResearchDef& {
        ResearchDef d;
        d.id = std::move(id); d.name = std::move(name); d.field = field; d.cost = cost;
        d.prereqs = std::move(pre); d.archive = std::move(archive);
        t.push_back(std::move(d));
        return t.back();
    };

    // ----- History -----
    add("albigensian_records", "Albigensian Crusade Records", F::History, 100, {},
        "Inquisition registers from Toulouse and Carcassonne describe 'Perfecti' who would not "
        "burn and could not be bled. The scribes recorded them as heretics. Their descriptions read "
        "like clinical notes on a disease.");
    add("blood_ledgers", "Blood Ledgers", F::History, 150, {},
        "Forensic accounting traces the bloodlines' shell companies. Hunt detection +15%. Black "
        "market prices drop 20% once we know whom we are buying from.")
        .requiredItem = "blood_ledger";
    add("cathar_codex", "The Cathar Codex", F::History, 250, {"albigensian_records", "sigil_analysis"},
        "The sigils form a single tree that branches from one root: the fall of Montsegur, March 1244. "
        "Someone survived the pyre.");
    {
        auto& d = add("montsegur_origin", "Montsegur Origin", F::History, 400,
                      {"cathar_codex", "elder_physiology"},
                      "With every lair burned, the genealogy has only one unresolved node, beneath the "
                      "ruins of Montsegur. The Progenitor sleeps there. We go in at night; we have no choice.");
        d.requiresAllLairs = true;
        d.revealsFinal = true;
    }

    // ----- Archaeology -----
    add("sigil_analysis", "Sigil Fragment Analysis", F::Archaeology, 200, {},
        "The carvings are not decoration. Each glyph pairs a name with a lineage marker: who "
        "turned whom, and when.")
        .anySigil = true;

    // ----- Genetics -----
    add("remains_analysis", "Vampire Remains Analysis", F::Genetics, 150, {},
        "A lentivirus-like retroelement rewrites the host's haematopoietic and immune systems. Tissue "
        "repair is astonishing, and it depends on oxygenated haemoglobin that the host cannot make "
        "itself. Fire denatures the virus faster than it can repair.")
        .requiredItem = "vamp_remains";
    add("torpor_physiology", "Torpor Physiology", F::Genetics, 250, {"remains_analysis"},
        "Under massive trauma the subject enters torpor: a coma-like state in which it rebuilds "
        "itself from stored haem. The repair runs through the clotting cascade.")
        .captive = CaptiveRequirement::AnyVampire;
    add("haemolytic_agent", "Haemolytic Agent", F::Genetics, 300, {"torpor_physiology"},
        "A synthetic enzyme that blocks the repair cascade. A vampire in torpor that has been darted "
        "never wakes up, so it can be captured or burned at leisure.");
    add("pheromone_analysis", "Pheromone Analysis", F::Genetics, 250, {},
        "Elders secrete volatile neuropeptides that bind human oxytocin and CRH receptors: fear or "
        "devotion on demand. A receptor antagonist (Neuro-Blocker) can be manufactured.")
        .requiredItem = "pheromone_gland";
    add("haem_serum_analysis", "Haem Serum Analysis", F::Genetics, 200, {},
        "Stripped of the viral load, the serum is a superb wound accelerant (Haem Stimulant).")
        .requiredItem = "haem_serum";
    add("elder_physiology", "Elder Physiology", F::Genetics, 400, {"torpor_physiology"},
        "An elder's genome carries edits made generations apart: deliberate, guided. Someone has "
        "been engineering the strain.")
        .captive = CaptiveRequirement::Elder;
    add("retroviral_lineage", "Retroviral Lineage", F::Genetics, 300, {"remains_analysis", "sigil_analysis"},
        "Matching viral sequences against the sigil genealogy shows that each bloodline's strain is "
        "distinct. With a fragment from a given line we can trace it to its source.");

    for (int b = 0; b < kBloodlineCount; ++b) {
        const auto& bl = bloodline(b);
        auto& d = add("trace_" + std::to_string(b), std::string("Trace the ") + bl.shortName + " Line",
                      F::Archaeology, 300, {"retroviral_lineage"},
                      std::string("Cross-referencing the sigil with land registries and flight records "
                                  "pinpoints the lair of ") + bl.name + ": " + bl.lairName + ".");
        d.requiredItem = sigilItemId(b);
        d.revealsLair = b;
    }

    // ----- Engineering -----
    add("thermal_necrosis", "Thermal Necrosis Study", F::Engineering, 120, {"remains_analysis"},
        "Above 400 C the retrovirus cannot keep up. Incendiary rifle magazines, AMR rounds and thermite "
        "grenades are now available for manufacture.");
    add("napalm_projector", "Napalm Projector", F::Engineering, 200, {"thermal_necrosis"},
        "A man-portable flame projector and thermite demolition charges.");
    add("ceramic_armor", "Ceramic Plate Armour", F::Engineering, 150, {},
        "Boron-carbide trauma plates in a modular carrier.");
    add("sealed_suit", "Sealed Ballistic Suit", F::Engineering, 300, {"ceramic_armor", "pheromone_analysis"},
        "A sealed rebreather integrated with ceramic armour stops pheromone aerosols at the mask.");
    add("exoframe", "Exo-Frame", F::Engineering, 450, {"sealed_suit", "torpor_physiology"},
        "A powered exoskeleton lets a soldier match a vampire's strength.");
    add("motion_tracker", "Motion Tracker", F::Engineering, 100, {},
        "A handheld millimetre-wave sensor that detects movement through walls.");
    add("night_optics", "Night-Vision Optics", F::Engineering, 120, {},
        "Image-intensifier goggles for every soldier. Night sight range increases from 9 to 14 tiles.");
    add("thermobaric_missile", "Thermobaric Missiles", F::Engineering, 200, {"thermal_necrosis"},
        "Fuel-air missiles for the interceptors. Longer range, and they burn whatever they hit.");

    return t;
}

} // namespace

const std::vector<ResearchDef>& allResearch() {
    static const std::vector<ResearchDef> t = buildTree();
    return t;
}

const ResearchDef* findResearch(const std::string& id) {
    for (const auto& r : allResearch())
        if (r.id == id) return &r;
    return nullptr;
}

} // namespace vamps

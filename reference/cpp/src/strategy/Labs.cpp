#include "strategy/Labs.h"

#include <algorithm>

#include "core/Format.h"
#include "core/Random.h"
#include "strategy/Economy.h"

namespace vamps {

namespace {

bool anyBaseHas(const GameState& g, const std::string& itemId) {
    for (const auto& b : g.bases)
        if (b.itemCount(itemId) > 0) return true;
    return false;
}

bool anySigil(const GameState& g) {
    for (int i = 0; i < kBloodlineCount; ++i)
        if (anyBaseHas(g, sigilItemId(i))) return true;
    return false;
}

bool hasCaptive(const GameState& g, CaptiveRequirement req) {
    for (const auto& b : g.bases)
        for (const auto& c : b.captives) {
            if (req == CaptiveRequirement::AnyVampire &&
                (c.rank == EnemyRank::Fledgling || c.rank == EnemyRank::Vampire || c.rank == EnemyRank::Elder))
                return true;
            if (req == CaptiveRequirement::Elder && c.rank == EnemyRank::Elder) return true;
        }
    return false;
}

// Consumes the item (or captive) a topic needed, from the researching base if possible.
void consumeRequirement(GameState& g, Base* b, const ResearchDef& r) {
    auto take = [&](const std::string& id) {
        if (b && b->removeItem(id)) return true;
        for (auto& o : g.bases)
            if (o.removeItem(id)) return true;
        return false;
    };
    if (!r.requiredItem.empty()) take(r.requiredItem);
    if (r.anySigil)
        for (int i = 0; i < kBloodlineCount; ++i)
            if (take(sigilItemId(i))) break;
    // Captives are studied, not consumed: they stay in containment.
}

} // namespace

std::string researchBlocker(const GameState& g, const ResearchDef& r) {
    if (g.isResearched(r.id)) return "Already researched.";
    for (const auto& p : r.prereqs)
        if (!g.isResearched(p)) return "Requires: " + findResearch(p)->name;
    if (!r.requiredItem.empty() && !anyBaseHas(g, r.requiredItem))
        return "Requires: " + item(r.requiredItem).name;
    if (r.anySigil && !anySigil(g)) return "Requires: a sigil fragment";
    if (r.captive != CaptiveRequirement::None && !hasCaptive(g, r.captive))
        return r.captive == CaptiveRequirement::Elder ? "Requires: a captive Elder" : "Requires: a captive vampire";
    if (r.requiresAllLairs && g.activeBloodlines() > 0) return "Requires: every bloodline destroyed";
    return "";
}

bool researchInProgress(const GameState& g, const std::string& id) {
    for (const auto& b : g.bases)
        for (const auto& p : b.research)
            if (p.id == id) return true;
    return false;
}

std::vector<const ResearchDef*> availableResearch(const GameState& g) {
    std::vector<const ResearchDef*> out;
    for (const auto& r : allResearch())
        if (researchBlocker(g, r).empty() && !researchInProgress(g, r.id)) out.push_back(&r);
    return out;
}

bool startResearch(GameState& g, Base& b, const std::string& id, int scientists, std::string& err) {
    const ResearchDef* r = findResearch(id);
    if (!r) { err = "Unknown topic."; return false; }
    std::string why = researchBlocker(g, *r);
    if (!why.empty()) { err = why; return false; }
    if (researchInProgress(g, id)) { err = "Already being researched."; return false; }
    if (b.countFacilities(FacilityType::Laboratory) == 0) { err = "This base has no laboratory."; return false; }
    ResearchProject p;
    p.id = id;
    p.cost = r->cost * g.diff().researchCostMult * rng().real(0.8, 1.2);
    b.research.push_back(p);
    setResearchScientists(b, (int)b.research.size() - 1, scientists);
    return true;
}

void setResearchScientists(Base& b, int idx, int n) {
    if (idx < 0 || idx >= (int)b.research.size()) return;
    auto& p = b.research[idx];
    int othersBusy = b.scientistsBusy() - p.scientists;
    int labSpace = b.capacity(FacilityType::Laboratory) - othersBusy;
    int available = std::min(b.scientists - othersBusy, labSpace);
    p.scientists = std::clamp(n, 0, std::max(0, available));
}

void cancelResearch(Base& b, int idx) {
    if (idx >= 0 && idx < (int)b.research.size()) b.research.erase(b.research.begin() + idx);
}

bool canManufacture(const GameState& g, const ItemDef& d) {
    return d.buildHours > 0 && (d.research.empty() || g.isResearched(d.research));
}

std::vector<const ItemDef*> manufacturableItems(const GameState& g) {
    std::vector<const ItemDef*> out;
    for (const auto& d : allItems())
        if (canManufacture(g, d)) out.push_back(&d);
    return out;
}

double unitBuildHours(const GameState& g, const ItemDef& d) { return d.buildHours * g.diff().buildTimeMult; }

bool startProduction(GameState& g, Base& b, const std::string& itemId, int qty, int engineers, std::string& err) {
    const ItemDef* d = findItem(itemId);
    if (!d || !canManufacture(g, *d)) { err = "Cannot manufacture that."; return false; }
    if (b.countFacilities(FacilityType::Workshop) == 0) { err = "This base has no workshop."; return false; }
    if (g.funds < d->buildCost) { err = "Not enough funds for the first unit."; return false; }
    ProductionJob j;
    j.itemId = itemId;
    j.quantity = std::max(1, qty);
    g.funds -= d->buildCost; // first unit paid now
    b.production.push_back(j);
    setProductionEngineers(b, (int)b.production.size() - 1, engineers);
    return true;
}

void setProductionEngineers(Base& b, int idx, int n) {
    if (idx < 0 || idx >= (int)b.production.size()) return;
    auto& j = b.production[idx];
    int othersBusy = b.engineersBusy() - j.engineers;
    int space = b.capacity(FacilityType::Workshop) - othersBusy;
    int available = std::min(b.engineers - othersBusy, space);
    j.engineers = std::clamp(n, 0, std::max(0, available));
}

void cancelProduction(Base& b, int idx) {
    if (idx >= 0 && idx < (int)b.production.size()) b.production.erase(b.production.begin() + idx);
}

void completeResearch(GameState& g, Base* b, const ResearchDef& r) {
    g.researched.insert(r.id);
    consumeRequirement(g, b, r);
    g.post(GeoEventType::ResearchDone, "Research Complete: " + r.name, r.archive);

    if (r.revealsLair >= 0) {
        int bl = r.revealsLair;
        g.bloodlines[bl].lairKnown = true;
        MissionSite s;
        s.id = g.newId();
        s.type = SiteType::Lair;
        s.bloodline = bl;
        s.pos = bloodline(bl).lair;
        s.nation = world().nearestNation(s.pos);
        s.label = std::string("Lair: ") + bloodline(bl).shortName;
        s.crew = 14;
        g.sites.push_back(s);
        g.post(GeoEventType::LairRevealed, "Lair Located",
               std::string("The lair of ") + bloodline(bl).name + " is in the " + bloodline(bl).lairName +
                   ". Send a transport when the squad is ready.",
               s.id);
    }
    if (r.revealsFinal && !g.finalRevealed) {
        g.finalRevealed = true;
        MissionSite s;
        s.id = g.newId();
        s.type = SiteType::Final;
        s.pos = montsegurLocation();
        s.nation = world().nearestNation(s.pos);
        s.label = "Montsegur";
        s.crew = 16;
        g.sites.push_back(s);
        g.post(GeoEventType::LairRevealed, "Montsegur",
               "The final assault is possible: two stages, the ruins and then the catacombs. Bring fire.", s.id);
    }
}

void hourlyLabs(GameState& g) {
    for (auto& b : g.bases) {
        // Research
        for (size_t i = 0; i < b.research.size();) {
            auto& p = b.research[i];
            p.progress += p.scientists / 24.0;
            if (p.progress >= p.cost) {
                const ResearchDef* r = findResearch(p.id);
                b.research.erase(b.research.begin() + i);
                if (r) completeResearch(g, &b, *r);
            } else {
                ++i;
            }
        }
        // Manufacturing
        for (size_t i = 0; i < b.production.size();) {
            auto& j = b.production[i];
            const ItemDef& d = item(j.itemId);
            j.progress += j.engineers;
            bool finished = false;
            while (j.progress >= unitBuildHours(g, d)) {
                j.progress -= unitBuildHours(g, d);
                if (d.storage + b.storageUsed() > storageCapacity(b)) {
                    g.post(GeoEventType::ProductionDone, "Stores Full",
                           "Production of " + d.name + " at " + b.name + " halted: no store space.");
                    finished = true;
                    break;
                }
                b.addItem(d.id);
                j.produced++;
                if (j.produced >= j.quantity) {
                    g.post(GeoEventType::ProductionDone, "Production Complete",
                           fmt("%d x %s ready at %s.", j.quantity, d.name.c_str(), b.name.c_str()));
                    finished = true;
                    break;
                }
                if (g.funds < d.buildCost) {
                    g.post(GeoEventType::ProductionDone, "Production Halted",
                           "Not enough money to continue building " + d.name + ".");
                    finished = true;
                    break;
                }
                g.funds -= d.buildCost;
            }
            if (finished) b.production.erase(b.production.begin() + i);
            else ++i;
        }
    }
}

void dailyBreakthroughs(GameState& g) {
    if (!rng().chance(g.diff().breakthroughPerDay)) return;
    std::vector<ResearchProject*> active;
    for (auto& b : g.bases)
        for (auto& p : b.research)
            if (p.scientists > 0) active.push_back(&p);
    if (active.empty()) return;
    ResearchProject* p = active[rng().range(0, (int)active.size() - 1)];
    p->progress += p->cost * 0.3;
    g.post(GeoEventType::Info, "Breakthrough",
           "Our scientists report an unexpected insight into " + findResearch(p->id)->name + ".");
}

} // namespace vamps

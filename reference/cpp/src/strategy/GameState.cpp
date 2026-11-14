#include "strategy/GameState.h"

namespace vamps {

const char* craftStatusName(CraftStatus s) {
    switch (s) {
        case CraftStatus::Ready: return "Ready";
        case CraftStatus::Refuelling: return "Refuelling";
        case CraftStatus::Repairing: return "Repairing";
        case CraftStatus::Rearming: return "Rearming";
        case CraftStatus::Airborne: return "Airborne";
    }
    return "?";
}

const char* huntMissionName(HuntMission m) {
    switch (m) {
        case HuntMission::Feeding: return "Feeding Run";
        case HuntMission::Infiltration: return "Infiltration";
        case HuntMission::Harvest: return "Harvest";
        case HuntMission::Supply: return "Supply Run";
    }
    return "?";
}

const char* siteTypeName(SiteType t) {
    switch (t) {
        case SiteType::CrashSite: return "Crash Site";
        case SiteType::LandedHunt: return "Landed Flight";
        case SiteType::Harvest: return "Harvest Night";
        case SiteType::PREvent: return "PR Event";
        case SiteType::Lair: return "Bloodline Lair";
        case SiteType::Final: return "Montsegur";
    }
    return "?";
}

template <class T>
static T* findById(std::vector<T>& v, int id) {
    for (auto& x : v)
        if (x.id == id) return &x;
    return nullptr;
}

Base* GameState::findBase(int id) { return findById(bases, id); }
Craft* GameState::findCraft(int id) { return findById(craft, id); }
Soldier* GameState::findSoldier(int id) { return findById(soldiers, id); }
Hunt* GameState::findHunt(int id) { return findById(hunts, id); }
MissionSite* GameState::findSite(int id) { return findById(sites, id); }

void GameState::post(GeoEventType type, std::string title, std::string text, int ref, int ref2) {
    addLog(title + ": " + text);
    events.push_back({type, std::move(title), std::move(text), ref, ref2});
}

void GameState::addLog(const std::string& msg) {
    log.push_back(time.dateString() + "  " + msg);
    while (log.size() > 200) log.pop_front();
}

int GameState::soldiersAt(int baseId) const {
    int n = 0;
    for (const auto& s : soldiers)
        if (s.baseId == baseId) ++n;
    return n;
}

int GameState::incomingPersonnel(int baseId) const {
    int n = 0;
    for (const auto& b : bases)
        if (b.id == baseId)
            for (const auto& t : b.incoming)
                if (t.kind == TransferKind::Scientist || t.kind == TransferKind::Engineer) n += t.count;
    return n;
}

int GameState::personnelAt(int baseId) const {
    int n = soldiersAt(baseId);
    for (const auto& b : bases)
        if (b.id == baseId) n += b.scientists + b.engineers;
    return n + incomingPersonnel(baseId);
}

int GameState::craftAt(int baseId) const {
    int n = 0;
    for (const auto& c : craft)
        if (c.baseId == baseId) ++n;
    for (const auto& b : bases)
        if (b.id == baseId)
            for (const auto& t : b.incoming)
                if (t.kind == TransferKind::Craft) ++n;
    return n;
}

int GameState::captivesAt(int baseId) const {
    int n = 0;
    for (const auto& b : bases)
        if (b.id == baseId) {
            n += (int)b.captives.size();
            for (const auto& t : b.incoming)
                if (t.kind == TransferKind::Captive) ++n;
        }
    return n;
}

double GameState::averageSupport() const {
    double total = 0;
    int n = 0;
    for (const auto& ns : nations) {
        total += ns.support;
        ++n;
    }
    return n ? total / n : 0;
}

int GameState::defectedCount() const {
    int n = 0;
    for (const auto& ns : nations)
        if (ns.defected) ++n;
    return n;
}

int GameState::activeBloodlines() const {
    int n = 0;
    for (const auto& b : bloodlines)
        if (!b.destroyed) ++n;
    return n;
}

} // namespace vamps

#include "strategy/Simulation.h"

#include <algorithm>

#include "core/Format.h"
#include "core/Random.h"
#include "data/Craft.h"
#include "data/Items.h"
#include "strategy/BloodlineAI.h"
#include "strategy/Economy.h"
#include "strategy/Labs.h"
#include "strategy/Politics.h"

namespace vamps {

namespace {

constexpr double kCatchNm = 5.0;

LatLon targetPosition(GameState& g, Craft& c, bool& valid) {
    valid = true;
    switch (c.target) {
        case CraftTarget::Hunt:
            if (Hunt* h = g.findHunt(c.targetId); h && h->detected) return h->pos;
            break;
        case CraftTarget::Site:
            if (MissionSite* s = g.findSite(c.targetId)) return s->pos;
            break;
        case CraftTarget::Waypoint: return c.waypoint;
        case CraftTarget::Home:
            if (Base* b = g.findBase(c.baseId)) return b->pos;
            break;
        default: break;
    }
    valid = false;
    return c.pos;
}

void goHome(Craft& c) {
    c.target = CraftTarget::Home;
    c.targetId = -1;
}

void arriveHome(GameState& g, Craft& c) {
    c.target = CraftTarget::None;
    c.status = CraftStatus::Refuelling;
    c.lowFuelWarned = false;
    if (Base* b = g.findBase(c.baseId)) c.pos = b->pos;
    g.addLog(c.name + " has returned to base.");
}

void moveCraft(GameState& g, double seconds) {
    for (auto& c : g.craft) {
        if (!c.airborne()) continue;
        const CraftDef& def = craftType(c.type);
        bool valid = false;
        LatLon dest = targetPosition(g, c, valid);
        if (!valid) {
            if (c.target == CraftTarget::Hunt)
                g.post(GeoEventType::ContactLost, "Target Lost", c.name + " has lost its target and is returning to base.", c.id);
            goHome(c);
            dest = targetPosition(g, c, valid);
        }

        double step = def.speed * seconds / 3600.0;
        double dist = distanceNm(c.pos, dest);
        if (dist > 0.01) c.pos = stepToward(c.pos, dest, step);
        c.fuel -= seconds / 3600.0;

        // Fuel check: always keep enough to get home, with a 10% margin.
        if (c.target != CraftTarget::Home) {
            Base* home = g.findBase(c.baseId);
            double hoursHome = home ? distanceNm(c.pos, home->pos) / def.speed : 0;
            if (c.fuel < hoursHome * 1.1 + 0.05) {
                if (!c.lowFuelWarned)
                    g.post(GeoEventType::CraftReturned, "Low Fuel", c.name + " is returning to base.", c.id);
                c.lowFuelWarned = true;
                goHome(c);
                continue;
            }
        }

        dist = distanceNm(c.pos, dest);
        switch (c.target) {
            case CraftTarget::Home:
                if (dist < 1) arriveHome(g, c);
                break;
            case CraftTarget::Hunt: {
                Hunt* h = g.findHunt(c.targetId);
                if (!h || dist > kCatchNm + step) break;
                if (h->phase == HuntPhase::Landed && h->siteId >= 0) {
                    if (def.soldiers > 0 && soldiersAboard(g, c.id) > 0) {
                        c.target = CraftTarget::Site;
                        c.targetId = h->siteId;
                    } else {
                        c.target = CraftTarget::Waypoint;
                        c.waypoint = h->pos;
                    }
                } else if (def.weaponSlots > 0) {
                    c.target = CraftTarget::Waypoint;
                    c.waypoint = c.pos;
                    g.post(GeoEventType::Intercept, "Interception", c.name + " has caught " +
                           huntCraft(h->craftType).name + ".", c.id, h->id);
                }
                break;
            }
            case CraftTarget::Site:
                if (dist < 1) {
                    MissionSite* s = g.findSite(c.targetId);
                    c.target = CraftTarget::Waypoint;
                    c.waypoint = c.pos;
                    if (s && def.soldiers > 0 && soldiersAboard(g, c.id) > 0)
                        g.post(GeoEventType::CraftAtSite, "Arrived", c.name + " is over the " + siteTypeName(s->type) + ".",
                               c.id, s->id);
                }
                break;
            default: break;
        }
    }
}

// Every 10 minutes: radar sweeps.
void detection(GameState& g) {
    Random& r = rng();
    for (auto& h : g.hunts) {
        if (h.phase == HuntPhase::Landed) continue;
        double mult = bloodline(h.bloodline).detectionMult * (g.isResearched("blood_ledgers") ? 1.15 : 1.0);
        bool inRange = false, spotted = false;
        for (const auto& b : g.bases) {
            for (const auto& f : b.facilities) {
                const auto& fd = facility(f.type);
                if (!f.ready() || fd.radarRangeNm == 0) continue;
                if (distanceNm(b.pos, h.pos) > fd.radarRangeNm) continue;
                inRange = true;
                if (r.chance(fd.detectPercent / 100.0 * mult)) spotted = true;
            }
        }
        for (const auto& c : g.craft) {
            if (!c.airborne()) continue;
            if (distanceNm(c.pos, h.pos) > craftType(c.type).radarRangeNm) continue;
            inRange = true;
            if (r.chance(0.25 * mult)) spotted = true;
        }
        if (!h.detected && spotted) {
            h.detected = true;
            const auto& def = huntCraft(h.craftType);
            int nation = world().nationAt(h.pos);
            g.post(GeoEventType::HuntDetected, "Flight Detected",
                   def.name + " (" + bloodline(h.bloodline).shortName + ") over " +
                       (nation >= 0 ? nations()[nation].name : std::string("open sea")) +
                       fmt(", heading %s. Speed %d knots.", h.mission == HuntMission::Harvest ? "for a city" : "inland",
                           def.speed),
                   h.id);
        } else if (h.detected && !inRange) {
            h.detected = false;
            g.post(GeoEventType::ContactLost, "Contact Lost",
                   huntCraft(h.craftType).name + " has left radar coverage.", h.id);
        }
    }
    // Landed sites become visible if their flight was tracked when it landed.
    for (auto& s : g.sites)
        if (s.type == SiteType::LandedHunt && !s.detected)
            if (Hunt* h = g.findHunt(s.huntId); h && h->detected) s.detected = true;
}

// Every hour at base: refuel, repair, rearm.
void serviceCraft(GameState& g) {
    for (auto& c : g.craft) {
        const CraftDef& def = craftType(c.type);
        Base* b = g.findBase(c.baseId);
        switch (c.status) {
            case CraftStatus::Refuelling:
                c.fuel = std::min(def.fuelHours, c.fuel + def.fuelHours * 0.25);
                if (c.fuel >= def.fuelHours) c.status = c.hp < def.hp ? CraftStatus::Repairing : CraftStatus::Rearming;
                break;
            case CraftStatus::Repairing:
                c.hp = std::min(def.hp, c.hp + std::max(1, def.hp / 10));
                if (c.hp >= def.hp) c.status = CraftStatus::Rearming;
                break;
            case CraftStatus::Rearming:
                for (auto& w : c.weapons) {
                    if (w.id.empty() || !b) continue;
                    const ItemDef& wd = item(w.id);
                    while (w.ammo < wd.craftAmmoCapacity && b->removeItem(wd.craftAmmoItem))
                        w.ammo = std::min(wd.craftAmmoCapacity, w.ammo + wd.craftAmmoPerItem);
                }
                c.status = CraftStatus::Ready;
                break;
            default: break;
        }
    }
}

void dailyBases(GameState& g) {
    for (auto& b : g.bases)
        for (auto& f : b.facilities)
            if (f.daysLeft > 0 && --f.daysLeft == 0)
                g.post(GeoEventType::FacilityDone, "Construction Complete",
                       std::string(facility(f.type).name) + " is operational at " + b.name + ".");
    for (auto& s : g.soldiers)
        if (s.woundDays > 0) s.woundDays--;
}

void hourly(GameState& g) {
    deliverTransfers(g);
    hourlyLabs(g);
    serviceCraft(g);
    hourlyBloodlines(g);
}

void daily(GameState& g) {
    dailyBases(g);
    dailyPolitics(g);
    dailyBreakthroughs(g);
}

} // namespace

int soldiersAboard(const GameState& g, int craftId) {
    int n = 0;
    for (const auto& s : g.soldiers)
        if (s.craftId == craftId) ++n;
    return n;
}

bool launchCraft(GameState& g, int craftId, CraftTarget target, int targetId, const LatLon& wp, std::string& err) {
    Craft* c = g.findCraft(craftId);
    if (!c) { err = "No such craft."; return false; }
    if (!c->airborne() && c->status != CraftStatus::Ready) {
        err = c->name + " is " + craftStatusName(c->status) + ".";
        return false;
    }
    LatLon where = wp;
    if (target == CraftTarget::Site)
        if (MissionSite* s = g.findSite(targetId)) where = s->pos;
    if (target == CraftTarget::Hunt)
        if (Hunt* h = g.findHunt(targetId)) where = h->pos;
    int nation = world().nationAt(where);
    if (target != CraftTarget::Home && !airspaceOpen(g, nation)) {
        err = nations()[nation].name + " has closed its airspace to the agency.";
        return false;
    }
    if (target == CraftTarget::Site && craftType(c->type).soldiers > 0 && soldiersAboard(g, c->id) == 0) {
        err = c->name + " has no soldiers aboard.";
        return false;
    }
    if (!c->airborne()) {
        if (Base* b = g.findBase(c->baseId)) c->pos = b->pos;
    }
    c->status = CraftStatus::Airborne;
    c->target = target;
    c->targetId = targetId;
    c->waypoint = wp;
    return true;
}

void recallCraft(GameState& g, int craftId) {
    if (Craft* c = g.findCraft(craftId); c && c->airborne()) goHome(*c);
}

int64_t advanceTime(GameState& g, int64_t seconds) {
    if (g.gameOver || g.victory) return 0;
    int64_t done = 0;
    const int64_t step = seconds <= 60 ? 5 : 60;
    while (done < seconds && g.events.empty()) {
        int64_t dt = std::min(step, seconds - done);
        int64_t before = g.time.seconds;
        int monthBefore = g.time.date().month;
        g.time.seconds += dt;
        done += dt;

        moveHunts(g, (double)dt);
        moveCraft(g, (double)dt);

        if (g.time.seconds / 600 != before / 600) detection(g);
        if (g.time.seconds / GameTime::kHour != before / GameTime::kHour) hourly(g);
        if (g.time.seconds / GameTime::kDay != before / GameTime::kDay) daily(g);
        if (g.time.date().month != monthBefore) monthlyPolitics(g);
    }
    return done;
}

} // namespace vamps

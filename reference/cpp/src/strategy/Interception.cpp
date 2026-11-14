#include "strategy/Interception.h"

#include <algorithm>

#include "core/Format.h"
#include "core/Random.h"
#include "data/Craft.h"
#include "data/Items.h"
#include "strategy/BloodlineAI.h"

namespace vamps {

const char* stanceName(Stance s) {
    switch (s) {
        case Stance::Standoff: return "Standoff";
        case Stance::Cautious: return "Cautious";
        case Stance::Standard: return "Standard";
        case Stance::Aggressive: return "Aggressive";
        case Stance::Disengage: return "Disengage";
    }
    return "?";
}

namespace {

// The distance the interceptor tries to hold for a stance.
double desiredDistance(const Craft& c, Stance s) {
    int longest = 0, shortest = 1000;
    for (const auto& w : c.weapons) {
        if (w.id.empty()) continue;
        int r = item(w.id).craftRangeKm;
        longest = std::max(longest, r);
        shortest = std::min(shortest, r);
    }
    if (longest == 0) return 60;
    switch (s) {
        case Stance::Standoff: return longest;
        case Stance::Cautious: return (longest + shortest) / 2.0;
        case Stance::Standard: return shortest;
        case Stance::Aggressive: return 1;
        case Stance::Disengage: return 200;
    }
    return shortest;
}

} // namespace

Dogfight startDogfight(GameState& g, int craftId, int huntId) {
    Dogfight d;
    d.craftId = craftId;
    d.huntId = huntId;
    if (Craft* c = g.findCraft(craftId)) d.reload.assign(c->weapons.size(), 0);
    d.log.push_back("Target acquired. Closing.");
    return d;
}

void stepDogfight(GameState& g, Dogfight& d) {
    if (d.result != DogfightResult::Ongoing) return;
    Craft* c = g.findCraft(d.craftId);
    Hunt* h = g.findHunt(d.huntId);
    if (!c || !h) { d.result = DogfightResult::Disengaged; return; }
    const auto& hd = huntCraft(h->craftType);
    const auto& cd = craftType(c->type);
    Random& r = rng();
    d.elapsed++;

    // Movement: close or open the range at up to 2 km/s.
    double want = desiredDistance(*c, d.stance);
    double delta = std::clamp(want - d.distanceKm, -2.0, 2.0);
    d.distanceKm = std::max(0.5, d.distanceKm + delta);
    if (d.stance == Stance::Disengage && d.distanceKm >= 60) {
        d.result = DogfightResult::Disengaged;
        d.log.push_back("Disengaged.");
        return;
    }

    // Our weapons.
    for (size_t i = 0; i < c->weapons.size(); ++i) {
        auto& w = c->weapons[i];
        if (w.id.empty() || w.ammo <= 0) continue;
        d.reload[i] -= 1;
        const ItemDef& wd = item(w.id);
        if (d.reload[i] > 0 || d.distanceKm > wd.craftRangeKm) continue;
        d.reload[i] = wd.craftReloadSec;
        w.ammo--;
        if (r.percent(wd.craftAccuracy)) {
            int dmg = r.range(wd.damage / 2, wd.damage);
            h->hp -= dmg;
            d.log.push_back(fmt("%s hit! %d damage.", wd.name.c_str(), dmg));
        } else {
            d.log.push_back(wd.name + " missed.");
        }
    }

    // Their weapon.
    if (hd.weaponDamage > 0) {
        d.enemyReload -= 1;
        if (d.enemyReload <= 0 && d.distanceKm <= hd.weaponRangeKm) {
            d.enemyReload = hd.weaponReloadSec;
            if (r.percent(45)) {
                int dmg = r.range(hd.weaponDamage / 2, hd.weaponDamage);
                c->hp -= dmg;
                d.log.push_back(fmt("We are hit! %d damage.", dmg));
            } else {
                d.log.push_back("Enemy fire misses.");
            }
        }
    }

    if (c->hp <= 0) {
        d.result = DogfightResult::CraftDestroyed;
        d.log.push_back(c->name + " has been destroyed.");
    } else if (h->hp <= 0) {
        d.result = DogfightResult::HuntDestroyed;
        d.log.push_back("Target destroyed.");
    } else if (h->hp <= hd.hp / 2) {
        d.result = DogfightResult::HuntDowned;
        d.log.push_back("Target is going down!");
    } else {
        // Out of ammo, or a faster flight running away after a while.
        bool anyAmmo = false;
        for (const auto& w : c->weapons) anyAmmo |= (!w.id.empty() && w.ammo > 0);
        if (!anyAmmo) {
            d.stance = Stance::Disengage;
        } else if (hd.speed > cd.speed && d.elapsed > 20 && r.percent(5)) {
            d.result = DogfightResult::HuntEscaped;
            d.log.push_back("Target is outrunning us.");
        } else if (d.elapsed > 240) {
            d.result = DogfightResult::HuntEscaped;
            d.log.push_back("Target broke contact in cloud.");
        }
    }
    if (d.log.size() > 50) d.log.erase(d.log.begin());
}

void finishDogfight(GameState& g, Dogfight& d) {
    Craft* c = g.findCraft(d.craftId);
    Hunt* h = g.findHunt(d.huntId);
    switch (d.result) {
        case DogfightResult::HuntDowned:
        case DogfightResult::HuntDestroyed: {
            if (!h) break;
            bool destroyed = d.result == DogfightResult::HuntDestroyed;
            int site = crashHunt(g, *h, destroyed);
            std::string name = huntCraft(h->craftType).name;
            if (site >= 0)
                g.post(GeoEventType::SiteAppeared, "Crash Site",
                       name + (destroyed ? " was destroyed. Wreckage and a few survivors are on the ground."
                                         : " was forced down. Survivors are regenerating in the wreck. Send a transport."),
                       site);
            else
                g.post(GeoEventType::Info, "Splashdown", name + " went down at sea. Nothing to recover.");
            removeHunt(g, h->id);
            break;
        }
        case DogfightResult::CraftDestroyed:
            if (c) {
                g.post(GeoEventType::Info, "Craft Lost", c->name + " was shot down.");
                int id = c->id;
                g.craft.erase(std::remove_if(g.craft.begin(), g.craft.end(), [&](const Craft& x) { return x.id == id; }),
                              g.craft.end());
                c = nullptr;
            }
            break;
        default: break;
    }
    if (c) {
        c->target = CraftTarget::Home;
        c->targetId = -1;
    }
}

} // namespace vamps

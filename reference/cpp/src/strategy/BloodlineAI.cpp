#include "strategy/BloodlineAI.h"

#include <algorithm>
#include <cmath>

#include "core/Format.h"
#include "core/Random.h"
#include "data/Craft.h"
#include "strategy/Politics.h"

namespace vamps {

namespace {

std::vector<int> nationsOn(const GameState& g, Continent c) {
    std::vector<int> out;
    for (int i = 0; i < (int)nations().size(); ++i)
        if (nations()[i].continent == c && !g.nations[i].defected) out.push_back(i);
    return out;
}

std::vector<int> citiesOf(int nation) {
    std::vector<int> out;
    for (int i = 0; i < (int)cities().size(); ++i)
        if (world().cityNation(i) == nation) out.push_back(i);
    return out;
}

// A land point 20-80 nm from a city (rural landing zone).
LatLon ruralPointNear(const LatLon& c) {
    for (int tries = 0; tries < 20; ++tries) {
        LatLon p = destinationPoint(c, rng().real(0, 2 * kPi), rng().real(20, 80));
        if (world().isLand(p)) return p;
    }
    return c;
}

// Somewhere 1500-2500 nm away: where flights come from and go to.
LatLon farPoint(const LatLon& from) {
    return destinationPoint(from, rng().real(0, 2 * kPi), rng().real(1500, 2500));
}

std::string pickCraft(const GameState& g, HuntMission m) {
    std::vector<std::string> pool;
    for (const auto& c : huntCraftTypes()) {
        if (c.firstMonth > g.monthIndex) continue;
        if (m == HuntMission::Feeding && (c.id == "exodus")) continue;
        if (m == HuntMission::Harvest && c.id == "courier") continue;
        pool.push_back(c.id);
        if (c.firstMonth + 2 > g.monthIndex) pool.push_back(c.id); // recent types are common
    }
    return pool.empty() ? "courier" : rng().pick(pool);
}

const char* kPrTitles[] = {
    "the premiere of 'Eternal Hearts'",  "a launch party for 'Night Garden' (novel)",
    "the 'Ageless' skincare campaign",   "a streaming series, 'Sanguine'",
    "a celebrity gala for 'Blood Drive Hope'", "a festival screening of 'The Gentle Dark'",
    "a viral wellness influencer tour",  "a prestige documentary, 'Misunderstood'",
};

void launchPrCampaign(GameState& g, int bl, int nation) {
    auto cs = citiesOf(nation);
    if (cs.empty()) return;
    int city = rng().pick(cs);
    MissionSite s;
    s.id = g.newId();
    s.type = SiteType::PREvent;
    s.bloodline = bl;
    s.nation = nation;
    s.city = city;
    s.pos = cities()[city].pos;
    s.expires = g.time.seconds + rng().range(5, 9) * GameTime::kDay;
    s.crew = rng().range(5, 8);
    s.label = "PR: " + cities()[city].name;
    g.sites.push_back(s);
    g.post(GeoEventType::SiteAppeared, "Vampire PR Campaign",
           std::string(bloodline(bl).name) + " is behind " + rng().pick(std::vector<std::string>(
                                                                std::begin(kPrTitles), std::end(kPrTitles))) +
               " in " + cities()[city].name + ". Disrupt it with a counter-op team, or lose support in " +
               nations()[nation].name + ".",
           s.id);
}

void launchHunt(GameState& g, int bl, HuntMission m, int nation) {
    const auto& def = huntCraft(pickCraft(g, m));
    Hunt h;
    h.id = g.newId();
    h.craftType = def.id;
    h.bloodline = bl;
    h.mission = m;
    h.nation = nation;
    h.hp = def.hp;
    h.crew = std::max(1, (int)std::round(rng().range(def.crewMin, def.crewMax) * g.diff().enemyCountMult));

    auto cs = citiesOf(nation);
    h.city = cs.empty() ? world().nearestCity(nations()[nation].seeds[0]) : rng().pick(cs);
    LatLon cityPos = cities()[h.city].pos;
    switch (m) {
        case HuntMission::Harvest: h.dest = cityPos; break;
        case HuntMission::Supply: h.dest = bloodline(bl).lair; break;
        default: h.dest = ruralPointNear(cityPos); break;
    }
    h.pos = (m == HuntMission::Supply) ? farPoint(h.dest)
            : (rng().percent(40) ? bloodline(bl).lair : farPoint(h.dest));
    h.exit = farPoint(h.dest);
    g.hunts.push_back(h);
}

void launchOperation(GameState& g, int bl) {
    Random& r = rng();
    auto ns = nationsOn(g, bloodline(bl).continent);
    if (ns.empty()) return;
    int nation = r.pick(ns);

    // Weights by campaign month.
    int m = g.monthIndex;
    int wFeed = 40, wPr = 20, wSupply = 15;
    int wInf = m >= 1 ? 15 + 3 * m : 0;
    int wHarvest = m >= 1 ? 10 + 2 * m : 0;
    int roll = r.range(1, wFeed + wPr + wSupply + wInf + wHarvest);
    g.bloodlines[bl].missionsLaunched++;

    if ((roll -= wFeed) <= 0) launchHunt(g, bl, HuntMission::Feeding, nation);
    else if ((roll -= wPr) <= 0) launchPrCampaign(g, bl, nation);
    else if ((roll -= wSupply) <= 0) launchHunt(g, bl, HuntMission::Supply, nation);
    else if ((roll -= wInf) <= 0) {
        // Infiltration targets the nation with the weakest support on the continent.
        int target = *std::min_element(ns.begin(), ns.end(), [&](int a, int b) {
            return g.nations[a].support < g.nations[b].support;
        });
        launchHunt(g, bl, HuntMission::Infiltration, target);
    } else {
        launchHunt(g, bl, HuntMission::Harvest, nation);
    }
}

// What happens when a hunt completes its landing undisturbed.
void landingSucceeded(GameState& g, Hunt& h) {
    switch (h.mission) {
        case HuntMission::Feeding:
            changeSupport(g, h.nation, -2, "unexplained disappearances");
            break;
        case HuntMission::Infiltration:
            g.nations[h.nation].infiltration = std::min(100.0, g.nations[h.nation].infiltration + 20);
            g.addLog(fmt("%s infiltration now %.0f%%.", nations()[h.nation].name.c_str(),
                         g.nations[h.nation].infiltration));
            break;
        default: break;
    }
}

void expireSite(GameState& g, const MissionSite& s) {
    const std::string where = s.nation >= 0 ? nations()[s.nation].name : std::string("the sea");
    switch (s.type) {
        case SiteType::CrashSite:
            changeSecrecy(g, -4, "a wreck was found by civilians");
            changeSupport(g, s.nation, -2, "");
            g.post(GeoEventType::Info, "Crash Site Lost",
                   "Survivors escaped and the wreck in " + where + " made the news (-4 secrecy).");
            break;
        case SiteType::Harvest:
            changeSupport(g, s.nation, -10, "harvest night ignored");
            changeSecrecy(g, -3, "");
            g.post(GeoEventType::Info, "Harvest Night",
                   "The bloodline fed undisturbed in " + (s.city >= 0 ? cities()[s.city].name : where) +
                       ". -10 support in " + where + ".");
            break;
        case SiteType::PREvent: {
            double hit = 10 * bloodline(s.bloodline).prStrength;
            changeSupport(g, s.nation, -hit, "vampire PR campaign");
            g.post(GeoEventType::Info, "PR Campaign Succeeds",
                   fmt("The campaign in %s went ahead. Support %+.0f in %s.",
                       s.city >= 0 ? cities()[s.city].name.c_str() : "?", -hit, where.c_str()));
            break;
        }
        default: break;
    }
}

} // namespace

// ---------------------------------------------------------------------------

void removeSite(GameState& g, int siteId) {
    for (auto& c : g.craft)
        if (c.target == CraftTarget::Site && c.targetId == siteId) { c.target = CraftTarget::Home; c.targetId = -1; }
    g.sites.erase(std::remove_if(g.sites.begin(), g.sites.end(), [&](const MissionSite& s) { return s.id == siteId; }),
                  g.sites.end());
}

void removeHunt(GameState& g, int huntId) {
    if (Hunt* h = g.findHunt(huntId))
        if (h->siteId >= 0) removeSite(g, h->siteId);
    for (auto& c : g.craft)
        if (c.target == CraftTarget::Hunt && c.targetId == huntId) { c.target = CraftTarget::Home; c.targetId = -1; }
    g.hunts.erase(std::remove_if(g.hunts.begin(), g.hunts.end(), [&](const Hunt& h) { return h.id == huntId; }),
                  g.hunts.end());
}

int crashHunt(GameState& g, Hunt& h, bool destroyed) {
    if (!world().isLand(h.pos)) return -1;
    MissionSite s;
    s.id = g.newId();
    s.type = SiteType::CrashSite;
    s.pos = h.pos;
    s.bloodline = h.bloodline;
    s.nation = world().nearestNation(h.pos);
    s.city = -1;
    s.craftType = h.craftType;
    s.mission = h.mission;
    s.huntId = -1;
    // Survivors: forced landings keep 50-80% of the crew, destruction 20-40%.
    double keep = destroyed ? rng().real(0.2, 0.4) : rng().real(0.5, 0.8);
    s.crew = std::max(1, (int)std::round(h.crew * keep));
    s.expires = g.time.seconds + rng().range(24, 48) * GameTime::kHour;
    s.label = "Crash: " + huntCraft(h.craftType).name;
    g.sites.push_back(s);

    double cityDist = 0;
    world().nearestCity(h.pos, &cityDist);
    changeSecrecy(g, cityDist < 150 ? -4 : -2, "air engagement over land");
    return s.id;
}

void hourlyBloodlines(GameState& g) {
    // Launch new operations.
    for (int b = 0; b < kBloodlineCount; ++b) {
        auto& st = g.bloodlines[b];
        if (st.destroyed) continue;
        if (g.time.seconds >= st.nextMission) {
            if (st.nextMission > 0) launchOperation(g, b);
            // Each bloodline acts every ~12 days at first, escalating to ~5 by month 6.
            double days = rng().real(9.0, 15.0) / (1.0 + 0.2 * g.monthIndex);
            st.nextMission = g.time.seconds + (int64_t)(std::max(3.0, days) * GameTime::kDay);
        }
    }

    // Expire sites whose time has run out.
    std::vector<MissionSite> expired;
    for (const auto& s : g.sites)
        if (s.expires > 0 && s.expires <= g.time.seconds && s.type != SiteType::LandedHunt) expired.push_back(s);
    for (const auto& s : expired) {
        expireSite(g, s);
        removeSite(g, s.id);
    }
}

void moveHunts(GameState& g, double seconds) {
    std::vector<int> finished;
    for (auto& h : g.hunts) {
        const auto& def = huntCraft(h.craftType);
        double nm = def.speed * seconds / 3600.0;
        switch (h.phase) {
            case HuntPhase::Inbound:
                h.pos = stepToward(h.pos, h.dest, nm);
                if (distanceNm(h.pos, h.dest) < 0.5) {
                    if (h.mission == HuntMission::Harvest) {
                        // The flight vanishes into the city; the harvest begins.
                        MissionSite s;
                        s.id = g.newId();
                        s.type = SiteType::Harvest;
                        s.pos = h.dest;
                        s.bloodline = h.bloodline;
                        s.nation = h.nation;
                        s.city = h.city;
                        s.crew = h.crew;
                        s.expires = g.time.seconds + rng().range(10, 16) * GameTime::kHour;
                        s.label = "Harvest: " + cities()[h.city].name;
                        g.sites.push_back(s);
                        g.post(GeoEventType::SiteAppeared, "Harvest Night",
                               "Mass disappearances are being reported in " + cities()[h.city].name +
                                   ". A bloodline is feeding. Respond before dawn.",
                               s.id);
                        finished.push_back(h.id);
                    } else if (h.mission == HuntMission::Supply) {
                        finished.push_back(h.id); // reached the lair
                    } else {
                        h.phase = HuntPhase::Landed;
                        h.phaseEnds = g.time.seconds + rng().range(2, 6) * GameTime::kHour;
                        MissionSite s;
                        s.id = g.newId();
                        s.type = SiteType::LandedHunt;
                        s.pos = h.pos;
                        s.bloodline = h.bloodline;
                        s.nation = h.nation;
                        s.crew = h.crew;
                        s.craftType = h.craftType;
                        s.mission = h.mission;
                        s.huntId = h.id;
                        s.expires = h.phaseEnds;
                        s.detected = h.detected;
                        s.label = "Landed: " + def.name;
                        g.sites.push_back(s);
                        h.siteId = s.id;
                    }
                }
                break;
            case HuntPhase::Landed:
                if (g.time.seconds >= h.phaseEnds) {
                    landingSucceeded(g, h);
                    if (h.siteId >= 0) removeSite(g, h.siteId);
                    h.siteId = -1;
                    h.phase = HuntPhase::Outbound;
                }
                break;
            case HuntPhase::Outbound:
                h.pos = stepToward(h.pos, h.exit, nm);
                if (distanceNm(h.pos, h.exit) < 0.5) finished.push_back(h.id);
                break;
        }
    }
    for (int id : finished) {
        Hunt* h = g.findHunt(id);
        if (h && h->detected && h->mission != HuntMission::Harvest)
            g.post(GeoEventType::ContactLost, "Contact Lost",
                   huntCraft(h->craftType).name + " has left our coverage.", id);
        removeHunt(g, id);
    }
}

} // namespace vamps

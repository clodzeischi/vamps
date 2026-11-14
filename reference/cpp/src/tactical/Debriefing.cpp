#include "tactical/Debriefing.h"

#include <algorithm>
#include <cmath>
#include <map>

#include "core/Format.h"
#include "core/Random.h"
#include "data/Craft.h"
#include "strategy/BloodlineAI.h"
#include "strategy/Politics.h"

namespace vamps {

namespace {

MapKind mapKindFor(const MissionSite& s) {
    switch (s.type) {
        case SiteType::Lair: return MapKind::Lair;
        case SiteType::Final: return MapKind::Ruins;
        case SiteType::Harvest:
        case SiteType::PREvent: return MapKind::Urban;
        default: break;
    }
    switch (world().biomeAt(s.pos)) {
        case Biome::Forest: return MapKind::Forest;
        case Biome::Desert: return MapKind::Desert;
        case Biome::Arctic: return MapKind::Arctic;
        case Biome::Tropical: return MapKind::Jungle;
        default: return MapKind::Rural;
    }
}

// Original-style stat growth: more use, bigger gains.
int growth(int uses) {
    Random& r = rng();
    if (uses <= 0) return 0;
    if (uses <= 2) return r.range(0, 1);
    if (uses <= 5) return r.range(1, 3);
    if (uses <= 10) return r.range(2, 4);
    return r.range(3, 6);
}

SoldierRank rankFor(const Soldier& s) {
    int points = s.missions + s.kills * 2;
    if (points >= 40) return SoldierRank::Commander;
    if (points >= 25) return SoldierRank::Colonel;
    if (points >= 15) return SoldierRank::Captain;
    if (points >= 8) return SoldierRank::Sergeant;
    if (points >= 3) return SoldierRank::Squaddie;
    return SoldierRank::Rookie;
}

void addLoot(std::map<std::string, int>& loot, const EnemyRankDef& def, int bloodlineId) {
    for (const auto& l : def.loot)
        if (rng().percent(l.percent)) loot[l.item == "sigil" ? sigilItemId(bloodlineId) : l.item]++;
}

} // namespace

bool continuesToNextStage(const Battle& b) {
    return b.setup.siteType == SiteType::Final && b.setup.stage == 1 && b.outcome == BattleOutcome::Victory;
}

MissionSetup buildMissionSetup(GameState& g, const MissionSite& site, const Craft& craft) {
    MissionSetup m;
    m.siteType = site.type;
    m.mapKind = mapKindFor(site);
    m.bloodline = site.bloodline;
    m.monthIndex = g.monthIndex;
    m.difficulty = g.difficultyLevel;
    m.nightOptics = g.isResearched("night_optics");
    m.night = site.type == SiteType::Lair || site.type == SiteType::Final || !isDaylight(site.pos, g.time);
    m.stage = 1;
    double count = site.crew;
    switch (site.type) {
        case SiteType::Lair: count = std::min(16, 10 + g.monthIndex); break;
        case SiteType::Final: count = 12; break;
        case SiteType::Harvest: m.civilians = 10; break;
        case SiteType::PREvent: m.civilians = 8; break;
        default: break;
    }
    m.enemyCount = std::max(1, (int)std::round(count * g.diff().enemyCountMult));
    std::string where = site.city >= 0 ? cities()[site.city].name
                        : site.nation >= 0 ? nations()[site.nation].name : std::string("international waters");
    m.title = std::string(siteTypeName(site.type)) + " - " + where + " - " + bloodline(site.bloodline).name;
    for (const auto& s : g.soldiers)
        if (s.craftId == craft.id && s.woundDays <= 0 && !s.inTransit) m.squad.push_back(s);
    if (m.squad.size() > (size_t)craftType(craft.type).soldiers) m.squad.resize(craftType(craft.type).soldiers);
    return m;
}

Debriefing applyBattleResult(GameState& g, Battle& b, int craftId, int siteId) {
    Debriefing d;
    d.outcome = b.outcome;
    MissionSite* site = g.findSite(siteId);
    Craft* craft = g.findCraft(craftId);
    Base* base = craft ? g.findBase(craft->baseId) : nullptr;
    const bool won = b.outcome == BattleOutcome::Victory;
    const SiteType type = b.setup.siteType;
    const int nation = site ? site->nation : -1;
    d.title = won ? "MISSION SUCCESSFUL" : b.outcome == BattleOutcome::Aborted ? "MISSION ABORTED" : "MISSION FAILED";

    // ----- Enemies, captives and loot -----
    std::map<std::string, int> loot;
    int captives = 0, incinerated = 0, escaped = 0;
    for (auto& u : b.units) {
        if (u.faction != Faction::Enemy) continue;
        const EnemyRankDef& def = enemyRank(u.rank);
        if (u.status == UnitStatus::Dead || u.status == UnitStatus::Incinerated) {
            d.score += def.score;
            if (u.status == UnitStatus::Incinerated) ++incinerated;
            if (won) addLoot(loot, def, u.bloodline);
        } else if (u.status == UnitStatus::Torpor && won) {
            d.score += def.score;
            bool room = base && g.captivesAt(base->id) < base->capacity(FacilityType::Containment);
            if (room) {
                base->captives.push_back({u.rank, u.bloodline});
                ++captives;
                // Captives still yield their artefacts.
                for (const auto& l : def.loot)
                    if (l.item != "vamp_remains" && l.item != "pheromone_gland" && rng().percent(l.percent))
                        loot[l.item == "sigil" ? sigilItemId(u.bloodline) : l.item]++;
            } else {
                ++incinerated;
                addLoot(loot, def, u.bloodline);
            }
        } else if (!won) {
            ++escaped;
        }
    }
    if (won) {
        // Everything left lying on the map.
        for (int z = 0; z < b.map.levels(); ++z)
            for (int y = 0; y < b.map.height(); ++y)
                for (int x = 0; x < b.map.width(); ++x)
                    for (const auto& it : b.map.at(x, y, z).items) loot[it.id]++;
        // Mission-specific salvage.
        if (type == SiteType::CrashSite || type == SiteType::LandedHunt) {
            loot["jet_avionics"] += type == SiteType::LandedHunt ? 2 : rng().range(0, 2);
            if (site && site->mission == HuntMission::Supply) loot[sigilItemId(site->bloodline)]++;
            if (rng().percent(30)) loot["blood_ledger"]++;
            if (rng().percent(30)) loot["encrypted_drive"]++;
        } else if (type == SiteType::Lair) {
            loot[sigilItemId(b.setup.bloodline)] += 2;
            loot["blood_ledger"] += 2;
            loot["haem_serum"] += 2;
        } else if (type == SiteType::PREvent) {
            loot["blood_ledger"]++;
        }
        for (auto& [id, n] : loot) {
            if (n <= 0 || !findItem(id)) continue;
            if (base) base->addItem(id, n);
            d.recovered.push_back({item(id).name, n});
            d.score += n * 2;
        }
        if (captives) d.lines.push_back(fmt("%d vampire(s) taken to containment in torpor.", captives));
        if (incinerated) d.lines.push_back(fmt("%d vampire(s) incinerated.", incinerated));
    } else if (escaped) {
        d.lines.push_back(fmt("%d hostiles remain at large.", escaped));
    }

    // ----- Soldiers -----
    int bodiesLeft = 0;
    std::vector<int> dead;
    for (auto& u : b.units) {
        if (u.faction != Faction::Player) continue;
        Soldier* s = g.findSoldier(u.soldierId);
        if (!s) continue;
        // Survivors: everyone still alive after a win; only those on the ramp after an abort.
        bool survived = u.status == UnitStatus::Escaped || (won && u.status != UnitStatus::Dead);
        if (!survived) {
            dead.push_back(s->id);
            if (u.status == UnitStatus::Dead || !won) ++bodiesLeft;
            d.soldiers.push_back(s->name + (u.status == UnitStatus::Dead ? " - KILLED IN ACTION" : " - MISSING IN ACTION"));
            d.score -= 20;
            continue;
        }
        s->loadout.clear();
        for (const auto& c : u.inv)
            if (c.slot != Slot::Ground) s->loadout.push_back(c);
        s->missions++;
        s->kills += u.kills;
        UnitStats before = s->stats;
        s->stats.firing = std::min(120, s->stats.firing + growth(u.xp.firing));
        s->stats.throwing = std::min(120, s->stats.throwing + growth(u.xp.throwing));
        s->stats.melee = std::min(120, s->stats.melee + growth(u.xp.melee));
        s->stats.reactions = std::min(100, s->stats.reactions + growth(u.xp.reactions));
        if (u.xp.bravery > 0 && rng().percent(std::min(90, u.xp.bravery * 10)))
            s->stats.bravery = std::min(100, s->stats.bravery + 10);
        s->stats.tu = std::min(80, s->stats.tu + rng().range(0, 2));
        s->stats.stamina = std::min(100, s->stats.stamina + rng().range(0, 2));
        s->stats.health = std::min(60, s->stats.health + rng().range(0, 1));
        s->stats.strength = std::min(70, s->stats.strength + rng().range(0, 1));
        int missing = s->stats.health - u.hp;
        s->woundDays = missing > 0 ? (int)std::ceil(missing * 1.5) : 0;
        SoldierRank oldRank = s->rank;
        s->rank = std::max(s->rank, rankFor(*s));
        std::string note = s->name;
        if (s->rank != oldRank) note += std::string(" promoted to ") + soldierRankName(s->rank) + ".";
        if (s->stats.firing > before.firing) note += fmt(" Firing +%d.", s->stats.firing - before.firing);
        if (s->stats.reactions > before.reactions) note += fmt(" Reactions +%d.", s->stats.reactions - before.reactions);
        if (s->stats.bravery > before.bravery) note += " Bravery +10.";
        if (s->woundDays > 0) note += fmt(" Wounded: %d days.", s->woundDays);
        if (u.kills) note += fmt(" %d kill(s).", u.kills);
        d.soldiers.push_back(note);
    }
    for (int id : dead)
        g.soldiers.erase(std::remove_if(g.soldiers.begin(), g.soldiers.end(), [&](const Soldier& s) { return s.id == id; }),
                         g.soldiers.end());

    // ----- Politics -----
    if (won) {
        double gain = type == SiteType::Harvest ? 10 : type == SiteType::PREvent ? 8 : 5;
        changeSupport(g, nation, gain, "mission success");
        d.lines.push_back(fmt("Support in %s %+.0f.", nation >= 0 ? nations()[nation].name.c_str() : "the region", gain));
        if (type == SiteType::Harvest) {
            int saved = 0;
            for (const auto& u : b.units)
                if (u.faction == Faction::Neutral && !u.gone()) ++saved;
            changeSupport(g, nation, saved * 0.5, "");
            d.lines.push_back(fmt("%d civilians survived the night.", saved));
            d.score += saved * 3;
        }
    } else {
        double loss = type == SiteType::Harvest ? 10 : 5;
        changeSupport(g, nation, -loss, "mission failure");
        d.lines.push_back(fmt("Support in %s -%.0f.", nation >= 0 ? nations()[nation].name.c_str() : "the region", loss));
    }
    if (type == SiteType::Harvest || type == SiteType::PREvent) {
        changeSecrecy(g, -2, "firefight in a city");
        d.lines.push_back("Secrecy -2: gunfire in a city.");
    }
    if (b.civiliansKilled > 0) {
        changeSupport(g, nation, -b.civiliansKilled, "civilian deaths");
        changeSecrecy(g, -0.3 * b.civiliansKilled, "civilian deaths");
        d.lines.push_back(fmt("%d civilians killed.", b.civiliansKilled));
        d.score -= b.civiliansKilled * 5;
    }
    if (bodiesLeft > 0 && !won) {
        changeSecrecy(g, -1.0 * bodiesLeft, "agency bodies recovered by police");
        d.lines.push_back(fmt("Secrecy -%d: agents' bodies left behind.", bodiesLeft));
    }

    // ----- The site -----
    if (site) {
        if (won) {
            if (type == SiteType::Lair) {
                g.bloodlines[site->bloodline].destroyed = true;
                changeContinentSupport(g, bloodline(site->bloodline).continent, 15, "bloodline destroyed");
                d.lines.push_back(std::string(bloodline(site->bloodline).name) + " has been destroyed.");
                d.score += 200;
                for (auto& h : g.hunts)
                    if (h.bloodline == site->bloodline) h.phase = HuntPhase::Outbound;
            }
            if (type == SiteType::Final) {
                g.victory = true;
                g.post(GeoEventType::Victory, "The Progenitor Is Dead",
                       "Beneath Montsegur the last root of the genealogy has burned. The bloodlines are finished. "
                       "The agency can return to the shadows.");
            }
            if (site->huntId >= 0) removeHunt(g, site->huntId);
            removeSite(g, siteId);
        } else if (type == SiteType::Harvest || type == SiteType::PREvent) {
            removeSite(g, siteId);
        }
    }
    if (craft) {
        craft->target = CraftTarget::Home;
        craft->targetId = -1;
    }
    g.monthScore += d.score;
    g.addLog(d.title + fmt(" (score %+d)", d.score));
    return d;
}

} // namespace vamps

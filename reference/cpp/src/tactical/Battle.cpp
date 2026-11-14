// Battle setup, turn flow and the win/lose check.
#include "tactical/Battle.h"

#include <algorithm>
#include <cmath>

#include "core/Format.h"
#include "core/Random.h"

namespace vamps {

const char* shotModeName(ShotMode m) {
    switch (m) {
        case ShotMode::Snap: return "Snap";
        case ShotMode::Aimed: return "Aimed";
        case ShotMode::Auto: return "Auto";
    }
    return "?";
}

namespace {

EnemyRank weightedRank(std::initializer_list<std::pair<EnemyRank, int>> weights) {
    int total = 0;
    for (const auto& w : weights) total += std::max(0, w.second);
    int roll = rng().range(1, std::max(1, total));
    for (const auto& w : weights) {
        roll -= std::max(0, w.second);
        if (roll <= 0) return w.first;
    }
    return EnemyRank::Familiar;
}

int regenTurns(const Battle& b) {
    int base = b.setup.night ? 2 : 3;
    return std::max(1, base - bloodline(b.setup.bloodline).regenBonus);
}

} // namespace

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

Battle::Battle(const MissionSetup& s) : setup(s) {
    MapRequest req;
    req.kind = s.mapKind;
    req.wreck = s.siteType == SiteType::CrashSite || s.siteType == SiteType::LandedHunt;
    req.progenitorHall = s.siteType == SiteType::Final && s.stage == 2;
    map = generateMap(req);
    placeSquad();
    placeEnemies();
    placeCivilians();
    map.recomputeLighting(daytime());
    addLog(s.title.empty() ? std::string("Mission start.") : s.title);
    addLog(std::string(setup.night ? "Night. " : "Daylight: vampires in the open will burn. ") +
           "Bullets only put vampires down; burn them.");
    startSideTurn(Faction::Player);
    updateVisibility();
}

Battle Battle::nextStage(const Battle& prev) {
    Battle b;
    b.setup = prev.setup;
    b.setup.stage = 2;
    b.setup.mapKind = MapKind::Catacombs;
    b.setup.night = true;
    b.setup.enemyCount = 10;
    b.setup.civilians = 0;
    MapRequest req;
    req.kind = MapKind::Catacombs;
    req.progenitorHall = true;
    b.map = generateMap(req);
    // Survivors carry their wounds and equipment down into the catacombs.
    size_t spawn = 0;
    for (const auto& u : prev.units) {
        if (u.faction != Faction::Player || !u.active()) continue;
        BattleUnit c = u;
        c.id = (int)b.units.size() + 1;
        c.pos = spawn < b.map.playerSpawns.size() ? b.map.playerSpawns[spawn++] : b.map.playerSpawns.front();
        c.kneeling = false;
        b.units.push_back(c);
    }
    b.placeEnemies();
    b.map.recomputeLighting(false);
    b.addLog("Stage 2: the catacombs beneath Montsegur.");
    b.startSideTurn(Faction::Player);
    b.updateVisibility();
    return b;
}

std::vector<EnemyRank> Battle::rollEnemyRoster() const {
    using R = EnemyRank;
    std::vector<EnemyRank> out;
    int n = std::max(1, setup.enemyCount);
    int m = setup.monthIndex;
    switch (setup.siteType) {
        case SiteType::PREvent:
            if (m >= 1 || rng().percent(50)) out.push_back(R::Fledgling);
            while ((int)out.size() < n) out.push_back(R::Familiar);
            break;
        case SiteType::Harvest:
            while ((int)out.size() < n)
                out.push_back(weightedRank({{R::Familiar, 10}, {R::Thrall, 35}, {R::Fledgling, 35}, {R::Vampire, 15 + 5 * m}}));
            break;
        case SiteType::Lair:
            out.push_back(R::Elder);
            if (n >= 14) out.push_back(R::Elder);
            while ((int)out.size() < n)
                out.push_back(weightedRank({{R::Familiar, 20}, {R::Thrall, 20}, {R::Fledgling, 30}, {R::Vampire, 30}}));
            break;
        case SiteType::Final:
            if (setup.stage == 2) {
                out = {R::Progenitor, R::Elder, R::Elder, R::Elder, R::Elder};
                while ((int)out.size() < n) out.push_back(R::Vampire);
            } else {
                out = {R::Elder, R::Elder};
                while ((int)out.size() < n)
                    out.push_back(weightedRank({{R::Thrall, 20}, {R::Fledgling, 30}, {R::Vampire, 50}}));
            }
            break;
        default: // crash / landed flights
            if (n >= 8 && m >= 2) out.push_back(R::Elder);
            while ((int)out.size() < n)
                out.push_back(weightedRank({{R::Familiar, std::max(10, 40 - 5 * m)},
                                            {R::Thrall, 20},
                                            {R::Fledgling, 30},
                                            {R::Vampire, m >= 1 ? 10 + 8 * m : 0}}));
    }
    return out;
}

BattleUnit Battle::makeSoldierUnit(const Soldier& s, int index) {
    BattleUnit u;
    u.id = (int)units.size() + 1;
    u.faction = Faction::Player;
    u.name = s.name;
    u.glyph = index < 9 ? (char)('1' + index) : (char)('A' + index - 9);
    u.soldierId = s.id;
    u.stats = s.stats;
    u.inv = s.loadout;
    u.armorId = s.armor;
    if (const ItemDef* a = findItem(s.armor)) {
        u.armorFront = a->armorFront;
        u.armorSide = a->armorSide;
        u.armorRear = a->armorRear;
        u.willBonus = a->willBonus;
        u.sealed = a->sealed;
    }
    u.tu = u.maxTu();
    u.energy = s.stats.stamina;
    u.hp = s.stats.health;
    u.facing = 4;
    return u;
}

BattleUnit Battle::makeEnemyUnit(EnemyRank r) {
    const EnemyRankDef& def = enemyRank(r);
    const BloodlineDef& bl = bloodline(setup.bloodline);
    const DifficultyDef& diff = difficulty(setup.difficulty);
    BattleUnit u;
    u.id = (int)units.size() + 1;
    u.faction = r == EnemyRank::Civilian ? Faction::Neutral : Faction::Enemy;
    u.rank = r;
    u.bloodline = setup.bloodline;
    u.name = def.name;
    u.glyph = def.glyph;
    u.vampiric = def.vampiric;
    u.sunSensitive = def.sunSensitive;
    u.canDominate = def.canDominate || (r == EnemyRank::Vampire && bl.vampiresDominate);
    u.clawDamage = def.clawDamage;
    u.stats = def.stats;
    if (u.faction == Faction::Enemy) {
        auto scale = [&](int v) { return (int)std::round(v * diff.enemyStatMult); };
        u.stats.tu = scale(u.stats.tu);
        u.stats.health = scale(u.stats.health);
        u.stats.firing = scale(u.stats.firing);
        u.stats.reactions = scale(u.stats.reactions);
        if (r == EnemyRank::Thrall || r == EnemyRank::Fledgling)
            u.stats.health = (int)std::round(u.stats.health * bl.feralHp);
    }
    u.armorFront = def.armorFront;
    u.armorSide = def.armorSide;
    u.armorRear = def.armorRear;
    std::string weapon = def.weapons.empty() ? "" : rng().pick(def.weapons);
    if (!weapon.empty()) {
        u.inv.push_back({Slot::RightHand, makeItem(weapon)});
        const ItemDef& w = item(weapon);
        if (!w.ammo.empty()) u.inv.push_back({Slot::Belt, makeItem(w.ammo.front())});
        if (r == EnemyRank::Familiar && rng().percent(20)) u.inv.push_back({Slot::Belt, makeItem("grenade")});
    }
    u.tu = u.maxTu();
    u.energy = u.stats.stamina;
    u.hp = u.stats.health;
    u.facing = rng().range(0, 7);
    return u;
}

namespace {

Point3 centroid(const std::vector<Point3>& pts) {
    if (pts.empty()) return {0, 0, 0};
    int sx = 0, sy = 0;
    for (const auto& p : pts) { sx += p.x; sy += p.y; }
    return {sx / (int)pts.size(), sy / (int)pts.size(), 0};
}

} // namespace

void Battle::placeSquad() {
    std::vector<Point3> spots = map.playerSpawns;
    for (size_t i = 0; i < setup.squad.size(); ++i) {
        BattleUnit u = makeSoldierUnit(setup.squad[i], (int)i);
        // Use a ramp tile, or the nearest free standable tile.
        Point3 p = spots.empty() ? Point3{1, 1, 0} : spots[std::min(i, spots.size() - 1)];
        for (int radius = 0; radius < 10 && (unitAt(p) || !map.standable(p.x, p.y, p.z)); ++radius)
            for (int dy = -radius; dy <= radius; ++dy)
                for (int dx = -radius; dx <= radius; ++dx) {
                    Point3 q{p.x + dx, p.y + dy, p.z};
                    if (map.standable(q.x, q.y, q.z) && !unitAt(q)) { p = q; dy = dx = radius + 1; }
                }
        u.pos = p;
        units.push_back(u);
    }
}

void Battle::placeEnemies() {
    Random& r = rng();
    std::vector<Point3> spawns = map.enemySpawns;
    for (size_t i = 0; i + 1 < spawns.size(); ++i) std::swap(spawns[i], spawns[r.range((int)i, (int)spawns.size() - 1)]);
    Point3 home = centroid(map.playerSpawns);
    size_t next = 0;
    for (EnemyRank rank : rollEnemyRoster()) {
        BattleUnit u = makeEnemyUnit(rank);
        bool placed = false;
        while (next < spawns.size() && !placed) {
            Point3 p = spawns[next++];
            if (map.standable(p.x, p.y, p.z) && !unitAt(p)) { u.pos = p; placed = true; }
        }
        for (int tries = 0; tries < 2000 && !placed; ++tries) {
            Point3 p{r.range(0, map.width() - 1), r.range(0, map.height() - 1), r.range(0, map.levels() - 1)};
            int d = std::abs(p.x - home.x) + std::abs(p.y - home.y);
            if (map.standable(p.x, p.y, p.z) && !unitAt(p) && d >= 14 &&
                map.at(p).type != TileType::CraftFloor) {
                u.pos = p;
                placed = true;
            }
        }
        if (placed) units.push_back(u);
    }
}

void Battle::placeCivilians() {
    Random& r = rng();
    std::vector<Point3> spawns = map.civilianSpawns;
    for (int i = 0; i < setup.civilians; ++i) {
        BattleUnit u = makeEnemyUnit(EnemyRank::Civilian);
        bool placed = false;
        while (!spawns.empty() && !placed) {
            Point3 p = spawns.back();
            spawns.pop_back();
            if (map.standable(p.x, p.y, p.z) && !unitAt(p)) { u.pos = p; placed = true; }
        }
        for (int tries = 0; tries < 1000 && !placed; ++tries) {
            Point3 p{r.range(0, map.width() - 1), r.range(0, map.height() - 1), 0};
            if (map.standable(p.x, p.y, p.z) && !unitAt(p) && map.at(p).type != TileType::CraftFloor) {
                u.pos = p;
                placed = true;
            }
        }
        if (placed) units.push_back(u);
    }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

// A tile can hold one standing unit plus bodies on the ground; the standing
// unit is returned first.
BattleUnit* Battle::unitAt(const Point3& p) {
    BattleUnit* body = nullptr;
    for (auto& u : units) {
        if (u.pos != p || u.gone()) continue;
        if (u.active()) return &u;
        body = &u;
    }
    return body;
}

const BattleUnit* Battle::unitAt(const Point3& p) const {
    return const_cast<Battle*>(this)->unitAt(p);
}

BattleUnit* Battle::unitById(int id) {
    if (id >= 1 && id <= (int)units.size() && units[id - 1].id == id) return &units[id - 1];
    for (auto& u : units)
        if (u.id == id) return &u;
    return nullptr;
}

bool Battle::playerCanSee(const BattleUnit& u) const {
    return u.faction == Faction::Player || playerSees.count(u.id) > 0;
}

int Battle::activeCount(Faction f) const {
    int n = 0;
    for (const auto& u : units)
        if (u.faction == f && u.active()) ++n;
    return n;
}

void Battle::addLog(const std::string& msg) {
    log.push_back(msg);
    while (log.size() > 100) log.pop_front();
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

void Battle::startSideTurn(Faction f) {
    for (auto& u : units) {
        if (u.faction != f) continue;
        // Stun wears off; unconscious humans may wake.
        if (u.stun > 0) u.stun = std::max(0, u.stun - 2);
        if (u.status == UnitStatus::Unconscious && u.stun < u.hp) {
            u.status = UnitStatus::Active;
            addLog(u.name + " regains consciousness.");
        }
        if (!u.active()) continue;
        // Bleeding.
        if (u.fatalWounds > 0 && !u.vampiric) {
            u.hp -= u.fatalWounds;
            if (u.hp <= 0) {
                u.status = UnitStatus::Dead;
                addLog(u.name + " has bled to death.");
                unitDown(u, -1);
                continue;
            }
        }
        u.tu = u.maxTu();
        u.energy = std::min(u.stats.stamina, u.energy + u.stats.stamina / 3);
        u.panicked = false;
    }
    if (f == Faction::Enemy) {
        processVampires();
        aiQueue_.clear();
        for (const auto& u : units)
            if (u.faction == Faction::Enemy && u.active()) aiQueue_.push_back(u.id);
    }
    if (f == Faction::Player) {
        if (trackerTurns > 0) trackerTurns--;
        if (turn > 1) processMorale();
    }
}

void Battle::processVampires() {
    const BloodlineDef& bl = bloodline(setup.bloodline);
    for (auto& u : units) {
        if (u.faction != Faction::Enemy || u.gone()) continue;
        bool inSun = map.at(u.pos).sunlit;
        if (u.status == UnitStatus::Torpor) {
            if (inSun) {
                // Three turns of direct sunlight denature a vampire in torpor.
                if (++u.sunTurns >= 3) {
                    u.status = UnitStatus::Incinerated;
                    addLog(u.name + " blackens and crumbles in the sunlight.");
                }
                continue;
            }
            u.sunTurns = 0;
            if (u.regenBlocked) continue;
            if (--u.regenTimer <= 0) {
                u.status = UnitStatus::Active;
                u.hp = std::max(1, u.stats.health * 40 / 100);
                u.tu = u.maxTu() / 2;
                addLog(u.name + " rises from torpor!");
            }
            continue;
        }
        if (!u.active()) continue;
        if (u.vampiric) {
            int heal = (setup.night ? 4 : 2) + 2 * bl.regenBonus;
            u.hp = std::min(u.stats.health, u.hp + heal);
        }
        if (u.sunSensitive && inSun) {
            int dmg = (int)std::round(rng().range(3, 7) * bl.sunDamageMult);
            u.hp -= dmg;
            addLog(fmt("%s smokes in the sunlight (%d).", u.name.c_str(), dmg));
            if (u.hp <= 0) {
                u.hp = 0;
                if (u.vampiric) {
                    u.status = UnitStatus::Torpor;
                    u.regenTimer = regenTurns(*this);
                } else {
                    u.status = UnitStatus::Dead;
                }
                unitDown(u, -1);
            }
        }
    }
}

void Battle::processMorale() {
    for (auto& u : units) {
        if (u.faction != Faction::Player || !u.active()) continue;
        if (u.dominated) {
            u.dominated = false;
            addLog(u.name + " is overwhelmed by the pheromones and opens fire!");
            berserk(u);
            continue;
        }
        if (u.morale < 50 && rng().percent((50 - u.morale) * 2)) {
            if (rng().percent(33)) {
                addLog(u.name + " has gone berserk!");
                berserk(u);
            } else {
                addLog(u.name + " has panicked!");
                for (Slot s : {Slot::RightHand, Slot::LeftHand})
                    if (CarriedItem* c = u.inSlot(s)) {
                        map.at(u.pos).items.push_back(c->item);
                        u.inv.erase(u.inv.begin() + (c - u.inv.data()));
                    }
                u.tu = 0;
                u.panicked = true;
            }
            u.morale = std::min(100, u.morale + 15);
        } else {
            u.morale = std::min(100, u.morale + 5);
        }
    }
}

void Battle::berserk(BattleUnit& u) {
    // Fire snap shots at the nearest other unit, whoever it is.
    BattleUnit* target = nullptr;
    int best = 1 << 30;
    for (auto& o : units) {
        if (&o == &u || !o.active() || !canSee(u, o)) continue;
        int d = std::abs(o.pos.x - u.pos.x) + std::abs(o.pos.y - u.pos.y);
        if (d < best) { best = d; target = &o; }
    }
    if (target)
        for (int i = 0; i < 4 && target->active(); ++i)
            if (!shoot(u, Slot::RightHand, ShotMode::Snap, target->pos) &&
                !shoot(u, Slot::LeftHand, ShotMode::Snap, target->pos))
                break;
    u.tu = 0;
    u.panicked = true;
}

void Battle::dropAll(BattleUnit& u) {
    auto& ground = map.at(u.pos).items;
    for (auto& c : u.inv) ground.push_back(c.item);
    u.inv.clear();
}

void Battle::moraleShock(const BattleUnit& victim) {
    for (auto& o : units) {
        if (!o.active() || &o == &victim) continue;
        if (o.faction == victim.faction) o.morale = std::max(0, o.morale - (110 - o.stats.bravery) / 5);
        else if (victim.faction != Faction::Neutral) o.morale = std::min(100, o.morale + 5);
    }
}

void Battle::unitDown(BattleUnit& u, int attackerId) {
    if (u.status == UnitStatus::Torpor) u.regenTimer = std::max(u.regenTimer, regenTurns(*this));
    u.kneeling = false;
    dropAll(u);
    moraleShock(u);
    if (BattleUnit* a = unitById(attackerId); a && a->faction != u.faction) a->kills++;
    if (u.faction == Faction::Neutral && u.status == UnitStatus::Dead) civiliansKilled++;
    checkOutcome();
}

void Battle::endOfTurnEffects() {
    // 1. Grenades with a fuse: 0 explodes now, others count down.
    struct Pending { Point3 p; std::string id; };
    std::vector<Pending> blasts;
    for (int z = 0; z < map.levels(); ++z)
        for (int y = 0; y < map.height(); ++y)
            for (int x = 0; x < map.width(); ++x) {
                auto& items = map.at(x, y, z).items;
                for (size_t i = 0; i < items.size();) {
                    if (items[i].fuse == 0) {
                        blasts.push_back({{x, y, z}, items[i].id});
                        items.erase(items.begin() + i);
                        continue;
                    }
                    if (items[i].fuse > 0) items[i].fuse--;
                    ++i;
                }
            }
    for (auto& u : units)
        for (size_t i = 0; i < u.inv.size();) {
            if (u.inv[i].item.fuse == 0 && !u.gone()) {
                blasts.push_back({u.pos, u.inv[i].item.id});
                u.inv.erase(u.inv.begin() + i);
                continue;
            }
            if (u.inv[i].item.fuse > 0) u.inv[i].item.fuse--;
            ++i;
        }
    for (const auto& b : blasts) {
        const ItemDef& d = item(b.id);
        explode(b.p, d.blastRadius, d.damage, d.damageType, -1);
    }

    // 2. Fire burns whoever is in it (including bodies in torpor), spreads, and dies down.
    std::vector<Point3> burningTiles;
    for (int z = 0; z < map.levels(); ++z)
        for (int y = 0; y < map.height(); ++y)
            for (int x = 0; x < map.width(); ++x)
                if (map.at(x, y, z).fire > 0) burningTiles.push_back({x, y, z});
    for (const auto& p : burningTiles) {
        if (BattleUnit* u = unitAt(p)) damageUnit(*u, rng().range(5, 15), DamageType::Incendiary, -1, p);
        Tile& t = map.at(p);
        for (int d = 0; d < 8; d += 2) {
            Point3 n{p.x + kDirX[d], p.y + kDirY[d], p.z};
            if (map.inside(n) && map.at(n).def().flammable && map.at(n).fire == 0 && rng().percent(15))
                igniteTile(n, rng().range(2, 3));
        }
        if (--t.fire == 0 && t.def().flammable) {
            TileType burnt = t.type == TileType::Grass ? TileType::Dirt : t.def().destroyedInto;
            map.set(p.x, p.y, p.z, burnt);
        }
        t.smoke = std::max<uint8_t>(t.smoke, 1);
    }
    for (auto& u : units)
        if (u.burning > 0 && !u.gone()) {
            u.burning--;
            damageUnit(u, 8, DamageType::Incendiary, -1, u.pos);
        }

    // 3. Smoke thins out.
    for (int z = 0; z < map.levels(); ++z)
        for (int y = 0; y < map.height(); ++y)
            for (int x = 0; x < map.width(); ++x)
                if (map.at(x, y, z).smoke > 0) map.at(x, y, z).smoke--;

    map.recomputeLighting(daytime());
}

void Battle::endPlayerTurn() {
    if (outcome != BattleOutcome::Ongoing || side != Faction::Player) return;
    endOfTurnEffects();
    side = Faction::Enemy;
    startSideTurn(Faction::Enemy);
    updateVisibility();
    checkOutcome();
}

bool Battle::stepEnemyTurn() {
    if (outcome != BattleOutcome::Ongoing) return false;
    if (side != Faction::Enemy) return false;
    while (!aiQueue_.empty()) {
        int id = aiQueue_.front();
        aiQueue_.erase(aiQueue_.begin());
        BattleUnit* u = unitById(id);
        if (!u || !u->active()) continue;
        runAi(*u);
        updateVisibility();
        checkOutcome();
        return outcome == BattleOutcome::Ongoing;
    }
    // Civilians scatter, then the round ends.
    for (auto& u : units)
        if (u.faction == Faction::Neutral && u.active()) {
            u.tu = u.maxTu();
            runCivilian(u);
        }
    endOfTurnEffects();
    turn++;
    side = Faction::Player;
    startSideTurn(Faction::Player);
    updateVisibility();
    checkOutcome();
    addLog(fmt("--- Turn %d ---", turn));
    return false;
}

void Battle::abort() {
    if (outcome != BattleOutcome::Ongoing) return;
    for (auto& u : units)
        if (u.faction == Faction::Player && u.active() && map.at(u.pos).type == TileType::CraftFloor)
            u.status = UnitStatus::Escaped;
    outcome = BattleOutcome::Aborted;
    addLog("Mission aborted.");
}

void Battle::checkOutcome() {
    if (outcome != BattleOutcome::Ongoing) return;
    if (activeCount(Faction::Enemy) == 0) {
        outcome = BattleOutcome::Victory;
        addLog("All hostiles neutralised.");
    } else if (activeCount(Faction::Player) == 0) {
        outcome = BattleOutcome::Defeat;
        addLog("The squad has been wiped out.");
    }
}

} // namespace vamps

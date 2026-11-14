// Shooting, throwing, melee, damage, explosions, fire, reaction fire and
// neurochemical domination.
//
// Key rules:
//  * Accuracy = Firing x mode accuracy, x1.15 kneeling, x0.8 for a two-handed
//    weapon with the other hand full, -5%/tile beyond the weapon's range.
//  * A hit flies at the target; a miss is deflected and may hit anything.
//    Projectiles are traced in 3D, so low walls and crates give real cover.
//  * Damage is 0-200% of power for bullets and blades (as in the original),
//    50-150% for explosions and fire, minus directional armour.
//  * Vampires at 0 HP fall into TORPOR and regenerate unless burned.
//    Incendiary damage that drops them to 0, or ANY incendiary damage to a
//    body in torpor, kills them for good.
//  * Reaction fire: whoever has the higher Reactions x (TU left / max TU)
//    gets a snap shot when an enemy acts in view.
#include <algorithm>
#include <cmath>

#include "core/Format.h"
#include "core/Random.h"
#include "tactical/Battle.h"

namespace vamps {

namespace {

const FireMode& modeOf(const ItemDef& w, ShotMode m) {
    switch (m) {
        case ShotMode::Snap: return w.snap;
        case ShotMode::Aimed: return w.aimed;
        default: return w.autoFire;
    }
}

int chebyshev(const Point3& a, const Point3& b) { return std::max(std::abs(a.x - b.x), std::abs(a.y - b.y)); }

double distance3(const Point3& a, const Point3& b) {
    double dx = a.x - b.x, dy = a.y - b.y, dz = (a.z - b.z) * 1.5;
    return std::sqrt(dx * dx + dy * dy + dz * dz);
}

} // namespace

// ---------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------

ShotPreview Battle::previewShot(const BattleUnit& u, Slot hand, ShotMode mode, const Point3& target) const {
    ShotPreview p;
    const CarriedItem* c = u.inSlot(hand);
    if (!c) { p.reason = "Nothing in that hand."; return p; }
    const ItemDef& w = item(c->item.id);
    if (w.kind != ItemKind::Firearm) { p.reason = w.name + " is not a firearm."; return p; }
    const FireMode& fm = modeOf(w, mode);
    if (!fm.available()) { p.reason = std::string("No ") + shotModeName(mode) + " mode."; return p; }
    if (c->item.ammo <= 0) { p.reason = "Out of ammo: reload."; return p; }
    if (target == u.pos) { p.reason = "Pick a target."; return p; }
    p.tuCost = fm.tuPercent * u.maxTu() / 100;

    double acc = u.stats.firing / 100.0 * fm.accuracy / 100.0;
    if (u.kneeling) acc *= 1.15;
    Slot other = hand == Slot::RightHand ? Slot::LeftHand : Slot::RightHand;
    if (w.twoHanded && u.inSlot(other)) acc *= 0.8;
    acc *= 0.6 + 0.4 * (double)u.hp / std::max(1, u.stats.health);
    double dist = distance3(u.pos, target);
    if (dist > w.effectiveRange) acc *= std::max(0.1, 1.0 - 0.05 * (dist - w.effectiveRange));
    if (u.sunSensitive && map.at(u.pos).sunlit) acc *= 0.8;
    p.accuracy = (int)std::round(std::clamp(acc, 0.0, 1.2) * 100);

    // Would a perfect shot hit one of our own first?
    if (const BattleUnit* tu = unitAt(target)) {
        TraceHit h = traceProjectile(u, target.x + 0.5, target.y + 0.5, target.z + tu->bodyHeight() * 0.6, 80);
        if (h.unitId >= 0 && h.unitId != tu->id)
            for (const auto& o : units)
                if (o.id == h.unitId && o.faction == u.faction) p.friendlyInLine = true;
    }

    if (u.tu < p.tuCost) { p.reason = fmt("Not enough TU (%d needed).", p.tuCost); return p; }
    p.possible = true;
    return p;
}

Battle::TraceHit Battle::traceProjectile(const BattleUnit& shooter, double tx, double ty, double tz, int maxTiles,
                                        std::vector<Point3>* path) const {
    TraceHit hit;
    if (path) path->clear();
    double ax = shooter.pos.x + 0.5, ay = shooter.pos.y + 0.5, az = shooter.pos.z + shooter.eyeHeight();
    double dx = tx - ax, dy = ty - ay, dz = tz - az;
    double len = std::sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-6) { hit.outOfMap = true; return hit; }
    dx /= len; dy /= len; dz /= len;
    Point3 prev = shooter.pos;
    for (double t = 0.1; t < maxTiles; t += 0.1) {
        double px = ax + dx * t, py = ay + dy * t, pz = az + dz * t;
        Point3 c{(int)std::floor(px), (int)std::floor(py), (int)std::floor(pz)};
        // Units are a cylinder in the middle of their tile, not the whole tile
        // (the original used voxel shapes): shots can pass beside someone.
        if (c == prev && !(c == shooter.pos)) {
            if (const BattleUnit* u = unitAt(c); u && u != &shooter && !u->gone()) {
                double ox = px - (c.x + 0.5), oy = py - (c.y + 0.5);
                double radius = u->active() ? 0.35 : 0.45;
                if (ox * ox + oy * oy <= radius * radius && pz - c.z <= u->bodyHeight()) {
                    hit.cell = c;
                    hit.unitId = u->id;
                    return hit;
                }
            }
            continue;
        }
        if (c == prev) continue;
        if (c.z < 0) { hit.cell = {c.x, c.y, 0}; hit.hitTerrain = true; return hit; }
        if (!map.inside(c)) { hit.outOfMap = true; return hit; }
        if (c.z != prev.z) {
            int upper = std::max(c.z, prev.z);
            if (map.at(c.x, c.y, upper).type != TileType::Void) {
                hit.cell = {c.x, c.y, upper};
                hit.hitTerrain = true;
                return hit;
            }
        }
        prev = c;
        if (path) path->push_back(c);
        double frac = pz - c.z;
        if (const BattleUnit* u = unitAt(c); u && u != &shooter && !u->gone()) {
            double ox = px - (c.x + 0.5), oy = py - (c.y + 0.5);
            double radius = u->active() ? 0.35 : 0.45;
            if (ox * ox + oy * oy <= radius * radius && frac <= u->bodyHeight()) {
                hit.cell = c;
                hit.unitId = u->id;
                return hit;
            }
        }
        const TileDef& d = map.at(c).def();
        if (d.blocksShots || (d.coverHeight > 0 && frac < d.coverHeight)) {
            hit.cell = c;
            hit.hitTerrain = true;
            return hit;
        }
    }
    hit.outOfMap = true;
    return hit;
}

bool Battle::shoot(BattleUnit& u, Slot hand, ShotMode mode, const Point3& target) {
    lastError.clear();
    if (!u.active()) return false;
    ShotPreview p = previewShot(u, hand, mode, target);
    if (!p.possible) { lastError = p.reason; return false; }
    CarriedItem* c = u.inSlot(hand);
    const ItemDef& w = item(c->item.id);
    const ItemDef& ammo = item(c->item.ammoId);
    const FireMode& fm = modeOf(w, mode);

    u.tu -= p.tuCost;
    u.facing = directionTo(target.x - u.pos.x, target.y - u.pos.y);
    Random& r = rng();
    BattleUnit* targetUnit = unitAt(target);
    double dist = distance3(u.pos, target);

    for (int shot = 0; shot < fm.shots && c->item.ammo > 0 && u.active(); ++shot) {
        c->item.ammo--;
        double aimZ = target.z + (targetUnit ? targetUnit->bodyHeight() * 0.6 : 0.5);
        double tx = target.x + 0.5, ty = target.y + 0.5, tz = aimZ;
        bool onTarget = r.percent(p.accuracy);
        if (!onTarget) {
            double spread = (1.0 - p.accuracy / 100.0) * 0.15 * dist + 0.6;
            tx += r.real(-spread, spread);
            ty += r.real(-spread, spread);
            tz += r.real(-spread, spread) * 0.3;
        }
        // Extend the line well past the target so misses keep flying.
        double ax = u.pos.x + 0.5, ay = u.pos.y + 0.5, az = u.pos.z + u.eyeHeight();
        double ex = ax + (tx - ax) * 3, ey = ay + (ty - ay) * 3, ez = az + (tz - az) * 3;
        TraceHit h = traceProjectile(u, ex, ey, ez, 80, &lastTrace);

        std::string msg = fmt("%s: %s shot (%d%%)", u.name.c_str(), shotModeName(mode), p.accuracy);
        if (h.unitId >= 0) {
            BattleUnit* v = unitById(h.unitId);
            msg += " hits " + v->name + ".";
            addLog(msg);
            if (v->faction != u.faction) u.xp.firing++;
            if (ammo.blastRadius > 0) explode(v->pos, ammo.blastRadius, ammo.damage, ammo.damageType, u.id);
            else damageUnit(*v, ammo.damage, ammo.damageType, u.id, u.pos);
        } else if (h.hitTerrain) {
            addLog(msg + " hits " + map.at(h.cell).def().name + ".");
            if (ammo.blastRadius > 0) explode(h.cell, ammo.blastRadius, ammo.damage, ammo.damageType, u.id);
            else damageTile(h.cell, ammo.damage, ammo.damageType);
            if (ammo.damageType == DamageType::Incendiary && map.at(h.cell).def().flammable) igniteTile(h.cell, 2);
        } else {
            addLog(msg + " misses.");
        }
        if (outcome != BattleOutcome::Ongoing) break;
    }
    updateVisibility();
    tryReactionFire(u);
    return true;
}

// ---------------------------------------------------------------------------
// Throwing
// ---------------------------------------------------------------------------

int Battle::throwRange(const BattleUnit& u, const ItemDef& d) const {
    return std::max(3, 6 + u.strengthTotal() / 5 - d.weight);
}

bool Battle::throwItem(BattleUnit& u, Slot hand, const Point3& target) {
    lastError.clear();
    CarriedItem* c = u.inSlot(hand);
    if (!c) { lastError = "Nothing in that hand."; return false; }
    const ItemDef& d = item(c->item.id);
    int dist = chebyshev(u.pos, target);
    if (dist > throwRange(u, d)) { lastError = fmt("Too far (max %d tiles).", throwRange(u, d)); return false; }
    int cost = u.maxTu() / 4;
    if (u.tu < cost) { lastError = fmt("Not enough TU (%d needed).", cost); return false; }
    u.tu -= cost;
    u.facing = directionTo(target.x - u.pos.x, target.y - u.pos.y);

    Random& r = rng();
    double acc = u.stats.throwing / 100.0 * (u.kneeling ? 1.1 : 1.0);
    Point3 land = target;
    if (!r.chance(acc)) {
        int k = 1 + (int)(dist * (1.0 - acc) / 2);
        land.x = std::clamp(target.x + r.range(-k, k), 0, map.width() - 1);
        land.y = std::clamp(target.y + r.range(-k, k), 0, map.height() - 1);
    }
    // Walk the flight path; a wall stops the item short.
    Point3 at = u.pos;
    int steps = std::max(std::abs(land.x - u.pos.x), std::abs(land.y - u.pos.y));
    for (int i = 1; i <= steps; ++i) {
        Point3 p{u.pos.x + (int)std::lround((land.x - u.pos.x) * (double)i / steps),
                 u.pos.y + (int)std::lround((land.y - u.pos.y) * (double)i / steps), land.z};
        if (!map.inside(p) || map.at(p).def().blocksShots) break;
        at = p;
    }
    while (at.z > 0 && map.at(at).type == TileType::Void) at.z--;

    ItemInstance thrown = c->item;
    u.inv.erase(u.inv.begin() + (c - u.inv.data()));
    u.xp.throwing++;
    addLog(fmt("%s throws the %s.", u.name.c_str(), d.name.c_str()));

    if (d.kind == ItemKind::Grenade && d.impactFuse) {
        if (d.damageType == DamageType::Light) {
            thrown.fuse = -2; // lit flare
            map.at(at).items.push_back(thrown);
            map.recomputeLighting(daytime());
        } else {
            explode(at, d.blastRadius, d.damage, d.damageType, u.id);
        }
    } else {
        map.at(at).items.push_back(thrown);
    }
    updateVisibility();
    tryReactionFire(u);
    return true;
}

// ---------------------------------------------------------------------------
// Melee
// ---------------------------------------------------------------------------

int Battle::meleeTuCost(const BattleUnit& u, Slot hand) const {
    if (hand != Slot::Ground)
        if (const CarriedItem* c = u.inSlot(hand); c && item(c->item.id).kind == ItemKind::MeleeWeapon)
            return item(c->item.id).meleeTuPercent * u.maxTu() / 100;
    return 25 * u.maxTu() / 100; // claws / bare hands
}

bool Battle::melee(BattleUnit& u, Slot hand, BattleUnit& target) {
    lastError.clear();
    if (chebyshev(u.pos, target.pos) > 1 || u.pos.z != target.pos.z) { lastError = "Target is not adjacent."; return false; }
    const ItemDef* weapon = nullptr;
    if (hand != Slot::Ground)
        if (const CarriedItem* c = u.inSlot(hand); c && item(c->item.id).kind == ItemKind::MeleeWeapon)
            weapon = &item(c->item.id);
    if (!weapon && u.clawDamage == 0) {
        // Unarmed humans can still use the butt of a rifle.
        if (!u.inSlot(hand)) { lastError = "Nothing to strike with."; return false; }
    }
    int cost = meleeTuCost(u, hand);
    if (u.tu < cost) { lastError = fmt("Not enough TU (%d needed).", cost); return false; }
    u.tu -= cost;
    u.facing = directionTo(target.pos.x - u.pos.x, target.pos.y - u.pos.y);

    int damage = weapon ? weapon->damage + u.strengthTotal() / 10
                        : (u.clawDamage > 0 ? u.clawDamage : 10 + u.strengthTotal() / 10);
    double acc = u.stats.melee / 100.0 * (weapon ? weapon->meleeAccuracy / 100.0 : 1.0);
    if (rng().chance(acc)) {
        addLog(fmt("%s strikes %s.", u.name.c_str(), target.name.c_str()));
        if (target.faction != u.faction) u.xp.melee++;
        damageUnit(target, damage, DamageType::Melee, u.id, u.pos);
    } else {
        addLog(fmt("%s lunges at %s and misses.", u.name.c_str(), target.name.c_str()));
    }
    tryReactionFire(u);
    return true;
}

// ---------------------------------------------------------------------------
// Domination: an engineered pheromone burst. Range 8, no line of sight
// needed. Attack = Will + bloodline bonus + d40 vs. Will (+suit, +blocker) + d40.
// ---------------------------------------------------------------------------

bool Battle::dominate(BattleUnit& elder, BattleUnit& target) {
    lastError.clear();
    if (!elder.canDominate) return false;
    if (chebyshev(elder.pos, target.pos) > 8 || std::abs(elder.pos.z - target.pos.z) > 1) return false;
    if (elder.tu < 25) return false;
    elder.tu -= 25;
    int attack = elder.stats.will + bloodline(elder.bloodline).dominationBonus + rng().range(0, 40);
    int defence = target.totalWill() + rng().range(0, 40);
    if (attack > defence) {
        target.morale = std::max(0, target.morale - 50);
        if (rng().percent(50)) target.dominated = true;
        addLog(target.name + " breathes in a sweet, cloying scent... (morale -50)");
    } else {
        addLog(target.name + " shrugs off a wave of dread.");
        target.xp.bravery++;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

void Battle::damageUnit(BattleUnit& target, int power, DamageType type, int attackerId, const Point3& from) {
    if (target.gone() || power <= 0) return;
    if (type == DamageType::Smoke || type == DamageType::Light) return;
    Random& r = rng();

    double roll = (type == DamageType::Explosive || type == DamageType::Incendiary) ? r.real(0.5, 1.5) : r.real(0.0, 2.0);
    double raw = power * roll * damageMultiplier(target.vampiric, type);

    // Directional armour.
    int armor = target.armorSide;
    if (!(from == target.pos)) {
        int rel = (directionTo(from.x - target.pos.x, from.y - target.pos.y) - target.facing + 8) % 8;
        armor = (rel == 0 || rel == 1 || rel == 7) ? target.armorFront : (rel == 2 || rel == 6) ? target.armorSide : target.armorRear;
    }
    if (type == DamageType::Incendiary) armor /= 2;
    int dmg = std::max(0, (int)std::round(raw) - armor);

    if (type == DamageType::Haemolytic && target.vampiric && dmg + armor > 0) {
        if (!target.regenBlocked) addLog(target.name + " is darted: regeneration suppressed.");
        target.regenBlocked = true;
    }
    if (type == DamageType::Stun) {
        target.stun += dmg;
        if (target.active() && target.stun >= target.hp) {
            target.status = UnitStatus::Unconscious;
            addLog(target.name + " is knocked out.");
            unitDown(target, attackerId);
        }
        return;
    }
    if (dmg <= 0) {
        if (target.status == UnitStatus::Active) addLog(target.name + ": no damage.");
        return;
    }

    target.xp.bravery++;
    target.morale = std::max(0, target.morale - dmg / 3);

    // Bodies already down.
    if (target.status == UnitStatus::Torpor) {
        if (type == DamageType::Incendiary) {
            target.status = UnitStatus::Incinerated;
            addLog(target.name + " is incinerated. It will not rise again.");
            checkOutcome();
        } else {
            target.regenTimer++;
            addLog(target.name + "'s body is torn apart further (regeneration delayed).");
        }
        return;
    }
    if (target.status == UnitStatus::Unconscious) {
        target.hp -= dmg;
        if (target.hp <= 0) {
            target.status = UnitStatus::Dead;
            addLog(target.name + " is killed.");
            if (target.faction == Faction::Neutral) civiliansKilled++;
            checkOutcome();
        }
        return;
    }

    target.hp -= dmg;
    if (target.vampiric && type == DamageType::Incendiary) target.burning = std::max(target.burning, 2);
    if (!target.vampiric && dmg >= 10 && r.percent(50)) target.fatalWounds++;

    if (target.hp > 0) {
        addLog(fmt("%s takes %d damage (%d HP left).", target.name.c_str(), dmg, target.hp));
        return;
    }
    target.hp = 0;
    if (target.vampiric) {
        if (type == DamageType::Incendiary) {
            target.status = UnitStatus::Incinerated;
            addLog(target.name + " goes up in flames and is destroyed!");
        } else {
            target.status = UnitStatus::Torpor;
            target.regenTimer = 0; // set by unitDown
            addLog(target.name + " collapses into torpor. Burn the body before it rises!");
        }
    } else {
        target.status = UnitStatus::Dead;
        addLog(target.name + " is killed.");
    }
    unitDown(target, attackerId);
}

void Battle::damageTile(const Point3& p, int damage, DamageType type) {
    if (!map.inside(p) || type == DamageType::Smoke || type == DamageType::Light) return;
    Tile& t = map.at(p);
    const TileDef& d = t.def();
    if (d.armor <= 0) return;
    t.hp -= damage;
    if (t.hp <= 0) {
        TileType into = d.destroyedInto;
        if (p.z > 0 && into == TileType::Rubble) into = TileType::Floor;
        auto items = t.items;
        map.set(p.x, p.y, p.z, into);
        map.at(p).items = items;
    }
}

void Battle::igniteTile(const Point3& p, int turns) {
    if (!map.inside(p)) return;
    Tile& t = map.at(p);
    if (t.type == TileType::Void || t.type == TileType::Water || t.type == TileType::Rock) return;
    t.fire = (uint8_t)std::max<int>(t.fire, turns);
}

void Battle::explode(const Point3& c, int radius, int damage, DamageType type, int attackerId) {
    Random& r = rng();
    if (type == DamageType::Smoke) {
        for (int z = std::max(0, c.z - 1); z <= std::min(map.levels() - 1, c.z + 1); ++z)
            for (int y = c.y - radius; y <= c.y + radius; ++y)
                for (int x = c.x - radius; x <= c.x + radius; ++x)
                    if (map.inside(x, y, z) && (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) <= radius * radius)
                        map.at(x, y, z).smoke = (uint8_t)r.range(4, 6);
        addLog("Smoke billows out.");
        updateVisibility();
        return;
    }
    addLog(type == DamageType::Incendiary ? "Whumph! Flames engulf the area." : "BOOM!");
    // Collect victims first: damage can move bodies' items around.
    std::vector<std::pair<int, int>> victims; // unit id, damage
    for (int z = std::max(0, c.z - 1); z <= std::min(map.levels() - 1, c.z + 1); ++z)
        for (int y = c.y - radius; y <= c.y + radius; ++y)
            for (int x = c.x - radius; x <= c.x + radius; ++x) {
                Point3 p{x, y, z};
                if (!map.inside(p)) continue;
                double d = distance3(c, p);
                if (d > radius + 0.5) continue;
                if (!(p == c) && !lineOfSight(c, 0.5, p, 0.5)) continue;
                int dmg = (int)std::round(damage * (1.0 - d / (radius + 1)));
                if (dmg <= 0) continue;
                for (auto& u : units)
                    if (u.pos == p && !u.gone()) victims.push_back({u.id, dmg});
                damageTile(p, dmg, type);
                if (type == DamageType::Incendiary) igniteTile(p, r.range(2, 4));
                else map.at(p).smoke = (uint8_t)std::max<int>(map.at(p).smoke, 1);
            }
    for (auto [id, dmg] : victims)
        if (BattleUnit* u = unitById(id)) damageUnit(*u, dmg, type, attackerId, c);
    map.recomputeLighting(daytime());
    updateVisibility();
}

// ---------------------------------------------------------------------------
// Reaction fire
// ---------------------------------------------------------------------------

bool Battle::tryReactionFire(BattleUnit& mover) {
    if (reactionDepth_ > 0 || !mover.active() || mover.faction == Faction::Neutral) return false;
    Faction enemyOf = mover.faction == Faction::Player ? Faction::Enemy : Faction::Player;
    double moverScore = mover.stats.reactions * (double)mover.tu / std::max(1, mover.maxTu());
    BattleUnit* best = nullptr;
    Slot bestHand = Slot::RightHand;
    double bestScore = moverScore;
    for (auto& o : units) {
        if (o.faction != enemyOf || !o.active() || o.panicked) continue;
        for (Slot hand : {Slot::RightHand, Slot::LeftHand}) {
            ShotPreview p = previewShot(o, hand, ShotMode::Snap, mover.pos);
            if (!p.possible) continue;
            double score = o.stats.reactions * (double)o.tu / std::max(1, o.maxTu());
            if (score > bestScore && canSee(o, mover)) {
                best = &o;
                bestHand = hand;
                bestScore = score;
            }
            break;
        }
    }
    if (!best) return false;
    ++reactionDepth_;
    addLog(best->name + " reacts!");
    best->xp.reactions++;
    shoot(*best, bestHand, ShotMode::Snap, mover.pos);
    --reactionDepth_;
    return true;
}

} // namespace vamps

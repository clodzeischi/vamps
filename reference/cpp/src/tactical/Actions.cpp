// Non-combat actions: movement, facing, posture, stairs, inventory,
// medkits, motion tracker, reloading and priming.
//
// TU costs (from the original where it had one):
//   turn 45 deg: 1    kneel: 4    stand: 8    stairs: 8
//   reload: 15 + moving the clip to hand    prime grenade: 8
//   medkit: 10        tracker: 25% of max TU
#include <algorithm>
#include <cmath>
#include <set>

#include "core/Format.h"
#include "tactical/Battle.h"

namespace vamps {

namespace {

int turnSteps(int from, int to) {
    int d = std::abs(from - to) % 8;
    return std::min(d, 8 - d);
}

} // namespace

bool Battle::move(BattleUnit& u, const Point3& dest) {
    lastError.clear();
    if (!u.active()) { lastError = "Unit cannot act."; return false; }
    Path path = findPath(u, dest);
    if (!path.found || path.steps.empty()) { lastError = "No path."; return false; }

    if (u.kneeling) {
        if (u.tu < 8) { lastError = "Not enough TU to stand."; return false; }
        u.tu -= 8;
        u.kneeling = false;
    }

    std::set<int> seenBefore = playerSees;
    int moved = 0;
    for (const Point3& next : path.steps) {
        int cost = stepCost(u.pos, next);
        if (cost < 0) break;
        const BattleUnit* occ = unitAt(next);
        if (occ && occ != &u && occ->active()) break; // someone stepped in the way
        int newFacing = (next.z == u.pos.z) ? directionTo(next.x - u.pos.x, next.y - u.pos.y) : u.facing;
        int total = cost + turnSteps(u.facing, newFacing);
        if (u.tu < total) { if (!moved) lastError = "Not enough TU."; break; }
        if (u.energy < cost / 2) { if (!moved) lastError = "Too exhausted."; break; }
        u.tu -= total;
        u.energy -= cost / 2;
        u.facing = newFacing;
        u.pos = next;
        if (map.at(next).type == TileType::DoorClosed) map.set(next.x, next.y, next.z, TileType::DoorOpen);
        ++moved;

        updateVisibility();
        // The original stops a move when a new enemy comes into view.
        if (u.faction == Faction::Player) {
            bool spotted = false;
            for (int id : playerSees)
                if (!seenBefore.count(id)) {
                    if (BattleUnit* e = unitById(id); e && e->faction == Faction::Enemy && e->active()) spotted = true;
                }
            if (spotted) {
                addLog(u.name + ": contact!");
                tryReactionFire(u);
                break;
            }
        }
        tryReactionFire(u);
        if (!u.active() || outcome != BattleOutcome::Ongoing) break;
    }
    return moved > 0;
}

bool Battle::turnTo(BattleUnit& u, const Point3& target) {
    lastError.clear();
    if (!u.active()) return false;
    int dir = directionTo(target.x - u.pos.x, target.y - u.pos.y);
    int cost = turnSteps(u.facing, dir);
    if (cost == 0) return true;
    if (u.tu < cost) { lastError = "Not enough TU."; return false; }
    u.tu -= cost;
    u.facing = dir;
    updateVisibility();
    return true;
}

bool Battle::toggleKneel(BattleUnit& u) {
    lastError.clear();
    int cost = u.kneeling ? 8 : 4;
    if (u.tu < cost) { lastError = "Not enough TU."; return false; }
    u.tu -= cost;
    u.kneeling = !u.kneeling;
    updateVisibility();
    return true;
}

bool Battle::changeLevel(BattleUnit& u, int dz) {
    lastError.clear();
    Point3 to{u.pos.x, u.pos.y, u.pos.z + dz};
    if (!map.inside(to) || stepCost(u.pos, to) < 0) { lastError = dz > 0 ? "No stairs up here." : "No stairs down here."; return false; }
    if (const BattleUnit* o = unitAt(to); o && o->active()) { lastError = "Someone is in the way."; return false; }
    if (u.tu < 8) { lastError = "Not enough TU."; return false; }
    u.tu -= 8;
    u.pos = to;
    u.kneeling = false;
    updateVisibility();
    tryReactionFire(u);
    return true;
}

bool Battle::moveItem(BattleUnit& u, int idx, Slot to) {
    lastError.clear();
    if (idx < 0 || idx >= (int)u.inv.size()) return false;
    CarriedItem c = u.inv[idx];
    int cost = slotMoveCost(c.slot, to);
    if (u.tu < cost) { lastError = "Not enough TU."; return false; }
    Loadout without = u.inv;
    without.erase(without.begin() + idx);
    if (!canPlace(without, to, c.item.id)) { lastError = "No room there."; return false; }
    u.tu -= cost;
    if (to == Slot::Ground) {
        map.at(u.pos).items.push_back(c.item);
        u.inv = without;
    } else {
        u.inv[idx].slot = to;
    }
    return true;
}

bool Battle::pickUp(BattleUnit& u, int gi, Slot to) {
    lastError.clear();
    auto& ground = map.at(u.pos).items;
    if (gi < 0 || gi >= (int)ground.size()) return false;
    int cost = slotMoveCost(Slot::Ground, to);
    if (u.tu < cost) { lastError = "Not enough TU."; return false; }
    if (!canPlace(u.inv, to, ground[gi].id)) { lastError = "No room there."; return false; }
    u.tu -= cost;
    u.inv.push_back({to, ground[gi]});
    ground.erase(ground.begin() + gi);
    return true;
}

bool Battle::useMedkit(BattleUnit& user, Slot hand, BattleUnit& target) {
    lastError.clear();
    CarriedItem* c = user.inSlot(hand);
    if (!c || item(c->item.id).kind != ItemKind::Medkit) { lastError = "No medkit in that hand."; return false; }
    if (std::max(std::abs(target.pos.x - user.pos.x), std::abs(target.pos.y - user.pos.y)) > 1 ||
        target.pos.z != user.pos.z) {
        lastError = "Too far away.";
        return false;
    }
    if (target.gone() || target.vampiric) { lastError = "Nothing to treat."; return false; }
    if (user.tu < 10) { lastError = "Not enough TU."; return false; }
    if (c->item.ammo <= 0) { lastError = "The medkit is empty."; return false; }
    const ItemDef& d = item(c->item.id);
    user.tu -= 10;
    c->item.ammo--;
    if (target.fatalWounds > 0) target.fatalWounds--;
    target.hp = std::min(target.stats.health, target.hp + d.healAmount);
    target.stun = std::max(0, target.stun - 20);
    if (target.status == UnitStatus::Unconscious && target.stun < target.hp) {
        target.status = UnitStatus::Active;
        target.tu = 0;
    }
    addLog(fmt("%s treats %s (%d HP, %d wounds left).", user.name.c_str(), target.name.c_str(), target.hp,
               target.fatalWounds));
    if (c->item.ammo <= 0) user.inv.erase(user.inv.begin() + (c - user.inv.data()));
    return true;
}

bool Battle::useTracker(BattleUnit& u, Slot hand) {
    lastError.clear();
    const CarriedItem* c = u.inSlot(hand);
    if (!c || c->item.id != "tracker") { lastError = "No tracker in that hand."; return false; }
    int cost = u.maxTu() / 4;
    if (u.tu < cost) { lastError = "Not enough TU."; return false; }
    u.tu -= cost;
    trackerTurns = 2;
    updateVisibility();
    addLog(u.name + " sweeps with the motion tracker.");
    return true;
}

bool Battle::reload(BattleUnit& u, Slot hand) {
    lastError.clear();
    CarriedItem* w = u.inSlot(hand);
    if (!w || item(w->item.id).kind != ItemKind::Firearm) { lastError = "No firearm in that hand."; return false; }
    const ItemDef& wd = item(w->item.id);
    // Prefer the clip type already in use, then any compatible clip.
    int best = -1;
    for (int i = 0; i < (int)u.inv.size(); ++i) {
        if (isHand(u.inv[i].slot)) continue;
        const std::string& id = u.inv[i].item.id;
        if (std::find(wd.ammo.begin(), wd.ammo.end(), id) == wd.ammo.end()) continue;
        if (best < 0 || id == w->item.ammoId) best = i;
    }
    if (best < 0) { lastError = "No compatible ammunition carried."; return false; }
    int cost = 15 + slotMoveCost(u.inv[best].slot, hand);
    if (u.tu < cost) { lastError = "Not enough TU."; return false; }
    u.tu -= cost;
    ItemInstance clip = u.inv[best].item;
    std::string oldAmmo = w->item.ammoId;
    int oldRounds = w->item.ammo;
    w->item.ammoId = clip.id;
    w->item.ammo = clip.ammo > 0 ? clip.ammo : item(clip.id).clipSize;
    u.inv.erase(u.inv.begin() + best);
    // A partly used clip is dropped at the soldier's feet.
    if (oldRounds > 0 && !oldAmmo.empty()) {
        ItemInstance old = makeItem(oldAmmo);
        old.ammo = oldRounds;
        map.at(u.pos).items.push_back(old);
    }
    addLog(u.name + " reloads.");
    return true;
}

bool Battle::primeGrenade(BattleUnit& u, Slot hand, int fuse) {
    lastError.clear();
    CarriedItem* c = u.inSlot(hand);
    if (!c || item(c->item.id).kind != ItemKind::Grenade || item(c->item.id).impactFuse) {
        lastError = "Nothing to prime in that hand.";
        return false;
    }
    if (u.tu < 8) { lastError = "Not enough TU."; return false; }
    u.tu -= 8;
    c->item.fuse = std::max(0, fuse);
    addLog(fmt("%s primes the %s (%d turn fuse).", u.name.c_str(), item(c->item.id).name.c_str(), c->item.fuse));
    return true;
}

} // namespace vamps

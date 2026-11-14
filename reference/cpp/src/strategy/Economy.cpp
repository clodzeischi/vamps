#include "strategy/Economy.h"

#include <algorithm>
#include <cmath>

#include "core/Format.h"
#include "core/Random.h"
#include "data/Craft.h"
#include "data/Items.h"
#include "strategy/Politics.h"

namespace vamps {

namespace {

bool spend(GameState& g, int64_t cost, std::string& err) {
    if (g.funds < cost) {
        err = "Not enough funds (" + money(cost) + " needed).";
        return false;
    }
    g.funds -= cost;
    return true;
}

// Purchases arrive in 1-3 days, like the original's deliveries.
int64_t deliveryTime(const GameState& g) {
    return g.time.seconds + rng().range(24, 72) * GameTime::kHour;
}

double incomingStorage(const Base& b) {
    double s = 0;
    for (const auto& t : b.incoming)
        if (t.kind == TransferKind::Item)
            if (const ItemDef* d = findItem(t.itemId)) s += d->storage * t.count;
    return s;
}

bool hasStorageFor(const Base& b, const std::string& itemId, int qty, std::string& err) {
    const ItemDef* d = findItem(itemId);
    double need = d ? d->storage * qty : 0;
    if (b.storageUsed() + incomingStorage(b) + need > storageCapacity(b) + 1e-6) {
        err = "Not enough store space at " + b.name + ".";
        return false;
    }
    return true;
}

bool hasHangarFor(const GameState& g, const Base& b, std::string& err) {
    if (g.craftAt(b.id) >= b.capacity(FacilityType::Hangar)) {
        err = "No free hangar at " + b.name + ".";
        return false;
    }
    return true;
}

std::string nextCraftName(const GameState& g, const std::string& type) {
    std::string prefix = type == "kestrel" ? "KESTREL-" : "LANCER-";
    int n = 1;
    for (const auto& c : g.craft)
        if (c.type == type) ++n;
    for (const auto& b : g.bases)
        for (const auto& t : b.incoming)
            if (t.kind == TransferKind::Craft && t.itemId == type) ++n;
    return prefix + std::to_string(n);
}

} // namespace

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

double storageCapacity(const Base& b) { return b.capacity(FacilityType::Stores); }

bool hasQuartersFor(const GameState& g, const Base& b, int extra) {
    return g.personnelAt(b.id) + extra <= b.capacity(FacilityType::Quarters);
}

// ---------------------------------------------------------------------------
// Open market
// ---------------------------------------------------------------------------

bool buyItem(GameState& g, Base& b, const std::string& itemId, int qty, std::string& err) {
    const ItemDef* d = findItem(itemId);
    if (!d || d->buyCost <= 0) { err = "That cannot be bought."; return false; }
    if (!hasStorageFor(b, itemId, qty, err)) return false;
    if (!spend(g, (int64_t)d->buyCost * qty, err)) return false;
    Transfer t;
    t.kind = TransferKind::Item; t.itemId = itemId; t.count = qty; t.arrival = deliveryTime(g);
    b.incoming.push_back(t);
    return true;
}

bool sellItem(GameState& g, Base& b, const std::string& itemId, int qty, std::string& err) {
    const ItemDef* d = findItem(itemId);
    if (!d || d->sellPrice <= 0) { err = "Nobody will buy that."; return false; }
    if (!b.removeItem(itemId, qty)) { err = "Not enough in stores."; return false; }
    g.funds += (int64_t)d->sellPrice * qty;
    return true;
}

bool hireSoldier(GameState& g, Base& b, std::string& err) {
    if (!hasQuartersFor(g, b, 1)) { err = "No room in living quarters."; return false; }
    if (!spend(g, kSoldierHireCost, err)) return false;
    Soldier s = generateSoldier(g.newId(), b.id);
    s.inTransit = true;
    Transfer t;
    t.kind = TransferKind::Soldier; t.refId = s.id; t.arrival = deliveryTime(g);
    b.incoming.push_back(t);
    g.soldiers.push_back(std::move(s));
    return true;
}

static bool hireStaff(GameState& g, Base& b, int n, TransferKind kind, int cost, std::string& err) {
    if (n <= 0) return true;
    if (!hasQuartersFor(g, b, n)) { err = "No room in living quarters."; return false; }
    if (!spend(g, (int64_t)cost * n, err)) return false;
    Transfer t;
    t.kind = kind; t.count = n; t.arrival = deliveryTime(g);
    b.incoming.push_back(t);
    return true;
}

bool hireScientists(GameState& g, Base& b, int n, std::string& err) {
    return hireStaff(g, b, n, TransferKind::Scientist, kScientistHireCost, err);
}

bool hireEngineers(GameState& g, Base& b, int n, std::string& err) {
    return hireStaff(g, b, n, TransferKind::Engineer, kEngineerHireCost, err);
}

bool buyCraft(GameState& g, Base& b, const std::string& type, std::string& err) {
    if (!hasHangarFor(g, b, err)) return false;
    // Aircraft are leased: the first month's rent is paid up front.
    if (!spend(g, craftType(type).rent, err)) return false;
    Transfer t;
    t.kind = TransferKind::Craft; t.itemId = type; t.arrival = g.time.seconds + 96 * GameTime::kHour;
    b.incoming.push_back(t);
    return true;
}

bool sackSoldier(GameState& g, int soldierId, std::string& err) {
    auto it = std::find_if(g.soldiers.begin(), g.soldiers.end(),
                           [&](const Soldier& s) { return s.id == soldierId; });
    if (it == g.soldiers.end()) { err = "No such soldier."; return false; }
    if (it->inTransit) { err = "Soldier is in transit."; return false; }
    // Their equipment goes back into stores.
    if (Base* b = g.findBase(it->baseId)) {
        for (const auto& c : it->loadout) b->addItem(c.item.id);
        if (!it->armor.empty()) b->addItem(it->armor);
    }
    g.soldiers.erase(it);
    return true;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

int facilityCost(const GameState& g, FacilityType t) {
    double mult = g.secrecy < 60 ? 1.25 : 1.0; // scrutiny makes contractors expensive
    return (int)(facility(t).cost * mult);
}

bool buildFacility(GameState& g, Base& b, FacilityType t, int x, int y, std::string& err) {
    if (!b.canBuild(t, x, y, &err)) return false;
    if (!spend(g, facilityCost(g, t), err)) return false;
    b.facilities.push_back({t, x, y, facility(t).buildDays});
    return true;
}

bool dismantleFacility(GameState& g, Base& b, int x, int y, std::string& err) {
    const Facility* f = b.facilityAt(x, y);
    if (!f) { err = "Nothing to dismantle."; return false; }
    if (f->type == FacilityType::AccessLift) { err = "The access lift cannot be removed."; return false; }
    FacilityType type = f->type;
    // Removing a ready facility must not drop capacity below what is in use.
    if (f->ready()) {
        int cap = facility(type).capacity;
        auto tooFull = [&](int used, int capacity) { return used > capacity - cap; };
        if ((type == FacilityType::Quarters && tooFull(g.personnelAt(b.id), b.capacity(type))) ||
            (type == FacilityType::Laboratory && tooFull(b.scientists, b.capacity(type))) ||
            (type == FacilityType::Workshop && tooFull(b.engineers, b.capacity(type))) ||
            (type == FacilityType::Stores && b.storageUsed() > storageCapacity(b) - cap) ||
            (type == FacilityType::Hangar && tooFull(g.craftAt(b.id), b.capacity(type))) ||
            (type == FacilityType::Containment && tooFull(g.captivesAt(b.id), b.capacity(type)))) {
            err = "That facility is in use.";
            return false;
        }
    }
    b.facilities.erase(b.facilities.begin() + (f - b.facilities.data()));
    return true;
}

bool buildBase(GameState& g, const LatLon& pos, const std::string& name, std::string& err) {
    if (!world().isLand(pos)) { err = "Bases must be built on land."; return false; }
    int nation = world().nationAt(pos);
    if (nation >= 0 && g.nations[nation].defected) {
        err = std::string(nations()[nation].name) + " will not allow an agency base.";
        return false;
    }
    if (g.secrecy < 30 && nation >= 0 && g.nations[nation].support < 0) {
        err = "Exposed: that government refuses permission.";
        return false;
    }
    int64_t cost = (int64_t)(kNewBaseCost * (g.secrecy < 60 ? 1.25 : 1.0)) + facilityCost(g, FacilityType::AccessLift);
    if (!spend(g, cost, err)) return false;
    Base b;
    b.id = g.newId();
    b.name = name;
    b.pos = pos;
    b.facilities.push_back({FacilityType::AccessLift, 2, 2, facility(FacilityType::AccessLift).buildDays});
    g.bases.push_back(std::move(b));
    return true;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

int64_t transferSeconds(const Base& from, const Base& to) {
    double nm = distanceNm(from.pos, to.pos);
    return (int64_t)((6.0 + nm / 400.0) * GameTime::kHour);
}

bool transferItem(GameState& g, Base& from, Base& to, const std::string& itemId, int qty, std::string& err) {
    if (from.id == to.id) { err = "Same base."; return false; }
    if (from.itemCount(itemId) < qty) { err = "Not enough in stores."; return false; }
    if (!hasStorageFor(to, itemId, qty, err)) return false;
    from.removeItem(itemId, qty);
    Transfer t;
    t.kind = TransferKind::Item; t.itemId = itemId; t.count = qty;
    t.arrival = g.time.seconds + transferSeconds(from, to);
    to.incoming.push_back(t);
    return true;
}

bool transferSoldier(GameState& g, int soldierId, Base& to, std::string& err) {
    Soldier* s = g.findSoldier(soldierId);
    if (!s) { err = "No such soldier."; return false; }
    if (s->inTransit) { err = "Already in transit."; return false; }
    if (s->baseId == to.id) { err = "Already stationed there."; return false; }
    if (s->craftId >= 0) {
        Craft* c = g.findCraft(s->craftId);
        if (c && c->airborne()) { err = "Soldier is on a mission."; return false; }
    }
    if (!hasQuartersFor(g, to, 1)) { err = "No room in quarters at " + to.name + "."; return false; }
    Base* from = g.findBase(s->baseId);
    s->craftId = -1;
    s->inTransit = true;
    s->baseId = to.id;
    Transfer t;
    t.kind = TransferKind::Soldier; t.refId = s->id;
    t.arrival = g.time.seconds + (from ? transferSeconds(*from, to) : 24 * GameTime::kHour);
    to.incoming.push_back(t);
    return true;
}

static bool transferStaff(GameState& g, Base& from, Base& to, int n, TransferKind kind, std::string& err) {
    if (from.id == to.id) { err = "Same base."; return false; }
    int idle = kind == TransferKind::Scientist ? from.scientistsFree() : from.engineersFree();
    if (n > idle) { err = "Not enough idle staff (reassign them from projects first)."; return false; }
    if (!hasQuartersFor(g, to, n)) { err = "No room in quarters at " + to.name + "."; return false; }
    (kind == TransferKind::Scientist ? from.scientists : from.engineers) -= n;
    Transfer t;
    t.kind = kind; t.count = n; t.arrival = g.time.seconds + transferSeconds(from, to);
    to.incoming.push_back(t);
    return true;
}

bool transferScientists(GameState& g, Base& from, Base& to, int n, std::string& err) {
    return transferStaff(g, from, to, n, TransferKind::Scientist, err);
}

bool transferEngineers(GameState& g, Base& from, Base& to, int n, std::string& err) {
    return transferStaff(g, from, to, n, TransferKind::Engineer, err);
}

bool transferCaptive(GameState& g, Base& from, Base& to, int idx, std::string& err) {
    if (idx < 0 || idx >= (int)from.captives.size()) { err = "No such captive."; return false; }
    if (g.captivesAt(to.id) >= to.capacity(FacilityType::Containment)) {
        err = "No free containment cell at " + to.name + ".";
        return false;
    }
    Transfer t;
    t.kind = TransferKind::Captive; t.captive = from.captives[idx];
    t.arrival = g.time.seconds + transferSeconds(from, to);
    from.captives.erase(from.captives.begin() + idx);
    to.incoming.push_back(t);
    return true;
}

bool transferCraft(GameState& g, int craftId, Base& to, std::string& err) {
    Craft* c = g.findCraft(craftId);
    if (!c) { err = "No such craft."; return false; }
    if (c->airborne()) { err = "Craft is airborne."; return false; }
    if (c->baseId == to.id) { err = "Already based there."; return false; }
    if (!hasHangarFor(g, to, err)) return false;
    for (auto& s : g.soldiers)
        if (s.craftId == c->id) s.craftId = -1;
    // The craft simply flies to its new home.
    c->baseId = to.id;
    c->status = CraftStatus::Airborne;
    c->target = CraftTarget::Home;
    c->fuel = std::max(c->fuel, craftType(c->type).fuelHours); // ferry tanks
    return true;
}

void deliverTransfers(GameState& g) {
    for (auto& b : g.bases) {
        std::vector<Transfer> still;
        for (auto& t : b.incoming) {
            if (t.arrival > g.time.seconds) { still.push_back(t); continue; }
            switch (t.kind) {
                case TransferKind::Item: b.addItem(t.itemId, t.count); break;
                case TransferKind::Scientist: b.scientists += t.count; break;
                case TransferKind::Engineer: b.engineers += t.count; break;
                case TransferKind::Captive: b.captives.push_back(t.captive); break;
                case TransferKind::Soldier:
                    if (Soldier* s = g.findSoldier(t.refId)) { s->inTransit = false; s->baseId = b.id; }
                    break;
                case TransferKind::Craft: {
                    const CraftDef& def = craftType(t.itemId);
                    Craft c;
                    c.id = g.newId();
                    c.type = def.id;
                    c.name = nextCraftName(g, def.id);
                    c.baseId = b.id;
                    c.pos = b.pos;
                    c.fuel = def.fuelHours;
                    c.hp = def.hp;
                    for (int i = 0; i < def.weaponSlots; ++i) c.weapons.push_back({});
                    g.craft.push_back(c);
                    g.addLog(c.name + " delivered to " + b.name + ".");
                    break;
                }
            }
        }
        b.incoming = std::move(still);
    }
}

// ---------------------------------------------------------------------------
// Black market
// ---------------------------------------------------------------------------

void rotateBlackMarket(GameState& g) {
    Random& r = rng();
    g.blackMarket.clear();
    std::vector<const ItemDef*> pool;
    for (const auto& d : allItems())
        if (d.blackMarket) pool.push_back(&d);
    double discount = g.isResearched("blood_ledgers") ? 0.8 : 1.0;
    int n = r.range(3, 5);
    for (int i = 0; i < n && !pool.empty(); ++i) {
        int k = r.range(0, (int)pool.size() - 1);
        const ItemDef* d = pool[k];
        pool.erase(pool.begin() + k);
        BlackMarketOffer o;
        o.itemId = d->id;
        o.quantity = d->kind == ItemKind::Artifact || d->kind == ItemKind::Armor ? r.range(1, 2) : r.range(3, 10);
        int basePrice = std::max(d->buyCost, d->sellPrice * 2);
        o.price = (int)(basePrice * r.real(1.5, 2.5) * discount);
        g.blackMarket.push_back(o);
    }
    // One or two mercenaries for hire.
    int mercs = r.range(1, 2);
    for (int i = 0; i < mercs; ++i) {
        BlackMarketOffer o;
        o.mercenary = true;
        o.merc = generateSoldier(0, 0, true);
        o.price = (int)(r.range(150, 260) * 1000 * discount);
        g.blackMarket.push_back(o);
    }
}

int blackMarketSellPrice(const GameState& g, const std::string& itemId) {
    const ItemDef* d = findItem(itemId);
    if (!d || d->sellPrice <= 0) return 0;
    double mult = d->kind == ItemKind::Artifact ? 1.6 : 1.15; // collectors pay for the exotic
    return (int)(d->sellPrice * mult);
}

// Every deal risks a leak: -1 secrecy, and 10% of the time a -5 exposure.
static void blackMarketExposure(GameState& g) {
    changeSecrecy(g, -1.0, "");
    if (rng().percent(10)) changeSecrecy(g, -5.0, "A black-market contact was arrested and talked");
}

bool buyBlackMarket(GameState& g, Base& b, int idx, std::string& err) {
    if (idx < 0 || idx >= (int)g.blackMarket.size()) { err = "No such offer."; return false; }
    BlackMarketOffer& o = g.blackMarket[idx];
    if (o.mercenary) {
        if (!hasQuartersFor(g, b, 1)) { err = "No room in living quarters."; return false; }
        if (!spend(g, o.price, err)) return false;
        Soldier s = o.merc;
        s.id = g.newId();
        s.baseId = b.id;
        s.inTransit = true;
        Transfer t;
        t.kind = TransferKind::Soldier; t.refId = s.id; t.arrival = deliveryTime(g);
        b.incoming.push_back(t);
        g.soldiers.push_back(s);
        g.blackMarket.erase(g.blackMarket.begin() + idx);
    } else {
        if (!hasStorageFor(b, o.itemId, 1, err)) return false;
        if (!spend(g, o.price, err)) return false;
        Transfer t;
        t.kind = TransferKind::Item; t.itemId = o.itemId; t.count = 1; t.arrival = deliveryTime(g);
        b.incoming.push_back(t);
        if (--o.quantity <= 0) g.blackMarket.erase(g.blackMarket.begin() + idx);
    }
    blackMarketExposure(g);
    return true;
}

bool sellBlackMarket(GameState& g, Base& b, const std::string& itemId, int qty, std::string& err) {
    int price = blackMarketSellPrice(g, itemId);
    if (price <= 0) { err = "No buyer for that."; return false; }
    if (!b.removeItem(itemId, qty)) { err = "Not enough in stores."; return false; }
    g.funds += (int64_t)price * qty;
    blackMarketExposure(g);
    return true;
}

// ---------------------------------------------------------------------------
// Monthly costs
// ---------------------------------------------------------------------------

int64_t monthlySalaries(const GameState& g) {
    int64_t total = (int64_t)g.soldiers.size() * kSoldierSalary;
    for (const auto& b : g.bases) total += (int64_t)b.scientists * kScientistSalary + (int64_t)b.engineers * kEngineerSalary;
    return total;
}

int64_t monthlyCraftRent(const GameState& g) {
    int64_t total = 0;
    for (const auto& c : g.craft) total += craftType(c.type).rent;
    return total;
}

int64_t monthlyFacilityUpkeep(const GameState& g) {
    int64_t total = 0;
    for (const auto& b : g.bases) total += b.monthlyUpkeep();
    return total;
}

int64_t monthlyMediaSpend(const GameState& g) {
    int64_t total = 0;
    for (const auto& n : g.nations)
        if (!n.defected) total += n.mediaBudget;
    return total;
}

} // namespace vamps

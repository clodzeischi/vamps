// Soldier roster and the between-missions equipment screen.
#include "core/Format.h"
#include "data/Craft.h"
#include "strategy/Economy.h"
#include "strategy/Simulation.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

Element statRow(const char* name, int value, int initial, int max, Color c) {
    std::string gain = value > initial ? fmt(" +%d", value - initial) : "";
    return hbox({text(padRight(name, 16)) | color(theme::kDim), text(fmt("%3d", value)) | color(theme::kText), text(" "),
                 meter(value, max, 20, c), text(gain) | color(theme::kGood)});
}

std::string loadoutSummary(const Soldier& s) {
    std::string out;
    for (const auto& c : s.loadout)
        if (isHand(c.slot)) out += (out.empty() ? "" : ", ") + item(c.item.id).name;
    return out.empty() ? "unarmed" : out;
}

class SoldiersScreen : public Screen {
public:
    explicit SoldiersScreen(int baseId) : baseId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        ids_.clear();
        std::vector<Element> rows;
        for (const auto& s : g.soldiers) {
            if (s.baseId != baseId_) continue;
            ids_.push_back(s.id);
            const Craft* c = s.craftId >= 0 ? g.findCraft(s.craftId) : nullptr;
            std::string state = s.inTransit ? "in transit" : s.woundDays > 0 ? fmt("wounded %dd", s.woundDays) : "ready";
            rows.push_back(hbox({
                text(padRight(s.name, 20)) | color(s.mercenary ? theme::kWarn : theme::kAccent),
                text(padRight(soldierRankName(s.rank), 10)),
                text(fmt("M%-3d K%-3d ", s.missions, s.kills)) | color(theme::kDim),
                text(padRight(c ? c->name : "-", 11)) | color(theme::kInfo),
                text(state) | color(s.woundDays > 0 ? theme::kBad : theme::kText),
            }));
        }
        Soldier* sel = selected(g);
        Element detail = text("No soldiers at this base.") | color(theme::kDim);
        if (sel) {
            const auto& st = sel->stats;
            const auto& in = sel->initial;
            const ItemDef* armor = findItem(sel->armor);
            detail = vbox({
                text(sel->name) | bold | color(theme::kAccent),
                text(std::string(soldierRankName(sel->rank)) + "  from " + nations()[sel->nation].name +
                     (sel->mercenary ? "  (mercenary)" : "")) | color(theme::kDim),
                text(""),
                statRow("Time Units", st.tu, in.tu, 100, theme::kInfo),
                statRow("Stamina", st.stamina, in.stamina, 120, theme::kWarn),
                statRow("Health", st.health, in.health, 80, theme::kBad),
                statRow("Bravery", st.bravery, in.bravery, 100, theme::kAccent),
                statRow("Reactions", st.reactions, in.reactions, 100, theme::kGood),
                statRow("Firing Accuracy", st.firing, in.firing, 120, theme::kGood),
                statRow("Throwing Acc.", st.throwing, in.throwing, 120, theme::kGood),
                statRow("Melee Accuracy", st.melee, in.melee, 120, theme::kGood),
                statRow("Strength", st.strength, in.strength, 80, theme::kWarn),
                statRow("Will", st.will, in.will, 100, Color::RGB(180, 120, 240)),
                text(""),
                text("Armour: " + (armor ? armor->name : std::string("none"))) | color(theme::kText),
                text("Carrying: " + loadoutSummary(*sel)) | color(theme::kText),
                text(fmt("Weight %d / Strength %d", loadoutWeight(sel->loadout), sel->stats.strength)) |
                    color(loadoutWeight(sel->loadout) > sel->stats.strength ? theme::kBad : theme::kDim),
            });
        }
        int h = std::max(5, app.height() - 8);
        return vbox({
                   header("SOLDIERS", fmt("%d at base", (int)ids_.size())),
                   hbox({panel("Roster", listView(cm_, list_, rows, h, [this, &app](int) { equip(app); })) | flex,
                         panel("Service record", detail) | size(WIDTH, EQUAL, 52)}) | flex,
                   hbox({button(cm_, "a", "Assign to craft", [this, &app] { assign(app); }), text(" "),
                         button(cm_, "e", "Equip", [this, &app] { equip(app); }), text(" "),
                         button(cm_, "n", "Rename", [this, &app] { rename(app); }), text(" "),
                         button(cm_, "d", "Dismiss", [this, &app] { dismiss(app); }), text(" "),
                         button(cm_, "\x1b", "Back", [&app] { app.pop(); })}),
               }) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        return listKeys(list_, e, (int)ids_.size(), [this, &app](int) { equip(app); });
    }

private:
    Soldier* selected(GameState& g) {
        if (ids_.empty()) return nullptr;
        return g.findSoldier(ids_[std::clamp(list_.selected, 0, (int)ids_.size() - 1)]);
    }

    // Cycles: no craft -> each transport at this base -> no craft.
    void assign(App& app) {
        GameState& g = *app.game;
        Soldier* s = selected(g);
        if (!s || s->inTransit) return;
        std::vector<int> transports;
        for (const auto& c : g.craft)
            if (c.baseId == baseId_ && craftType(c.type).soldiers > 0 && !c.airborne()) transports.push_back(c.id);
        if (transports.empty()) { app.error("No transport is docked at this base."); return; }
        auto it = std::find(transports.begin(), transports.end(), s->craftId);
        int next = it == transports.end() ? 0 : (int)(it - transports.begin()) + 1;
        while (next < (int)transports.size()) {
            const Craft* c = g.findCraft(transports[next]);
            if (soldiersAboard(g, c->id) < craftType(c->type).soldiers) break;
            ++next;
        }
        s->craftId = next < (int)transports.size() ? transports[next] : -1;
    }

    void equip(App& app) {
        if (Soldier* s = selected(*app.game)) app.push(makeEquip(s->id));
    }

    void rename(App& app) {
        Soldier* s = selected(*app.game);
        if (!s) return;
        int id = s->id;
        app.push(makeTextInput("Rename soldier", s->name, [id](App& a, const std::string& name) {
            if (Soldier* x = a.game->findSoldier(id)) x->name = name;
        }));
    }

    void dismiss(App& app) {
        Soldier* s = selected(*app.game);
        if (!s) return;
        int id = s->id;
        app.push(makeChoiceBox("Dismiss", "Dismiss " + s->name + "? Their equipment returns to stores.",
                               {{"y", "Dismiss", [id](App& a) {
                                     std::string err;
                                     if (!sackSoldier(*a.game, id, err)) a.error(err);
                                 }},
                                {"n", "Keep", {}}}));
    }

    int baseId_;
    ListState list_;
    std::vector<int> ids_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------
// Equipment between missions. Moving items here is free (no TU).
// ---------------------------------------------------------------------------

bool equippable(const ItemDef& d) {
    switch (d.kind) {
        case ItemKind::Firearm: case ItemKind::Ammo: case ItemKind::Grenade: case ItemKind::MeleeWeapon:
        case ItemKind::Medkit: case ItemKind::Equipment: return true;
        default: return false;
    }
}

class EquipScreen : public Screen {
public:
    explicit EquipScreen(int soldierId) : soldierId_(soldierId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        Soldier* s = g.findSoldier(soldierId_);
        Base* b = s ? g.findBase(s->baseId) : nullptr;
        if (!s || !b) return text("");

        // Soldier side, grouped by slot.
        std::vector<Element> carried;
        for (const auto& c : s->loadout) {
            const ItemDef& d = item(c.item.id);
            std::string extra;
            if (d.kind == ItemKind::Firearm) extra = c.item.ammoId.empty() ? " (empty)" : fmt(" (%d)", c.item.ammo);
            if (d.kind == ItemKind::Medkit) extra = fmt(" (%d uses)", c.item.ammo);
            carried.push_back(hbox({text(padRight(slotName(c.slot), 12)) | color(theme::kDim), text(d.name + extra)}));
        }
        // Base side.
        storeIds_.clear();
        std::vector<Element> stock;
        for (const auto& [id, n] : b->stores) {
            const ItemDef* d = findItem(id);
            if (!d || !equippable(*d)) continue;
            storeIds_.push_back(id);
            stock.push_back(hbox({text(padRight(d->name, 24)), text(fmt("%4d", n)) | color(theme::kDim),
                                  text(fmt("  size %d  wt %d", d->size, d->weight)) | color(theme::kDim)}));
        }
        const ItemDef* armor = findItem(s->armor);
        int weight = loadoutWeight(s->loadout);
        int h = std::max(5, app.height() - 10);
        return vbox({
                   header("EQUIP: " + s->name, armor ? armor->name : "no armour"),
                   hbox({
                       panel("Carried (Enter: return to stores)",
                             listView(cm_, carriedList_, carried, h, [this, &app](int i) { unequip(app, i); })) |
                           (leftFocus_ ? color(theme::kText) : dim) | flex,
                       panel("Base stores (Enter: equip)",
                             listView(cm_, storeList_, stock, h, [this, &app](int i) { equipItem(app, i); })) |
                           (leftFocus_ ? dim : color(theme::kText)) | flex,
                   }) | flex,
                   text(fmt("Weight %d / Strength %d%s", weight, s->stats.strength,
                            weight > s->stats.strength ? "  OVERLOADED: TU penalty" : "")) |
                       color(weight > s->stats.strength ? theme::kBad : theme::kDim),
                   hbox({button(cm_, "o", "Change armour", [this, &app] { cycleArmor(app); }), text(" "),
                         button(cm_, "f", "Refill ammo", [this, &app] { refill(app); }), text(" "),
                         button(cm_, "\t", "Switch side", [this] { leftFocus_ = !leftFocus_; }), text(" "),
                         button(cm_, "\x1b", "Done", [&app] { app.pop(); })}),
               }) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (e == Event::Tab) { leftFocus_ = !leftFocus_; return true; }
        if (cm_.handle(e)) return true;
        Soldier* s = app.game->findSoldier(soldierId_);
        if (!s) return false;
        if (leftFocus_) return listKeys(carriedList_, e, (int)s->loadout.size(), [this, &app](int i) { unequip(app, i); });
        return listKeys(storeList_, e, (int)storeIds_.size(), [this, &app](int i) { equipItem(app, i); });
    }

private:
    void equipItem(App& app, int i) {
        Soldier* s = app.game->findSoldier(soldierId_);
        Base* b = s ? app.game->findBase(s->baseId) : nullptr;
        if (!b || i < 0 || i >= (int)storeIds_.size()) return;
        const std::string id = storeIds_[i];
        const ItemDef& d = item(id);
        // Weapons go to the hands first; everything else to belt, legs, shoulders, backpack.
        std::vector<Slot> order = d.kind == ItemKind::Firearm || d.kind == ItemKind::MeleeWeapon
            ? std::vector<Slot>{Slot::RightHand, Slot::LeftHand, Slot::Backpack}
            : std::vector<Slot>{Slot::Belt, Slot::RightShoulder, Slot::LeftShoulder, Slot::RightLeg, Slot::LeftLeg,
                                Slot::Backpack, Slot::LeftHand, Slot::RightHand};
        for (Slot slot : order)
            if (canPlace(s->loadout, slot, id)) {
                b->removeItem(id);
                ItemInstance inst = makeItem(id);
                if (d.kind == ItemKind::Firearm) {
                    // Load it from stores if a clip is available.
                    inst.ammoId.clear();
                    inst.ammo = 0;
                    for (const auto& a : d.ammo)
                        if (b->removeItem(a)) { inst.ammoId = a; inst.ammo = item(a).clipSize; break; }
                }
                s->loadout.push_back({slot, inst});
                return;
            }
        app.error("No room: the soldier's slots are full.");
    }

    void unequip(App& app, int i) {
        Soldier* s = app.game->findSoldier(soldierId_);
        Base* b = s ? app.game->findBase(s->baseId) : nullptr;
        if (!b || i < 0 || i >= (int)s->loadout.size()) return;
        const ItemInstance& it = s->loadout[i].item;
        b->addItem(it.id);
        // A full (or nearly full) clip goes back to stores with the gun.
        if (!it.ammoId.empty() && it.ammo * 2 >= item(it.ammoId).clipSize) b->addItem(it.ammoId);
        s->loadout.erase(s->loadout.begin() + i);
    }

    void cycleArmor(App& app) {
        Soldier* s = app.game->findSoldier(soldierId_);
        Base* b = s ? app.game->findBase(s->baseId) : nullptr;
        if (!b) return;
        std::vector<std::string> options = {""};
        for (const auto& d : allItems())
            if (d.kind == ItemKind::Armor && (b->itemCount(d.id) > 0 || d.id == s->armor)) options.push_back(d.id);
        auto it = std::find(options.begin(), options.end(), s->armor);
        size_t next = it == options.end() ? 0 : (it - options.begin() + 1) % options.size();
        if (!s->armor.empty()) b->addItem(s->armor);
        s->armor = options[next];
        if (!s->armor.empty()) b->removeItem(s->armor);
    }

    void refill(App& app) {
        Soldier* s = app.game->findSoldier(soldierId_);
        Base* b = s ? app.game->findBase(s->baseId) : nullptr;
        if (!b) return;
        for (auto& c : s->loadout) {
            const ItemDef& d = item(c.item.id);
            if (d.kind != ItemKind::Firearm) continue;
            if (!c.item.ammoId.empty() && c.item.ammo >= item(c.item.ammoId).clipSize) continue;
            for (const auto& a : d.ammo)
                if (b->removeItem(a)) { c.item.ammoId = a; c.item.ammo = item(a).clipSize; break; }
        }
    }

    int soldierId_;
    bool leftFocus_ = false;
    ListState carriedList_, storeList_;
    std::vector<std::string> storeIds_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makeSoldiers(int baseId) { return std::make_unique<SoldiersScreen>(baseId); }
std::unique_ptr<Screen> makeEquip(int soldierId) { return std::make_unique<EquipScreen>(soldierId); }

} // namespace vamps

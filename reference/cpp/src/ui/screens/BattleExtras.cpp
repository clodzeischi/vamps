// In-battle inventory (moving items costs TU) and the post-mission debriefing.
#include "core/Format.h"
#include "tactical/Battle.h"
#include "tactical/Debriefing.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

const Slot kDestinations[] = {Slot::Ground, Slot::RightHand, Slot::LeftHand, Slot::Belt, Slot::Backpack,
                              Slot::RightLeg, Slot::LeftLeg, Slot::RightShoulder, Slot::LeftShoulder};

std::string itemLabel(const ItemInstance& it) {
    const ItemDef& d = item(it.id);
    std::string s = d.name;
    if (d.kind == ItemKind::Firearm) s += it.ammoId.empty() ? " (empty)" : fmt(" (%d)", it.ammo);
    if (d.kind == ItemKind::Ammo) s += fmt(" (%d)", it.ammo);
    if (d.kind == ItemKind::Medkit) s += fmt(" (%d uses)", it.ammo);
    if (d.kind == ItemKind::Grenade && it.fuse >= 0) s += fmt(" PRIMED %d", it.fuse);
    return s;
}

class BattleInventory : public Screen {
public:
    BattleInventory(Battle& b, int unitId) : battle_(b), unitId_(unitId) {}
    bool isOverlay() const override { return true; }

    Element render(App& app) override {
        cm_.clear();
        BattleUnit* u = battle_.unitById(unitId_);
        if (!u) return text("");
        // Rows: carried items, then items on the ground.
        entries_.clear();
        std::vector<Element> rows;
        for (int i = 0; i < (int)u->inv.size(); ++i) {
            entries_.push_back({false, i});
            rows.push_back(hbox({text(padRight(slotName(u->inv[i].slot), 12)) | color(theme::kDim),
                                 text(itemLabel(u->inv[i].item)) | color(theme::kText)}));
        }
        auto& ground = battle_.map.at(u->pos).items;
        for (int i = 0; i < (int)ground.size(); ++i) {
            entries_.push_back({true, i});
            rows.push_back(hbox({text(padRight("Ground", 12)) | color(theme::kWarn), text(itemLabel(ground[i])) | color(theme::kText)}));
        }

        // Destination buttons with their TU cost for the selected item.
        Elements dest;
        Slot from = Slot::Ground;
        bool have = !entries_.empty();
        if (have) {
            const auto& e = entries_[std::clamp(list_.selected, 0, (int)entries_.size() - 1)];
            from = e.ground ? Slot::Ground : u->inv[e.index].slot;
        }
        for (int k = 0; k < 9; ++k) {
            Slot to = kDestinations[k];
            int cost = slotMoveCost(from, to);
            dest.push_back(button(cm_, std::to_string(k), fmt("%-12s %2d TU", slotName(to), cost),
                                  [this, k] { moveSelected(kDestinations[k]); }, have && to != from));
        }
        return panel("Inventory: " + u->name,
                     vbox({text(fmt("TU %d / %d    Weight %d / Strength %d", u->tu, u->maxTu(), loadoutWeight(u->inv),
                                    u->strengthTotal())) | color(theme::kAccent),
                           hbox({listView(cm_, list_, rows, 14, {}) | size(WIDTH, EQUAL, 44), separator(),
                                 vbox({text("Move selected item to:") | color(theme::kDim), vbox(std::move(dest))})}),
                           separator(),
                           hbox({button(cm_, "p", "Prime grenade (fuse 0)", [this] { prime(0); }), text(" "),
                                 button(cm_, "P", "Fuse 1", [this] { prime(1); }), text(" "),
                                 button(cm_, "\x1b", "Close", [&app] { app.pop(); })}),
                           text(battle_.lastError.empty() ? "" : "! " + battle_.lastError) | color(theme::kBad)}) |
                         size(WIDTH, GREATER_THAN, 80)) |
               bgcolor(theme::kPanelBg);
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        if (e == Event::Escape || e == Event::Character('i')) { app.pop(); return true; }
        listKeys(list_, e, (int)entries_.size(), {});
        return true;
    }

private:
    struct Entry { bool ground; int index; };

    void moveSelected(Slot to) {
        BattleUnit* u = battle_.unitById(unitId_);
        if (!u || entries_.empty()) return;
        const Entry e = entries_[std::clamp(list_.selected, 0, (int)entries_.size() - 1)];
        battle_.lastError.clear();
        if (e.ground) {
            if (to != Slot::Ground) battle_.pickUp(*u, e.index, to);
        } else {
            battle_.moveItem(*u, e.index, to);
        }
    }

    void prime(int fuse) {
        BattleUnit* u = battle_.unitById(unitId_);
        if (!u || entries_.empty()) return;
        const Entry e = entries_[std::clamp(list_.selected, 0, (int)entries_.size() - 1)];
        if (e.ground) return;
        Slot s = u->inv[e.index].slot;
        if (!isHand(s)) { battle_.lastError = "Move the grenade to a hand first."; return; }
        battle_.primeGrenade(*u, s, fuse);
    }

    Battle& battle_;
    int unitId_;
    ListState list_;
    std::vector<Entry> entries_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------

class DebriefScreen : public Screen {
public:
    explicit DebriefScreen(Debriefing d) : d_(std::move(d)) {}

    Element render(App& app) override {
        cm_.clear();
        Elements loot;
        for (const auto& [name, n] : d_.recovered) loot.push_back(text(fmt("%4d  %s", n, name.c_str())) | color(theme::kText));
        if (loot.empty()) loot.push_back(text("Nothing.") | color(theme::kDim));
        Elements lines;
        for (const auto& l : d_.lines) lines.push_back(paragraph(l) | color(theme::kText));
        Elements soldiers;
        for (const auto& s : d_.soldiers)
            soldiers.push_back(paragraph(s) | color(s.find("ACTION") != std::string::npos ? theme::kBad : theme::kText));
        bool good = d_.outcome == BattleOutcome::Victory;
        return vbox({header("DEBRIEFING", fmt("Score %+d", d_.score)),
                     text(d_.title) | bold | color(good ? theme::kGood : theme::kBad) | center,
                     hbox({panel("Recovered", vbox(std::move(loot))) | flex, panel("Consequences", vbox(std::move(lines))) | flex}),
                     panel("Squad", vbox(std::move(soldiers))) | flex,
                     button(cm_, "\n", "Return to the Geoscape", [&app] { app.pop(); }) | center}) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (e == Event::Escape || e == Event::Character(' ')) { app.pop(); return true; }
        return cm_.handle(e);
    }

private:
    Debriefing d_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makeBattleInventory(Battle& b, int unitId) { return std::make_unique<BattleInventory>(b, unitId); }
std::unique_ptr<Screen> makeDebrief(const Debriefing& d) { return std::make_unique<DebriefScreen>(d); }

} // namespace vamps

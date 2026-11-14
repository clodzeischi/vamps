// Aircraft hangar, open market, black market and transfers.
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

Element tabs(ClickMap& cm, int& current, std::vector<std::string> names) {
    Elements out;
    for (int i = 0; i < (int)names.size(); ++i) {
        int* cur = &current;
        Element b = button(cm, std::to_string(i + 1), names[i], [cur, i] { *cur = i; });
        out.push_back(i == current ? b | inverted : b);
        out.push_back(text("  "));
    }
    return hbox(std::move(out));
}

// ---------------------------------------------------------------------------
// Hangar
// ---------------------------------------------------------------------------
class CraftScreen : public Screen {
public:
    explicit CraftScreen(int baseId) : baseId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        ids_.clear();
        std::vector<Element> rows;
        for (const auto& c : g.craft) {
            if (c.baseId != baseId_) continue;
            ids_.push_back(c.id);
            const CraftDef& d = craftType(c.type);
            rows.push_back(hbox({text(padRight(c.name, 12)) | color(theme::kAccent), text(padRight(d.name, 20)),
                                 text(padRight(craftStatusName(c.status), 11)),
                                 text(fmt("hull %3d/%-3d fuel %4.1f/%-4.1f", c.hp, d.hp, c.fuel, d.fuelHours))}));
        }
        Craft* c = selected(g);
        Elements detail;
        if (c) {
            const CraftDef& d = craftType(c->type);
            detail.push_back(text(c->name + " - " + d.name) | bold | color(theme::kAccent));
            detail.push_back(paragraph(d.description) | color(theme::kDim));
            detail.push_back(text(fmt("Speed %d knots   Endurance %.1f h   Rent %s/month", d.speed, d.fuelHours,
                                      money(d.rent).c_str())) | color(theme::kText));
            if (d.soldiers > 0) detail.push_back(text(fmt("Soldiers aboard: %d / %d (assign them on the Soldiers screen)",
                                                          soldiersAboard(g, c->id), d.soldiers)) | color(theme::kText));
            for (int i = 0; i < (int)c->weapons.size(); ++i) {
                const auto& w = c->weapons[i];
                std::string desc = w.id.empty() ? "(empty)" : fmt("%s  ammo %d/%d", item(w.id).name.c_str(), w.ammo,
                                                                  item(w.id).craftAmmoCapacity);
                detail.push_back(button(cm_, std::to_string(i + 1), fmt("Hardpoint %d: %s", i + 1, desc.c_str()),
                                        [this, &app, i] { cycleWeapon(app, i); }, !c->airborne()));
            }
        }
        return vbox({header("HANGARS", money(g.funds)),
                     panel("Aircraft", listView(cm_, list_, rows, 8, {})),
                     panel("Details", vbox(std::move(detail))) | flex,
                     hbox({text("Hardpoint keys cycle weapons from stores.  ") | color(theme::kDim),
                           button(cm_, "\x1b", "Back", [&app] { app.pop(); })})}) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        return listKeys(list_, e, (int)ids_.size(), {});
    }

private:
    Craft* selected(GameState& g) {
        if (ids_.empty()) return nullptr;
        return g.findCraft(ids_[std::clamp(list_.selected, 0, (int)ids_.size() - 1)]);
    }

    void cycleWeapon(App& app, int slot) {
        GameState& g = *app.game;
        Craft* c = selected(g);
        Base* b = g.findBase(baseId_);
        if (!c || !b || c->airborne()) return;
        std::vector<std::string> options = {""};
        for (const auto& d : allItems())
            if (d.kind == ItemKind::CraftWeapon && (b->itemCount(d.id) > 0 || d.id == c->weapons[slot].id)) options.push_back(d.id);
        auto it = std::find(options.begin(), options.end(), c->weapons[slot].id);
        size_t next = it == options.end() ? 0 : (it - options.begin() + 1) % options.size();
        if (!c->weapons[slot].id.empty()) b->addItem(c->weapons[slot].id);
        c->weapons[slot] = {options[next], 0};
        if (!options[next].empty()) {
            b->removeItem(options[next]);
            c->status = CraftStatus::Rearming;
        }
    }

    int baseId_;
    ListState list_;
    std::vector<int> ids_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------
// Open market: buy, hire, sell
// ---------------------------------------------------------------------------
class Market : public Screen {
public:
    explicit Market(int baseId) : baseId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        Base* b = g.findBase(baseId_);
        cm_.clear();
        if (!b) return text("");
        rows_.clear();
        actions_.clear();
        int q = qty_;
        int id = baseId_;
        if (tab_ == 0) {
            for (const auto& d : allItems()) {
                if (d.buyCost <= 0) continue;
                rows_.push_back(hbox({text(padRight(d.name, 26)), text(padLeft(money(d.buyCost), 12)) | color(theme::kAccent),
                                      text(fmt("   in stores %d", b->itemCount(d.id))) | color(theme::kDim)}));
                std::string itemId = d.id;
                actions_.push_back([itemId, id, q](App& a) {
                    std::string err;
                    if (Base* bb = a.game->findBase(id); !bb || !buyItem(*a.game, *bb, itemId, q, err)) a.error(err);
                });
            }
        } else if (tab_ == 1) {
            auto hireRow = [&](const std::string& name, int cost, std::function<bool(App&, Base&, std::string&)> fn) {
                rows_.push_back(hbox({text(padRight(name, 26)), text(padLeft(money(cost), 12)) | color(theme::kAccent)}));
                actions_.push_back([fn, id, q](App& a) {
                    std::string err;
                    Base* bb = a.game->findBase(id);
                    if (!bb) return;
                    for (int i = 0; i < q; ++i)
                        if (!fn(a, *bb, err)) { a.error(err); return; }
                });
            };
            hireRow("Soldier (arrives in 1-3 days)", kSoldierHireCost, [](App& a, Base& bb, std::string& e) { return hireSoldier(*a.game, bb, e); });
            hireRow("Scientist", kScientistHireCost, [](App& a, Base& bb, std::string& e) { return hireScientists(*a.game, bb, 1, e); });
            hireRow("Engineer", kEngineerHireCost, [](App& a, Base& bb, std::string& e) { return hireEngineers(*a.game, bb, 1, e); });
            for (const auto& c : craftTypes()) {
                std::string type = c.id;
                rows_.push_back(hbox({text(padRight("Lease " + c.name, 26)), text(padLeft(money(c.rent), 12)) | color(theme::kAccent),
                                      text("  per month") | color(theme::kDim)}));
                actions_.push_back([type, id](App& a) {
                    std::string err;
                    if (Base* bb = a.game->findBase(id); !bb || !buyCraft(*a.game, *bb, type, err)) a.error(err);
                });
            }
        } else {
            for (const auto& [itemId, n] : b->stores) {
                const ItemDef* d = findItem(itemId);
                if (!d || d->sellPrice <= 0) continue;
                rows_.push_back(hbox({text(padRight(d->name, 26)), text(fmt("%5d", n)) | color(theme::kDim),
                                      text(padLeft(money(d->sellPrice), 12)) | color(theme::kAccent)}));
                std::string iid = itemId;
                actions_.push_back([iid, id, q](App& a) {
                    std::string err;
                    Base* bb = a.game->findBase(id);
                    int n = bb ? std::min(q, bb->itemCount(iid)) : 0;
                    if (!bb || !sellItem(*a.game, *bb, iid, n, err)) a.error(err);
                });
            }
        }
        auto activate = [this, &app](int i) { if (i < (int)actions_.size()) actions_[i](app); };
        return vbox({header("MARKET: " + b->name, money(g.funds)),
                     tabs(cm_, tab_, {"Buy", "Hire & lease", "Sell"}),
                     panel(tab_ == 2 ? "Stores (Enter: sell)" : "Enter / double-click to order",
                           listView(cm_, list_, rows_, std::max(5, app.height() - 9), activate)) | flex,
                     hbox({text(fmt("Quantity: %d  ", qty_)) | color(theme::kAccent),
                           button(cm_, "+", "x10", [this] { qty_ = std::min(999, qty_ * 10); }), text(" "),
                           button(cm_, "-", "/10", [this] { qty_ = std::max(1, qty_ / 10); }), text(" "),
                           button(cm_, ">", "+1", [this] { qty_ = std::min(999, qty_ + 1); }), text(" "),
                           button(cm_, "<", "-1", [this] { qty_ = std::max(1, qty_ - 1); }), text("   "),
                           button(cm_, "\x1b", "Back", [&app] { app.pop(); })})}) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        int before = tab_;
        if (cm_.handle(e)) { if (tab_ != before) list_ = {}; return true; }
        return listKeys(list_, e, (int)actions_.size(), [this, &app](int i) { actions_[i](app); });
    }

private:
    int baseId_;
    int tab_ = 0;
    int qty_ = 1;
    ListState list_;
    std::vector<Element> rows_;
    std::vector<std::function<void(App&)>> actions_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------
// Black market
// ---------------------------------------------------------------------------
class BlackMarket : public Screen {
public:
    explicit BlackMarket(int baseId) : baseId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        Base* b = g.findBase(baseId_);
        cm_.clear();
        if (!b) return text("");
        rows_.clear();
        actions_.clear();
        int id = baseId_;
        if (tab_ == 0) {
            for (int i = 0; i < (int)g.blackMarket.size(); ++i) {
                const auto& o = g.blackMarket[i];
                std::string name = o.mercenary
                    ? fmt("Mercenary: %s (TU %d, Acc %d, React %d)", o.merc.name.c_str(), o.merc.stats.tu, o.merc.stats.firing,
                          o.merc.stats.reactions)
                    : fmt("%s  x%d", item(o.itemId).name.c_str(), o.quantity);
                rows_.push_back(hbox({text(padRight(name, 52)), text(padLeft(money(o.price), 12)) | color(theme::kWarn)}));
                actions_.push_back([i, id](App& a) {
                    std::string err;
                    if (Base* bb = a.game->findBase(id); !bb || !buyBlackMarket(*a.game, *bb, i, err)) a.error(err);
                });
            }
        } else {
            for (const auto& [itemId, n] : b->stores) {
                int price = blackMarketSellPrice(g, itemId);
                if (price <= 0) continue;
                rows_.push_back(hbox({text(padRight(item(itemId).name, 30)), text(fmt("%5d", n)) | color(theme::kDim),
                                      text(padLeft(money(price), 12)) | color(theme::kWarn),
                                      text(fmt("  (market %s)", money(item(itemId).sellPrice).c_str())) | color(theme::kDim)}));
                std::string iid = itemId;
                actions_.push_back([iid, id](App& a) {
                    std::string err;
                    if (Base* bb = a.game->findBase(id); !bb || !sellBlackMarket(*a.game, *bb, iid, 1, err)) a.error(err);
                });
            }
        }
        auto activate = [this, &app](int i) { if (i < (int)actions_.size()) actions_[i](app); };
        return vbox({header("BLACK MARKET", money(g.funds)),
                     paragraph("Every deal costs 1 secrecy, and there is a 10% chance a contact is caught and talks "
                               "(-5 more). Stock changes every month.") | color(theme::kWarn),
                     tabs(cm_, tab_, {"Buy", "Sell (premium prices)"}),
                     panel("Enter / double-click to deal", listView(cm_, list_, rows_, std::max(5, app.height() - 10), activate)) | flex,
                     hbox({text(fmt("Secrecy %.0f   ", g.secrecy)) | color(theme::kDim),
                           button(cm_, "\x1b", "Back", [&app] { app.pop(); })})}) |
               bgcolor(Color::RGB(10, 6, 6));
    }

    bool onEvent(App& app, Event e) override {
        int before = tab_;
        if (cm_.handle(e)) { if (tab_ != before) list_ = {}; return true; }
        return listKeys(list_, e, (int)actions_.size(), [this, &app](int i) { actions_[i](app); });
    }

private:
    int baseId_;
    int tab_ = 0;
    ListState list_;
    std::vector<Element> rows_;
    std::vector<std::function<void(App&)>> actions_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------
// Transfers between bases
// ---------------------------------------------------------------------------
class TransferScreen : public Screen {
public:
    explicit TransferScreen(int baseId) : fromId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        Base* from = g.findBase(fromId_);
        if (!from) return text("");
        if (!g.findBase(toId_) || toId_ == fromId_) {
            toId_ = -1;
            for (const auto& b : g.bases)
                if (b.id != fromId_) { toId_ = b.id; break; }
        }
        Base* to = g.findBase(toId_);
        if (!to) return vbox({text("No other base."), button(cm_, "\x1b", "Back", [&app] { app.pop(); })});

        rows_.clear();
        actions_.clear();
        int fid = fromId_, tid = toId_, q = qty_;
        if (tab_ == 0) {
            for (const auto& [itemId, n] : from->stores) {
                rows_.push_back(hbox({text(padRight(item(itemId).name, 30)), text(fmt("%5d", n)) | color(theme::kDim)}));
                std::string iid = itemId;
                actions_.push_back([iid, fid, tid, q](App& a) {
                    Base* f = a.game->findBase(fid); Base* t = a.game->findBase(tid);
                    std::string err;
                    if (f && t && !transferItem(*a.game, *f, *t, iid, std::min(q, f->itemCount(iid)), err)) a.error(err);
                });
            }
        } else if (tab_ == 1) {
            rows_.push_back(text(fmt("Scientists (idle %d)", from->scientistsFree())));
            actions_.push_back([fid, tid, q](App& a) {
                Base* f = a.game->findBase(fid); Base* t = a.game->findBase(tid);
                std::string err;
                if (f && t && !transferScientists(*a.game, *f, *t, q, err)) a.error(err);
            });
            rows_.push_back(text(fmt("Engineers (idle %d)", from->engineersFree())));
            actions_.push_back([fid, tid, q](App& a) {
                Base* f = a.game->findBase(fid); Base* t = a.game->findBase(tid);
                std::string err;
                if (f && t && !transferEngineers(*a.game, *f, *t, q, err)) a.error(err);
            });
            for (const auto& s : g.soldiers) {
                if (s.baseId != fromId_ || s.inTransit) continue;
                rows_.push_back(text("Soldier: " + s.name));
                int sid = s.id;
                actions_.push_back([sid, tid](App& a) {
                    std::string err;
                    if (Base* t = a.game->findBase(tid); t && !transferSoldier(*a.game, sid, *t, err)) a.error(err);
                });
            }
        } else if (tab_ == 2) {
            for (const auto& c : g.craft) {
                if (c.baseId != fromId_) continue;
                rows_.push_back(text(c.name + "  " + craftStatusName(c.status)));
                int cid = c.id;
                actions_.push_back([cid, tid](App& a) {
                    std::string err;
                    if (Base* t = a.game->findBase(tid); t && !transferCraft(*a.game, cid, *t, err)) a.error(err);
                });
            }
        } else {
            for (int i = 0; i < (int)from->captives.size(); ++i) {
                const auto& c = from->captives[i];
                rows_.push_back(text(std::string(enemyRankName(c.rank)) + " of " + bloodline(c.bloodline).name));
                actions_.push_back([i, fid, tid](App& a) {
                    Base* f = a.game->findBase(fid); Base* t = a.game->findBase(tid);
                    std::string err;
                    if (f && t && !transferCaptive(*a.game, *f, *t, i, err)) a.error(err);
                });
            }
        }
        auto activate = [this, &app](int i) { if (i < (int)actions_.size()) actions_[i](app); };
        return vbox({header("TRANSFER", fmt("%s -> %s  (%.0f hours)", from->name.c_str(), to->name.c_str(),
                                            transferSeconds(*from, *to) / 3600.0)),
                     tabs(cm_, tab_, {"Items", "Personnel", "Aircraft", "Captives"}),
                     panel("Enter / double-click to send", listView(cm_, list_, rows_, std::max(5, app.height() - 9), activate)) | flex,
                     hbox({text(fmt("Quantity %d  ", qty_)) | color(theme::kAccent),
                           button(cm_, ">", "+1", [this] { qty_ = std::min(999, qty_ + 1); }), text(" "),
                           button(cm_, "<", "-1", [this] { qty_ = std::max(1, qty_ - 1); }), text(" "),
                           button(cm_, "+", "x10", [this] { qty_ = std::min(999, qty_ * 10); }), text(" "),
                           button(cm_, "d", "Change destination", [this, &app] { nextDest(app); }), text("  "),
                           button(cm_, "\x1b", "Back", [&app] { app.pop(); })})}) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        int before = tab_;
        if (cm_.handle(e)) { if (tab_ != before) list_ = {}; return true; }
        return listKeys(list_, e, (int)actions_.size(), [this, &app](int i) { actions_[i](app); });
    }

private:
    void nextDest(App& app) {
        auto& bases = app.game->bases;
        for (size_t k = 0; k < bases.size(); ++k)
            if (bases[k].id == toId_) {
                for (size_t step = 1; step <= bases.size(); ++step) {
                    const Base& cand = bases[(k + step) % bases.size()];
                    if (cand.id != fromId_) { toId_ = cand.id; return; }
                }
            }
    }

    int fromId_, toId_ = -1;
    int tab_ = 0, qty_ = 1;
    ListState list_;
    std::vector<Element> rows_;
    std::vector<std::function<void(App&)>> actions_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makeCraftScreen(int baseId) { return std::make_unique<CraftScreen>(baseId); }
std::unique_ptr<Screen> makeMarket(int baseId) { return std::make_unique<Market>(baseId); }
std::unique_ptr<Screen> makeBlackMarket(int baseId) { return std::make_unique<BlackMarket>(baseId); }
std::unique_ptr<Screen> makeTransfer(int baseId) { return std::make_unique<TransferScreen>(baseId); }

} // namespace vamps

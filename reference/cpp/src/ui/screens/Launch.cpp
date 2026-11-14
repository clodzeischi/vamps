// Choose which aircraft to send to a target.
#include "core/Format.h"
#include "data/Craft.h"
#include "strategy/Simulation.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

class Launch : public Screen {
public:
    Launch(CraftTarget t, int id, LatLon wp) : target_(t), targetId_(id), waypoint_(wp) {}
    bool isOverlay() const override { return true; }

    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        LatLon where = waypoint_;
        std::string what = "No target: pick a craft, then a target on the globe.";
        if (target_ == CraftTarget::Hunt) {
            if (Hunt* h = g.findHunt(targetId_)) { where = h->pos; what = "Target: " + huntCraft(h->craftType).name; }
        } else if (target_ == CraftTarget::Site) {
            if (MissionSite* s = g.findSite(targetId_)) { where = s->pos; what = "Target: " + s->label; }
        } else if (target_ == CraftTarget::Waypoint) {
            what = fmt("Target: waypoint %.1f, %.1f", where.lat, where.lon);
        }

        craftIds_.clear();
        std::vector<Element> rows;
        for (const auto& c : g.craft) {
            const CraftDef& d = craftType(c.type);
            Base* b = g.findBase(c.baseId);
            double dist = distanceNm(c.pos, where);
            std::string eta = target_ == CraftTarget::None ? "" : fmt("%5.1fh", dist / d.speed);
            std::string crew = d.soldiers > 0 ? fmt("%2d/%-2d", soldiersAboard(g, c.id), d.soldiers) : "  -  ";
            rows.push_back(hbox({
                text(padRight(c.name, 11)) | color(theme::kAccent),
                text(padRight(b ? b->name : "?", 12)),
                text(padRight(craftStatusName(c.status), 11)),
                text(fmt("fuel %4.1fh ", c.fuel)),
                text("crew " + crew + " "),
                text(eta),
            }));
            craftIds_.push_back(c.id);
        }
        auto activate = [this, &app](int i) { launch(app, i); };
        return panel("Launch Craft",
                     vbox({text(what) | color(theme::kText),
                           text("  Craft      Base        Status     Fuel       Crew    ETA") | color(theme::kDim),
                           listView(cm_, list_, rows, 12, activate),
                           text(""),
                           hbox({button(cm_, "\n", "Launch", [this, &app] { launch(app, list_.selected); },
                                        target_ != CraftTarget::None && !craftIds_.empty()),
                                 text("  "),
                                 button(cm_, "r", "Recall", [this, &app] {
                                     if (list_.selected < (int)craftIds_.size()) recallCraft(*app.game, craftIds_[list_.selected]);
                                 }),
                                 text("  "), button(cm_, "\x1b", "Close", [&app] { app.pop(); })})}) |
                         size(WIDTH, GREATER_THAN, 70)) |
               bgcolor(theme::kPanelBg);
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        if (listKeys(list_, e, (int)craftIds_.size(), [this, &app](int i) { launch(app, i); })) return true;
        if (e == Event::Escape) { app.pop(); return true; }
        return true;
    }

private:
    void launch(App& app, int i) {
        if (target_ == CraftTarget::None || i < 0 || i >= (int)craftIds_.size()) return;
        std::string err;
        if (launchCraft(*app.game, craftIds_[i], target_, targetId_, waypoint_, err)) app.pop();
        else app.error(err);
    }

    CraftTarget target_;
    int targetId_;
    LatLon waypoint_;
    ClickMap cm_;
    ListState list_;
    std::vector<int> craftIds_;
};

} // namespace

std::unique_ptr<Screen> makeLaunch(CraftTarget t, int id, const LatLon& wp) { return std::make_unique<Launch>(t, id, wp); }

} // namespace vamps

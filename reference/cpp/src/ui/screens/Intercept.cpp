// The interception window: one simulated second per frame.
#include "core/Format.h"
#include "data/Craft.h"
#include "data/Items.h"
#include "strategy/Interception.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

class Intercept : public Screen {
public:
    Intercept(int craftId, int huntId) : craftId_(craftId), huntId_(huntId) {}
    bool isOverlay() const override { return true; }

    Element render(App& app) override {
        GameState& g = *app.game;
        if (!started_) { fight_ = startDogfight(g, craftId_, huntId_); started_ = true; }
        cm_.clear();
        Craft* c = g.findCraft(craftId_);
        Hunt* h = g.findHunt(huntId_);

        // Range strip: our craft on the left, the target placed by distance.
        const int strip = 50;
        int pos = std::clamp((int)(fight_.distanceKm / 60.0 * strip), 1, strip - 1);
        std::string bar(strip, '-');
        bar[0] = '>';
        bar[pos] = 'X';
        Elements weapons;
        if (c)
            for (const auto& w : c->weapons) {
                if (w.id.empty()) { weapons.push_back(text("  (empty hardpoint)") | color(theme::kDim)); continue; }
                const ItemDef& d = item(w.id);
                bool inRange = fight_.distanceKm <= d.craftRangeKm;
                weapons.push_back(text(fmt("  %-20s range %2d km  ammo %3d", d.name.c_str(), d.craftRangeKm, w.ammo)) |
                                  color(inRange ? theme::kGood : theme::kDim));
            }
        Elements log;
        int start = std::max(0, (int)fight_.log.size() - 8);
        for (int i = start; i < (int)fight_.log.size(); ++i) log.push_back(text(fight_.log[i]) | color(theme::kText));

        Elements stances;
        for (int s = 0; s < 5; ++s) {
            Element b = button(cm_, std::to_string(s + 1), stanceName((Stance)s), [this, s] { fight_.stance = (Stance)s; },
                               fight_.result == DogfightResult::Ongoing);
            stances.push_back(fight_.stance == (Stance)s ? b | inverted : b);
            stances.push_back(text(" "));
        }

        const HuntCraftDef* hd = h ? &huntCraft(h->craftType) : nullptr;
        bool over = fight_.result != DogfightResult::Ongoing;
        return panel("Interception",
                     vbox({
                         hbox({text(c ? c->name : "?") | color(theme::kInfo) | bold, filler(),
                               text(hd ? hd->name : "target lost") | color(theme::kBad) | bold}),
                         hbox({text("Hull "), c ? meter(c->hp, craftType(c->type).hp, 15, theme::kGood) : text(""), filler(),
                               text("Damage "), h && hd ? meter(hd->hp - h->hp, hd->hp / 2, 15, theme::kBad) : text("")}),
                         text(""),
                         text(bar) | color(theme::kAccent),
                         text(fmt("Range %.1f km", fight_.distanceKm)) | center,
                         text(""),
                         vbox(std::move(weapons)),
                         text(""),
                         vbox(std::move(log)) | size(HEIGHT, EQUAL, 8),
                         separator(),
                         over ? button(cm_, "\n", "Close", [this, &app] { close(app); }) : hflow(std::move(stances)),
                     }) | size(WIDTH, EQUAL, 64)) |
               bgcolor(theme::kPanelBg);
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        if (e == Event::Escape && fight_.result == DogfightResult::Ongoing) { fight_.stance = Stance::Disengage; return true; }
        return true;
    }

    void onTick(App& app, double) override {
        if (started_ && fight_.result == DogfightResult::Ongoing) stepDogfight(*app.game, fight_);
    }

private:
    void close(App& app) {
        finishDogfight(*app.game, fight_);
        app.pop();
    }

    int craftId_, huntId_;
    bool started_ = false;
    Dogfight fight_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makeIntercept(int craftId, int huntId) { return std::make_unique<Intercept>(craftId, huntId); }

} // namespace vamps

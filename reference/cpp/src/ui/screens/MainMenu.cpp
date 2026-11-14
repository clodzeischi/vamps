// Title screen, difficulty selection and base placement.
#include <ftxui/component/mouse.hpp>

#include "core/Format.h"
#include "data/Difficulty.h"
#include "strategy/Campaign.h"
#include "strategy/Economy.h"
#include "strategy/SaveGame.h"
#include "ui/GlobeView.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

const char* kTitleArt[] = {
    "  ##   ##   ####   ##   ##  #####   ######",
    "  ##   ##  ##  ##  ### ###  ##  ##  ##    ",
    "  ##   ##  ######  ## # ##  #####   ######",
    "   ## ##   ##  ##  ##   ##  ##          ##",
    "    ###    ##  ##  ##   ##  ##      ######",
};

class MainMenu : public Screen {
public:
    Element render(App& app) override {
        cm_.clear();
        Elements art;
        for (const char* line : kTitleArt) art.push_back(text(line) | color(theme::kTitle) | bold);
        auto newGame = [&app] {
            std::vector<Choice> choices;
            for (int d = 0; d < 3; ++d) {
                const auto& def = difficulty((Difficulty)d);
                choices.push_back({std::to_string(d + 1), def.name, [d](App& a) {
                                       a.push(makeBasePlacement((Difficulty)d));
                                   }});
            }
            app.push(makeChoiceBox(
                "Difficulty",
                "EASY: generous funding, fast research, frequent lucky breaks.\n"
                "NORMAL: as intended.\n"
                "HARD: little money, slow and painful research, rare good fortune, more and tougher enemies.",
                choices));
        };
        return vbox({
                   filler(),
                   vbox(std::move(art)) | center,
                   text("C A T H A R   P R O T O C O L") | color(theme::kAccent) | center,
                   text(""),
                   text("Since 1244 they have hidden in plain sight. Burn them.") | color(theme::kDim) | center,
                   text(""),
                   vbox({
                       button(cm_, "n", "New campaign", newGame),
                       button(cm_, "l", "Load campaign", [&app] { app.push(makeSaveLoad(false)); }),
                       button(cm_, "q", "Quit", [&app] { app.quit(); }),
                   }) | center,
                   filler(),
                   text("Mouse and keyboard both work. Press the key in [brackets].") | color(theme::kDim) | center,
               }) |
               bgcolor(Color::RGB(6, 4, 8));
    }

    bool onEvent(App& app, Event e) override { return cm_.handle(e); }

private:
    ClickMap cm_;
};

// ---------------------------------------------------------------------------

class BasePlacement : public Screen {
public:
    explicit BasePlacement(Difficulty d) : difficulty_(d) {}

    Element render(App& app) override {
        cm_.clear();
        int w = std::max(20, app.width() - 34), h = std::max(10, app.height() - 2);
        auto grid = globe_.render(app.game.get(), w, h);
        // Crosshair at the centre: Enter picks the point under it.
        grid->put(w / 2, h / 2, "+", {255, 255, 255}, grid->at(w / 2, h / 2).bg, true);
        centre_ = {w / 2, h / 2};
        Element map = cm_.area(gridElement(grid), ClickHandlers{
            [this] { clickPending_ = true; },
            {},
            [this] { globe_.zoomBy(1.25); },
            [this] { globe_.zoomBy(0.8); },
        });
        mapBox_ = cm_.lastBox();

        std::string where = "-";
        if (picked_) {
            int n = world().nationAt(*picked_);
            where = fmt("%.1f, %.1f", picked_->lat, picked_->lon) + "  " +
                    (n >= 0 ? nations()[n].name : std::string(world().isLand(*picked_) ? "unclaimed land" : "sea"));
        }
        bool newCampaign = !app.game;
        std::string cost = newCampaign ? "free (first base)"
                                       : money(kNewBaseCost + facilityCost(*app.game, FacilityType::AccessLift));
        Element side = vbox({
            header(newCampaign ? "FOUND THE AGENCY" : "NEW BASE"),
            text(""),
            paragraph(newCampaign ? "Choose the location of your first base. Its listening post will cover 1500 nm: "
                                    "put it where the bloodlines will fly."
                                  : "Choose a location for the new base.") |
                color(theme::kText),
            text(""),
            text("Location: ") | color(theme::kDim),
            paragraph(where) | color(theme::kAccent),
            text("Cost: " + cost) | color(theme::kDim),
            text(""),
            button(cm_, "\n", picked_ ? "Build here" : "Pick the crosshair", [this, &app] {
                if (!picked_) picked_ = globe_.pick(centre_.first, centre_.second);
                else confirm(app);
            }),
            button(cm_, "\x1b", "Back", [&app] { app.pop(); }),
            filler(),
            text("Click or Enter: pick location") | color(theme::kDim),
            text("Arrows: rotate   +/-: zoom") | color(theme::kDim),
        }) | size(WIDTH, EQUAL, 32);
        return hbox({map, separator(), side}) | bgcolor(Color::RGB(0, 0, 0));
    }

    bool onEvent(App& app, Event e) override {
        if (e.is_mouse() && mapBox_) {
            Mouse m = e.mouse();
            if (m.button == Mouse::Left && m.motion == Mouse::Pressed && mapBox_->Contain(m.x, m.y)) {
                picked_ = globe_.pick(m.x - mapBox_->x_min, m.y - mapBox_->y_min);
                return true;
            }
        }
        if (cm_.handle(e)) return true;
        double step = 10.0 / globe_.zoom;
        if (e == Event::ArrowLeft) globe_.rotate(-step, 0);
        else if (e == Event::ArrowRight) globe_.rotate(step, 0);
        else if (e == Event::ArrowUp) globe_.rotate(0, step);
        else if (e == Event::ArrowDown) globe_.rotate(0, -step);
        else if (isKey(e, "+=")) globe_.zoomBy(1.25);
        else if (isKey(e, "-_")) globe_.zoomBy(0.8);
        else return false;
        picked_.reset(); // the view moved: re-pick
        return true;
    }

private:
    void confirm(App& app) {
        if (!picked_) return;
        if (!world().isLand(*picked_)) { app.error("Bases must be built on land."); return; }
        LatLon pos = *picked_;
        Difficulty d = difficulty_;
        app.push(makeTextInput("Name the base", app.game ? "Outpost" : "Carcassonne", [pos, d](App& a, const std::string& name) {
            if (!a.game) {
                a.game = std::make_unique<GameState>(newCampaign(d, pos, name));
                a.popAll();
                a.push(makeGeoscape());
                a.message("Welcome, Director",
                          "The council has funded a clandestine agency to find and destroy the six bloodlines.\n\n"
                          "Bullets will put a vampire down, but it will get up again. Only fire kills them for good: "
                          "molotovs now, better incendiaries once research gets going.\n\n"
                          "Keep the agency SECRET and the public on our SIDE. Start researching, and watch the "
                          "skies for their flights.");
            } else {
                std::string err;
                if (buildBase(*a.game, pos, name, err)) {
                    a.pop();
                    a.message("Base Founded", name + " is under construction. Build facilities from the base screen.");
                } else {
                    a.error(err);
                }
            }
        }));
    }

    Difficulty difficulty_;
    GlobeView globe_;
    ClickMap cm_;
    const Box* mapBox_ = nullptr;
    bool clickPending_ = false;
    std::optional<LatLon> picked_;
    std::pair<int, int> centre_{0, 0};
};

} // namespace

std::unique_ptr<Screen> makeMainMenu() { return std::make_unique<MainMenu>(); }
std::unique_ptr<Screen> makeBasePlacement(Difficulty d) { return std::make_unique<BasePlacement>(d); }

} // namespace vamps

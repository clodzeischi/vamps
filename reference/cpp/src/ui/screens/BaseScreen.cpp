// The base view: the 6x6 facility grid, construction, and the base menu.
#include "core/Format.h"
#include "data/Craft.h"
#include "strategy/Economy.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

Color facilityColor(FacilityType t) {
    switch (t) {
        case FacilityType::AccessLift: return Color::RGB(90, 90, 100);
        case FacilityType::Quarters: return Color::RGB(60, 80, 120);
        case FacilityType::Laboratory: return Color::RGB(40, 110, 110);
        case FacilityType::Workshop: return Color::RGB(120, 90, 40);
        case FacilityType::Stores: return Color::RGB(90, 70, 50);
        case FacilityType::ListeningPost:
        case FacilityType::SigintArray: return Color::RGB(40, 110, 60);
        case FacilityType::Hangar: return Color::RGB(70, 70, 80);
        case FacilityType::Containment: return Color::RGB(120, 40, 60);
        default: return Color::RGB(50, 50, 50);
    }
}

class BaseScreen : public Screen {
public:
    explicit BaseScreen(int baseId) : baseId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        Base* b = g.findBase(baseId_);
        if (!b) {
            if (g.bases.empty()) return text("No bases.");
            baseId_ = g.bases.front().id;
            b = &g.bases.front();
        }

        // ----- Grid -----
        Elements rows;
        for (int y = 0; y < kBaseGrid; ++y) {
            Elements cells;
            for (int x = 0; x < kBaseGrid; ++x) {
                const Facility* f = b->facilityAt(x, y);
                std::string l1 = "       ", l2 = "       ", l3 = "       ";
                Color bg = Color::RGB(22, 20, 18);
                if (f) {
                    bg = facilityColor(f->type);
                    if (f->x == x && f->y == y) {
                        l1 = padRight(std::string(" ") + facility(f->type).abbrev, 7);
                        if (!f->ready()) l2 = padRight(fmt(" %dd", f->daysLeft), 7);
                    }
                    if (!f->ready()) bg = Color::RGB(60, 50, 30);
                } else {
                    l2 = "   .   ";
                }
                bool sel = x == cx_ && y == cy_;
                Element cell = vbox({text(l1), text(l2), text(l3)}) | bgcolor(bg) | color(theme::kText);
                if (sel) cell = cell | inverted;
                cells.push_back(cm_.area(cell, [this, &app, x, y] { clickCell(app, x, y); }));
                cells.push_back(text(" "));
            }
            rows.push_back(hbox(std::move(cells)));
            rows.push_back(text(""));
        }
        Element grid = vbox(std::move(rows));

        // ----- Selected cell info -----
        Elements info;
        if (building_) {
            const FacilityDef& d = facility(*building_);
            info.push_back(text("BUILDING: " + std::string(d.name)) | bold | color(theme::kWarn));
            info.push_back(text(fmt("%s  %d days  upkeep %s/mo", money(facilityCost(g, *building_)).c_str(), d.buildDays,
                                    money(d.upkeep).c_str())) | color(theme::kText));
            info.push_back(paragraph(d.description) | color(theme::kDim));
            info.push_back(text("Click a free cell next to the base (Enter = here, Esc = cancel).") | color(theme::kDim));
        } else if (const Facility* f = b->facilityAt(cx_, cy_)) {
            const FacilityDef& d = facility(f->type);
            info.push_back(text(d.name) | bold | color(theme::kAccent));
            info.push_back(paragraph(d.description) | color(theme::kDim));
            info.push_back(text(f->ready() ? "Operational" : fmt("Under construction: %d days", f->daysLeft)) | color(theme::kText));
        } else {
            info.push_back(text("Empty rock.") | color(theme::kDim));
        }

        // ----- Capacities -----
        auto cap = [&](const char* name, double used, double total) {
            return hbox({text(padRight(name, 14)) | color(theme::kDim), meter((int)used, std::max(1, (int)total), 14,
                                                                            used > total ? theme::kBad : theme::kInfo),
                         text(fmt(" %3.0f/%-3.0f", used, total))});
        };
        Elements caps = {
            cap("Quarters", g.personnelAt(b->id), b->capacity(FacilityType::Quarters)),
            cap("Laboratories", b->scientists, b->capacity(FacilityType::Laboratory)),
            cap("Workshops", b->engineers, b->capacity(FacilityType::Workshop)),
            cap("Stores", b->storageUsed(), storageCapacity(*b)),
            cap("Hangars", g.craftAt(b->id), b->capacity(FacilityType::Hangar)),
            cap("Containment", g.captivesAt(b->id), b->capacity(FacilityType::Containment)),
            text(fmt("Radar %d nm   Upkeep %s/mo", b->radarRange(), money(b->monthlyUpkeep()).c_str())) | color(theme::kDim),
        };

        // ----- Craft here -----
        Elements craft;
        for (const auto& c : g.craft)
            if (c.baseId == b->id)
                craft.push_back(text(fmt("%-11s %-10s", c.name.c_str(), craftStatusName(c.status))) | color(theme::kText));

        int id = b->id;
        Elements menu = {
            button(cm_, "b", "Build facility", [this, &app] { chooseFacility(app); }),
            button(cm_, "x", "Dismantle selected", [this, &app] { dismantle(app); }),
            button(cm_, "r", "Research", [&app, id] { app.push(makeResearch(id)); }),
            button(cm_, "m", "Manufacture", [&app, id] { app.push(makeManufacture(id)); }),
            button(cm_, "s", "Soldiers & equipment", [&app, id] { app.push(makeSoldiers(id)); }),
            button(cm_, "c", "Aircraft", [&app, id] { app.push(makeCraftScreen(id)); }),
            button(cm_, "p", "Purchase / hire / sell", [&app, id] { app.push(makeMarket(id)); }),
            button(cm_, "k", "Black market", [&app, id] { app.push(makeBlackMarket(id)); }),
            button(cm_, "t", "Transfer", [&app, id] { app.push(makeTransfer(id)); }, g.bases.size() > 1),
            button(cm_, "\x1b", "Back to Geoscape", [&app] { app.pop(); }),
        };

        std::string title = "BASE: " + b->name;
        Element switcher = hbox({button(cm_, "<", "Prev base", [this, &app] { cycle(app, -1); }), text(" "),
                                 button(cm_, ">", "Next base", [this, &app] { cycle(app, 1); })});
        return vbox({
                   header(title, money(g.funds)),
                   hbox({
                       vbox({text(""), grid, switcher}) | size(WIDTH, EQUAL, 50),
                       separator(),
                       vbox({vbox(std::move(info)) | size(HEIGHT, GREATER_THAN, 5), separator(), vbox(std::move(caps)),
                             separator(), text("Aircraft") | bold | color(theme::kAccent), vbox(std::move(craft)),
                             separator(), vbox(std::move(menu))}) |
                           flex,
                   }) | flex,
               }) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (building_ && e == Event::Escape) { building_.reset(); return true; }
        if (building_ && e == Event::Return) { clickCell(app, cx_, cy_); return true; }
        if (cm_.handle(e)) return true;
        if (e == Event::ArrowLeft) cx_ = std::max(0, cx_ - 1);
        else if (e == Event::ArrowRight) cx_ = std::min(kBaseGrid - 1, cx_ + 1);
        else if (e == Event::ArrowUp) cy_ = std::max(0, cy_ - 1);
        else if (e == Event::ArrowDown) cy_ = std::min(kBaseGrid - 1, cy_ + 1);
        else return false;
        return true;
    }

private:
    void clickCell(App& app, int x, int y) {
        cx_ = x;
        cy_ = y;
        if (!building_) return;
        Base* b = app.game->findBase(baseId_);
        std::string err;
        if (b && buildFacility(*app.game, *b, *building_, x, y, err)) building_.reset();
        else app.error(err);
    }

    void chooseFacility(App& app) {
        std::vector<Choice> choices;
        for (int t = 1; t < (int)FacilityType::Count; ++t) {
            FacilityType ft = (FacilityType)t;
            const FacilityDef& d = facility(ft);
            choices.push_back({std::to_string(t), fmt("%s (%s)", d.name, money(facilityCost(*app.game, ft)).c_str()),
                               [this, ft](App&) { building_ = ft; }});
        }
        choices.push_back({"\x1b", "Cancel", {}});
        app.push(makeChoiceBox("Build Facility", "Choose a facility, then click where to build it.", choices));
    }

    void dismantle(App& app) {
        Base* b = app.game->findBase(baseId_);
        if (!b || !b->facilityAt(cx_, cy_)) return;
        int x = cx_, y = cy_, id = baseId_;
        app.push(makeChoiceBox("Dismantle", std::string("Dismantle the ") + facility(b->facilityAt(x, y)->type).name +
                                                "? There is no refund.",
                               {{"y", "Dismantle", [x, y, id](App& a) {
                                     std::string err;
                                     if (Base* bb = a.game->findBase(id); bb && !dismantleFacility(*a.game, *bb, x, y, err))
                                         a.error(err);
                                 }},
                                {"n", "Keep it", {}}}));
    }

    void cycle(App& app, int dir) {
        auto& bases = app.game->bases;
        for (size_t i = 0; i < bases.size(); ++i)
            if (bases[i].id == baseId_) {
                baseId_ = bases[(i + bases.size() + dir) % bases.size()].id;
                return;
            }
    }

    int baseId_;
    int cx_ = 2, cy_ = 2;
    std::optional<FacilityType> building_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makeBase(int baseId) { return std::make_unique<BaseScreen>(baseId); }

} // namespace vamps

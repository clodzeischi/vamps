// Politics & funding, the research archive, and save / load.
#include "core/Format.h"
#include "data/Research.h"
#include "strategy/Economy.h"
#include "strategy/Politics.h"
#include "strategy/SaveGame.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

Element supportBar(double s) {
    // Centre-zero bar: left half red (pro-vampire), right half green.
    const int half = 10;
    int n = std::clamp((int)std::round(std::abs(s) / 100.0 * half), 0, half);
    std::string left(half - (s < 0 ? n : 0), ' '), neg(s < 0 ? n : 0, ' '), pos(s > 0 ? n : 0, ' '),
        right(half - (s > 0 ? n : 0), ' ');
    Color bg = Color::RGB(40, 40, 44);
    return hbox({text(left) | bgcolor(bg), text(neg) | bgcolor(theme::kBad), text("|") | color(theme::kDim),
                 text(pos) | bgcolor(theme::kGood), text(right) | bgcolor(bg)});
}

class PoliticsScreen : public Screen {
public:
    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        std::vector<Element> rows;
        for (int i = 0; i < (int)nations().size(); ++i) {
            const auto& n = g.nations[i];
            double delta = n.support - n.monthStartSupport;
            rows.push_back(hbox({
                text(padRight(nations()[i].name, 16)) | color(n.defected ? theme::kBad : theme::kText),
                supportBar(n.support), text(fmt(" %+4.0f ", n.support)),
                text(fmt("%+4.0f ", delta)) | color(delta >= 0 ? theme::kGood : theme::kBad),
                text(fmt("inf %3.0f%% ", n.infiltration)) | color(n.infiltration > 50 ? theme::kBad : theme::kDim),
                text(padLeft(n.defected ? "WITHDRAWN" : money(nationFunding(g, i)), 12)) | color(theme::kAccent),
                text(padLeft(money(n.mediaBudget), 11)) | color(theme::kInfo),
            }));
        }
        Elements lines;
        for (int b = 0; b < kBloodlineCount; ++b) {
            const auto& bl = bloodline(b);
            const auto& st = g.bloodlines[b];
            std::string status = st.destroyed ? "DESTROYED" : st.lairKnown ? "lair located" : "lair unknown";
            lines.push_back(hbox({text(padRight(bl.name, 26)) | color(st.destroyed ? theme::kDim : theme::kTitle),
                                  text(padRight(continentName(bl.continent), 15)) | color(theme::kDim),
                                  text(padRight(status, 14)) | color(st.destroyed ? theme::kGood : theme::kWarn),
                                  text(bl.traitName) | color(theme::kText)}));
        }
        auto budget = [this, &app](int delta) {
            int i = std::clamp(list_.selected, 0, (int)app.game->nations.size() - 1);
            auto& n = app.game->nations[i];
            if (!n.defected) n.mediaBudget = std::clamp(n.mediaBudget + delta, 0, 2000000);
        };
        SecrecyBand band = secrecyBand(g.secrecy);
        return vbox({
                   header("POLITICS & FUNDING", g.time.monthYearString()),
                   hbox({text(fmt(" Secrecy %.0f: %s.  ", g.secrecy, secrecyBandName(band))) | bold |
                             color(band == SecrecyBand::Normal ? theme::kGood : band == SecrecyBand::Scrutiny ? theme::kWarn : theme::kBad),
                         paragraph(band == SecrecyBand::Normal ? "No restrictions."
                                   : band == SecrecyBand::Scrutiny ? "Construction costs +25%."
                                   : "Funding -20%; pro-vampire nations close their airspace and refuse bases.") | color(theme::kText)}),
                   text(fmt(" Expenses per month: salaries %s, aircraft %s, facilities %s, media %s",
                            money(monthlySalaries(g)).c_str(), money(monthlyCraftRent(g)).c_str(),
                            money(monthlyFacilityUpkeep(g)).c_str(), money(monthlyMediaSpend(g)).c_str())) | color(theme::kDim),
                   panel("Nations     pro-vampire | pro-agency   support  month  infiltration   funding    media",
                         listView(cm_, list_, rows, std::max(5, app.height() - 20), {})) | flex,
                   hbox({button(cm_, "+", "Media budget +$50k", [budget] { budget(50000); }), text(" "),
                         button(cm_, "-", "-$50k", [budget] { budget(-50000); }), text("   "),
                         text("Media spending raises support each month (diminishing returns).") | color(theme::kDim)}),
                   panel("Bloodlines", vbox(std::move(lines))),
                   button(cm_, "\x1b", "Back", [&app] { app.pop(); }),
               }) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        return listKeys(list_, e, (int)app.game->nations.size(), {});
    }

private:
    ListState list_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------

class ArchiveScreen : public Screen {
public:
    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        titles_.clear();
        bodies_.clear();
        titles_.push_back("The Bloodlines");
        std::string lore = "In March 1244 the Cathar fortress of Montsegur fell and more than two hundred Perfecti "
                           "were burned. Not all of them burned.\n\n";
        for (int b = 0; b < kBloodlineCount; ++b) {
            const auto& bl = bloodline(b);
            lore += std::string(bl.name) + " (" + continentName(bl.continent) + ")\n  " + bl.traitName + ": " +
                    bl.traitText + "\n\n";
        }
        bodies_.push_back(lore);
        titles_.push_back("Field Manual");
        bodies_.push_back(
            "Ballistic weapons drop a vampire into TORPOR. In torpor it regenerates and will stand up again in a few "
            "turns (faster at night).\n\nINCENDIARY damage (molotovs, incendiary rounds, thermite, napalm) on a body "
            "in torpor destroys it permanently, and so do three turns of direct sunlight.\n\nWin a mission with "
            "vampires still in torpor and they are taken captive (if you have containment cells) or incinerated.\n\n"
            "Thralls and familiars are flesh: bullets kill them.\n\nElders exhale engineered pheromones: keep "
            "high-Will soldiers forward, and research the Neuro-Blocker and Sealed Suit.");
        for (const auto& r : allResearch())
            if (g.isResearched(r.id)) {
                titles_.push_back(r.name);
                bodies_.push_back(std::string(researchFieldName(r.field)) + "\n\n" + r.archive);
            }
        std::vector<Element> rows;
        for (const auto& t : titles_) rows.push_back(text(t));
        int i = std::clamp(list_.selected, 0, (int)titles_.size() - 1);
        return vbox({header("ARCHIVE"),
                     hbox({panel("Entries", listView(cm_, list_, rows, std::max(5, app.height() - 6), {})) | size(WIDTH, EQUAL, 40),
                           panel(titles_[i], textBlock(bodies_[i]) | color(theme::kText)) | flex}) | flex,
                     button(cm_, "\x1b", "Back", [&app] { app.pop(); })}) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        return listKeys(list_, e, (int)titles_.size(), {});
    }

private:
    std::vector<std::string> titles_, bodies_;
    ListState list_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------

class SaveLoad : public Screen {
public:
    explicit SaveLoad(bool saving) : saving_(saving) {}
    bool isOverlay() const override { return true; }

    Element render(App& app) override {
        cm_.clear();
        std::vector<Element> rows;
        for (int i = 1; i <= kSaveSlots; ++i) {
            std::string d = describeSlot(i);
            rows.push_back(text(fmt("Slot %d   ", i) + (d.empty() ? "(empty)" : d)) | color(d.empty() ? theme::kDim : theme::kText));
        }
        auto act = [this, &app](int i) { choose(app, i + 1); };
        return panel(saving_ ? "Save Campaign" : "Load Campaign",
                     vbox({listView(cm_, list_, rows, kSaveSlots, act), text(""),
                           hbox({button(cm_, "\n", saving_ ? "Save" : "Load", [this, &app] { choose(app, list_.selected + 1); }),
                                 text("  "), button(cm_, "\x1b", "Cancel", [&app] { app.pop(); })})}) |
                         size(WIDTH, GREATER_THAN, 60)) |
               bgcolor(theme::kPanelBg);
    }

    bool onEvent(App& app, Event e) override {
        if (cm_.handle(e)) return true;
        listKeys(list_, e, kSaveSlots, {});
        return true;
    }

private:
    void choose(App& app, int slot) {
        std::string err;
        if (saving_) {
            if (saveGame(*app.game, slot, err)) { app.pop(); app.message("Saved", "Campaign saved to " + savePath(slot) + "."); }
            else app.error(err);
            return;
        }
        auto loaded = std::make_unique<GameState>();
        if (!loadGame(*loaded, slot, err)) { app.error(err); return; }
        app.game = std::move(loaded);
        app.popAll();
        app.push(makeGeoscape());
    }

    bool saving_;
    ListState list_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makePolitics() { return std::make_unique<PoliticsScreen>(); }
std::unique_ptr<Screen> makeArchive() { return std::make_unique<ArchiveScreen>(); }
std::unique_ptr<Screen> makeSaveLoad(bool saving) { return std::make_unique<SaveLoad>(saving); }

} // namespace vamps

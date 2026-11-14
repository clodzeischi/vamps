// Research and Manufacturing screens.
#include <cmath>

#include "core/Format.h"
#include "strategy/Labs.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

// The original never told you exact progress; neither do we.
std::string fuzzyProgress(double done, double cost) {
    double f = cost > 0 ? done / cost : 0;
    if (f < 0.25) return "early days";
    if (f < 0.5) return "progressing";
    if (f < 0.75) return "past halfway";
    if (f < 0.95) return "nearly there";
    return "imminent";
}

class ResearchScreen : public Screen {
public:
    explicit ResearchScreen(int baseId) : baseId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        Base* b = g.findBase(baseId_);
        cm_.clear();
        if (!b) return text("");
        int listH = std::max(5, app.height() / 2 - 6);

        std::vector<Element> projects;
        for (const auto& p : b->research) {
            const ResearchDef* r = findResearch(p.id);
            projects.push_back(hbox({text(padRight(r ? r->name : p.id, 30)) | color(theme::kAccent),
                                     text(fmt("%3d scientists  ", p.scientists)),
                                     text(p.scientists > 0 ? fuzzyProgress(p.progress, p.cost) : "stalled") |
                                         color(p.scientists > 0 ? theme::kText : theme::kBad)}));
        }
        auto avail = availableResearch(g);
        std::vector<Element> topics;
        for (const auto* r : avail)
            topics.push_back(hbox({text(padRight(r->name, 32)) | color(theme::kText),
                                   text(padRight(researchFieldName(r->field), 13)) | color(theme::kInfo),
                                   text(fmt("~%d sci-days", (int)std::round(r->cost * g.diff().researchCostMult))) | color(theme::kDim)}));
        std::vector<Element> locked;
        for (const auto& r : allResearch())
            if (!g.isResearched(r.id) && !researchInProgress(g, r.id) && !researchBlocker(g, r).empty())
                locked.push_back(hbox({text(padRight(r.name, 32)) | color(theme::kDim),
                                       text(researchBlocker(g, r)) | color(Color::RGB(90, 90, 100))}));

        auto start = [this, &app, avail](int i) {
            if (i < 0 || i >= (int)avail.size()) return;
            Base* bb = app.game->findBase(baseId_);
            std::string err;
            if (!bb || !startResearch(*app.game, *bb, avail[i]->id, bb->scientistsFree(), err)) app.error(err);
            else focusProjects_ = true;
        };
        auto adjust = [this, &app](int delta) {
            Base* bb = app.game->findBase(baseId_);
            if (!bb || bb->research.empty()) return;
            int i = std::clamp(projectList_.selected, 0, (int)bb->research.size() - 1);
            setResearchScientists(*bb, i, bb->research[i].scientists + delta);
        };

        return vbox({
                   header("RESEARCH: " + b->name,
                          fmt("Scientists %d (free %d)   Lab space %d", b->scientists, b->scientistsFree(),
                              b->capacity(FacilityType::Laboratory))),
                   panel("Current projects", listView(cm_, projectList_, projects, std::max(3, listH / 2), {})) |
                       (focusProjects_ ? color(theme::kText) : dim),
                   hbox({button(cm_, "+", "Add scientist", [adjust] { adjust(1); }), text(" "),
                         button(cm_, "-", "Remove", [adjust] { adjust(-1); }), text(" "),
                         button(cm_, "*", "Add all free", [adjust] { adjust(1000); }), text(" "),
                         button(cm_, "x", "Cancel project", [this, &app] {
                             if (Base* bb = app.game->findBase(baseId_)) cancelResearch(*bb, projectList_.selected);
                         })}),
                   panel("Available topics (Enter / double-click to start)", listView(cm_, topicList_, topics, listH, start)) |
                       (focusProjects_ ? dim : color(theme::kText)),
                   panel(fmt("Locked topics (%d)", (int)locked.size()), vbox(locked.size() > 6
                       ? std::vector<Element>(locked.begin(), locked.begin() + 6) : locked)) | flex,
                   hbox({button(cm_, "\t", "Switch list (Tab)", [this] { focusProjects_ = !focusProjects_; }), text("  "),
                         button(cm_, "\x1b", "Back", [&app] { app.pop(); })}),
               }) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (e == Event::Tab) { focusProjects_ = !focusProjects_; return true; }
        if (cm_.handle(e)) return true;
        GameState& g = *app.game;
        Base* b = g.findBase(baseId_);
        if (!b) return false;
        if (focusProjects_) return listKeys(projectList_, e, (int)b->research.size(), {});
        auto avail = availableResearch(g);
        return listKeys(topicList_, e, (int)avail.size(), [this, &app, avail](int i) {
            Base* bb = app.game->findBase(baseId_);
            std::string err;
            if (!bb || !startResearch(*app.game, *bb, avail[i]->id, bb->scientistsFree(), err)) app.error(err);
            else focusProjects_ = true;
        });
    }

private:
    int baseId_;
    bool focusProjects_ = false;
    ListState projectList_, topicList_;
    ClickMap cm_;
};

// ---------------------------------------------------------------------------

class ManufactureScreen : public Screen {
public:
    explicit ManufactureScreen(int baseId) : baseId_(baseId) {}

    Element render(App& app) override {
        GameState& g = *app.game;
        Base* b = g.findBase(baseId_);
        cm_.clear();
        if (!b) return text("");
        int listH = std::max(5, app.height() / 2 - 6);

        std::vector<Element> jobs;
        for (const auto& j : b->production) {
            const ItemDef& d = item(j.itemId);
            double hours = unitBuildHours(g, d);
            double remain = (j.quantity - j.produced) * hours - j.progress;
            std::string eta = j.engineers > 0 ? fmt("%.0f days", std::ceil(remain / j.engineers / 24.0)) : "stalled";
            jobs.push_back(hbox({text(padRight(d.name, 26)) | color(theme::kAccent),
                                 text(fmt("%3d/%-3d  %3d engineers  ", j.produced, j.quantity, j.engineers)),
                                 text(eta) | color(j.engineers > 0 ? theme::kText : theme::kBad)}));
        }
        auto items = manufacturableItems(g);
        std::vector<Element> rows;
        for (const auto* d : items)
            rows.push_back(hbox({text(padRight(d->name, 26)) | color(theme::kText),
                                 text(fmt("%5.0f eng-hours  %10s each  in stores %d", unitBuildHours(g, *d),
                                          money(d->buildCost).c_str(), b->itemCount(d->id))) | color(theme::kDim)}));

        auto start = [this, &app, items](int i) {
            if (i < 0 || i >= (int)items.size()) return;
            Base* bb = app.game->findBase(baseId_);
            std::string err;
            if (!bb || !startProduction(*app.game, *bb, items[i]->id, quantity_, bb->engineersFree(), err)) app.error(err);
            else focusJobs_ = true;
        };
        auto adjust = [this, &app](int delta) {
            Base* bb = app.game->findBase(baseId_);
            if (!bb || bb->production.empty()) return;
            int i = std::clamp(jobList_.selected, 0, (int)bb->production.size() - 1);
            setProductionEngineers(*bb, i, bb->production[i].engineers + delta);
        };
        auto quantity = [this, &app](int delta) {
            if (focusJobs_) {
                Base* bb = app.game->findBase(baseId_);
                if (!bb || bb->production.empty()) return;
                auto& j = bb->production[std::clamp(jobList_.selected, 0, (int)bb->production.size() - 1)];
                j.quantity = std::max(j.produced + 1, j.quantity + delta);
            } else {
                quantity_ = std::clamp(quantity_ + delta, 1, 999);
            }
        };

        return vbox({
                   header("MANUFACTURING: " + b->name,
                          fmt("Engineers %d (free %d)   Workshop space %d", b->engineers, b->engineersFree(),
                              b->capacity(FacilityType::Workshop))),
                   panel("Production", listView(cm_, jobList_, jobs, std::max(3, listH / 2), {})) |
                       (focusJobs_ ? color(theme::kText) : dim),
                   hbox({button(cm_, "+", "Engineer", [adjust] { adjust(1); }), text(" "),
                         button(cm_, "-", "Engineer", [adjust] { adjust(-1); }), text(" "),
                         button(cm_, "*", "All free", [adjust] { adjust(1000); }), text(" "),
                         button(cm_, ">", "Qty +1", [quantity] { quantity(1); }), text(" "),
                         button(cm_, "<", "Qty -1", [quantity] { quantity(-1); }), text(" "),
                         button(cm_, "x", "Cancel job", [this, &app] {
                             if (Base* bb = app.game->findBase(baseId_)) cancelProduction(*bb, jobList_.selected);
                         })}),
                   panel(fmt("Can manufacture (new jobs: quantity %d)", quantity_), listView(cm_, itemList_, rows, listH, start)) |
                       (focusJobs_ ? dim : color(theme::kText)) | flex,
                   hbox({button(cm_, "\t", "Switch list (Tab)", [this] { focusJobs_ = !focusJobs_; }), text("  "),
                         button(cm_, "\x1b", "Back", [&app] { app.pop(); })}),
               }) |
               bgcolor(Color::RGB(8, 7, 9));
    }

    bool onEvent(App& app, Event e) override {
        if (e == Event::Tab) { focusJobs_ = !focusJobs_; return true; }
        if (cm_.handle(e)) return true;
        Base* b = app.game->findBase(baseId_);
        if (!b) return false;
        if (focusJobs_) return listKeys(jobList_, e, (int)b->production.size(), {});
        auto items = manufacturableItems(*app.game);
        return listKeys(itemList_, e, (int)items.size(), [this, &app, items](int i) {
            Base* bb = app.game->findBase(baseId_);
            std::string err;
            if (!bb || !startProduction(*app.game, *bb, items[i]->id, quantity_, bb->engineersFree(), err)) app.error(err);
            else focusJobs_ = true;
        });
    }

private:
    int baseId_;
    int quantity_ = 1;
    bool focusJobs_ = false;
    ListState jobList_, itemList_;
    ClickMap cm_;
};

} // namespace

std::unique_ptr<Screen> makeResearch(int baseId) { return std::make_unique<ResearchScreen>(baseId); }
std::unique_ptr<Screen> makeManufacture(int baseId) { return std::make_unique<ManufactureScreen>(baseId); }

} // namespace vamps

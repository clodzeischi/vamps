// The Geoscape: the globe, the clock, and every event that pauses time.
#include <ftxui/component/mouse.hpp>

#include "core/Format.h"
#include "data/Craft.h"
#include "strategy/Politics.h"
#include "strategy/Simulation.h"
#include "ui/GlobeView.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

struct Speed {
    const char* label;
    int64_t secondsPerTick; // game seconds per 50 ms frame
};
const Speed kSpeeds[] = {{"5 sec", 5}, {"1 min", 30}, {"5 min", 150}, {"30 min", 900}, {"1 hour", 1800}, {"1 day", 7200}};

std::string hoursLeft(const GameState& g, int64_t until) {
    if (until <= 0) return "-";
    int64_t s = until - g.time.seconds;
    if (s <= 0) return "now";
    return fmt("%lldh %02lldm", (long long)(s / 3600), (long long)((s % 3600) / 60));
}

class Geoscape : public Screen {
public:
    Geoscape() = default;

    Element render(App& app) override {
        GameState& g = *app.game;
        cm_.clear();
        int panelW = 36;
        int w = std::max(20, app.width() - panelW - 1), h = std::max(10, app.height());
        auto grid = globe_.render(&g, w, h, selKind_, selId_, blink_);
        Element map = gridElement(grid) | reflect(mapBox_);
        map = cm_.area(map, ClickHandlers{{}, {}, [this] { globe_.zoomBy(1.25); }, [this] { globe_.zoomBy(0.8); }});

        // ----- Status -----
        SecrecyBand band = secrecyBand(g.secrecy);
        Color secColor = band == SecrecyBand::Normal ? theme::kGood : band == SecrecyBand::Scrutiny ? theme::kWarn : theme::kBad;
        double sup = g.averageSupport();
        Elements status = {
            header(g.time.dateString(), fmt("%02d:%02d", g.time.date().hour, g.time.date().minute)),
            hbox({text("Funds   ") | color(theme::kDim), text(money(g.funds)) | color(g.funds < 0 ? theme::kBad : theme::kAccent)}),
            hbox({text("Secrecy ") | color(theme::kDim), meter((int)g.secrecy, 100, 12, secColor),
                  text(fmt(" %3.0f %s", g.secrecy, secrecyBandName(band))) | color(secColor)}),
            hbox({text("Support ") | color(theme::kDim), meter((int)(sup + 100), 200, 12, sup >= 0 ? theme::kGood : theme::kBad),
                  text(fmt(" %+4.0f avg", sup)) | color(sup >= 0 ? theme::kGood : theme::kBad)}),
            text(fmt("Bloodlines %d/6 active   Nations lost %d", g.activeBloodlines(), g.defectedCount())) | color(theme::kDim),
            separator(),
        };

        // ----- Time controls -----
        Elements speeds;
        for (int i = 0; i < 6; ++i) {
            bool on = !paused_ && speed_ == i;
            Element b = button(cm_, std::to_string(i + 1), kSpeeds[i].label, [this, i] { speed_ = i; paused_ = false; });
            speeds.push_back(on ? b | inverted : b);
        }
        status.push_back(hflow(std::move(speeds)));
        status.push_back(button(cm_, " ", paused_ ? "PAUSED - resume" : "Pause", [this] { paused_ = !paused_; }) |
                         (paused_ ? color(theme::kWarn) : color(theme::kText)));
        status.push_back(separator());

        // ----- Selection -----
        status.push_back(selectionPanel(app));
        status.push_back(separator());

        // ----- Menu -----
        int firstBase = g.bases.empty() ? -1 : g.bases.front().id;
        status.push_back(button(cm_, "i", "Intercept / launch craft",
                                [&app] { app.push(makeLaunch(CraftTarget::None, -1, {})); }));
        status.push_back(button(cm_, "b", "Bases", [&app, firstBase] { app.push(makeBase(firstBase)); }));
        status.push_back(button(cm_, "n", "New base", [&app] { app.push(makeBasePlacement(app.game->difficultyLevel)); }));
        status.push_back(button(cm_, "p", "Politics & funding", [&app] { app.push(makePolitics()); }));
        status.push_back(button(cm_, "a", "Archive (research)", [&app] { app.push(makeArchive()); }));
        status.push_back(hbox({button(cm_, "s", "Save", [&app] { app.push(makeSaveLoad(true)); }), text(" "),
                               button(cm_, "l", "Load", [&app] { app.push(makeSaveLoad(false)); }), text(" "),
                               button(cm_, "q", "Menu", [&app] {
                                   app.push(makeChoiceBox("Quit", "Return to the main menu? Unsaved progress is lost.",
                                                          {{"y", "Yes", [](App& a) {
                                                                a.game.reset();
                                                                a.popAll();
                                                                a.push(makeMainMenu());
                                                            }},
                                                           {"n", "No", {}}}));
                               })}));
        status.push_back(separator());

        // ----- Log -----
        Elements log;
        int lines = std::max(0, app.height() - 34);
        int start = std::max(0, (int)g.log.size() - lines);
        for (int i = start; i < (int)g.log.size(); ++i) log.push_back(paragraph(g.log[i].substr(g.log[i].find("  ") + 2)) | color(theme::kDim));
        status.push_back(vbox(std::move(log)) | flex);

        return hbox({map, separator(), vbox(std::move(status)) | size(WIDTH, EQUAL, panelW)}) | bgcolor(Color::RGB(0, 0, 0));
    }

    bool onEvent(App& app, Event e) override {
        if (e.is_mouse()) {
            Mouse m = e.mouse();
            if (mapBox_.Contain(m.x, m.y) && m.motion == Mouse::Pressed &&
                (m.button == Mouse::Left || m.button == Mouse::Right)) {
                int cx = m.x - mapBox_.x_min, cy = m.y - mapBox_.y_min;
                if (m.button == Mouse::Right) {
                    if (auto p = globe_.pick(cx, cy)) globe_.centerOn(*p);
                    return true;
                }
                if (const GlobeMarker* mk = globe_.markerAt(cx, cy)) {
                    if (selKind_ == mk->kind && selId_ == mk->id && mk->kind == GlobeMarker::Base) {
                        app.push(makeBase(mk->id));
                    }
                    selKind_ = mk->kind;
                    selId_ = mk->id;
                } else if (auto p = globe_.pick(cx, cy)) {
                    selKind_ = kPoint;
                    selId_ = 0;
                    point_ = *p;
                } else {
                    selKind_ = -1;
                }
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
        return true;
    }

    void onTick(App& app, double seconds) override {
        GameState& g = *app.game;
        blinkTimer_ += seconds;
        if (blinkTimer_ > 0.5) { blinkTimer_ = 0; blink_ = !blink_; }

        if (!g.events.empty()) { handleEvent(app); return; }
        if (!paused_) advanceTime(g, kSpeeds[speed_].secondsPerTick);
        if (!g.events.empty()) handleEvent(app);
    }

private:
    static constexpr int kPoint = 100;

    Element selectionPanel(App& app) {
        GameState& g = *app.game;
        Elements out;
        auto title = [](const std::string& s) { return text(s) | bold | color(theme::kAccent); };
        auto line = [](const std::string& s) { return paragraph(s) | color(theme::kText); };
        switch (selKind_) {
            case GlobeMarker::Base:
                if (Base* b = g.findBase(selId_)) {
                    out.push_back(title("Base: " + b->name));
                    out.push_back(line(fmt("%d soldiers, %d scientists, %d engineers", g.soldiersAt(b->id), b->scientists, b->engineers)));
                    int id = b->id;
                    out.push_back(button(cm_, "\n", "Open base", [&app, id] { app.push(makeBase(id)); }));
                }
                break;
            case GlobeMarker::Hunt:
                if (Hunt* h = g.findHunt(selId_)) {
                    const auto& d = huntCraft(h->craftType);
                    out.push_back(title("Flight: " + d.name) | color(theme::kBad));
                    out.push_back(line(std::string("Bloodline: ") + bloodline(h->bloodline).name));
                    out.push_back(line(fmt("Speed %d kn   ", d.speed) + (d.weaponDamage ? "ARMED" : "unarmed")));
                    int id = h->id;
                    out.push_back(button(cm_, "\n", "Intercept", [&app, id] { app.push(makeLaunch(CraftTarget::Hunt, id, {})); }));
                    out.push_back(button(cm_, "c", "Centre", [this, &app, id] {
                        if (Hunt* hh = app.game->findHunt(id)) globe_.centerOn(hh->pos);
                    }));
                }
                break;
            case GlobeMarker::Site:
                if (MissionSite* s = g.findSite(selId_)) {
                    out.push_back(title(siteTypeName(s->type)) | color(theme::kWarn));
                    out.push_back(line(s->label));
                    out.push_back(line(std::string("Bloodline: ") + bloodline(s->bloodline).name));
                    if (s->expires > 0) out.push_back(line("Time left: " + hoursLeft(g, s->expires)));
                    out.push_back(line(isDaylight(s->pos, g.time) ? "Daylight at the site" : "Night at the site"));
                    int id = s->id;
                    out.push_back(button(cm_, "\n", "Send transport", [&app, id] { app.push(makeLaunch(CraftTarget::Site, id, {})); }));
                }
                break;
            case GlobeMarker::Craft:
                if (Craft* c = g.findCraft(selId_)) {
                    out.push_back(title(c->name));
                    out.push_back(line(fmt("%s  fuel %.1fh  hull %d/%d", craftStatusName(c->status), c->fuel, c->hp,
                                           craftType(c->type).hp)));
                    int id = c->id;
                    out.push_back(button(cm_, "r", "Return to base", [&app, id] { recallCraft(*app.game, id); }));
                }
                break;
            case GlobeMarker::City: {
                const auto& c = cities()[selId_];
                int n = world().cityNation(selId_);
                out.push_back(title(c.name));
                if (n >= 0) out.push_back(line(fmt("%s, support %+.0f", nations()[n].name.c_str(), g.nations[n].support)));
                break;
            }
            case kPoint: {
                out.push_back(title(fmt("%.1f, %.1f", point_.lat, point_.lon)));
                int n = world().nationAt(point_);
                out.push_back(line(n >= 0 ? nations()[n].name : std::string(world().isLand(point_) ? "Land" : "Ocean")));
                LatLon p = point_;
                out.push_back(button(cm_, "\n", "Send craft here", [&app, p] { app.push(makeLaunch(CraftTarget::Waypoint, -1, p)); }));
                break;
            }
            default:
                out.push_back(text("Click the globe to select.") | color(theme::kDim));
                out.push_back(text("Right-click centres the view.") | color(theme::kDim));
        }
        return vbox(std::move(out));
    }

    void handleEvent(App& app) {
        GameState& g = *app.game;
        GeoEvent ev = g.events.front();
        g.events.pop_front();
        Geoscape* self = this;
        switch (ev.type) {
            case GeoEventType::GameOver: app.push(makeGameOver(false, ev.text)); return;
            case GeoEventType::Victory: app.push(makeGameOver(true, ev.text)); return;
            case GeoEventType::HuntDetected: {
                int id = ev.refId;
                if (Hunt* h = g.findHunt(id)) globe_.centerOn(h->pos);
                selKind_ = GlobeMarker::Hunt;
                selId_ = id;
                app.push(makeChoiceBox(ev.title, ev.text, {
                    {"i", "Intercept", [id](App& a) { a.push(makeLaunch(CraftTarget::Hunt, id, {})); }},
                    {"\n", "OK", {}},
                }));
                return;
            }
            case GeoEventType::SiteAppeared:
            case GeoEventType::LairRevealed: {
                int id = ev.refId;
                if (MissionSite* s = g.findSite(id)) {
                    globe_.centerOn(s->pos);
                    selKind_ = GlobeMarker::Site;
                    selId_ = id;
                    app.push(makeChoiceBox(ev.title, ev.text, {
                        {"t", "Send transport", [id](App& a) { a.push(makeLaunch(CraftTarget::Site, id, {})); }},
                        {"\n", "OK", {}},
                    }));
                } else {
                    app.message(ev.title, ev.text);
                }
                return;
            }
            case GeoEventType::Intercept: {
                int craftId = ev.refId, huntId = ev.refId2;
                app.push(makeChoiceBox(ev.title, ev.text + "\n\nEngage the target?", {
                    {"e", "Engage", [craftId, huntId](App& a) { a.push(makeIntercept(craftId, huntId)); }},
                    {"r", "Break off", [craftId](App& a) { recallCraft(*a.game, craftId); }},
                }));
                return;
            }
            case GeoEventType::CraftAtSite: {
                int craftId = ev.refId, siteId = ev.refId2;
                MissionSite* s = g.findSite(siteId);
                std::string light = s && isDaylight(s->pos, g.time)
                                        ? "It is DAYLIGHT there: vampires in the open will burn, but they will hide indoors."
                                        : "It is NIGHT there: vampires see in the dark and regenerate faster.";
                app.push(makeChoiceBox(ev.title, ev.text + "\n\n" + light, {
                    {"b", "Begin mission", [craftId, siteId](App& a) { beginMission(a, craftId, siteId); }},
                    {"w", "Wait (circle overhead)", {}},
                    {"r", "Return to base", [craftId](App& a) { recallCraft(*a.game, craftId); }},
                }));
                (void)self;
                return;
            }
            default: app.message(ev.title, ev.text); return;
        }
    }

    GlobeView globe_;
    ClickMap cm_;
    Box mapBox_;
    int speed_ = 0;
    bool paused_ = false;
    bool blink_ = false;
    double blinkTimer_ = 0;
    int selKind_ = -1, selId_ = -1;
    LatLon point_;
};

} // namespace

std::unique_ptr<Screen> makeGeoscape() { return std::make_unique<Geoscape>(); }

} // namespace vamps

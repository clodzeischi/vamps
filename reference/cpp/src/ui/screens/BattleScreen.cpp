// The battlescape: map view, unit panel, targeting, and the enemy turn.
//
// Mouse: left-click a soldier to select; left-click a tile to put the cursor
// there and click it again to move / fire / throw. Right-click turns the
// soldier to face that tile. Wheel changes the visible level.
// Keyboard: see the help text at the bottom of the panel.
#include <ftxui/component/mouse.hpp>

#include "core/Format.h"
#include "strategy/Simulation.h"
#include "tactical/Battle.h"
#include "tactical/Debriefing.h"
#include "ui/CellGrid.h"
#include "ui/Theme.h"
#include "ui/Widgets.h"
#include "ui/screens/Screens.h"

namespace vamps {

using namespace ftxui;

namespace {

const char* kArrows[8] = {"↑", "↗", "→", "↘", "↓", "↙", "←", "↖"};

enum class Mode { Move, Fire, Throw, Strike, Medkit };

const char* modeName(Mode m) {
    switch (m) {
        case Mode::Move: return "MOVE";
        case Mode::Fire: return "FIRE";
        case Mode::Throw: return "THROW";
        case Mode::Strike: return "STRIKE";
        case Mode::Medkit: return "MEDKIT";
    }
    return "?";
}

class BattleScreen : public Screen {
public:
    BattleScreen(std::unique_ptr<Battle> b, int craftId, int siteId)
        : battle_(std::move(b)), craftId_(craftId), siteId_(siteId) {
        selectNext();
        if (BattleUnit* u = selected()) cursor_ = u->pos, viewZ_ = u->pos.z;
    }

    Element render(App& app) override {
        cm_.clear();
        Battle& b = *battle_;
        const int panelW = 42;
        int tilesW = std::max(10, (app.width() - panelW - 1) / 2);
        int tilesH = std::max(8, app.height() - 1);
        tilesW = std::min(tilesW, b.map.width());
        tilesH = std::min(tilesH, b.map.height());
        followCursor(tilesW, tilesH);
        viewW_ = tilesW;
        viewH_ = tilesH;

        Element map = gridElement(drawMap(tilesW, tilesH)) | reflect(mapBox_);
        return hbox({map, separator(), drawPanel(app) | size(WIDTH, EQUAL, panelW)}) | bgcolor(Color::RGB(0, 0, 0));
    }

    bool onEvent(App& app, Event e) override {
        Battle& b = *battle_;
        if (b.outcome != BattleOutcome::Ongoing) {
            if (e == Event::Return || e == Event::Character(' ') || (e.is_mouse() && e.mouse().motion == Mouse::Pressed)) finish(app);
            return true;
        }
        if (b.side != Faction::Player) return true;
        if (e.is_mouse()) return onMouse(app, e);
        if (cm_.handle(e)) return true;

        // Cursor movement: arrows or vi keys (hjkl + yubn diagonals).
        struct K { Event ev; int dx, dy; };
        const K keys[] = {{Event::ArrowUp, 0, -1}, {Event::ArrowDown, 0, 1}, {Event::ArrowLeft, -1, 0}, {Event::ArrowRight, 1, 0},
                          {Event::Character('k'), 0, -1}, {Event::Character('j'), 0, 1}, {Event::Character('h'), -1, 0},
                          {Event::Character('l'), 1, 0}, {Event::Character('y'), -1, -1}, {Event::Character('u'), 1, -1},
                          {Event::Character('b'), -1, 1}, {Event::Character('n'), 1, 1}};
        for (const auto& k : keys)
            if (e == k.ev) {
                cursor_.x = std::clamp(cursor_.x + k.dx, 0, b.map.width() - 1);
                cursor_.y = std::clamp(cursor_.y + k.dy, 0, b.map.height() - 1);
                cursor_.z = viewZ_;
                return true;
            }
        if (e == Event::Return || e == Event::Character(' ')) { confirm(app); return true; }
        if (e == Event::Escape) { mode_ = Mode::Move; return true; }
        if (e == Event::PageUp) { viewZ_ = std::min(b.map.levels() - 1, viewZ_ + 1); cursor_.z = viewZ_; return true; }
        if (e == Event::PageDown) { viewZ_ = std::max(0, viewZ_ - 1); cursor_.z = viewZ_; return true; }
        if (mode_ == Mode::Fire && isKey(e, "123")) { shotMode_ = (ShotMode)(e.character()[0] - '1'); return true; }
        return false;
    }

    void onTick(App& app, double dt) override {
        Battle& b = *battle_;
        if (traceTimer_ > 0) traceTimer_ -= dt;
        if (b.outcome != BattleOutcome::Ongoing || b.side != Faction::Enemy) return;
        enemyTimer_ += dt;
        if (enemyTimer_ < 0.25) return;
        enemyTimer_ = 0;
        size_t logBefore = b.log.size();
        bool more = b.stepEnemyTurn();
        if (b.log.size() != logBefore) traceTimer_ = 0.6;
        if (!more && b.side == Faction::Player) {
            selectNext();
            if (BattleUnit* u = selected()) { cursor_ = u->pos; viewZ_ = u->pos.z; }
        }
    }

private:
    // ----- selection helpers -----
    BattleUnit* selected() {
        BattleUnit* u = battle_->unitById(selectedId_);
        return u && u->faction == Faction::Player && u->active() ? u : nullptr;
    }

    void selectNext() {
        auto& units = battle_->units;
        int start = 0;
        for (int i = 0; i < (int)units.size(); ++i)
            if (units[i].id == selectedId_) start = i + 1;
        for (int k = 0; k < (int)units.size(); ++k) {
            auto& u = units[(start + k) % units.size()];
            if (u.faction == Faction::Player && u.active() && (u.tu > 0 || k == (int)units.size() - 1)) {
                selectedId_ = u.id;
                return;
            }
        }
        for (auto& u : units)
            if (u.faction == Faction::Player && u.active()) { selectedId_ = u.id; return; }
    }

    void focusOnSelected() {
        if (BattleUnit* u = selected()) { cursor_ = u->pos; viewZ_ = u->pos.z; }
    }

    void followCursor(int w, int h) {
        const int margin = 3;
        if (cursor_.x < camX_ + margin) camX_ = cursor_.x - margin;
        if (cursor_.x >= camX_ + w - margin) camX_ = cursor_.x - w + margin + 1;
        if (cursor_.y < camY_ + margin) camY_ = cursor_.y - margin;
        if (cursor_.y >= camY_ + h - margin) camY_ = cursor_.y - h + margin + 1;
        camX_ = std::clamp(camX_, 0, std::max(0, battle_->map.width() - w));
        camY_ = std::clamp(camY_, 0, std::max(0, battle_->map.height() - h));
    }

    Slot activeHand(ItemKind kind) {
        BattleUnit* u = selected();
        if (!u) return Slot::RightHand;
        for (Slot s : {Slot::RightHand, Slot::LeftHand})
            if (const CarriedItem* c = u->inSlot(s); c && item(c->item.id).kind == kind) return s;
        return Slot::RightHand;
    }

    // ----- drawing -----
    std::shared_ptr<CellGrid> drawMap(int w, int h) {
        Battle& b = *battle_;
        auto grid = std::make_shared<CellGrid>(w * 2, h);
        BattleUnit* sel = selected();

        // Path preview in move mode.
        std::vector<Point3> path;
        int pathCost = 0;
        if (sel && mode_ == Mode::Move && !(cursor_ == sel->pos) && b.side == Faction::Player) {
            Path p = b.findPath(*sel, cursor_);
            if (p.found) { path = p.steps; pathCost = p.tuCost; }
        }
        pathCost_ = pathCost;

        for (int vy = 0; vy < h; ++vy)
            for (int vx = 0; vx < w; ++vx) {
                int x = camX_ + vx, y = camY_ + vy, z = viewZ_;
                std::string c0 = " ", c1 = " ";
                Rgb fg{0, 0, 0}, bg{0, 0, 0};
                bool bold = false;
                const Tile* t = &b.map.at(x, y, z);
                double shade = 1.0;
                // Open air on an upper level: look down.
                if (z > 0 && t->type == TileType::Void) {
                    t = &b.map.at(x, y, z - 1);
                    shade = 0.5;
                }
                if (t->explored) {
                    const TileDef& d = t->def();
                    c0 = std::string(1, d.glyph[0]);
                    c1 = std::string(1, d.glyph[1]);
                    fg = d.fg;
                    bg = d.bg;
                    if (!t->visible) shade *= 0.45;
                    else if (b.setup.night && !t->lit) shade *= 0.75;
                    if (t->visible && t->fire > 0) { c0 = "^"; c1 = "^"; fg = {255, 220, 60}; bg = {170, 50, 10}; shade = 1; }
                    else if (t->visible && t->smoke > 0) { c0 = "░"; c1 = "░"; fg = {150, 150, 150}; bg = {60, 60, 64}; }
                    else if (t->visible && !t->items.empty()) {
                        bool flare = false;
                        for (const auto& it : t->items) flare |= it.fuse == -2;
                        c1 = flare ? "*" : "&";
                        fg = flare ? Rgb{255, 255, 150} : Rgb{230, 200, 90};
                    }
                    fg = fg.scaled(shade);
                    bg = bg.scaled(shade);
                }
                // Units.
                Point3 p{x, y, z};
                if (const BattleUnit* u = b.unitAt(p); u && (u->faction == Faction::Player || b.playerSees.count(u->id))) {
                    c0 = std::string(1, u->glyph);
                    c1 = u->active() ? kArrows[u->facing] : (u->status == UnitStatus::Torpor ? "z" : "_");
                    bold = true;
                    if (u->faction == Faction::Player) { fg = {255, 255, 255}; bg = {30, 70, 150}; }
                    else if (u->faction == Faction::Enemy) { fg = {255, 90, 90}; bg = {80, 10, 14}; }
                    else { fg = {240, 230, 150}; bg = {70, 64, 20}; }
                    if (!u->active()) bg = {60, 20, 30};
                    if (u->kneeling) c1 = "▄";
                    if (sel && u->id == sel->id) { fg = {0, 0, 0}; bg = {230, 190, 40}; }
                }
                // Path and projectile trace.
                for (size_t i = 0; i < path.size(); ++i)
                    if (path[i] == p) bg = Rgb::mix(bg, sel && pathStepAffordable(*sel, i, path) ? Rgb{40, 160, 60} : Rgb{180, 110, 30}, 0.6);
                if (traceTimer_ > 0)
                    for (const auto& tp : b.lastTrace)
                        if (tp.x == x && tp.y == y && tp.z == z) { c1 = "•"; fg = {255, 240, 120}; }
                // Cursor.
                if (x == cursor_.x && y == cursor_.y) {
                    Rgb cbg = mode_ == Mode::Move ? Rgb{200, 200, 200} : Rgb{230, 60, 60};
                    bg = cbg;
                    fg = {0, 0, 0};
                    bold = true;
                }
                grid->put(vx * 2, vy, c0, fg, bg, bold);
                grid->put(vx * 2 + 1, vy, c1, fg, bg, bold);
            }
        return grid;
    }

    bool pathStepAffordable(const BattleUnit& u, size_t i, const std::vector<Point3>& path) {
        // Cheap estimate: 4 TU per step ortho, 6 diagonal.
        int cost = u.kneeling ? 8 : 0;
        Point3 prev = u.pos;
        for (size_t k = 0; k <= i; ++k) {
            cost += battle_->stepCost(prev, path[k]);
            prev = path[k];
        }
        return cost <= u.tu;
    }

    Element drawPanel(App& app) {
        Battle& b = *battle_;
        Elements out;
        bool playerTurn = b.side == Faction::Player;
        out.push_back(header(fmt("TURN %d", b.turn), playerTurn ? "YOUR TURN" : "ENEMY TURN"));
        out.push_back(text(b.setup.night ? "Night" : "Day - vampires burn in the open") |
                      color(b.setup.night ? theme::kInfo : theme::kWarn));
        out.push_back(text(fmt("Level %d/%d   %s", viewZ_ + 1, b.map.levels(), mapKindName(b.setup.mapKind))) | color(theme::kDim));

        if (b.outcome != BattleOutcome::Ongoing) {
            const char* msg = b.outcome == BattleOutcome::Victory ? "MISSION SUCCESSFUL"
                              : b.outcome == BattleOutcome::Aborted ? "MISSION ABORTED" : "MISSION FAILED";
            out.push_back(separator());
            out.push_back(text(msg) | bold | color(b.outcome == BattleOutcome::Victory ? theme::kGood : theme::kBad) | center);
            out.push_back(text(continuesToNextStage(b) ? "Press Enter to descend to the catacombs" : "Press Enter for the debriefing") |
                          color(theme::kText) | center);
        }

        out.push_back(separator());
        if (BattleUnit* u = selected()) {
            out.push_back(text(u->name) | bold | color(theme::kAccent));
            auto bar = [](const char* n, int v, int m, Color c) {
                return hbox({text(padRight(n, 8)) | color(theme::kDim), text(fmt("%3d ", v)), meter(v, m, 20, c)});
            };
            out.push_back(bar("TU", u->tu, u->maxTu(), theme::kInfo));
            out.push_back(bar("Energy", u->energy, u->stats.stamina, theme::kWarn));
            out.push_back(bar("Health", u->hp, u->stats.health, theme::kBad));
            out.push_back(bar("Morale", u->morale, 100, theme::kGood));
            std::string flags;
            if (u->kneeling) flags += "kneeling  ";
            if (u->fatalWounds) flags += fmt("%d fatal wounds  ", u->fatalWounds);
            if (u->dominated) flags += "DOMINATED";
            if (!flags.empty()) out.push_back(text(flags) | color(theme::kBad));
            for (Slot s : {Slot::RightHand, Slot::LeftHand}) {
                const CarriedItem* c = u->inSlot(s);
                std::string desc = "-";
                if (c) {
                    const ItemDef& d = item(c->item.id);
                    desc = d.name;
                    if (d.kind == ItemKind::Firearm)
                        desc += c->item.ammoId.empty() ? " (empty)" : fmt(" [%s %d]", item(c->item.ammoId).damageType == DamageType::Incendiary ? "INC" : "", c->item.ammo);
                    if (d.kind == ItemKind::Grenade && c->item.fuse >= 0) desc += fmt(" PRIMED(%d)", c->item.fuse);
                }
                out.push_back(hbox({text(s == Slot::RightHand ? "R: " : "L: ") | color(theme::kDim), text(desc) | color(theme::kText)}));
            }
        }

        // Mode / target information.
        out.push_back(separator());
        out.push_back(text(std::string("Mode: ") + modeName(mode_)) | bold | color(mode_ == Mode::Move ? theme::kText : theme::kBad));
        if (BattleUnit* u = selected()) {
            if (mode_ == Mode::Move && pathCost_ > 0)
                out.push_back(text(fmt("Move cost: %d TU", pathCost_ + (u->kneeling ? 8 : 0))) |
                              color(pathCost_ <= u->tu ? theme::kGood : theme::kWarn));
            if (mode_ == Mode::Fire) {
                ShotPreview p = b.previewShot(*u, fireHand_, shotMode_, cursor_);
                out.push_back(text(fmt("%s shot: %d TU, %d%% to hit", shotModeName(shotMode_), p.tuCost, p.accuracy)) |
                              color(p.possible ? theme::kGood : theme::kWarn));
                if (!p.possible) out.push_back(paragraph(p.reason) | color(theme::kWarn));
                if (p.friendlyInLine) out.push_back(text("WARNING: a friendly is in the line of fire!") | bold | color(theme::kBad));
                out.push_back(text("1 Snap  2 Aimed  3 Auto   Enter/click: fire") | color(theme::kDim));
            }
            if (mode_ == Mode::Throw)
                if (const CarriedItem* c = u->inSlot(throwHand_)) {
                    int range = b.throwRange(*u, item(c->item.id));
                    int dist = std::max(std::abs(cursor_.x - u->pos.x), std::abs(cursor_.y - u->pos.y));
                    out.push_back(text(fmt("Throw %s: %d TU, range %d (target %d)", item(c->item.id).name.c_str(),
                                           u->maxTu() / 4, range, dist)) | color(dist <= range ? theme::kGood : theme::kWarn));
                }
            if (mode_ == Mode::Strike)
                out.push_back(text(fmt("Strike: %d TU. Target an adjacent tile.", b.meleeTuCost(*u, meleeHand()))) | color(theme::kText));
            if (mode_ == Mode::Medkit) out.push_back(text("Medkit: 10 TU. Target yourself or an adjacent soldier.") | color(theme::kText));
        }
        if (const BattleUnit* t = b.unitAt(cursor_); t && (t->faction == Faction::Player || b.playerSees.count(t->id))) {
            std::string status = t->active() ? "" : t->status == UnitStatus::Torpor ? (t->regenBlocked ? "  TORPOR (darted)" : "  TORPOR - burn it!")
                                                                                     : "  down";
            out.push_back(text("Target: " + t->name + status) | color(t->faction == Faction::Enemy ? theme::kBad : theme::kText));
        }
        const Tile& ct = b.map.at(cursor_);
        if (ct.explored) {
            std::string desc = ct.def().name;
            if (!ct.items.empty()) desc += fmt(", %d item(s)", (int)ct.items.size());
            if (ct.fire) desc += ", burning";
            out.push_back(text("Tile: " + desc) | color(theme::kDim));
        }

        // Actions.
        out.push_back(separator());
        if (playerTurn && b.outcome == BattleOutcome::Ongoing) {
            out.push_back(hflow({
                button(cm_, "f", "Fire", [this] { startFire(); }), text(" "),
                button(cm_, "t", "Throw", [this, &app] { startThrow(app); }), text(" "),
                button(cm_, "s", "Strike", [this] { mode_ = Mode::Strike; }), text(" "),
                button(cm_, "r", "Reload", [this, &app] { act(app, [this](Battle& bt, BattleUnit& u) { return bt.reload(u, activeHand(ItemKind::Firearm)); }); }), text(" "),
                button(cm_, "c", "Kneel", [this, &app] { act(app, [](Battle& bt, BattleUnit& u) { return bt.toggleKneel(u); }); }), text(" "),
                button(cm_, "i", "Inventory", [this, &app] { if (BattleUnit* u = selected()) app.push(makeBattleInventory(*battle_, u->id)); }), text(" "),
                button(cm_, "m", "Medkit", [this] { mode_ = Mode::Medkit; }), text(" "),
                button(cm_, "p", "Prime", [this, &app] { act(app, [this](Battle& bt, BattleUnit& u) { return bt.primeGrenade(u, activeHand(ItemKind::Grenade), 0); }); }), text(" "),
                button(cm_, "x", "Scanner", [this, &app] { act(app, [](Battle& bt, BattleUnit& u) {
                    return bt.useTracker(u, u.inSlot(Slot::LeftHand) && u.inSlot(Slot::LeftHand)->item.id == "tracker" ? Slot::LeftHand : Slot::RightHand); }); }), text(" "),
                button(cm_, ">", "Upstairs", [this, &app] { act(app, [](Battle& bt, BattleUnit& u) { return bt.changeLevel(u, 1); }); followUnit(); }), text(" "),
                button(cm_, "<", "Downstairs", [this, &app] { act(app, [](Battle& bt, BattleUnit& u) { return bt.changeLevel(u, -1); }); followUnit(); }), text(" "),
                button(cm_, "\t", "Next", [this] { selectNext(); focusOnSelected(); }), text(" "),
                button(cm_, "e", "End turn", [this] { endTurn(); }), text(" "),
                button(cm_, "a", "Abort", [this, &app] { askAbort(app); }),
            }));
            out.push_back(text("Cursor: arrows / hjkl yubn  Enter: go") | color(theme::kDim));
            out.push_back(text("PgUp/PgDn: view level  Esc: cancel") | color(theme::kDim));
        }

        // Log.
        out.push_back(separator());
        Elements log;
        int lines = 12;
        int start = std::max(0, (int)b.log.size() - lines);
        for (int i = start; i < (int)b.log.size(); ++i) log.push_back(paragraph(b.log[i]) | color(i == (int)b.log.size() - 1 ? theme::kText : theme::kDim));
        out.push_back(vbox(std::move(log)) | flex);
        return vbox(std::move(out));
    }

    // ----- actions -----
    void act(App& app, const std::function<bool(Battle&, BattleUnit&)>& fn) {
        BattleUnit* u = selected();
        if (!u) return;
        if (!fn(*battle_, *u) && !battle_->lastError.empty()) battle_->addLog("! " + battle_->lastError);
        traceTimer_ = 0.8;
        if (!selected()) selectNext();
    }

    void followUnit() {
        if (BattleUnit* u = selected()) { viewZ_ = u->pos.z; cursor_ = u->pos; }
    }

    Slot meleeHand() {
        BattleUnit* u = selected();
        if (!u) return Slot::RightHand;
        for (Slot s : {Slot::RightHand, Slot::LeftHand})
            if (const CarriedItem* c = u->inSlot(s); c && item(c->item.id).kind == ItemKind::MeleeWeapon) return s;
        return u->inSlot(Slot::RightHand) ? Slot::RightHand : Slot::LeftHand;
    }

    void startFire() {
        BattleUnit* u = selected();
        if (!u) return;
        fireHand_ = activeHand(ItemKind::Firearm);
        const CarriedItem* c = u->inSlot(fireHand_);
        if (!c || item(c->item.id).kind != ItemKind::Firearm) { battle_->addLog("! No firearm in hand."); return; }
        mode_ = Mode::Fire;
        if (!item(c->item.id).snap.available()) shotMode_ = ShotMode::Aimed;
    }

    void startThrow(App& app) {
        BattleUnit* u = selected();
        if (!u) return;
        // Prefer a grenade in either hand, else whatever is in the right hand.
        throwHand_ = activeHand(ItemKind::Grenade);
        if (!u->inSlot(throwHand_)) throwHand_ = u->inSlot(Slot::RightHand) ? Slot::RightHand : Slot::LeftHand;
        if (!u->inSlot(throwHand_)) { battle_->addLog("! Nothing in hand to throw. Use the inventory (i)."); return; }
        mode_ = Mode::Throw;
    }

    void confirm(App& app) {
        Battle& b = *battle_;
        BattleUnit* u = selected();
        if (!u) return;
        switch (mode_) {
            case Mode::Move: {
                const BattleUnit* there = b.unitAt(cursor_);
                if (there && there->faction == Faction::Player && there->active()) { selectedId_ = there->id; return; }
                act(app, [this](Battle& bt, BattleUnit& x) { return bt.move(x, cursor_); });
                if (BattleUnit* s = selected()) viewZ_ = s->pos.z;
                break;
            }
            case Mode::Fire:
                act(app, [this](Battle& bt, BattleUnit& x) { return bt.shoot(x, fireHand_, shotMode_, cursor_); });
                break;
            case Mode::Throw:
                act(app, [this](Battle& bt, BattleUnit& x) { return bt.throwItem(x, throwHand_, cursor_); });
                mode_ = Mode::Move;
                break;
            case Mode::Strike:
                if (BattleUnit* t = b.unitAt(cursor_); t && t != u)
                    act(app, [this, t](Battle& bt, BattleUnit& x) { return bt.melee(x, meleeHand(), *t); });
                break;
            case Mode::Medkit:
                if (BattleUnit* t = b.unitAt(cursor_)) {
                    Slot hand = activeHand(ItemKind::Medkit);
                    act(app, [t, hand](Battle& bt, BattleUnit& x) { return bt.useMedkit(x, hand, *t); });
                }
                mode_ = Mode::Move;
                break;
        }
    }

    bool onMouse(App& app, Event e) {
        Mouse m = e.mouse();
        if (!mapBox_.Contain(m.x, m.y)) return cm_.handle(e);
        Battle& b = *battle_;
        Point3 tile{camX_ + (m.x - mapBox_.x_min) / 2, camY_ + (m.y - mapBox_.y_min), viewZ_};
        if (!b.map.inside(tile)) return true;
        if (m.button == Mouse::WheelUp) { viewZ_ = std::min(b.map.levels() - 1, viewZ_ + 1); cursor_.z = viewZ_; return true; }
        if (m.button == Mouse::WheelDown) { viewZ_ = std::max(0, viewZ_ - 1); cursor_.z = viewZ_; return true; }
        if (m.motion != Mouse::Pressed) return true;
        if (m.button == Mouse::Right) {
            act(app, [tile](Battle& bt, BattleUnit& u) { return bt.turnTo(u, tile); });
            return true;
        }
        if (m.button != Mouse::Left) return true;
        if (mode_ == Mode::Move) {
            const BattleUnit* there = b.unitAt(tile);
            if (there && there->faction == Faction::Player && there->active()) {
                selectedId_ = there->id;
                cursor_ = tile;
                return true;
            }
        }
        if (tile == cursor_) confirm(app);
        else cursor_ = tile;
        return true;
    }

    void endTurn() {
        mode_ = Mode::Move;
        battle_->endPlayerTurn();
        enemyTimer_ = 0;
    }

    void askAbort(App& app) {
        Battle* b = battle_.get();
        app.push(makeChoiceBox("Abort Mission",
                               "Soldiers standing on the transport ramp (::) will escape. Everyone else is lost.",
                               {{"y", "Abort", [b](App&) { b->abort(); }}, {"n", "Keep fighting", {}}}));
    }

    void finish(App& app) {
        if (continuesToNextStage(*battle_)) {
            battle_ = std::make_unique<Battle>(Battle::nextStage(*battle_));
            selectedId_ = -1;
            selectNext();
            focusOnSelected();
            app.message("The Catacombs", "The surface is ours. Beneath the ruins a stair descends into the dark. "
                                         "The Progenitor waits below. There is no daylight down here.");
            return;
        }
        Debriefing d = applyBattleResult(*app.game, *battle_, craftId_, siteId_);
        app.replaceTop(makeDebrief(d));
    }

    std::unique_ptr<Battle> battle_;
    int craftId_, siteId_;
    int selectedId_ = -1;
    Point3 cursor_;
    int viewZ_ = 0;
    int camX_ = 0, camY_ = 0, viewW_ = 0, viewH_ = 0;
    Mode mode_ = Mode::Move;
    Slot fireHand_ = Slot::RightHand, throwHand_ = Slot::RightHand;
    ShotMode shotMode_ = ShotMode::Snap;
    int pathCost_ = 0;
    double enemyTimer_ = 0, traceTimer_ = 0;
    ClickMap cm_;
    Box mapBox_;
};

} // namespace

std::unique_ptr<Screen> makeBattle(std::unique_ptr<Battle> b, int craftId, int siteId) {
    return std::make_unique<BattleScreen>(std::move(b), craftId, siteId);
}

void beginMission(App& app, int craftId, int siteId) {
    GameState& g = *app.game;
    Craft* c = g.findCraft(craftId);
    MissionSite* s = g.findSite(siteId);
    if (!c || !s) { app.error("The site is gone."); return; }
    // Top up every soldier's magazines from base stores before deployment.
    if (Base* b = g.findBase(c->baseId))
        for (auto& sol : g.soldiers) {
            if (sol.craftId != c->id) continue;
            for (auto& ci : sol.loadout) {
                const ItemDef& d = item(ci.item.id);
                if (d.kind != ItemKind::Firearm || d.ammo.empty()) continue;
                bool full = !ci.item.ammoId.empty() && ci.item.ammo >= item(ci.item.ammoId).clipSize;
                if (full) continue;
                std::string want = ci.item.ammoId.empty() ? d.ammo.front() : ci.item.ammoId;
                if (b->removeItem(want)) { ci.item.ammoId = want; ci.item.ammo = item(want).clipSize; }
            }
        }
    MissionSetup setup = buildMissionSetup(g, *s, *c);
    if (setup.squad.empty()) { app.error("No fit soldiers aboard " + c->name + "."); return; }
    app.push(makeBattle(std::make_unique<Battle>(setup), craftId, siteId));
    app.message("Briefing", setup.title + "\n\n" +
                                (setup.night ? "Night operation. Your soldiers see 9 tiles in the dark (more in firelight "
                                               "or under flares)."
                                             : "Daylight. Vampires in the open take sun damage and will try to get indoors.") +
                                "\n\nSelect a soldier, click a tile, click again to move. Bullets put vampires down; "
                                "burn the bodies (molotovs, incendiaries) before they rise.");
}

} // namespace vamps

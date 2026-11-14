// Headless smoke test. Exercises every system without a terminal:
//   1. map generation for every terrain
//   2. months of campaign simulation (events auto-resolved, interceptions fought)
//   3. full battles, AI vs a scripted squad, on every mission type
//   4. save -> load round trip
//   5. every screen rendered off-screen
// Exits non-zero on the first failed check.

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <iostream>

#include <ftxui/component/screen_interactive.hpp>
#include <ftxui/dom/elements.hpp>
#include <ftxui/screen/screen.hpp>
#include <ftxui/screen/terminal.hpp>

#include "core/Random.h"
#include "strategy/BloodlineAI.h"
#include "strategy/Campaign.h"
#include "strategy/Interception.h"
#include "strategy/Labs.h"
#include "strategy/SaveGame.h"
#include "strategy/Simulation.h"
#include "tactical/Battle.h"
#include "tactical/Debriefing.h"
#include "tactical/MapBlocks.h"
#include "ui/App.h"
#include "ui/screens/Screens.h"

using namespace vamps;

static int failures = 0;
#define CHECK(cond, msg)                                                   \
    do {                                                                   \
        if (!(cond)) {                                                     \
            std::printf("FAIL: %s  (%s:%d)\n", msg, __FILE__, __LINE__);   \
            ++failures;                                                    \
        }                                                                  \
    } while (0)

// ---------------------------------------------------------------------------
static void testMaps() {
    const MapKind kinds[] = {MapKind::Rural, MapKind::Forest, MapKind::Urban, MapKind::Desert, MapKind::Arctic,
                             MapKind::Jungle, MapKind::Lair, MapKind::Ruins, MapKind::Catacombs};
    for (MapKind k : kinds)
        for (int i = 0; i < 20; ++i) {
            MapRequest req;
            req.kind = k;
            req.wreck = i % 2 == 0 && k != MapKind::Lair && k != MapKind::Catacombs;
            req.progenitorHall = k == MapKind::Catacombs;
            BattleMap m = generateMap(req);
            CHECK(m.playerSpawns.size() >= 14, mapKindName(k));
            CHECK(m.width() == 40 && m.height() == 40, "map size");
        }
    std::printf("maps ok\n");
}

// ---------------------------------------------------------------------------
// A scripted squad: every soldier shoots the nearest visible enemy, burns
// bodies in torpor with molotovs, otherwise walks toward the enemy.
static void playerTurn(Battle& b) {
    for (auto& u : b.units) {
        if (u.faction != Faction::Player || !u.active()) continue;
        for (int action = 0; action < 6 && u.active() && b.outcome == BattleOutcome::Ongoing; ++action) {
            BattleUnit* target = nullptr;
            BattleUnit* body = nullptr;
            for (auto& o : b.units) {
                if (o.faction != Faction::Enemy || !b.playerSees.count(o.id)) continue;
                if (o.active() && (!target || std::abs(o.pos.x - u.pos.x) + std::abs(o.pos.y - u.pos.y) <
                                                  std::abs(target->pos.x - u.pos.x) + std::abs(target->pos.y - u.pos.y)))
                    target = &o;
                if (o.status == UnitStatus::Torpor) body = &o;
            }
            if (body) {
                // Molotov into a hand, throw it at the body.
                for (int i = 0; i < (int)u.inv.size(); ++i)
                    if (u.inv[i].item.id == "molotov" && !u.inSlot(Slot::LeftHand)) { b.moveItem(u, i, Slot::LeftHand); break; }
                if (u.inSlot(Slot::LeftHand) && u.inSlot(Slot::LeftHand)->item.id == "molotov" &&
                    b.throwItem(u, Slot::LeftHand, body->pos))
                    continue;
            }
            if (target) {
                if (u.inSlot(Slot::RightHand) && u.inSlot(Slot::RightHand)->item.ammo == 0) b.reload(u, Slot::RightHand);
                if (b.previewShot(u, Slot::RightHand, ShotMode::Snap, target->pos).friendlyInLine) target = nullptr;
            }
            if (target) {
                if (!u.kneeling && u.tu > 30) b.toggleKneel(u);
                if (b.shoot(u, Slot::RightHand, ShotMode::Aimed, target->pos)) continue;
                if (b.shoot(u, Slot::RightHand, ShotMode::Snap, target->pos)) continue;
            }
            // Advance toward the nearest enemy.
            const BattleUnit* nearest = nullptr;
            for (const auto& o : b.units)
                if (o.faction == Faction::Enemy && o.active() &&
                    (!nearest || std::abs(o.pos.x - u.pos.x) + std::abs(o.pos.y - u.pos.y) <
                                     std::abs(nearest->pos.x - u.pos.x) + std::abs(nearest->pos.y - u.pos.y)))
                    nearest = &o;
            if (!nearest) break;
            Point3 dest = b.freeTileNear(u, nearest->pos);
            Path p = b.findPath(u, dest);
            if (!p.found) {
                // Walk toward it as far as possible on any reachable tile.
                Point3 step{std::clamp(u.pos.x + (dest.x > u.pos.x) - (dest.x < u.pos.x) * 1, 0, 39),
                            std::clamp(u.pos.y + (dest.y > u.pos.y) - (dest.y < u.pos.y) * 1, 0, 39), u.pos.z};
                if (!b.move(u, step)) break;
            } else if (p.steps.size() > 1) {
                if (!b.move(u, p.steps[std::min<size_t>(p.steps.size() - 2, 6)])) break;
            } else break;
        }
    }
}

static BattleOutcome runBattle(MissionSetup setup, int maxTurns, int* turnsOut) {
    Battle b(setup);
    for (int t = 0; t < maxTurns && b.outcome == BattleOutcome::Ongoing; ++t) {
        playerTurn(b);
        if (b.outcome != BattleOutcome::Ongoing) break;
        b.endPlayerTurn();
        int guard = 0;
        while (b.stepEnemyTurn() && guard++ < 500) {}
        CHECK(guard < 500, "enemy turn never ended");
    }
    if (continuesToNextStage(b)) {
        Battle s2 = Battle::nextStage(b);
        CHECK(s2.activeCount(Faction::Player) > 0, "stage 2 has soldiers");
    }
    if (turnsOut) *turnsOut = b.turn;
    if (std::getenv("VAMPS_LOG")) { for (const auto& l : b.log) std::printf("    | %s\n", l.c_str()); std::exit(0); }
    if (std::getenv("VAMPS_VERBOSE")) {
        int alive = 0, torpor = 0, dead = 0, burned = 0, active = 0;
        for (const auto& u : b.units) {
            if (u.faction == Faction::Player && u.active()) ++alive;
            if (u.faction != Faction::Enemy) continue;
            if (u.active()) ++active;
            else if (u.status == UnitStatus::Torpor) ++torpor;
            else if (u.status == UnitStatus::Incinerated) ++burned;
            else ++dead;
        }
        std::printf("  %-14s %s turn %2d outcome %d | soldiers left %d | enemies active %d torpor %d dead %d burned %d\n",
                    siteTypeName(setup.siteType), setup.night ? "night" : "day  ", b.turn, (int)b.outcome, alive, active,
                    torpor, dead, burned);
    }
    return b.outcome;
}

static void testBattles(GameState& g) {
    const SiteType types[] = {SiteType::PREvent, SiteType::CrashSite, SiteType::LandedHunt, SiteType::Harvest, SiteType::PREvent,
                              SiteType::Lair, SiteType::Final};
    int wins = 0, losses = 0, other = 0, total = 0;
    for (SiteType t : types)
        for (int night = 0; night < 2; ++night)
            for (int rep = 0; rep < 4; ++rep) {
                MissionSite s;
                s.id = 999;
                s.type = t;
                s.pos = {48.0, 2.0};
                s.bloodline = rep % kBloodlineCount;
                s.nation = 7;
                s.crew = 6;
                Craft& c = g.craft.front();
                MissionSetup m = buildMissionSetup(g, s, c);
                m.night = night == 1;
                g.monthIndex = rep;
                m.monthIndex = rep;
                int turns = 0;
                BattleOutcome o = runBattle(m, 40, &turns);
                ++total;
                if (o == BattleOutcome::Victory) ++wins;
                else if (o == BattleOutcome::Defeat) ++losses;
                else ++other;
            }
    g.monthIndex = 0;
    std::printf("battles ok: %d fought, %d won, %d lost, %d unresolved after 40 turns\n", total, wins, losses, other);
    CHECK(wins + losses > 0, "some battles resolved");
}

static void testDebrief(GameState& g) {
    // A real site, a real battle, applied to the campaign.
    MissionSite s;
    s.id = g.newId();
    s.type = SiteType::CrashSite;
    s.pos = g.bases.front().pos;
    s.nation = 7;
    s.crew = 4;
    s.expires = g.time.seconds + 86400;
    g.sites.push_back(s);
    Craft& c = g.craft.front();
    size_t before = g.soldiers.size();
    MissionSetup m = buildMissionSetup(g, s, c);
    Battle b(m);
    for (int t = 0; t < 40 && b.outcome == BattleOutcome::Ongoing; ++t) {
        playerTurn(b);
        b.endPlayerTurn();
        while (b.stepEnemyTurn()) {}
    }
    Debriefing d = applyBattleResult(g, b, c.id, s.id);
    CHECK(g.soldiers.size() <= before, "no soldiers created by debrief");
    std::printf("debrief ok: %s, score %d, %zu item types recovered\n", d.title.c_str(), d.score, d.recovered.size());
}

// ---------------------------------------------------------------------------
static void testCampaign(GameState& g, int days) {
    int detected = 0, sites = 0, intercepts = 0, months = 0, research = 0;
    int64_t end = g.time.seconds + (int64_t)days * 86400;
    // Start some research so the labs tick.
    std::string err;
    startResearch(g, g.bases.front(), "albigensian_records", 10, err);
    while (g.time.seconds < end && !g.gameOver) {
        advanceTime(g, 3600);
        while (!g.events.empty()) {
            GeoEvent e = g.events.front();
            g.events.pop_front();
            switch (e.type) {
                case GeoEventType::HuntDetected: {
                    ++detected;
                    // Send the first ready interceptor.
                    for (auto& c : g.craft)
                        if (c.type == "lancer" && c.status == CraftStatus::Ready) {
                            launchCraft(g, c.id, CraftTarget::Hunt, e.refId, {}, err);
                            break;
                        }
                    break;
                }
                case GeoEventType::Intercept: {
                    ++intercepts;
                    Dogfight d = startDogfight(g, e.refId, e.refId2);
                    for (int i = 0; i < 300 && d.result == DogfightResult::Ongoing; ++i) stepDogfight(g, d);
                    finishDogfight(g, d);
                    break;
                }
                case GeoEventType::SiteAppeared: ++sites; break;
                case GeoEventType::MonthlyReport: ++months; break;
                case GeoEventType::ResearchDone: ++research; break;
                default: break;
            }
        }
        for (auto& b : g.bases)
            if (b.research.empty()) {
                auto avail = availableResearch(g);
                if (!avail.empty()) startResearch(g, b, avail.front()->id, b.scientistsFree(), err);
            }
    }
    std::printf("campaign ok: %d days, %d flights detected, %d interceptions, %d sites, %d monthly reports, "
                "%d topics researched, funds %lld, secrecy %.0f, support %+.0f%s\n",
                days, detected, intercepts, sites, months, research, (long long)g.funds, g.secrecy, g.averageSupport(),
                g.gameOver ? (" GAME OVER: " + g.gameOverReason).c_str() : "");
    CHECK(months >= days / 31, "monthly reports happen");
    CHECK(detected > 0, "flights get detected");
}

// ---------------------------------------------------------------------------
static void testSaveLoad(GameState& g) {
    std::string err;
    CHECK(saveGame(g, 6, err), "save");
    GameState l;
    CHECK(loadGame(l, 6, err), ("load: " + err).c_str());
    CHECK(l.time.seconds == g.time.seconds, "time round-trips");
    CHECK(l.funds == g.funds, "funds round-trip");
    CHECK(l.soldiers.size() == g.soldiers.size(), "soldiers round-trip");
    CHECK(l.bases.size() == g.bases.size() && l.bases[0].stores == g.bases[0].stores, "stores round-trip");
    CHECK(l.hunts.size() == g.hunts.size() && l.sites.size() == g.sites.size(), "hunts/sites round-trip");
    CHECK(l.researched == g.researched, "research round-trips");
    // A loaded game must be able to keep running.
    advanceTime(l, 86400);
    std::filesystem::remove(savePath(6));
    std::printf("save/load ok\n");
}

// ---------------------------------------------------------------------------
static void renderAll(GameState& g) {
    ftxui::Terminal::SetFallbackSize({150, 48});
    auto interactive = ftxui::ScreenInteractive::FitComponent();
    App app(interactive);
    app.game = std::make_unique<GameState>(g);
    int base = g.bases.front().id;
    int soldier = g.soldiers.empty() ? -1 : g.soldiers.front().id;
    std::vector<std::pair<const char*, std::unique_ptr<Screen>>> screens;
    screens.emplace_back("main menu", makeMainMenu());
    screens.emplace_back("placement", makeBasePlacement(Difficulty::Normal));
    screens.emplace_back("geoscape", makeGeoscape());
    screens.emplace_back("launch", makeLaunch(CraftTarget::None, -1, {}));
    screens.emplace_back("base", makeBase(base));
    screens.emplace_back("research", makeResearch(base));
    screens.emplace_back("manufacture", makeManufacture(base));
    screens.emplace_back("soldiers", makeSoldiers(base));
    if (soldier >= 0) screens.emplace_back("equip", makeEquip(soldier));
    screens.emplace_back("craft", makeCraftScreen(base));
    screens.emplace_back("market", makeMarket(base));
    screens.emplace_back("black market", makeBlackMarket(base));
    screens.emplace_back("transfer", makeTransfer(base));
    screens.emplace_back("politics", makePolitics());
    screens.emplace_back("archive", makeArchive());
    screens.emplace_back("save", makeSaveLoad(true));
    screens.emplace_back("message", makeMessageBox("Title", "Some text\n\nMore  text"));
    screens.emplace_back("game over", makeGameOver(true, "You won."));
    MissionSite s;
    s.type = SiteType::Harvest;
    s.pos = {48, 2};
    s.crew = 6;
    MissionSetup m = buildMissionSetup(*app.game, s, app.game->craft.front());
    auto battle = std::make_unique<Battle>(m);
    Battle* bp = battle.get();
    screens.emplace_back("battle", makeBattle(std::move(battle), app.game->craft.front().id, -1));
    screens.emplace_back("inventory", makeBattleInventory(*bp, bp->units.front().id));
    Debriefing d;
    d.title = "TEST";
    d.recovered = {{"Rifle", 2}};
    screens.emplace_back("debrief", makeDebrief(d));

    for (auto& [name, scr] : screens) {
        for (int frame = 0; frame < 3; ++frame) {
            auto out = ftxui::Screen::Create(ftxui::Dimension::Fixed(150), ftxui::Dimension::Fixed(48));
            ftxui::Element e = scr->render(app);
            ftxui::Render(out, e);
            if (const char* dir = std::getenv("VAMPS_DUMP"); dir && frame == 2) {
                std::string path = std::string(dir) + "/" + name + ".txt";
                if (FILE* f = std::fopen(path.c_str(), "w")) { std::fputs(out.ToString().c_str(), f); std::fclose(f); }
            }
            scr->onTick(app, 0.05);
        }
    }
    std::printf("rendered %zu screens ok\n", screens.size());
}

int main() {
    rng().seed(12345);
    std::string err;
    if (!blockLibrary().load(dataDirectory(), err)) {
        std::printf("FAIL: %s\n", err.c_str());
        return 1;
    }
    testMaps();
    for (Difficulty d : {Difficulty::Easy, Difficulty::Normal, Difficulty::Hard}) {
        GameState g = newCampaign(d, {46.0, 2.0}, "Test Base");
        std::printf("--- %s ---\n", difficulty(d).name);
        testCampaign(g, 120);
        testSaveLoad(g);
    }
    GameState g = newCampaign(Difficulty::Normal, {46.0, 2.0}, "Test Base");
    testBattles(g);
    testDebrief(g);
    renderAll(g);
    if (const char* dir = std::getenv("VAMPS_DUMP")) {
        void dumpGlobe(const GameState&, const std::string&, double, double, double);
        dumpGlobe(g, std::string(dir) + "/globe_europe.bmp", 35, 15, 1.0);
        dumpGlobe(g, std::string(dir) + "/globe_americas.bmp", 10, -80, 1.0);
        dumpGlobe(g, std::string(dir) + "/globe_asia.bmp", 15, 110, 1.0);
        dumpGlobe(g, std::string(dir) + "/globe_zoom.bmp", 46, 5, 3.0);
    }
    std::printf(failures ? "\n%d FAILURES\n" : "\nALL CHECKS PASSED\n", failures);
    return failures ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Debug helper (VAMPS_DUMP): writes the globe as a BMP image so the
// coastlines and shading can be checked by eye. Not part of the checks.
#include <fstream>
#include "ui/GlobeView.h"
void dumpGlobe(const GameState& g, const std::string& path, double lat, double lon, double zoom) {
    GlobeView v;
    v.centerLat = lat;
    v.centerLon = lon;
    v.zoom = zoom;
    const int cw = 120, ch = 60, scale = 4;
    auto grid = v.render(&g, cw, ch);
    const int W = cw * scale, H = ch * 2 * scale;
    std::vector<uint8_t> px(W * H * 3);
    for (int y = 0; y < ch; ++y)
        for (int x = 0; x < cw; ++x) {
            const Cell& c = grid->at(x, y);
            bool half = c.ch == "▀";
            for (int sub = 0; sub < 2; ++sub) {
                Rgb col = half ? (sub == 0 ? c.fg : c.bg) : (c.ch == " " ? c.bg : c.fg);
                for (int dy = 0; dy < scale; ++dy)
                    for (int dx = 0; dx < scale; ++dx) {
                        int X = x * scale + dx, Y = (y * 2 + sub) * scale + dy;
                        uint8_t* p = &px[((H - 1 - Y) * W + X) * 3]; // BMP is bottom-up, BGR
                        p[0] = col.b; p[1] = col.g; p[2] = col.r;
                    }
            }
        }
    std::ofstream f(path, std::ios::binary);
    auto u32 = [&](uint32_t v) { f.write((const char*)&v, 4); };
    auto u16 = [&](uint16_t v) { f.write((const char*)&v, 2); };
    f.write("BM", 2); u32(54 + px.size()); u32(0); u32(54);
    u32(40); u32(W); u32(H); u16(1); u16(24); u32(0); u32(px.size()); u32(2835); u32(2835); u32(0); u32(0);
    f.write((const char*)px.data(), px.size());
}

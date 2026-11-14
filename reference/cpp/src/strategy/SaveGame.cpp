#include "strategy/SaveGame.h"

#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <sstream>

#include "core/Format.h"

namespace vamps {

namespace {

constexpr int kSaveVersion = 1;

// ---------------------------------------------------------------------------
// Archive: one object that either writes or reads tokens.
// ---------------------------------------------------------------------------
class Archive {
public:
    explicit Archive(std::ostream& out) : out_(&out) {}
    explicit Archive(std::istream& in) : in_(&in) {}

    bool reading() const { return in_ != nullptr; }
    bool ok() const { return ok_; }
    const std::string& error() const { return error_; }

    // Section label: written as-is, verified when reading.
    void label(const char* name) {
        if (!reading()) { *out_ << "\n" << name << " "; return; }
        std::string tok = next();
        if (tok != name) fail(std::string("expected '") + name + "', found '" + tok + "'");
    }

    void io(int& v) { number(v); }
    void io(int64_t& v) { number(v); }
    void io(double& v) { number(v); }
    void io(bool& v) {
        int i = v ? 1 : 0;
        number(i);
        v = i != 0;
    }
    void io(std::string& s) {
        if (!reading()) {
            *out_ << '"';
            for (char c : s) {
                if (c == '"' || c == '\\') *out_ << '\\' << c;
                else if (c == '\n') *out_ << "\\n";
                else *out_ << c;
            }
            *out_ << "\" ";
            return;
        }
        s = nextQuoted();
    }
    template <class E, class = std::enable_if_t<std::is_enum_v<E>>>
    void io(E& e) {
        int i = (int)e;
        number(i);
        e = (E)i;
    }

private:
    template <class T>
    void number(T& v) {
        if (!reading()) { *out_ << v << ' '; return; }
        std::string tok = next();
        std::istringstream ss(tok);
        if (!(ss >> v)) fail("bad number '" + tok + "'");
    }

    std::string next() {
        std::string tok;
        if (!(*in_ >> tok)) fail("unexpected end of file");
        return tok;
    }

    std::string nextQuoted() {
        char c;
        while (in_->get(c) && std::isspace((unsigned char)c)) {}
        if (!*in_ || c != '"') { fail("expected string"); return ""; }
        std::string s;
        while (in_->get(c)) {
            if (c == '"') return s;
            if (c == '\\' && in_->get(c)) s += (c == 'n') ? '\n' : c;
            else s += c;
        }
        fail("unterminated string");
        return s;
    }

    void fail(const std::string& msg) {
        if (ok_) error_ = msg;
        ok_ = false;
    }

    std::ostream* out_ = nullptr;
    std::istream* in_ = nullptr;
    bool ok_ = true;
    std::string error_;
};

// ----- containers -----
template <class T>
void serialize(Archive& a, std::vector<T>& v);
template <class T, size_t N>
void serialize(Archive& a, std::array<T, N>& v);

void serialize(Archive& a, std::string& v) { a.io(v); }

void serialize(Archive& a, std::map<std::string, int>& m) {
    int n = (int)m.size();
    a.io(n);
    if (a.reading()) {
        m.clear();
        for (int i = 0; i < n && a.ok(); ++i) {
            std::string k; int v = 0;
            a.io(k); a.io(v);
            m[k] = v;
        }
    } else {
        for (auto& [k, v] : m) { std::string key = k; a.io(key); a.io(v); }
    }
}

void serialize(Archive& a, std::set<std::string>& s) {
    std::vector<std::string> v(s.begin(), s.end());
    serialize(a, v);
    if (a.reading()) s = std::set<std::string>(v.begin(), v.end());
}

// ----- game structs -----
void serialize(Archive& a, LatLon& p) { a.io(p.lat); a.io(p.lon); }

void serialize(Archive& a, UnitStats& s) {
    a.io(s.tu); a.io(s.stamina); a.io(s.health); a.io(s.bravery); a.io(s.reactions);
    a.io(s.firing); a.io(s.throwing); a.io(s.strength); a.io(s.melee); a.io(s.will);
}

void serialize(Archive& a, CarriedItem& c) {
    a.io(c.slot); a.io(c.item.id); a.io(c.item.ammoId); a.io(c.item.ammo); a.io(c.item.fuse);
}

void serialize(Archive& a, Soldier& s) {
    a.label("soldier");
    a.io(s.id); a.io(s.name); a.io(s.nation);
    serialize(a, s.stats); serialize(a, s.initial);
    a.io(s.rank); a.io(s.missions); a.io(s.kills); a.io(s.woundDays); a.io(s.mercenary);
    a.io(s.armor); serialize(a, s.loadout);
    a.io(s.baseId); a.io(s.craftId); a.io(s.inTransit);
}

void serialize(Archive& a, Facility& f) { a.io(f.type); a.io(f.x); a.io(f.y); a.io(f.daysLeft); }
void serialize(Archive& a, ResearchProject& p) { a.io(p.id); a.io(p.scientists); a.io(p.progress); a.io(p.cost); }
void serialize(Archive& a, ProductionJob& j) {
    a.io(j.itemId); a.io(j.engineers); a.io(j.quantity); a.io(j.produced); a.io(j.progress);
}
void serialize(Archive& a, Captive& c) { a.io(c.rank); a.io(c.bloodline); }
void serialize(Archive& a, Transfer& t) {
    a.io(t.kind); a.io(t.itemId); a.io(t.count); a.io(t.refId); serialize(a, t.captive); a.io(t.arrival);
}

void serialize(Archive& a, Base& b) {
    a.label("base");
    a.io(b.id); a.io(b.name); serialize(a, b.pos);
    serialize(a, b.facilities); serialize(a, b.stores);
    a.io(b.scientists); a.io(b.engineers);
    serialize(a, b.research); serialize(a, b.production);
    serialize(a, b.captives); serialize(a, b.incoming);
}

void serialize(Archive& a, CraftWeapon& w) { a.io(w.id); a.io(w.ammo); }

void serialize(Archive& a, Craft& c) {
    a.label("craft");
    a.io(c.id); a.io(c.type); a.io(c.name); a.io(c.baseId); serialize(a, c.pos);
    a.io(c.status); a.io(c.fuel); a.io(c.hp); serialize(a, c.weapons);
    a.io(c.target); a.io(c.targetId); serialize(a, c.waypoint); a.io(c.lowFuelWarned);
}

void serialize(Archive& a, Hunt& h) {
    a.label("hunt");
    a.io(h.id); a.io(h.craftType); a.io(h.bloodline); a.io(h.mission); a.io(h.nation); a.io(h.city);
    serialize(a, h.pos); serialize(a, h.dest); serialize(a, h.exit);
    a.io(h.phase); a.io(h.hp); a.io(h.crew); a.io(h.detected); a.io(h.phaseEnds); a.io(h.siteId);
}

void serialize(Archive& a, MissionSite& s) {
    a.label("site");
    a.io(s.id); a.io(s.type); a.io(s.label); serialize(a, s.pos); a.io(s.bloodline); a.io(s.nation);
    a.io(s.city); a.io(s.expires); a.io(s.crew); a.io(s.craftType); a.io(s.mission); a.io(s.huntId);
    a.io(s.detected); a.io(s.stage);
}

void serialize(Archive& a, NationState& n) {
    a.io(n.support); a.io(n.infiltration); a.io(n.defected); a.io(n.mediaBudget); a.io(n.lastFunding);
    a.io(n.monthStartSupport);
}

void serialize(Archive& a, BloodlineState& b) {
    a.io(b.destroyed); a.io(b.lairKnown); a.io(b.nextMission); a.io(b.missionsLaunched);
}

void serialize(Archive& a, BlackMarketOffer& o) {
    a.io(o.mercenary); a.io(o.itemId); a.io(o.quantity); a.io(o.price);
    if (o.mercenary) serialize(a, o.merc);
}

template <class T>
void serialize(Archive& a, std::vector<T>& v) {
    int n = (int)v.size();
    a.io(n);
    if (a.reading()) {
        if (n < 0 || n > 100000) { a.label("<bad count>"); return; }
        v.assign(n, T{});
    }
    for (auto& x : v) {
        if (!a.ok()) return;
        serialize(a, x);
    }
}

template <class T, size_t N>
void serialize(Archive& a, std::array<T, N>& v) {
    for (auto& x : v) serialize(a, x);
}

void serialize(Archive& a, GameState& g) {
    int version = kSaveVersion;
    a.label("VAMPS_SAVE");
    a.io(version);
    a.label("campaign");
    a.io(g.difficultyLevel); a.io(g.time.seconds); a.io(g.startTime.seconds); a.io(g.funds); a.io(g.secrecy);
    a.io(g.nextId); a.io(g.monthIndex); a.io(g.negativeMonths); a.io(g.monthScore);
    a.io(g.finalRevealed); a.io(g.gameOver); a.io(g.victory); a.io(g.gameOverReason);
    a.label("bases"); serialize(a, g.bases);
    a.label("soldiers"); serialize(a, g.soldiers);
    a.label("aircraft"); serialize(a, g.craft);
    a.label("hunts"); serialize(a, g.hunts);
    a.label("sites"); serialize(a, g.sites);
    a.label("bloodlines"); serialize(a, g.bloodlines);
    a.label("nations"); serialize(a, g.nations);
    a.label("researched"); serialize(a, g.researched);
    a.label("blackmarket"); serialize(a, g.blackMarket);
    a.label("end");
}

} // namespace

std::string savePath(int slot) { return "saves/slot" + std::to_string(slot) + ".sav"; }

bool saveGame(const GameState& g, int slot, std::string& err) {
    std::error_code ec;
    std::filesystem::create_directories("saves", ec);
    std::ofstream out(savePath(slot));
    if (!out) { err = "Cannot write " + savePath(slot); return false; }
    Archive a(out);
    GameState copy = g; // serialize() takes non-const refs for both directions
    serialize(a, copy);
    out << "\n";
    return true;
}

bool loadGame(GameState& g, int slot, std::string& err) {
    std::ifstream in(savePath(slot));
    if (!in) { err = "Slot is empty."; return false; }
    GameState loaded;
    Archive a(in);
    serialize(a, loaded);
    if (!a.ok()) { err = "Save file is damaged: " + a.error(); return false; }
    loaded.addLog("Game loaded.");
    g = std::move(loaded);
    return true;
}

std::string describeSlot(int slot) {
    std::ifstream in(savePath(slot));
    if (!in) return "";
    GameState g;
    Archive a(in);
    serialize(a, g);
    if (!a.ok()) return "(damaged)";
    return g.time.dateString() + "  " + g.diff().name + "  " + money(g.funds) + "  " +
           std::to_string(g.bases.size()) + (g.bases.size() == 1 ? " base" : " bases");
}

} // namespace vamps

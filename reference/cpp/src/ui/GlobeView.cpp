#include "ui/GlobeView.h"

#include <algorithm>
#include <cmath>

#include "data/World.h"

namespace vamps {

namespace {

Rgb biomeColor(Biome b) {
    switch (b) {
        case Biome::Ocean: return {25, 60, 140};
        case Biome::Temperate: return {72, 128, 56};
        case Biome::Forest: return {38, 98, 46};
        case Biome::Desert: return {196, 170, 112};
        case Biome::Arctic: return {226, 230, 240};
        case Biome::Tropical: return {46, 140, 62};
    }
    return {255, 0, 255};
}

Rgb siteColor(SiteType t) {
    switch (t) {
        case SiteType::CrashSite: return {255, 150, 40};
        case SiteType::LandedHunt: return {255, 80, 80};
        case SiteType::Harvest: return {235, 60, 210};
        case SiteType::PREvent: return {250, 220, 80};
        case SiteType::Lair: return {175, 95, 255};
        case SiteType::Final: return {255, 255, 255};
    }
    return {255, 255, 255};
}

uint32_t hash2(int x, int y) {
    uint32_t h = (uint32_t)x * 374761393u + (uint32_t)y * 668265263u;
    h = (h ^ (h >> 13)) * 1274126177u;
    return h ^ (h >> 16);
}

} // namespace

void GlobeView::rotate(double dLon, double dLat) {
    centerLon = wrapLon(centerLon + dLon);
    centerLat = std::clamp(centerLat + dLat, -85.0, 85.0);
}

void GlobeView::zoomBy(double f) { zoom = std::clamp(zoom * f, 0.8, 8.0); }

void GlobeView::basis(Vec3& f, Vec3& e, Vec3& n) const {
    f = toVector({centerLat, centerLon});          // toward the viewer
    e = Vec3(0, 0, 1).cross(f).normalized();       // screen right (east)
    if (e.length() < 1e-6) e = {0, 1, 0};
    n = f.cross(e);                                // screen up (north)
}

bool GlobeView::project(const LatLon& p, int& px, int& py) const {
    Vec3 f, e, n;
    basis(f, e, n);
    Vec3 v = toVector(p);
    if (v.dot(f) < 0) return false;
    int W = w_, H = h_ * 2;
    double R = std::min(W, H) / 2.0 * 0.95 * zoom;
    px = (int)std::floor(W / 2.0 + v.dot(e) * R);
    py = (int)std::floor(H / 2.0 - v.dot(n) * R);
    return px >= 0 && py >= 0 && px < W && py < H;
}

std::optional<LatLon> GlobeView::pick(int cellX, int cellY) const {
    Vec3 f, e, n;
    basis(f, e, n);
    int W = w_, H = h_ * 2;
    double R = std::min(W, H) / 2.0 * 0.95 * zoom;
    double sx = (cellX + 0.5 - W / 2.0) / R, sy = -(cellY * 2 + 1.0 - H / 2.0) / R;
    double r2 = sx * sx + sy * sy;
    if (r2 > 1) return std::nullopt;
    Vec3 p = f * std::sqrt(1 - r2) + e * sx + n * sy;
    return toLatLon(p);
}

const GlobeMarker* GlobeView::markerAt(int cx, int cy) const {
    const GlobeMarker* best = nullptr;
    int bestD = 3;
    // Prefer the most important kinds when they overlap.
    for (const auto& m : markers_) {
        if (m.cellX < 0) continue;
        int d = std::abs(m.cellX - cx) + std::abs(m.cellY - cy);
        if (d < bestD || (d == bestD && best && m.kind > best->kind)) {
            bestD = d;
            best = &m;
        }
    }
    return best;
}

std::shared_ptr<CellGrid> GlobeView::render(const GameState* g, int w, int h, int selKind, int selId, bool blink) {
    w_ = std::max(10, w);
    h_ = std::max(5, h);
    const int W = w_, H = h_ * 2;
    const double R = std::min(W, H) / 2.0 * 0.95 * zoom;
    Vec3 f, e, n;
    basis(f, e, n);
    Vec3 sun = g ? sunDirection(g->time) : Vec3(1, 0, 0).normalized();
    const WorldMap& wm = world();

    // ----- 1. The sphere, pixel by pixel -----
    std::vector<Rgb> pix(W * H);
    for (int py = 0; py < H; ++py) {
        for (int px = 0; px < W; ++px) {
            double sx = (px + 0.5 - W / 2.0) / R, sy = -(py + 0.5 - H / 2.0) / R;
            double r2 = sx * sx + sy * sy;
            Rgb& out = pix[py * W + px];
            if (r2 > 1.0) {
                // Space: a faint atmosphere rim, then stars.
                if (r2 < 1.06) out = {30, 50, 100};
                else out = (hash2(px, py) % 97 == 0) ? Rgb{150, 150, 160} : Rgb{2, 2, 6};
                continue;
            }
            double sz = std::sqrt(1.0 - r2);
            Vec3 p = f * sz + e * sx + n * sy;
            LatLon ll = toLatLon(p);
            Biome b = wm.biomeAt(ll);
            Rgb c = biomeColor(b);
            if (b != Biome::Ocean) {
                // National borders: the nation changes within half a degree.
                int here = wm.nationAt(ll);
                int east = wm.nationAt({ll.lat, ll.lon + 0.6});
                int north = wm.nationAt({ll.lat + 0.6, ll.lon});
                if ((east >= 0 && east != here) || (north >= 0 && north != here)) c = c.scaled(0.55);
                if (g && here >= 0 && g->nations[here].defected) c = Rgb::mix(c, {120, 30, 30}, 0.45);
            }
            // Day / night terminator.
            double light = p.dot(sun);
            double day = std::clamp((light + 0.08) / 0.16, 0.0, 1.0);
            Rgb lit = c.scaled(0.75 + 0.3 * std::max(0.0, light));
            Rgb dark = Rgb::mix(c.scaled(0.16), {4, 6, 22}, 0.35);
            out = Rgb::mix(dark, lit, day).scaled(0.65 + 0.35 * sz);
        }
    }

    // ----- 2. Radar coverage circles -----
    if (g) {
        auto ring = [&](const LatLon& c, double nm, Rgb col) {
            for (int i = 0; i < 160; ++i) {
                LatLon p = destinationPoint(c, i * 2 * kPi / 160, nm);
                int px, py;
                if (project(p, px, py)) pix[py * W + px] = Rgb::mix(pix[py * W + px], col, 0.7);
            }
        };
        for (const auto& b : g->bases)
            if (int r = b.radarRange(); r > 0) ring(b.pos, r, {60, 210, 100});
    }

    // ----- 3. Pixels -> half-block cells -----
    auto grid = std::make_shared<CellGrid>(w_, h_);
    for (int y = 0; y < h_; ++y)
        for (int x = 0; x < w_; ++x) grid->put(x, y, "▀", pix[(2 * y) * W + x], pix[(2 * y + 1) * W + x]);

    // ----- 4. Markers -----
    markers_.clear();
    if (!g) return grid;
    auto place = [&](GlobeMarker m, const std::string& glyph, Rgb col, const std::string& label) {
        int px, py;
        if (!project(m.pos, px, py)) { markers_.push_back(m); return; }
        m.cellX = px;
        m.cellY = py / 2;
        bool selected = (int)m.kind == selKind && m.id == selId;
        Rgb bg = grid->at(m.cellX, m.cellY).bg.scaled(0.6);
        if (selected) bg = {150, 30, 40};
        grid->put(m.cellX, m.cellY, glyph, col, bg, true);
        if (!label.empty()) grid->text(m.cellX + 2, m.cellY, label, col);
        markers_.push_back(m);
    };

    // Cities only appear once zoomed in, and get names when zoomed further.
    if (zoom >= 1.6)
        for (int i = 0; i < (int)cities().size(); ++i)
            place({GlobeMarker::City, i, cities()[i].pos}, "·", {210, 205, 170}, zoom >= 2.6 ? cities()[i].name : "");

    for (const auto& s : g->sites)
        if (s.detected)
            place({GlobeMarker::Site, s.id, s.pos}, "●", siteColor(s.type), zoom >= 2.0 ? s.label : "");
    for (const auto& b : g->bases) place({GlobeMarker::Base, b.id, b.pos}, "■", {90, 200, 255}, b.name);
    for (const auto& h : g->hunts)
        if (h.detected && h.phase != HuntPhase::Landed)
            place({GlobeMarker::Hunt, h.id, h.pos}, blink ? "▲" : "△", {255, 70, 70}, "");
    for (const auto& c : g->craft)
        if (c.airborne()) place({GlobeMarker::Craft, c.id, c.pos}, "✚", {130, 255, 130}, zoom >= 2.0 ? c.name : "");
    return grid;
}

} // namespace vamps

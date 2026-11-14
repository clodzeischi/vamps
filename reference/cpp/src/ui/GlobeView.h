#pragma once
// The Geoscape globe, software-rendered the way the 1994 original did it:
// an orthographic projection of the world, rotated by the camera, shaded by
// the sun (with a day/night terminator) and drawn as half-block "pixels"
// (two per terminal cell, each with its own colour).

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "core/Geo.h"
#include "strategy/GameState.h"
#include "ui/CellGrid.h"

namespace vamps {

// Something drawn on the globe that the player can click.
struct GlobeMarker {
    enum Kind { City, Base, Craft, Hunt, Site } kind;
    int id;            // base / craft / hunt / site id, or city index
    LatLon pos;
    int cellX = -1, cellY = -1; // filled in by render()
};

class GlobeView {
public:
    double centerLat = 30, centerLon = 0;
    double zoom = 1.0;  // 1 = whole globe fits

    void rotate(double dLon, double dLat);
    void zoomBy(double f);
    void centerOn(const LatLon& p) { centerLat = p.lat; centerLon = p.lon; }

    // Draws the globe and all markers into a w x h cell grid.
    std::shared_ptr<CellGrid> render(const GameState* g, int w, int h, int selectedKind = -1, int selectedId = -1,
                                     bool blink = false);

    // Cell -> point on the globe (none if the click missed the sphere).
    std::optional<LatLon> pick(int cellX, int cellY) const;
    // The marker nearest to a cell, within two cells.
    const GlobeMarker* markerAt(int cellX, int cellY) const;

private:
    bool project(const LatLon& p, int& px, int& py) const; // pixel coords; false if on the far side
    void basis(Vec3& f, Vec3& e, Vec3& n) const;

    int w_ = 0, h_ = 0; // in cells
    std::vector<GlobeMarker> markers_;
};

} // namespace vamps

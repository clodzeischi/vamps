#pragma once
// A rectangle of terminal cells drawn directly into FTXUI's screen buffer.
// Used for the globe (half-block "pixels") and the battlescape map, where
// building thousands of individual text elements would be slow.

#include <memory>
#include <string>
#include <vector>

#include <ftxui/dom/elements.hpp>

#include "core/Color.h"

namespace vamps {

struct Cell {
    std::string ch = " ";
    Rgb fg{200, 200, 200};
    Rgb bg{0, 0, 0};
    bool bold = false;
};

class CellGrid {
public:
    CellGrid(int w, int h) : w_(w), h_(h), cells_(w * h) {}
    int width() const { return w_; }
    int height() const { return h_; }
    bool inside(int x, int y) const { return x >= 0 && y >= 0 && x < w_ && y < h_; }
    Cell& at(int x, int y) { return cells_[y * w_ + x]; }
    const Cell& at(int x, int y) const { return cells_[y * w_ + x]; }
    void put(int x, int y, const std::string& ch, Rgb fg, Rgb bg, bool bold = false);
    // ASCII text, left to right, keeping each cell's background.
    void text(int x, int y, const std::string& s, Rgb fg);

private:
    int w_, h_;
    std::vector<Cell> cells_;
};

ftxui::Element gridElement(std::shared_ptr<const CellGrid> grid);

} // namespace vamps

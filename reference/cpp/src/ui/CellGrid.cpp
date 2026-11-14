#include "ui/CellGrid.h"

#include <ftxui/dom/node.hpp>
#include <ftxui/screen/screen.hpp>

namespace vamps {

void CellGrid::put(int x, int y, const std::string& ch, Rgb fg, Rgb bg, bool bold) {
    if (!inside(x, y)) return;
    Cell& c = at(x, y);
    c.ch = ch;
    c.fg = fg;
    c.bg = bg;
    c.bold = bold;
}

void CellGrid::text(int x, int y, const std::string& s, Rgb fg) {
    for (size_t i = 0; i < s.size(); ++i)
        if (inside(x + (int)i, y)) {
            Cell& c = at(x + (int)i, y);
            c.ch = std::string(1, s[i]);
            c.fg = fg;
        }
}

namespace {

class GridNode : public ftxui::Node {
public:
    explicit GridNode(std::shared_ptr<const CellGrid> g) : grid_(std::move(g)) {}

    void ComputeRequirement() override {
        requirement_.min_x = grid_->width();
        requirement_.min_y = grid_->height();
    }

    void Render(ftxui::Screen& screen) override {
        for (int y = 0; y < grid_->height(); ++y) {
            int sy = box_.y_min + y;
            if (sy > box_.y_max) break;
            for (int x = 0; x < grid_->width(); ++x) {
                int sx = box_.x_min + x;
                if (sx > box_.x_max) break;
                const Cell& c = grid_->at(x, y);
                ftxui::Pixel& p = screen.PixelAt(sx, sy);
                p.character = c.ch;
                p.foreground_color = ftxui::Color::RGB(c.fg.r, c.fg.g, c.fg.b);
                p.background_color = ftxui::Color::RGB(c.bg.r, c.bg.g, c.bg.b);
                p.bold = c.bold;
            }
        }
    }

private:
    std::shared_ptr<const CellGrid> grid_;
};

} // namespace

ftxui::Element gridElement(std::shared_ptr<const CellGrid> grid) {
    return std::make_shared<GridNode>(std::move(grid));
}

} // namespace vamps

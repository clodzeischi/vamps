#pragma once
// A plain RGB colour, so game logic can describe colours without
// depending on the UI library.

#include <algorithm>
#include <cstdint>

namespace vamps {

struct Rgb {
    uint8_t r = 0, g = 0, b = 0;
    constexpr Rgb() = default;
    constexpr Rgb(uint8_t r_, uint8_t g_, uint8_t b_) : r(r_), g(g_), b(b_) {}

    Rgb scaled(double f) const {
        auto c = [f](uint8_t v) { return (uint8_t)std::clamp(v * f, 0.0, 255.0); };
        return {c(r), c(g), c(b)};
    }
    static Rgb mix(Rgb a, Rgb b, double t) {
        auto m = [t](uint8_t x, uint8_t y) { return (uint8_t)std::clamp(x + (y - x) * t, 0.0, 255.0); };
        return {m(a.r, b.r), m(a.g, b.g), m(a.b, b.b)};
    }
    bool operator==(const Rgb& o) const { return r == o.r && g == o.g && b == o.b; }
};

} // namespace vamps

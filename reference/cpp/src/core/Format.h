#pragma once
// Small string helpers used everywhere in the UI.

#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <string>

namespace vamps {

// printf-style formatting into a std::string.
inline std::string fmt(const char* f, ...) {
    char buf[1024];
    va_list args;
    va_start(args, f);
    std::vsnprintf(buf, sizeof buf, f, args);
    va_end(args);
    return buf;
}

// $1,234,567
inline std::string money(int64_t dollars) {
    bool neg = dollars < 0;
    uint64_t v = (uint64_t)(neg ? -dollars : dollars);
    std::string digits = std::to_string(v), out;
    int n = 0;
    for (auto it = digits.rbegin(); it != digits.rend(); ++it) {
        if (n && n % 3 == 0) out.insert(out.begin(), ',');
        out.insert(out.begin(), *it);
        ++n;
    }
    return (neg ? "-$" : "$") + out;
}

// Pads (or truncates) to exactly `width` characters. Assumes ASCII.
inline std::string padRight(const std::string& s, int width) {
    if ((int)s.size() >= width) return s.substr(0, width);
    return s + std::string(width - s.size(), ' ');
}

inline std::string padLeft(const std::string& s, int width) {
    if ((int)s.size() >= width) return s.substr(0, width);
    return std::string(width - s.size(), ' ') + s;
}

} // namespace vamps

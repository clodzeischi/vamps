#pragma once
// Campaign clock. Stored as seconds since the Unix epoch (UTC) so calendar
// math is simple. Also computes the sun's position for day/night.

#include <cstdint>
#include <string>

#include "core/Geo.h"

namespace vamps {

struct Date {
    int year = 2026, month = 1, day = 1;
    int hour = 0, minute = 0, second = 0;
};

class GameTime {
public:
    static constexpr int64_t kMinute = 60;
    static constexpr int64_t kHour = 3600;
    static constexpr int64_t kDay = 86400;

    int64_t seconds = 0;

    GameTime() = default;
    explicit GameTime(int64_t s) : seconds(s) {}
    static GameTime fromDate(int year, int month, int day, int hour = 0, int minute = 0);

    Date date() const;
    int dayOfYear() const;       // 0-based
    double utcHours() const;     // 0..24
    std::string toString() const;   // "14 Jan 2026  21:05"
    std::string dateString() const; // "14 Jan 2026"
    std::string monthYearString() const; // "January 2026"

    static const char* monthName(int month);      // 1..12, full
    static const char* monthShortName(int month); // 1..12, "Jan"
};

// Unit vector from Earth's centre toward the sun (world coordinates, see Geo.h).
Vec3 sunDirection(const GameTime& t);

// > 0 in daylight, < 0 at night. Value is the sine of the sun's elevation.
double sunElevation(const LatLon& p, const GameTime& t);

inline bool isDaylight(const LatLon& p, const GameTime& t) { return sunElevation(p, t) > 0.0; }

} // namespace vamps

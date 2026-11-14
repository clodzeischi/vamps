#include "core/GameTime.h"

#include <cmath>
#include <cstdio>

namespace vamps {

namespace {

// Howard Hinnant's civil-from-days / days-from-civil algorithms.
int64_t daysFromCivil(int y, int m, int d) {
    y -= m <= 2;
    const int64_t era = (y >= 0 ? y : y - 399) / 400;
    const unsigned yoe = (unsigned)(y - era * 400);
    const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
    const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    return era * 146097 + (int64_t)doe - 719468;
}

void civilFromDays(int64_t z, int& y, int& m, int& d) {
    z += 719468;
    const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
    const unsigned doe = (unsigned)(z - era * 146097);
    const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    const int64_t yy = (int64_t)yoe + era * 400;
    const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    const unsigned mp = (5 * doy + 2) / 153;
    d = (int)(doy - (153 * mp + 2) / 5 + 1);
    m = (int)(mp < 10 ? mp + 3 : mp - 9);
    y = (int)(yy + (m <= 2));
}

} // namespace

GameTime GameTime::fromDate(int year, int month, int day, int hour, int minute) {
    return GameTime(daysFromCivil(year, month, day) * kDay + hour * kHour + minute * kMinute);
}

Date GameTime::date() const {
    Date out;
    int64_t days = seconds / kDay;
    int64_t rem = seconds % kDay;
    if (rem < 0) { rem += kDay; days -= 1; }
    civilFromDays(days, out.year, out.month, out.day);
    out.hour = (int)(rem / kHour);
    out.minute = (int)((rem % kHour) / kMinute);
    out.second = (int)(rem % kMinute);
    return out;
}

int GameTime::dayOfYear() const {
    Date d = date();
    return (int)(seconds / kDay - daysFromCivil(d.year, 1, 1));
}

double GameTime::utcHours() const {
    int64_t rem = seconds % kDay;
    if (rem < 0) rem += kDay;
    return (double)rem / kHour;
}

const char* GameTime::monthName(int m) {
    static const char* names[] = {"January", "February", "March",     "April",   "May",      "June",
                                  "July",    "August",   "September", "October", "November", "December"};
    return names[(m - 1) % 12];
}

const char* GameTime::monthShortName(int m) {
    static const char* names[] = {"Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"};
    return names[(m - 1) % 12];
}

std::string GameTime::toString() const {
    Date d = date();
    char buf[64];
    std::snprintf(buf, sizeof buf, "%2d %s %d  %02d:%02d:%02d", d.day, monthShortName(d.month), d.year,
                  d.hour, d.minute, d.second);
    return buf;
}

std::string GameTime::dateString() const {
    Date d = date();
    char buf[32];
    std::snprintf(buf, sizeof buf, "%d %s %d", d.day, monthShortName(d.month), d.year);
    return buf;
}

std::string GameTime::monthYearString() const {
    Date d = date();
    return std::string(monthName(d.month)) + " " + std::to_string(d.year);
}

Vec3 sunDirection(const GameTime& t) {
    // Solar declination (simple cosine model) and the sub-solar longitude.
    double decl = -23.44 * std::cos(2.0 * kPi / 365.0 * (t.dayOfYear() + 10));
    double subLon = -(t.utcHours() - 12.0) * 15.0;
    return toVector({decl, wrapLon(subLon)});
}

double sunElevation(const LatLon& p, const GameTime& t) {
    return toVector(p).dot(sunDirection(t));
}

} // namespace vamps

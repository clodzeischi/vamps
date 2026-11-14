#include "core/Geo.h"

#include <algorithm>

namespace vamps {

Vec3 toVector(const LatLon& p) {
    double la = deg2rad(p.lat), lo = deg2rad(p.lon);
    return {std::cos(la) * std::cos(lo), std::cos(la) * std::sin(lo), std::sin(la)};
}

LatLon toLatLon(const Vec3& v) {
    Vec3 n = v.normalized();
    return {rad2deg(std::asin(std::clamp(n.z, -1.0, 1.0))), rad2deg(std::atan2(n.y, n.x))};
}

double wrapLon(double lon) {
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    return lon;
}

double angleBetween(const LatLon& a, const LatLon& b) {
    double d = toVector(a).dot(toVector(b));
    return std::acos(std::clamp(d, -1.0, 1.0));
}

double distanceNm(const LatLon& a, const LatLon& b) {
    return angleBetween(a, b) * kEarthRadiusNm;
}

LatLon stepToward(const LatLon& from, const LatLon& to, double nm) {
    double total = angleBetween(from, to);
    double step = nm / kEarthRadiusNm;
    if (total <= step || total < 1e-9) return to;
    // Spherical linear interpolation.
    double t = step / total;
    Vec3 a = toVector(from), b = toVector(to);
    double s = std::sin(total);
    Vec3 p = a * (std::sin((1 - t) * total) / s) + b * (std::sin(t * total) / s);
    return toLatLon(p);
}

LatLon destinationPoint(const LatLon& from, double bearing, double nm) {
    double d = nm / kEarthRadiusNm;
    double la1 = deg2rad(from.lat), lo1 = deg2rad(from.lon);
    double la2 = std::asin(std::sin(la1) * std::cos(d) +
                           std::cos(la1) * std::sin(d) * std::cos(bearing));
    double lo2 = lo1 + std::atan2(std::sin(bearing) * std::sin(d) * std::cos(la1),
                                  std::cos(d) - std::sin(la1) * std::sin(la2));
    return {rad2deg(la2), wrapLon(rad2deg(lo2))};
}

} // namespace vamps

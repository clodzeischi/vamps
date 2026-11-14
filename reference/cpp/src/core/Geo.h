#pragma once
// Spherical geometry for the Geoscape: positions are latitude/longitude in
// degrees, distances are nautical miles (like the original game).

#include <cmath>

namespace vamps {

constexpr double kPi = 3.14159265358979323846;
constexpr double kEarthRadiusNm = 3440.1;

inline double deg2rad(double d) { return d * kPi / 180.0; }
inline double rad2deg(double r) { return r * 180.0 / kPi; }

struct Vec3 {
    double x = 0, y = 0, z = 0;
    Vec3() = default;
    Vec3(double x_, double y_, double z_) : x(x_), y(y_), z(z_) {}
    Vec3 operator+(const Vec3& o) const { return {x + o.x, y + o.y, z + o.z}; }
    Vec3 operator-(const Vec3& o) const { return {x - o.x, y - o.y, z - o.z}; }
    Vec3 operator*(double s) const { return {x * s, y * s, z * s}; }
    double dot(const Vec3& o) const { return x * o.x + y * o.y + z * o.z; }
    Vec3 cross(const Vec3& o) const {
        return {y * o.z - z * o.y, z * o.x - x * o.z, x * o.y - y * o.x};
    }
    double length() const { return std::sqrt(dot(*this)); }
    Vec3 normalized() const {
        double l = length();
        return l > 0 ? (*this) * (1.0 / l) : *this;
    }
};

struct LatLon {
    double lat = 0; // degrees, +north
    double lon = 0; // degrees, +east
};

// Unit vector: +x = (0N,0E), +y = (0N,90E), +z = north pole.
Vec3 toVector(const LatLon& p);
LatLon toLatLon(const Vec3& v);

double wrapLon(double lon);
double angleBetween(const LatLon& a, const LatLon& b); // radians
double distanceNm(const LatLon& a, const LatLon& b);

// Moves along the great circle from `from` toward `to` by `nm`.
// Returns `to` exactly if it is closer than `nm`.
LatLon stepToward(const LatLon& from, const LatLon& to, double nm);

// Point reached by travelling `nm` from `from` on initial bearing (radians, 0=N).
LatLon destinationPoint(const LatLon& from, double bearingRad, double nm);

} // namespace vamps

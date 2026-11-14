#pragma once
// Random number generation. One global generator so that every system draws
// from the same stream (and a campaign can be re-seeded on load).

#include <cstdint>
#include <random>
#include <vector>

namespace vamps {

class Random {
public:
    explicit Random(uint64_t seed = 0x5eed1209u) : engine_(seed) {}

    void seed(uint64_t s) { engine_.seed(s); }

    // Uniform integer in [lo, hi] (inclusive). Returns lo if hi < lo.
    int range(int lo, int hi) {
        if (hi <= lo) return lo;
        return std::uniform_int_distribution<int>(lo, hi)(engine_);
    }

    // Uniform real in [0, 1).
    double real() { return std::uniform_real_distribution<double>(0.0, 1.0)(engine_); }
    double real(double lo, double hi) { return lo + (hi - lo) * real(); }

    bool chance(double p) { return real() < p; }   // p in [0,1]
    bool percent(int p) { return range(1, 100) <= p; } // p in [0,100]

    template <class T>
    const T& pick(const std::vector<T>& v) { return v[range(0, (int)v.size() - 1)]; }

private:
    std::mt19937_64 engine_;
};

Random& rng();

} // namespace vamps

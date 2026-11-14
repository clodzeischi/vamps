#include "core/Random.h"

#include <chrono>

namespace vamps {

Random& rng() {
    static Random instance(
        (uint64_t)std::chrono::steady_clock::now().time_since_epoch().count());
    return instance;
}

} // namespace vamps

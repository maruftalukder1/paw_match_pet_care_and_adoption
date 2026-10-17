/**
 * @file IdGenerator.h
 * @brief Thread-safe unique alphanumeric identifier generator.
 */

#pragma once

#include <string>
#include <atomic>
#include <sstream>
#include <chrono>

namespace pawmatch {

class IdGenerator {
private:
    static inline std::atomic<unsigned long long> counter_{1000};

public:
    static std::string generate(const std::string& prefix = "ID") {
        const auto now = std::chrono::system_clock::now();
        const auto epochSeconds = std::chrono::duration_cast<std::chrono::seconds>(
            now.time_since_epoch()
        ).count();

        std::stringstream ss;
        ss << prefix << "-" << (epochSeconds % 1000000) << "-" << (++counter_);
        return ss.str();
    }
};

} // namespace pawmatch

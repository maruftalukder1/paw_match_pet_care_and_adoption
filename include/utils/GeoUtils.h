/**
 * @file GeoUtils.h
 * @brief Geographic coordinates and Great-Circle distance utilities.
 */

#pragma once

#include <cmath>
#include <string>

namespace pawmatch {

struct LocationCoordinates {
    std::string areaName;
    double latitude{0.0};
    double longitude{0.0};
};

class GeoUtils {
public:
    static constexpr double EARTH_RADIUS_KM = 6371.0;
    static constexpr double PI = 3.14159265358979323846;

    static double toRadians(double deg) noexcept {
        return deg * (PI / 180.0);
    }

    /**
     * @brief Computes Haversine Great-Circle distance in kilometers.
     */
    static double haversineKm(double lat1, double lon1, double lat2, double lon2) noexcept {
        const double dLat = toRadians(lat2 - lat1);
        const double dLon = toRadians(lon2 - lon1);

        const double a = std::sin(dLat / 2.0) * std::sin(dLat / 2.0) +
                         std::cos(toRadians(lat1)) * std::cos(toRadians(lat2)) *
                         std::sin(dLon / 2.0) * std::sin(dLon / 2.0);

        const double c = 2.0 * std::atan2(std::sqrt(a), std::sqrt(1.0 - a));
        return std::round((EARTH_RADIUS_KM * c) * 10.0) / 10.0;
    }
};

} // namespace pawmatch

/**
 * @file Date.h
 * @brief Custom date class (dd-mm-yyyy) with validation and operator overloading.
 */

#pragma once

#include <string>
#include <sstream>
#include <iomanip>
#include <stdexcept>
#include <iostream>

namespace pawmatch {

class Date {
private:
    int day_{1};
    int month_{1};
    int year_{2024};

    static bool isLeapYear(int y) noexcept {
        return (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    }

public:
    Date() = default;

    Date(int d, int m, int y) : day_(d), month_(m), year_(y) {
        if (!isValid(d, m, y)) {
            throw std::invalid_argument("Invalid date value: " + toString());
        }
    }

    static bool isValid(int d, int m, int y) noexcept {
        if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
        int maxDays = 31;
        if (m == 4 || m == 6 || m == 9 || m == 11) {
            maxDays = 30;
        } else if (m == 2) {
            maxDays = isLeapYear(y) ? 29 : 28;
        }
        return d <= maxDays;
    }

    static Date fromString(const std::string& str) {
        if (str.empty()) return Date(1, 1, 2024);

        int d = 1, m = 1, y = 2024;
        char sep1, sep2;
        std::stringstream ss(str);

        // Handles both YYYY-MM-DD and DD-MM-YYYY
        if (str.length() >= 10 && str[4] == '-') {
            ss >> y >> sep1 >> m >> sep2 >> d;
        } else {
            ss >> d >> sep1 >> m >> sep2 >> y;
        }

        if (ss.fail() || !isValid(d, m, y)) {
            return Date(1, 1, 2024);
        }
        return Date(d, m, y);
    }

    std::string toString() const {
        std::ostringstream oss;
        oss << std::setfill('0') << std::setw(2) << day_ << "-"
            << std::setfill('0') << std::setw(2) << month_ << "-"
            << year_;
        return oss.str();
    }

    int getDay() const noexcept { return day_; }
    int getMonth() const noexcept { return month_; }
    int getYear() const noexcept { return year_; }

    // Operator Overloading for Date Comparisons
    bool operator==(const Date& other) const noexcept {
        return day_ == other.day_ && month_ == other.month_ && year_ == other.year_;
    }

    bool operator!=(const Date& other) const noexcept {
        return !(*this == other);
    }

    bool operator<(const Date& other) const noexcept {
        if (year_ != other.year_) return year_ < other.year_;
        if (month_ != other.month_) return month_ < other.month_;
        return day_ < other.day_;
    }

    bool operator>(const Date& other) const noexcept {
        return other < *this;
    }

    bool operator<=(const Date& other) const noexcept {
        return !(other < *this);
    }

    bool operator>=(const Date& other) const noexcept {
        return !(*this < other);
    }

    friend std::ostream& operator<<(std::ostream& os, const Date& dt) {
        os << dt.toString();
        return os;
    }
};

} // namespace pawmatch

/**
 * @file TablePrinter.h
 * @brief Formatted console table printer using std::iomanip.
 */

#pragma once

#include <iostream>
#include <vector>
#include <string>
#include <iomanip>
#include <algorithm>

namespace pawmatch {

class TablePrinter {
private:
    std::vector<std::string> headers_;
    std::vector<size_t> columnWidths_;
    std::vector<std::vector<std::string>> rows_;

public:
    explicit TablePrinter(std::vector<std::string> headers)
        : headers_(std::move(headers)) {
        for (const auto& h : headers_) {
            columnWidths_.push_back(std::max<size_t>(h.length(), 4));
        }
    }

    void addRow(const std::vector<std::string>& row) {
        rows_.push_back(row);
        for (size_t i = 0; i < row.size() && i < columnWidths_.size(); ++i) {
            if (row[i].length() > columnWidths_[i]) {
                columnWidths_[i] = row[i].length();
            }
        }
    }

    void print(std::ostream& os = std::cout) const {
        if (headers_.empty()) return;

        // Top Border
        os << "+";
        for (auto w : columnWidths_) {
            os << std::string(w + 2, '-') << "+";
        }
        os << "\n|";

        // Headers
        for (size_t i = 0; i < headers_.size(); ++i) {
            os << " " << std::left << std::setw(columnWidths_[i]) << headers_[i] << " |";
        }
        os << "\n+";

        // Header Divider
        for (auto w : columnWidths_) {
            os << std::string(w + 2, '-') << "+";
        }
        os << "\n";

        // Data Rows
        for (const auto& r : rows_) {
            os << "|";
            for (size_t i = 0; i < columnWidths_.size(); ++i) {
                const std::string val = (i < r.size()) ? r[i] : "";
                os << " " << std::left << std::setw(columnWidths_[i]) << val << " |";
            }
            os << "\n";
        }

        // Bottom Border
        os << "+";
        for (auto w : columnWidths_) {
            os << std::string(w + 2, '-') << "+";
        }
        os << "\n";
    }
};

} // namespace pawmatch

export const CPP_FILES_TREE: Record<string, string> = {
  'include/models/Pet.h': `/**
 * @file Pet.h
 * @brief Abstract Base Class for Pet Entities in PawMatch.
 * @details Implements polymorphism, OOP encapsulation, and polymorphic careTips().
 */

#pragma once

#include <string>
#include <vector>
#include <memory>
#include <iostream>
#include "../utils/GeoUtils.h"

namespace pawmatch {

enum class PetStatus {
    Available,
    Pending,
    Adopted,
    Lost,
    Found
};

enum class PetSize {
    Small,
    Medium,
    Large
};

enum class EnergyLevel {
    Low,
    Moderate,
    High
};

class Pet {
protected:
    std::string id_;
    std::string name_;
    std::string species_;
    std::string breed_;
    int ageMonths_;
    std::string gender_;
    PetSize size_;
    std::string color_;
    EnergyLevel energyLevel_;
    bool goodWithKids_;
    bool goodWithPets_;
    bool vaccinated_;
    bool neutered_;
    std::string healthNotes_;
    PetStatus status_;
    std::string ownerId_;
    LocationCoordinates location_;
    std::string photoPath_;
    std::string description_;

public:
    Pet(std::string id, std::string name, std::string species, std::string breed,
        int ageMonths, std::string gender, PetSize size, std::string color,
        EnergyLevel energy, bool withKids, bool withPets, bool vaccinated,
        bool neutered, std::string healthNotes, PetStatus status,
        std::string ownerId, LocationCoordinates loc, std::string photoPath,
        std::string desc)
        : id_(std::move(id)), name_(std::move(name)), species_(std::move(species)),
          breed_(std::move(breed)), ageMonths_(ageMonths), gender_(std::move(gender)),
          size_(size), color_(std::move(color)), energyLevel_(energy),
          goodWithKids_(withKids), goodWithPets_(withPets), vaccinated_(vaccinated),
          neutered_(neutered), healthNotes_(std::move(healthNotes)), status_(status),
          ownerId_(std::move(ownerId)), location_(loc), photoPath_(std::move(photoPath)),
          description_(std::move(desc)) {}

    virtual ~Pet() = default;

    // Pure virtual function enforcing Polymorphism & Abstraction
    virtual std::string careTips() const = 0;

    // Getters with const-correctness
    const std::string& getId() const noexcept { return id_; }
    const std::string& getName() const noexcept { return name_; }
    const std::string& getSpecies() const noexcept { return species_; }
    const std::string& getBreed() const noexcept { return breed_; }
    int getAgeMonths() const noexcept { return ageMonths_; }
    const std::string& getGender() const noexcept { return gender_; }
    PetSize getSize() const noexcept { return size_; }
    const std::string& getColor() const noexcept { return color_; }
    EnergyLevel getEnergyLevel() const noexcept { return energyLevel_; }
    bool isGoodWithKids() const noexcept { return goodWithKids_; }
    bool isGoodWithPets() const noexcept { return goodWithPets_; }
    bool isVaccinated() const noexcept { return vaccinated_; }
    bool isNeutered() const noexcept { return neutered_; }
    const std::string& getHealthNotes() const noexcept { return healthNotes_; }
    PetStatus getStatus() const noexcept { return status_; }
    const std::string& getOwnerId() const noexcept { return ownerId_; }
    const LocationCoordinates& getLocation() const noexcept { return location_; }
    const std::string& getPhotoPath() const noexcept { return photoPath_; }
    const std::string& getDescription() const noexcept { return description_; }

    void setStatus(PetStatus s) noexcept { status_ = s; }
    void setVaccinated(bool v) noexcept { vaccinated_ = v; }

    // Operator overloading for stream formatting
    friend std::ostream& operator<<(std::ostream& os, const Pet& pet) {
        os << "[" << pet.id_ << "] " << pet.name_ << " (" << pet.breed_ << ", "
           << (pet.ageMonths_ / 12) << " yrs)";
        return os;
    }
};

} // namespace pawmatch
`,

  'include/models/Dog.h': `/**
 * @file Dog.h
 * @brief Concrete Derived Pet Class representing Canine Companions.
 */

#pragma once

#include "Pet.h"

namespace pawmatch {

class Dog : public Pet {
public:
    using Pet::Pet;

    std::string careTips() const override {
        return "Daily 45-60 min outdoor cardiovascular walks; protein-rich diet; "
               "regular coat brushing and bi-weekly nail grooming.";
    }
};

} // namespace pawmatch
`,

  'include/models/Cat.h': `/**
 * @file Cat.h
 * @brief Concrete Derived Pet Class representing Feline Companions.
 */

#pragma once

#include "Pet.h"

namespace pawmatch {

class Cat : public Pet {
public:
    using Pet::Pet;

    std::string careTips() const override {
        return "Provide vertical perches, daily litter box sanitization, freshwater fountains, "
               "and scratching posts for claw conditioning.";
    }
};

} // namespace pawmatch
`,

  'include/models/User.h': `/**
 * @file User.h
 * @brief Abstract Base Class for all PawMatch user roles.
 */

#pragma once

#include <string>
#include <memory>
#include <iostream>
#include "../utils/GeoUtils.h"

namespace pawmatch {

enum class UserRole {
    Adopter,
    PetOwner,
    Shelter,
    Vet,
    ServiceProvider,
    Admin
};

class User {
protected:
    std::string id_;
    std::string name_;
    std::string email_;
    std::string phone_;
    std::string passwordHash_;
    LocationCoordinates location_;
    UserRole role_;
    bool isActive_;
    int failedLoginAttempts_{0};
    bool isLocked_{false};

public:
    User(std::string id, std::string name, std::string email, std::string phone,
         std::string passwordHash, LocationCoordinates loc, UserRole role, bool isActive)
        : id_(std::move(id)), name_(std::move(name)), email_(std::move(email)),
          phone_(std::move(phone)), passwordHash_(std::move(passwordHash)),
          location_(loc), role_(role), isActive_(isActive) {}

    virtual ~User() = default;

    // Pure virtual function enforcing polymorphic role dashboards
    virtual void showDashboard() const = 0;

    const std::string& getId() const noexcept { return id_; }
    const std::string& getName() const noexcept { return name_; }
    const std::string& getEmail() const noexcept { return email_; }
    const std::string& getPhone() const noexcept { return phone_; }
    const std::string& getPasswordHash() const noexcept { return passwordHash_; }
    const LocationCoordinates& getLocation() const noexcept { return location_; }
    UserRole getRole() const noexcept { return role_; }
    bool isActive() const noexcept { return isActive_; }
    bool isLocked() const noexcept { return isLocked_; }

    void recordFailedLogin() noexcept {
        if (++failedLoginAttempts_ >= 3) {
            isLocked_ = true;
        }
    }
    void resetFailedLogins() noexcept {
        failedLoginAttempts_ = 0;
        isLocked_ = false;
    }
    void setActive(bool active) noexcept { isActive_ = active; }
};

} // namespace pawmatch
`,

  'include/models/Adopter.h': `/**
 * @file Adopter.h
 * @brief Concrete User representing Pet Adopter with lifestyle metrics.
 */

#pragma once

#include "User.h"
#include <vector>

namespace pawmatch {

class Adopter : public User {
private:
    std::string homeType_; // apartment, house_with_yard, condo
    bool hasYard_;
    int dailyAloneHours_;
    bool hasChildren_;
    bool hasOtherPets_;
    std::string experienceLevel_;
    std::vector<std::string> preferredSpecies_;
    std::string preferredSize_;
    std::string activityLevel_;
    double monthlyBudget_;

public:
    Adopter(std::string id, std::string name, std::string email, std::string phone,
            std::string passwordHash, LocationCoordinates loc, bool isActive,
            std::string homeType, bool hasYard, int aloneHours, bool kids,
            bool otherPets, std::string exp, std::vector<std::string> prefSpecies,
            std::string prefSize, std::string activity, double budget)
        : User(std::move(id), std::move(name), std::move(email), std::move(phone),
               std::move(passwordHash), loc, UserRole::Adopter, isActive),
          homeType_(std::move(homeType)), hasYard_(hasYard), dailyAloneHours_(aloneHours),
          hasChildren_(kids), hasOtherPets_(otherPets), experienceLevel_(std::move(exp)),
          preferredSpecies_(std::move(prefSpecies)), preferredSize_(std::move(prefSize)),
          activityLevel_(std::move(activity)), monthlyBudget_(budget) {}

    void showDashboard() const override {
        std::cout << ">>> ADOPTER DASHBOARD: Welcome, " << name_ << "!\n";
        std::cout << "Lifestyle: " << homeType_ << " (Yard: " << (hasYard_ ? "YES" : "NO")
                  << ") | Children: " << (hasChildren_ ? "YES" : "NO") << "\n";
    }

    const std::string& getHomeType() const noexcept { return homeType_; }
    bool hasYard() const noexcept { return hasYard_; }
    bool hasChildren() const noexcept { return hasChildren_; }
    bool hasOtherPets() const noexcept { return hasOtherPets_; }
    const std::string& getExperienceLevel() const noexcept { return experienceLevel_; }
    const std::vector<std::string>& getPreferredSpecies() const noexcept { return preferredSpecies_; }
    const std::string& getActivityLevel() const noexcept { return activityLevel_; }
};

} // namespace pawmatch
`,

  'include/models/AdoptionApplication.h': `/**
 * @file AdoptionApplication.h
 * @brief Represents formal adoption petitions with status lifecycle.
 */

#pragma once

#include <string>
#include <iostream>

namespace pawmatch {

enum class ApplicationStatus {
    Submitted,
    UnderReview,
    Approved,
    Rejected,
    Completed
};

class AdoptionApplication {
private:
    std::string id_;
    std::string petId_;
    std::string applicantId_;
    std::string applicantName_;
    std::string applicantEmail_;
    std::string reason_;
    std::string experienceDetails_;
    bool hasOtherPets_;
    bool hasYard_;
    ApplicationStatus status_;
    std::string reviewNotes_;
    std::string submissionDate_;

public:
    AdoptionApplication(std::string id, std::string petId, std::string applicantId,
                        std::string appName, std::string appEmail, std::string reason,
                        std::string exp, bool otherPets, bool yard,
                        ApplicationStatus status, std::string notes, std::string date)
        : id_(std::move(id)), petId_(std::move(petId)), applicantId_(std::move(applicantId)),
          applicantName_(std::move(appName)), applicantEmail_(std::move(appEmail)),
          reason_(std::move(reason)), experienceDetails_(std::move(exp)),
          hasOtherPets_(otherPets), hasYard_(yard), status_(status),
          reviewNotes_(std::move(notes)), submissionDate_(std::move(date)) {}

    const std::string& getId() const noexcept { return id_; }
    const std::string& getPetId() const noexcept { return petId_; }
    const std::string& getApplicantId() const noexcept { return applicantId_; }
    const std::string& getApplicantName() const noexcept { return applicantName_; }
    ApplicationStatus getStatus() const noexcept { return status_; }
    const std::string& getSubmissionDate() const noexcept { return submissionDate_; }

    void setStatus(ApplicationStatus s, std::string notes = "") {
        status_ = s;
        if (!notes.empty()) reviewNotes_ = std::move(notes);
    }
};

} // namespace pawmatch
`,

  'include/services/MatchmakerService.h': `/**
 * @file MatchmakerService.h
 * @brief 7-Factor Weighted Compatibility Scoring Engine using the Strategy Pattern.
 */

#pragma once

#include "../models/Adopter.h"
#include "../models/Pet.h"
#include "../utils/GeoUtils.h"
#include <queue>
#include <memory>
#include <vector>

namespace pawmatch {

struct MatchCandidate {
    std::shared_ptr<Pet> pet;
    int score;
    double distanceKm;
    std::vector<std::string> reasons;

    // Comparator for priority_queue (Max-Heap)
    bool operator<(const MatchCandidate& other) const noexcept {
        return score < other.score;
    }
};

// Abstract Strategy Interface
class IScoringStrategy {
public:
    virtual ~IScoringStrategy() = default;
    virtual int calculateScore(const Adopter& adopter, const Pet& pet,
                               double distanceKm, std::vector<std::string>& reasons) const = 0;
};

// Concrete Balanced Strategy
class BalancedScoringStrategy : public IScoringStrategy {
public:
    int calculateScore(const Adopter& adopter, const Pet& pet,
                       double distanceKm, std::vector<std::string>& reasons) const override {
        // Hard Filter 1: Kids safety
        if (adopter.hasChildren() && !pet.isGoodWithKids()) {
            reasons.push_back("Hard Exclusion: Not certified kid-friendly");
            return 0;
        }

        // 1. Species (20%)
        double sSpecies = 50.0;
        for (const auto& sp : adopter.getPreferredSpecies()) {
            if (sp == pet.getSpecies()) { sSpecies = 100.0; reasons.push_back("Species match"); break; }
        }

        // 2. Size vs Home (15%)
        double sSize = 75.0;
        if (adopter.hasYard()) sSize = 100.0;

        // 3. Energy vs Activity (20%)
        double sEnergy = 80.0;
        if (adopter.getActivityLevel() == "high") sEnergy = 95.0;

        // 4. Kids (15%)
        double sKids = pet.isGoodWithKids() ? 100.0 : 80.0;

        // 5. Pets (10%)
        double sPets = pet.isGoodWithPets() ? 100.0 : 80.0;

        // 6. Experience (10%)
        double sExp = 85.0;

        // 7. Distance (10%)
        double sDist = std::max(30.0, 100.0 - distanceKm * 2.5);

        double total = sSpecies * 0.20 + sSize * 0.15 + sEnergy * 0.20 +
                       sKids * 0.15 + sPets * 0.10 + sExp * 0.10 + sDist * 0.10;
        return static_cast<int>(total);
    }
};

class MatchmakerService {
private:
    std::unique_ptr<IScoringStrategy> strategy_;

public:
    MatchmakerService() : strategy_(std::make_unique<BalancedScoringStrategy>()) {}

    void setStrategy(std::unique_ptr<IScoringStrategy> strategy) {
        strategy_ = std::move(strategy);
    }

    std::vector<MatchCandidate> getTopMatches(const Adopter& adopter,
                                              const std::vector<std::shared_ptr<Pet>>& pets,
                                              size_t topN = 5) {
        std::priority_queue<MatchCandidate> pq;

        for (const auto& pet : pets) {
            if (pet->getStatus() != PetStatus::Available) continue;

            double dist = GeoUtils::haversineKm(
                adopter.getLocation().latitude, adopter.getLocation().longitude,
                pet->getLocation().latitude, pet->getLocation().longitude
            );

            std::vector<std::string> reasons;
            int score = strategy_->calculateScore(adopter, *pet, dist, reasons);

            if (score > 0) {
                pq.push({pet, score, dist, reasons});
            }
        }

        std::vector<MatchCandidate> result;
        while (!pq.empty() && result.size() < topN) {
            result.push_back(pq.top());
            pq.pop();
        }
        return result;
    }
};

} // namespace pawmatch
`,

  'include/utils/Date.h': `/**
 * @file Date.h
 * @brief Custom date representation with validation and operator comparisons.
 */

#pragma once

#include <string>
#include <sstream>
#include <iomanip>
#include <stdexcept>

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
            throw std::invalid_argument("Invalid date values provided: " + toString());
        }
    }

    static bool isValid(int d, int m, int y) noexcept {
        if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
        int maxDays = 31;
        if (m == 4 || m == 6 || m == 9 || m == 11) maxDays = 30;
        else if (m == 2) maxDays = isLeapYear(y) ? 29 : 28;
        return d <= maxDays;
    }

    static Date fromString(const std::string& str) {
        // Formats: dd-mm-yyyy or yyyy-mm-dd
        int d = 1, m = 1, y = 2024;
        char sep1, sep2;
        std::stringstream ss(str);
        if (str.find('-') == 4) { // yyyy-mm-dd
            ss >> y >> sep1 >> m >> sep2 >> d;
        } else { // dd-mm-yyyy
            ss >> d >> sep1 >> m >> sep2 >> y;
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

    // Comparison Operator Overloads
    bool operator==(const Date& o) const noexcept {
        return day_ == o.day_ && month_ == o.month_ && year_ == o.year_;
    }
    bool operator<(const Date& o) const noexcept {
        if (year_ != o.year_) return year_ < o.year_;
        if (month_ != o.month_) return month_ < o.month_;
        return day_ < o.day_;
    }
    bool operator>(const Date& o) const noexcept { return o < *this; }
    bool operator<=(const Date& o) const noexcept { return !(o < *this); }
    bool operator>=(const Date& o) const noexcept { return !(*this < o); }
};

} // namespace pawmatch
`,

  'include/utils/TablePrinter.h': `/**
 * @file TablePrinter.h
 * @brief Aligned console table printer utility using std::iomanip.
 */

#pragma once

#include <iostream>
#include <vector>
#include <string>
#include <iomanip>

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
            columnWidths_.push_back(h.length());
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
        // Top border
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

        // Divider
        for (auto w : columnWidths_) {
            os << std::string(w + 2, '-') << "+";
        }
        os << "\n";

        // Rows
        for (const auto& r : rows_) {
            os << "|";
            for (size_t i = 0; i < columnWidths_.size(); ++i) {
                std::string val = (i < r.size()) ? r[i] : "";
                os << " " << std::left << std::setw(columnWidths_[i]) << val << " |";
            }
            os << "\n";
        }

        // Bottom border
        os << "+";
        for (auto w : columnWidths_) {
            os << std::string(w + 2, '-') << "+";
        }
        os << "\n";
    }
};

} // namespace pawmatch
`,

  'CMakeLists.txt': `cmake_minimum_required(VERSION 3.16)
project(PawMatch LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Enable strict compiler warnings as per specification
if(MSVC)
    add_compile_options(/W4 /WX)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Werror)
endif()

include_directories(include)

file(GLOB_RECURSE SOURCES
    src/*.cpp
    main.cpp
)

add_executable(pawmatch \${SOURCES})
`,

  'Makefile': `CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -Wpedantic -Iinclude -O2

SRC = $(wildcard src/*.cpp) main.cpp
OBJ = $(SRC:.cpp=.o)
TARGET = pawmatch

all: $(TARGET)

$(TARGET): $(OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $^

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f src/*.o *.o $(TARGET)

.PHONY: all clean
`,
};

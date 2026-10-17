/**
 * @file Hasher.h
 * @brief Salted hash implementation for user credential security.
 * @note In production systems, modern key-derivation algorithms such as bcrypt,
 *       scrypt, or Argon2id would be used. For this standard-library C++17
 *       environment, a salted std::hash with hexadecimal digest is implemented.
 */

#pragma once

#include <string>
#include <sstream>
#include <iomanip>
#include <functional>

namespace pawmatch {

class Hasher {
private:
    static constexpr const char* SALT = "PawMatch_SecKey_2024$!x7";

public:
    static std::string hashPassword(const std::string& plaintextPassword) {
        const std::string salted = plaintextPassword + SALT;
        const std::size_t h = std::hash<std::string>{}(salted);

        std::stringstream ss;
        ss << std::hex << std::setfill('0') << std::setw(16) << h;
        return ss.str();
    }

    static bool verifyPassword(const std::string& plaintextPassword,
                               const std::string& storedHash) {
        return hashPassword(plaintextPassword) == storedHash;
    }
};

} // namespace pawmatch

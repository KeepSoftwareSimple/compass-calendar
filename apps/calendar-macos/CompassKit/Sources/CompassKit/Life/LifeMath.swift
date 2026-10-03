import Foundation

public enum LifeVariation: String, Codable, Hashable, Sendable, CaseIterable {
    case average
    case long
    case random
}

public struct LifeVariationDetails: Sendable, Hashable {
    public let label: String
    public let defaultLifespan: Int
}

public enum LifeMath {
    public static let weeksPerRow = 52
    public static let defaultLifespan = 77
    public static let minLifespan = 1
    public static let maxLifespan = 150
    public static let randomLifespanMax = 100

    public static let variationOrder: [LifeVariation] = [.average, .long, .random]

    public static let variations: [LifeVariation: LifeVariationDetails] = [
        .average: LifeVariationDetails(label: "Average", defaultLifespan: 77),
        .long: LifeVariationDetails(label: "Long", defaultLifespan: 100),
        .random: LifeVariationDetails(label: "Random", defaultLifespan: randomLifespanMax),
    ]

    private static let msPerWeek: Double = 1_000 * 60 * 60 * 24 * 7

    public static func clampLifespan(_ value: Double) -> Int {
        guard value.isFinite else { return defaultLifespan }
        return min(maxLifespan, max(minLifespan, Int(value.rounded())))
    }

    public static func totalLifeDots(lifespan: Int) -> Int {
        weeksPerRow * clampLifespan(Double(lifespan))
    }

    public static func clampWeeksLived(_ weeks: Int, totalDots: Int) -> Int {
        max(0, min(weeks, totalDots))
    }

    public static func parseLifeDate(_ value: String) -> Date? {
        let pattern = /^(\d{4})-(\d{2})-(\d{2})$/
        guard let match = value.wholeMatch(of: pattern) else { return nil }
        let year = Int(match.1)!
        let month = Int(match.2)!
        let day = Int(match.3)!
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        components.hour = 12
        guard let date = Calendar(identifier: .gregorian).date(from: components) else {
            return nil
        }
        let resolved = Calendar(identifier: .gregorian)
        guard resolved.component(.year, from: date) == year,
              resolved.component(.month, from: date) == month,
              resolved.component(.day, from: date) == day
        else {
            return nil
        }
        return date
    }

    public static func weekLivedCount(
        birthDateValue: String,
        totalDots: Int,
        today: Date = Date()
    ) -> Int {
        guard let birthDate = parseLifeDate(birthDateValue) else { return 0 }
        let diffWeeks = Int(floor(today.timeIntervalSince(birthDate) / (msPerWeek / 1_000)))
        return clampWeeksLived(diffWeeks, totalDots: totalDots)
    }

    public static func ageInYears(birthDateValue: String, today: Date = Date()) -> Int? {
        guard let birthDate = parseLifeDate(birthDateValue) else { return nil }
        let calendar = Calendar(identifier: .gregorian)
        var age = calendar.component(.year, from: today) - calendar.component(.year, from: birthDate)
        let birthdayPassed = calendar.component(.month, from: today) > calendar.component(.month, from: birthDate)
            || (calendar.component(.month, from: today) == calendar.component(.month, from: birthDate)
                && calendar.component(.day, from: today) >= calendar.component(.day, from: birthDate))
        if !birthdayPassed { age -= 1 }
        return max(0, age)
    }

    public static func randomLifespan(
        birthDateValue: String,
        today: Date = Date(),
        random: () -> Double = { Double.random(in: 0 ..< 1)
        }
    ) -> Int {
        let currentAge = ageInYears(birthDateValue: birthDateValue, today: today) ?? minLifespan
        let minimumAge = max(minLifespan, min(currentAge, randomLifespanMax))
        let range = randomLifespanMax - minimumAge + 1
        return minimumAge + Int(floor(random() * Double(range)))
    }

    public static func lifeDotLabel(weekNumber: Int) -> String {
        let yearOfLife = (weekNumber - 1) / weeksPerRow + 1
        let weekOfYear = (weekNumber - 1) % weeksPerRow + 1
        return "Year \(yearOfLife), Week \(weekOfYear)"
    }

    public static func currentWeekLabel(today: Date, weeksLived: Int, totalDots: Int) -> String {
        let currentWeek = min(weeksLived + 1, totalDots)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        let dateLabel = formatter.string(from: today)
        return "\(dateLabel) | week \(currentWeek) / \(totalDots)"
    }

    public static func formatDateInputValue(_ date: Date) -> String {
        let calendar = Calendar(identifier: .gregorian)
        let year = calendar.component(.year, from: date)
        let month = calendar.component(.month, from: date)
        let day = calendar.component(.day, from: date)
        return String(format: "%04d-%02d-%02d", year, month, day)
    }

    public static func cycleVariation(
        _ preferences: LifePreferences,
        direction: Int,
        today: Date
    ) -> LifePreferences {
        guard let currentIndex = variationOrder.firstIndex(of: preferences.variation) else {
            return preferences
        }
        let count = variationOrder.count
        let nextIndex = (currentIndex + direction + count) % count
        let variation = variationOrder[nextIndex]
        let lifespan: Int
        if variation == .random {
            lifespan = randomLifespan(birthDateValue: preferences.birthDate, today: today)
        } else {
            lifespan = variations[variation]?.defaultLifespan ?? defaultLifespan
        }
        return LifePreferences(
            birthDate: preferences.birthDate,
            lifespan: lifespan,
            variation: variation)
    }
}

public struct LifePreferences: Codable, Hashable, Sendable {
    public var birthDate: String
    public var lifespan: Int
    public var variation: LifeVariation

    public init(birthDate: String, lifespan: Int, variation: LifeVariation) {
        self.birthDate = birthDate
        self.lifespan = LifeMath.clampLifespan(Double(lifespan))
        self.variation = variation
    }

    public static let defaults = LifePreferences(
        birthDate: "2000-01-01",
        lifespan: LifeMath.variations[.average]!.defaultLifespan,
        variation: .average)
}

// Mirrors `apps/calendar-web/src/views/Life/life-preferences.storage.ts` and LifeView state.

import CompassKit
import Foundation

private enum LifePreferencesStorageKeys {
    static let preferences = "compass.life.preferences"
}

@MainActor
@Observable
public final class LifeStore {
    public private(set) var preferences: LifePreferences
    public private(set) var scrollToCurrentWeekToken = 0

    private let defaults: UserDefaults
    private let today: () -> Date

    public init(defaults: UserDefaults = .standard, today: @escaping () -> Date = Date.init) {
        self.defaults = defaults
        self.today = today
        preferences = LifePreferencesPersistence.read(from: defaults)
    }

    public var hasBirthDate: Bool {
        LifeMath.parseLifeDate(preferences.birthDate) != nil
    }

    public var totalDots: Int {
        LifeMath.totalLifeDots(lifespan: preferences.lifespan)
    }

    public var weeksLived: Int {
        LifeMath.weekLivedCount(
            birthDateValue: preferences.birthDate,
            totalDots: totalDots,
            today: today())
    }

    public var summary: String {
        guard hasBirthDate else { return "Birth date not set" }
        let weeks = weeksLived
        let years = LifeMath.ageInYears(birthDateValue: preferences.birthDate, today: today()) ?? 0
        let percent = totalDots > 0 ? Int(round(Double(weeks) / Double(totalDots) * 100)) : 0
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        let weeksLabel = formatter.string(from: NSNumber(value: weeks)) ?? "\(weeks)"
        return "\(weeksLabel) weeks lived - \(years) years - \(percent)%"
    }

    public var currentWeekLabel: String? {
        guard hasBirthDate else { return nil }
        return LifeMath.currentWeekLabel(
            today: today(),
            weeksLived: weeksLived,
            totalDots: totalDots)
    }

    public func cycleVariation(direction: Int) {
        preferences = LifeMath.cycleVariation(preferences, direction: direction, today: today())
        persist()
    }

    public func shuffleRandomVariation() {
        preferences = LifePreferences(
            birthDate: preferences.birthDate,
            lifespan: LifeMath.randomLifespan(
                birthDateValue: preferences.birthDate,
                today: today()),
            variation: .random)
        persist()
    }

    public func focusCurrentWeek() {
        scrollToCurrentWeekToken += 1
    }

    public func updatePreferences(_ transform: (LifePreferences) -> LifePreferences) {
        preferences = transform(preferences)
        persist()
    }

    private func persist() {
        LifePreferencesPersistence.write(preferences, to: defaults)
    }
}

enum LifePreferencesPersistence {
    static func read(from defaults: UserDefaults) -> LifePreferences {
        guard let data = defaults.data(forKey: LifePreferencesStorageKeys.preferences),
              let decoded = try? JSONDecoder().decode(LifePreferences.self, from: data)
        else {
            return .defaults
        }
        return normalize(decoded)
    }

    static func write(_ preferences: LifePreferences, to defaults: UserDefaults) {
        let normalized = normalize(preferences)
        if let data = try? JSONEncoder().encode(normalized) {
            defaults.set(data, forKey: LifePreferencesStorageKeys.preferences)
        }
    }

    private static func normalize(_ preferences: LifePreferences) -> LifePreferences {
        LifePreferences(
            birthDate: LifeMath.parseLifeDate(preferences.birthDate) != nil
                ? preferences.birthDate
                : "",
            lifespan: preferences.lifespan,
            variation: preferences.variation)
    }
}

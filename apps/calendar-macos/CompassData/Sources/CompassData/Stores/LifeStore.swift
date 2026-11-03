// Mirrors `apps/calendar-web/src/views/Life/life-preferences.storage.ts` and LifeView state.

import CompassKit
import Foundation

private enum LifePreferencesStorageKeys {
    static let preferences = "compass.life.preferences"
}

public protocol LifePreferencesRemoteClient: Sendable {
    func lifePreferences() async throws -> LifePreferencesResponse
    func saveLifePreferences(_ preferences: LifePreferences, revision: Int) async throws -> LifePreferencesResponse
}

extension UserAPI: LifePreferencesRemoteClient {}

@MainActor
@Observable
public final class LifeStore {
    public private(set) var preferences: LifePreferences
    public private(set) var scrollToCurrentWeekToken = 0

    public private(set) var error: String?
    public private(set) var isLoading = false
    private var userId: String?
    private var remote: (any LifePreferencesRemoteClient)?
    private var revision = 0
    private var generation = 0
    private var pending: Task<Void, Never>?

    public func flushPendingChanges() async { await pending?.value }

    public func load(userId: String?, remote: any LifePreferencesRemoteClient) async {
        if self.userId == userId { await pending?.value }
        if userId == nil, let previous = self.userId {
            defaults.removeObject(forKey: "compass.life.account.\(previous)")
        }
        generation += 1
        let token = generation
        self.userId = userId
        self.remote = userId == nil ? nil : remote
        error = nil
        guard let userId else {
            preferences = LifePreferencesPersistence.read(from: defaults)
            isLoading = false
            return
        }
        isLoading = true
        preferences = .defaults
        revision = 0
        if let data = defaults.data(forKey: "compass.life.account.\(userId)"),
           let cached = try? JSONDecoder().decode(LifePreferencesResponse.self, from: data) {
            apply(cached)
        }
        do {
            var response = try await remote.lifePreferences()
            guard generation == token else { return }
            if response.preferences == nil,
               defaults.object(forKey: LifePreferencesStorageKeys.preferences) != nil,
               defaults.string(forKey: "compass.life.migrated-account") == nil {
                var legacy = LifePreferencesPersistence.read(from: defaults)
                if legacy.birthDate == "2000-01-01" { legacy.birthDate = "" }
                do { response = try await remote.saveLifePreferences(legacy, revision: 0) }
                catch { response = try await remote.lifePreferences() }
            }
            guard generation == token else { return }
            defaults.set(userId, forKey: "compass.life.migrated-account")
            apply(response)
        } catch {
            guard generation == token else { return }
            self.error = "Life settings could not be loaded. Please try again."
        }
        guard generation == token else { return }
        isLoading = false
    }

    private func apply(_ response: LifePreferencesResponse) {
        revision = response.revision
        preferences = response.preferences.map { LifePreferences(birthDate: $0.birthDate,
            lifespan: $0.lifespan, variation: LifeVariation(rawValue: $0.variation.rawValue) ?? .average) } ?? .defaults
        cache(response)
    }

    private func cache(_ response: LifePreferencesResponse) {
        if let userId, let data = try? JSONEncoder().encode(response) {
            defaults.set(data, forKey: "compass.life.account.\(userId)")
        }
    }

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

    @discardableResult
    public func updateBirthDate(_ value: String) -> Bool {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !value.isEmpty {
            guard let date = LifeMath.parseLifeDate(value), value >= "1900-01-01",
                EffectiveTimeZone.calendar.startOfDay(for: date) <= EffectiveTimeZone.calendar.startOfDay(for: today())
            else { return false }
        }
        preferences = LifePreferences(birthDate: value,
            lifespan: preferences.variation == .random && !value.isEmpty
                ? LifeMath.randomLifespan(birthDateValue: value, today: today()) : preferences.lifespan,
            variation: preferences.variation)
        persist()
        return true
    }

    @discardableResult
    public func updateLifespan(_ value: Double) -> Bool {
        guard value.isFinite else { return false }
        preferences.lifespan = LifeMath.clampLifespan(value)
        persist()
        return true
    }

    public func updatePreferences(_ transform: (LifePreferences) -> LifePreferences) {
        preferences = transform(preferences)
        persist()
    }

    private func persist() {
        guard let remote else {
            LifePreferencesPersistence.write(preferences, to: defaults)
            return
        }
        guard !isLoading else { return }
        let value = preferences
        let token = generation
        let previous = pending
        pending = Task { [weak self] in
            await previous?.value
            guard let self, self.generation == token else { return }
            do {
                let response = try await remote.saveLifePreferences(value, revision: self.revision)
                guard self.generation == token else { return }
                self.revision = response.revision
                self.cache(response)
                self.error = nil
            } catch {
                guard self.generation == token else { return }
                self.generation += 1
                if let response = try? await remote.lifePreferences() {
                    guard self.generation == token + 1 else { return }
                    self.apply(response)
                }
                guard self.generation == token + 1 else { return }
                self.error = "Life settings were not saved. Check the values and try again."
            }
        }
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

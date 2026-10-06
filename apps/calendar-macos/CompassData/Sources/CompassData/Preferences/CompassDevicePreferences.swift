import CompassKit
import Foundation

public protocol CompassDevicePreferencesStorage: Sendable {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
    func removeObject(forKey key: String)
}

extension UserDefaults: CompassDevicePreferencesStorage {}

public enum CompassDevicePreferences {
    public static func readTheme(from storage: CompassDevicePreferencesStorage = UserDefaults.standard)
        -> CompassThemeName?
    {
        guard let raw = storage.string(forKey: CompassStorageKeys.theme) else {
            return nil
        }
        return CompassThemeName(rawValue: raw)
    }

    @discardableResult
    public static func writeTheme(
        _ theme: CompassThemeName,
        to storage: CompassDevicePreferencesStorage = UserDefaults.standard
    ) -> Bool {
        storage.set(theme.rawValue, forKey: CompassStorageKeys.theme)
        return true
    }

    public static func readDefaultCalendarId(
        from storage: CompassDevicePreferencesStorage = UserDefaults.standard
    ) -> String? {
        guard let raw = storage.string(forKey: CompassStorageKeys.defaultCalendarId),
              !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return nil
        }
        return raw
    }

    @discardableResult
    public static func writeDefaultCalendarId(
        _ calendarId: String?,
        to storage: CompassDevicePreferencesStorage = UserDefaults.standard
    ) -> Bool {
        if let calendarId {
            storage.set(calendarId, forKey: CompassStorageKeys.defaultCalendarId)
        } else {
            storage.removeObject(forKey: CompassStorageKeys.defaultCalendarId)
        }
        return true
    }

    public static func readPinnedTimeZone(
        from storage: CompassDevicePreferencesStorage = UserDefaults.standard
    ) -> String? {
        guard let raw = storage.string(forKey: CompassStorageKeys.defaultTimeZone),
              TimeZoneFormatting.isValidTimeZone(raw)
        else {
            return nil
        }
        return raw
    }

    @discardableResult
    public static func writePinnedTimeZone(
        _ timeZone: String?,
        to storage: CompassDevicePreferencesStorage = UserDefaults.standard
    ) -> Bool {
        if let timeZone {
            guard TimeZoneFormatting.isValidTimeZone(timeZone) else { return false }
            storage.set(timeZone, forKey: CompassStorageKeys.defaultTimeZone)
        } else {
            storage.removeObject(forKey: CompassStorageKeys.defaultTimeZone)
        }
        return true
    }

    public static func readTimeTravelTimeZone(
        from storage: CompassDevicePreferencesStorage = UserDefaults.standard
    ) -> String? {
        guard let raw = storage.string(forKey: CompassStorageKeys.timeTravelTimeZone),
              TimeZoneFormatting.isValidTimeZone(raw)
        else {
            return nil
        }
        return raw
    }

    @discardableResult
    public static func writeTimeTravelTimeZone(
        _ timeZone: String?,
        to storage: CompassDevicePreferencesStorage = UserDefaults.standard
    ) -> Bool {
        if let timeZone {
            guard TimeZoneFormatting.isValidTimeZone(timeZone) else { return false }
            storage.set(timeZone, forKey: CompassStorageKeys.timeTravelTimeZone)
        } else {
            storage.removeObject(forKey: CompassStorageKeys.timeTravelTimeZone)
        }
        return true
    }
}

import CompassKit
import Foundation

public protocol CompassDevicePreferencesStorage: Sendable {
    func string(forKey key: String) -> String?
    func set(_ value: String?, forKey key: String)
    func removeObject(forKey key: String)
}

extension UserDefaults: CompassDevicePreferencesStorage {}

public enum CompassDevicePreferences {
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
}

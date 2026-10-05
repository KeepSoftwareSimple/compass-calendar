// Mirrors `apps/calendar-web/src/settings/settings.store.ts` device-local prefs.

import CompassKit
import Foundation

public enum SettingsPage: String, Sendable, Hashable, CaseIterable {
    case accounts
    case billing
}

@MainActor
@Observable
public final class SettingsStore {
    public var isPresented = false
    public var page: SettingsPage = .accounts
    public private(set) var defaultCalendarId: String?

    private let storage: CompassDevicePreferencesStorage

    public init(storage: CompassDevicePreferencesStorage = UserDefaults.standard) {
        self.storage = storage
        defaultCalendarId = CompassDevicePreferences.readDefaultCalendarId(from: storage)
    }

    public func open(page: SettingsPage = .accounts) {
        isPresented = true
        self.page = page
    }

    public func close() {
        isPresented = false
        page = .accounts
    }

    @discardableResult
    public func setDefaultCalendarId(_ calendarId: String?) -> Bool {
        guard CompassDevicePreferences.writeDefaultCalendarId(calendarId, to: storage) else {
            return false
        }
        defaultCalendarId = calendarId
        return true
    }
}

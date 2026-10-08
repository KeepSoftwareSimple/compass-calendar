// Mirrors `apps/calendar-web/src/settings/settings.store.ts` and device-local prefs.

import CompassKit
import Foundation

public enum SettingsPage: String, Sendable, Hashable, CaseIterable {
    case accounts
    case billing
    case booking
}

public enum TimezoneDialogPurpose: String, Sendable, Hashable {
    case pin
    case timeTravel
}

public protocol NativeSettingsBridge: AnyObject {
    @MainActor func launchAtLoginEnabled() -> Bool
    @MainActor func setLaunchAtLogin(_ enabled: Bool) throws
    @MainActor func applyQuickAddHotKey(_ displayString: String)
    @MainActor func applyTheme(_ theme: CompassThemeName)
}

public final class UnavailableNativeSettingsBridge: NativeSettingsBridge {
    public init() {}
    public func launchAtLoginEnabled() -> Bool { false }
    public func setLaunchAtLogin(_ enabled: Bool) throws {}
    public func applyQuickAddHotKey(_ displayString: String) {}
    public func applyTheme(_ theme: CompassThemeName) {}
}

@MainActor
@Observable
public final class SettingsStore {
    public var isPresented = false
    public var page: SettingsPage = .accounts
    public var guestMeetingSetupActive = false
    public var timezoneDialogPurpose: TimezoneDialogPurpose?
    public private(set) var defaultCalendarId: String?
    public private(set) var quickAddHotKeyDisplay: String
    public private(set) var launchAtLoginEnabled = false
    public private(set) var theme: CompassThemeName

    private let storage: CompassDevicePreferencesStorage
    private weak var bridge: (any NativeSettingsBridge)?
    private let viewStore: ViewStore
    public var onDevicePreferencesChanged: (() -> Void)?

    public init(
        viewStore: ViewStore,
        storage: CompassDevicePreferencesStorage = UserDefaults.standard,
        bridge: (any NativeSettingsBridge)? = nil
    ) {
        self.viewStore = viewStore
        self.storage = storage
        self.bridge = bridge
        theme = CompassDevicePreferences.readTheme(from: storage) ?? .default
        defaultCalendarId = CompassDevicePreferences.readDefaultCalendarId(from: storage)
        if let defaults = storage as? UserDefaults {
            quickAddHotKeyDisplay = QuickAddHotKeyStorage.load(from: defaults).displayString
        } else {
            quickAddHotKeyDisplay = QuickAddHotKeyStorage.defaultDisplayString
        }
        refreshLaunchAtLogin()
    }

    public func setBridge(_ bridge: (any NativeSettingsBridge)?) {
        self.bridge = bridge
        refreshLaunchAtLogin()
    }

    public func open(page: SettingsPage = .accounts) {
        isPresented = true
        self.page = page
        refreshLaunchAtLogin()
    }

    public func close() {
        isPresented = false
        page = .accounts
        timezoneDialogPurpose = nil
        guestMeetingSetupActive = false
    }

    public func closeForGuestAuthHandoff() {
        isPresented = false
        page = .accounts
        timezoneDialogPurpose = nil
    }

    public func beginGuestMeetingSetup() {
        isPresented = true
        page = .booking
        guestMeetingSetupActive = true
    }

    public func clearGuestMeetingSetup() {
        guestMeetingSetupActive = false
    }

    public func openTimezoneDialog(_ purpose: TimezoneDialogPurpose) {
        timezoneDialogPurpose = purpose
    }

    public func dismissTimezoneDialog() {
        timezoneDialogPurpose = nil
    }

    @discardableResult
    public func setDefaultCalendarId(_ calendarId: String?) -> Bool {
        guard CompassDevicePreferences.writeDefaultCalendarId(calendarId, to: storage) else {
            return false
        }
        defaultCalendarId = calendarId
        return true
    }

    @discardableResult
    public func setPinnedTimeZone(_ timeZone: String?) -> Bool {
        guard CompassDevicePreferences.writePinnedTimeZone(timeZone, to: storage) else {
            return false
        }
        let applied = viewStore.setPinnedTimeZone(timeZone)
        if applied { onDevicePreferencesChanged?() }
        return applied
    }

    @discardableResult
    public func setTimeTravelTimeZone(_ timeZone: String?) -> Bool {
        guard CompassDevicePreferences.writeTimeTravelTimeZone(timeZone, to: storage) else {
            return false
        }
        let applied = viewStore.setTimeTravelTimeZone(timeZone)
        if applied { onDevicePreferencesChanged?() }
        return applied
    }

    @discardableResult
    public func setTheme(_ newTheme: CompassThemeName) -> Bool {
        guard CompassDevicePreferences.writeTheme(newTheme, to: storage) else {
            return false
        }
        theme = newTheme
        bridge?.applyTheme(newTheme)
        return true
    }

    @discardableResult
    public func setQuickAddHotKey(_ displayString: String) -> Bool {
        guard let binding = QuickAddHotKeyParser.parse(displayString) else {
            return false
        }
        if let defaults = storage as? UserDefaults {
            QuickAddHotKeyStorage.save(binding, to: defaults)
        }
        quickAddHotKeyDisplay = binding.displayString
        bridge?.applyQuickAddHotKey(binding.displayString)
        return true
    }

    @discardableResult
    public func setLaunchAtLogin(_ enabled: Bool) -> Bool {
        do {
            try bridge?.setLaunchAtLogin(enabled)
            launchAtLoginEnabled = bridge?.launchAtLoginEnabled() ?? enabled
            return true
        } catch {
            launchAtLoginEnabled = bridge?.launchAtLoginEnabled() ?? false
            return false
        }
    }

    public func refreshLaunchAtLogin() {
        launchAtLoginEnabled = bridge?.launchAtLoginEnabled() ?? false
    }
}

import Foundation

public struct SettingsSectionSnapshot: Codable, Hashable, Sendable {
    public var sectionId: String
    public var accessibilityIdentifiers: [String]

    public init(sectionId: String, accessibilityIdentifiers: [String]) {
        self.sectionId = sectionId
        self.accessibilityIdentifiers = accessibilityIdentifiers
    }
}

public enum SettingsSectionSnapshots {
    public static let accounts = SettingsSectionSnapshot(
        sectionId: "accounts",
        accessibilityIdentifiers: [
            "settings-section-accounts",
            "settings-accounts-list",
            "settings-icloud-connect",
        ])
    public static let defaultCalendar = SettingsSectionSnapshot(
        sectionId: "default-calendar",
        accessibilityIdentifiers: ["settings-section-default-calendar"])
    public static let timezone = SettingsSectionSnapshot(
        sectionId: "timezone",
        accessibilityIdentifiers: ["settings-section-timezone"])
    public static let quickAddHotkey = SettingsSectionSnapshot(
        sectionId: "quick-add-hotkey",
        accessibilityIdentifiers: ["settings-section-quick-add-hotkey"])
    public static let launchAtLogin = SettingsSectionSnapshot(
        sectionId: "launch-at-login",
        accessibilityIdentifiers: ["settings-section-launch-at-login"])
    public static let theme = SettingsSectionSnapshot(
        sectionId: "theme",
        accessibilityIdentifiers: ["settings-section-theme"])
    public static let billing = SettingsSectionSnapshot(
        sectionId: "billing",
        accessibilityIdentifiers: ["settings-section-billing"])

    public static let accountsSlice: [SettingsSectionSnapshot] = [
        accounts,
        defaultCalendar,
    ]

    public static let timezoneThemeSlice: [SettingsSectionSnapshot] = [
        timezone,
        theme,
    ]

    public static let all: [SettingsSectionSnapshot] = [
        accounts,
        defaultCalendar,
        timezone,
        quickAddHotkey,
        launchAtLogin,
        theme,
        billing,
    ]
}

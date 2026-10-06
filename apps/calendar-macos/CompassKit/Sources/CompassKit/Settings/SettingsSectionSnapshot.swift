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

    public static let accountsSlice: [SettingsSectionSnapshot] = [
        accounts,
        defaultCalendar,
    ]
}

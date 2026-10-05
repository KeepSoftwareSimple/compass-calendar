import Foundation

/// macOS modifier flags for an NSMenu key equivalent, aligned with
/// `DESKTOP_MENU_MAC_KEY_EQUIVALENTS` in packages/core.
public struct MacKeyEquivalent: Equatable, Sendable {
    public let key: String
    public let command: Bool
    public let shift: Bool
    public let option: Bool
    public let control: Bool

    public init(
        key: String,
        command: Bool = false,
        shift: Bool = false,
        option: Bool = false,
        control: Bool = false
    ) {
        self.key = key
        self.command = command
        self.shift = shift
        self.option = option
        self.control = control
    }
}

public enum MainMenuShortcutName: String, CaseIterable, Sendable {
    case createTimed = "create-timed"
    case navToday = "nav-today"
    case navDayView = "nav-day-view"
    case navWeekView = "nav-week-view"
    case otherPalette = "other-palette"
    case otherSettings = "other-settings"
    case otherShortcuts = "other-shortcuts"
}

public enum MainMenuActionKind: Equatable, Sendable {
    case separator
    case dispatchShortcut(MainMenuShortcutName)
    case showAbout
    case quit
    case openSettings
    case openHelp
    case shareFeedback
    case checkForUpdates
    case restartToUpdate
    case switchToStaging
    case switchToProduction
    case toggleNativeUI
    case nativeThemeLightBeach
    case nativeThemeDarkAbyss
    case standardEdit(String)
}

public struct MainMenuRow: Equatable, Sendable {
    public let title: String
    public let action: MainMenuActionKind
    public let keyEquivalent: MacKeyEquivalent?

    public init(title: String, action: MainMenuActionKind, keyEquivalent: MacKeyEquivalent? = nil) {
        self.title = title
        self.action = action
        self.keyEquivalent = keyEquivalent
    }
}

public struct MainMenuSection: Equatable, Sendable {
    public let title: String
    public let rows: [MainMenuRow]

    public init(title: String, rows: [MainMenuRow]) {
        self.title = title
        self.rows = rows
    }
}

/// Data model for the AppKit main menu. Key equivalents mirror the web keymap.
public enum MainMenuModel {
    public static let shortcutKeyEquivalents: [MainMenuShortcutName: MacKeyEquivalent] = [
        .createTimed: MacKeyEquivalent(key: "c"),
        .navToday: MacKeyEquivalent(key: "t"),
        .navDayView: MacKeyEquivalent(key: "d"),
        .navWeekView: MacKeyEquivalent(key: "w"),
        .otherPalette: MacKeyEquivalent(key: "k", command: true),
        .otherSettings: MacKeyEquivalent(key: ",", command: true),
        .otherShortcuts: MacKeyEquivalent(key: "/", command: true, shift: true),
    ]

    public static func keyEquivalent(for shortcut: MainMenuShortcutName) -> MacKeyEquivalent? {
        shortcutKeyEquivalents[shortcut]
    }

    public static func sections(showDebugMenu: Bool) -> [MainMenuSection] {
        var result: [MainMenuSection] = [
            compassSection,
            fileSection,
            editSection,
            viewSection,
            windowSection,
            helpSection,
        ]
        if showDebugMenu {
            result.append(debugSection)
        }
        return result
    }

    private static var compassSection: MainMenuSection {
        MainMenuSection(
            title: "Compass",
            rows: [
                MainMenuRow(title: "About Compass", action: .showAbout),
                MainMenuRow(title: "Check for Updates…", action: .checkForUpdates),
                MainMenuRow(title: "Restart to update", action: .restartToUpdate),
                MainMenuRow(title: "", action: .separator),
                MainMenuRow(
                    title: "Settings…",
                    action: .openSettings,
                    keyEquivalent: shortcutKeyEquivalents[.otherSettings]),
                MainMenuRow(title: "", action: .separator),
                MainMenuRow(title: "Quit Compass", action: .quit, keyEquivalent: MacKeyEquivalent(key: "q", command: true)),
            ])
    }

    private static var fileSection: MainMenuSection {
        MainMenuSection(
            title: "File",
            rows: [
                MainMenuRow(
                    title: "New Event",
                    action: .dispatchShortcut(.createTimed),
                    keyEquivalent: shortcutKeyEquivalents[.createTimed]),
            ])
    }

    private static var editSection: MainMenuSection {
        MainMenuSection(
            title: "Edit",
            rows: [
                MainMenuRow(
                    title: "Undo",
                    action: .standardEdit("undo:"),
                    keyEquivalent: MacKeyEquivalent(key: "z", command: true)),
                MainMenuRow(
                    title: "Redo",
                    action: .standardEdit("redo:"),
                    keyEquivalent: MacKeyEquivalent(key: "z", command: true, shift: true)),
                MainMenuRow(title: "", action: .separator),
                MainMenuRow(title: "Cut", action: .standardEdit("cut:"), keyEquivalent: MacKeyEquivalent(key: "x", command: true)),
                MainMenuRow(title: "Copy", action: .standardEdit("copy:"), keyEquivalent: MacKeyEquivalent(key: "c", command: true)),
                MainMenuRow(title: "Paste", action: .standardEdit("paste:"), keyEquivalent: MacKeyEquivalent(key: "v", command: true)),
                MainMenuRow(
                    title: "Select All",
                    action: .standardEdit("selectAll:"),
                    keyEquivalent: MacKeyEquivalent(key: "a", command: true)),
            ])
    }

    private static var viewSection: MainMenuSection {
        MainMenuSection(
            title: "View",
            rows: [
                MainMenuRow(
                    title: "Today",
                    action: .dispatchShortcut(.navToday),
                    keyEquivalent: shortcutKeyEquivalents[.navToday]),
                MainMenuRow(
                    title: "Day",
                    action: .dispatchShortcut(.navDayView),
                    keyEquivalent: shortcutKeyEquivalents[.navDayView]),
                MainMenuRow(
                    title: "Week",
                    action: .dispatchShortcut(.navWeekView),
                    keyEquivalent: shortcutKeyEquivalents[.navWeekView]),
                MainMenuRow(
                    title: "Command Palette",
                    action: .dispatchShortcut(.otherPalette),
                    keyEquivalent: shortcutKeyEquivalents[.otherPalette]),
            ])
    }

    private static var windowSection: MainMenuSection {
        MainMenuSection(
            title: "Window",
            rows: [
                MainMenuRow(title: "Minimize", action: .standardEdit("performMiniaturize:"), keyEquivalent: MacKeyEquivalent(key: "m", command: true)),
                MainMenuRow(title: "Close", action: .standardEdit("performClose:"), keyEquivalent: MacKeyEquivalent(key: "w", command: true)),
            ])
    }

    private static var helpSection: MainMenuSection {
        MainMenuSection(
            title: "Help",
            rows: [
                MainMenuRow(
                    title: "Compass Help",
                    action: .openHelp,
                    keyEquivalent: shortcutKeyEquivalents[.otherShortcuts]),
                MainMenuRow(title: "Share Feedback…", action: .shareFeedback),
            ])
    }

    private static var debugSection: MainMenuSection {
        MainMenuSection(
            title: "Debug",
            rows: [
                MainMenuRow(title: "Use Native UI", action: .toggleNativeUI),
                MainMenuRow(title: "Native Theme: Light Beach", action: .nativeThemeLightBeach),
                MainMenuRow(title: "Native Theme: Dark Abyss", action: .nativeThemeDarkAbyss),
                MainMenuRow(title: "", action: .separator),
                MainMenuRow(title: "Switch to Staging", action: .switchToStaging),
                MainMenuRow(title: "Switch to Production", action: .switchToProduction),
            ])
    }
}

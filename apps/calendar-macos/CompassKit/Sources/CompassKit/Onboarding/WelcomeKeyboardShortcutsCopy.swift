import Foundation

/// Web `packages/core/src/onboarding/welcome-keyboard-shortcuts.content.ts`.
public enum WelcomeKeyboardShortcutsCopy {
    public static let title = "Essential shortcuts"
    public static let subtitle =
        "These keys work on your calendar as soon as you continue."
    public static let continueLabel = "Continue to calendar"

    public struct Row: Sendable {
        public let label: String
        public let keycaps: [String]

        public init(label: String, keycaps: [String]) {
            self.label = label
            self.keycaps = keycaps
        }
    }

    public static let rows: [Row] = [
        Row(label: "Create an event", keycaps: ["C"]),
        Row(label: "Open the command palette", keycaps: ["Mod", "K"]),
        Row(label: "Show every shortcut", keycaps: ["?"]),
        Row(label: "Go to today", keycaps: ["T"]),
    ]
}

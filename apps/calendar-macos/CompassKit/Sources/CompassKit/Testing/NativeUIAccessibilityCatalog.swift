import Foundation

/// Stable accessibility identifiers XCUITest and audits expect on native surfaces.
public enum NativeUIAccessibilityCatalog {
    public static let demoWeekGridBaseline: [String] = [
        "Compass",
        "compass-native-demo-events-banner",
        "compass-native-header",
        "compass-native-sidebar",
        "compass-native-content",
        "compass-grid-timed",
    ]

    public static let commandPalette: [String] = [
        "compass-native-command-palette",
        "compass-native-command-palette-search",
        "compass-native-palette-item-today",
        "compass-native-palette-item-practice-shortcuts",
    ]

    public static let shortcutsLegend: [String] = [
        "compass-native-shortcuts-legend",
    ]

    public static let lifeView: [String] = [
        "compass-native-life-grid",
    ]

    public static let blockParty: [String] = [
        "block-party-overlay",
        "block-party-practice-grid",
    ]

    public static let welcome: [String] = [
        "compass-native-welcome-modal",
    ]

    public static let eventForm: [String] = [
        "compass-event-form",
        "compass-event-form-title",
    ]

    public static let recurrenceScope: [String] = [
        "compass-native-status-toast",
    ]

    public static let allUniqueSorted: [String] = {
        Array(
            Set(
                demoWeekGridBaseline
                    + commandPalette
                    + shortcutsLegend
                    + lifeView
                    + blockParty
                    + welcome
                    + eventForm
                    + recurrenceScope
            )
        ).sorted()
    }()
}

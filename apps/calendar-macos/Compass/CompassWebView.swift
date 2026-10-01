import AppKit

/// Mirrors `window.compassDesktop.version` on the main window for XCUITest.
enum CompassBridgeAccessibility {
    private static let bridgeVersionKey = "CompassBridgeVersion"
    private static let lastShortcutKey = "CompassLastDispatchedShortcut"

    @MainActor
    static func publishBridgeVersion(_ version: String?, on window: NSWindow?) {
        window?.setAccessibilityValue(version)
        window?.setAccessibilityIdentifier(bridgeVersionKey)
    }

    @MainActor
    static func publishLastDispatchedShortcut(_ shortcut: String?, on window: NSWindow?) {
        window?.setAccessibilityHelp(shortcut)
        window?.setAccessibilityIdentifier(lastShortcutKey)
    }
}

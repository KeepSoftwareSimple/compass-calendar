import AppKit

/// Mirrors `window.compassDesktop.version` on the main window for XCUITest.
enum CompassBridgeAccessibility {
    private static let bridgeVersionKey = "CompassBridgeVersion"

    @MainActor
    static func publishBridgeVersion(_ version: String?, on window: NSWindow?) {
        window?.setAccessibilityValue(version)
        window?.setAccessibilityIdentifier(bridgeVersionKey)
    }

    @MainActor
    static func publishLastDispatchedShortcut(_ shortcut: String?, on window: NSWindow?) {
        // Keep the bridge-version identifier stable so XCUITest can read help on
        // the same window element it already resolved as "Compass".
        window?.setAccessibilityHelp(shortcut)
    }
}

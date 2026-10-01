import AppKit

/// Mirrors `window.compassDesktop.version` on the main window for XCUITest.
enum CompassBridgeAccessibility {
    private static let bridgeProbeIdentifier = "CompassBridgeVersion"

    @MainActor
    static func publishBridgeVersion(_ version: String?, on window: NSWindow?) {
        window?.setAccessibilityValue(version)
        window?.setAccessibilityIdentifier(bridgeProbeIdentifier)
    }

    @MainActor
    static func publishLastDispatchedShortcut(_ shortcut: String?, on window: NSWindow?) {
        // Mirror on `value` like bridge.version: NSWindow does not reliably expose
        // `help` to XCUITest, but value updates on the stable identifier do.
        window?.setAccessibilityValue(shortcut)
    }
}

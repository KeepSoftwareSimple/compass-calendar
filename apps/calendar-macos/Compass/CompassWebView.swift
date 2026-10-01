import AppKit

/// Mirrors `window.compassDesktop.version` on the main window for XCUITest.
enum CompassBridgeAccessibility {
<<<<<<< HEAD
    private static let bridgeVersionKey = "CompassBridgeVersion"
=======
    private static let bridgeProbeIdentifier = "CompassBridgeVersion"
>>>>>>> cece70324 (fix(desktop): retain main menu controller for shortcut dispatch)

    @MainActor
    static func publishBridgeVersion(_ version: String?, on window: NSWindow?) {
        window?.setAccessibilityValue(version)
        window?.setAccessibilityIdentifier(bridgeProbeIdentifier)
    }

    @MainActor
    static func publishLastDispatchedShortcut(_ shortcut: String?, on window: NSWindow?) {
<<<<<<< HEAD
        // Mirror on `value` like bridge.version: NSWindow does not reliably expose
        // `help` to XCUITest, but value updates on the stable identifier do.
        window?.setAccessibilityValue(shortcut)
=======
        // Keep the same identifier as bridge version so XCUITest reads value and
        // help on one window element.
        window?.setAccessibilityHelp(shortcut)
        window?.setAccessibilityIdentifier(bridgeProbeIdentifier)
>>>>>>> cece70324 (fix(desktop): retain main menu controller for shortcut dispatch)
    }
}

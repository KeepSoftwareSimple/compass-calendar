import AppKit

/// Mirrors `window.compassDesktop.version` on the main window for XCUITest.
enum CompassBridgeAccessibility {
    @MainActor
    static func publishBridgeVersion(_ version: String?, on window: NSWindow?) {
        window?.setAccessibilityValue(version)
    }
}

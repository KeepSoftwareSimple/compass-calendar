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

    @MainActor
    static func publishDeepLinkNavigationPath(_ path: String?, on window: NSWindow?) {
        // Keep path on `label` so bridge.version polling can keep using `value`
        // without clobbering the deep-link probe (see publishBridgeVersion).
        window?.setAccessibilityLabel(path)
    }

    /// Native grid focus for XCUITest (`NativeLaunchTests`). Same transport as
    /// `publishLastDispatchedShortcut`: the main window `value` is observable in CI.
    @MainActor
    static func prepareNativeRootWindowForXCUITest(_ window: NSWindow?) {
        window?.setAccessibilityIdentifier("Compass")
        window?.setAccessibilityValue("")
    }

    @MainActor
    static func publishNativeGridFocusedEventTitle(_ title: String?, on window: NSWindow?) {
        guard let window else { return }
        window.setAccessibilityIdentifier("Compass")
        if let title, !title.isEmpty {
            window.setAccessibilityValue(title)
        } else {
            window.setAccessibilityValue("")
        }
        NSAccessibility.post(element: window, notification: .valueChanged)
    }
}

import AppKit
import CompassData

/// Window accessibility values for XCUITest (grid focus, deep links).
enum NativeAccessibilityProbes {
    @MainActor
    static func publishLastDispatchedShortcut(_ shortcut: String?, on window: NSWindow?) {
        window?.setAccessibilityValue(shortcut)
    }

    @MainActor
    static func publishDeepLinkNavigationPath(_ path: String?, on window: NSWindow?) {
        window?.setAccessibilityLabel(path)
    }

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

    /// XCUITest-only mirror: `"undo-ready"` after a create records native undo.
    @MainActor
    static func publishNativeUndoReadyForUITest(on window: NSWindow?) {
        guard UITestLaunchPolicy.syncGridDraftSave, let window else { return }
        window.setAccessibilityIdentifier("Compass")
        window.setAccessibilityValue("undo-ready")
        NSAccessibility.post(element: window, notification: .valueChanged)
    }
}

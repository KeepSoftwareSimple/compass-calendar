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
        guard let window else { return }
        window.setAccessibilityLabel(path)
        NSAccessibility.post(element: window, notification: .valueChanged)
    }

    @MainActor
    static func prepareNativeRootWindowForXCUITest(_ window: NSWindow?) {
        window?.setAccessibilityIdentifier("Compass")
        window?.setAccessibilityValue("")
    }

    @MainActor
    static func publishParityExport(surface: String, on window: NSWindow?) {
        window?.setAccessibilityValue("parity-exported:\(surface)")
        if let window {
            NSAccessibility.post(element: window, notification: .valueChanged)
        }
    }

    @MainActor
    static func publishNativeGridFocusedEventTitle(_ title: String?, on window: NSWindow?) {
        guard let window else { return }
        window.setAccessibilityIdentifier("Compass")
        // Wide viewport XCTest keeps geometry on the window value mirror.
        guard !UITestLaunchPolicy.meetingLinkWideViewport else { return }
        if let title, !title.isEmpty {
            window.setAccessibilityValue(title)
        } else {
            window.setAccessibilityValue("")
        }
        NSAccessibility.post(element: window, notification: .valueChanged)
    }
}

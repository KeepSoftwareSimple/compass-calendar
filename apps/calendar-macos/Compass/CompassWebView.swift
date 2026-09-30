import AppKit
import WebKit

/// Hosts page content. XCUITest matches the inner WebKit web-area node as
/// `app.webViews[...]`, not the outer `WKWebView`, so UITest hooks are
/// applied across the subtree (see `UITestAccessibility`).
final class CompassWebView: WKWebView {
    static let accessibilityContractIdentifier = "CompassWebView"

    /// Bridge version from the loaded page, exposed as accessibilityValue.
    var bridgeVersionForUITests: String?

    override func layout() {
        super.layout()
        applyUITestAccessibilityContract()
    }

    func applyUITestAccessibilityContract() {
        UITestAccessibility.apply(to: self, version: bridgeVersionForUITests)
    }
}

enum UITestAccessibility {
    static func apply(to root: NSView, version: String?) {
        visit(root, version: version)
    }

    private static func visit(_ view: NSView, version: String?) {
        let role = view.accessibilityRole()
        if view is WKWebView || role == .webArea {
            view.setAccessibilityIdentifier(CompassWebView.accessibilityContractIdentifier)
            if let version {
                view.setAccessibilityValue(version)
            }
        }
        for subview in view.subviews {
            visit(subview, version: version)
        }
    }
}

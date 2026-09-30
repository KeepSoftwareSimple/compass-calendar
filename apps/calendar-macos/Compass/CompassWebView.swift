import AppKit
import WebKit

/// Hosts page content. XCUITest matches the inner WebKit web-area node as
/// `app.webViews[...]`, not the outer `WKWebView`, so UITest hooks are
/// applied across the subtree (see `UITestAccessibility`).
@MainActor
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

@MainActor
enum UITestAccessibility {
    private static let webAreaRoleRawValue = "AXWebArea"

    static func apply(to root: NSView, version: String?) {
        visit(root, version: version)
    }

    private static func visit(_ view: NSView, version: String?) {
        let roleRaw = view.accessibilityRole()?.rawValue
        if view is WKWebView || roleRaw == webAreaRoleRawValue {
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

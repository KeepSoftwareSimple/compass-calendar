import AppKit
import WebKit

/// Native mirror of `window.compassDesktop.version` for XCUITest. WebKit exposes
/// the page as a separate accessibility WebView, so the shell publishes the
/// bridge version on this element (identifier `CompassWebView`).
@MainActor
final class CompassBridgeAccessibilityHost: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityElement(true)
        setAccessibilityIdentifier("CompassWebView")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    func setBridgeVersion(_ version: String?) {
        setAccessibilityValue(version)
    }
}

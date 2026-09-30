import AppKit

/// Native mirror of `window.compassDesktop.version` for XCUITest. WebKit exposes
/// the page as a separate accessibility WebView, so the shell publishes the
/// bridge version on this element (identifier `CompassWebView`).
@MainActor
final class CompassBridgeAccessibilityHost: NSTextField {
    init() {
        super.init(frame: NSRect(x: 8, y: 8, width: 80, height: 21))
        isEditable = false
        isBezeled = false
        drawsBackground = false
        isSelectable = false
        isBordered = false
        alphaValue = 0.01
        setAccessibilityElement(true)
        setAccessibilityIdentifier("CompassWebView")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    func setBridgeVersion(_ version: String?) {
        stringValue = version ?? ""
        setAccessibilityValue(version)
    }
}

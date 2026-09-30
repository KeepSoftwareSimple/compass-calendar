import AppKit
import WebKit

/// Hosts page content. WebKit exposes page accessibility as a separate web-area
/// node XCUITest types as `WebView`, so native hooks live on
/// `CompassBridgeAccessibilityHost` (identifier `CompassWebView`).
@MainActor
final class CompassWebView: WKWebView {
    static let accessibilityContractIdentifier = "CompassWebView"

    private let bridgeAccessibilityHost = CompassBridgeAccessibilityHost()

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        installBridgeAccessibilityHostIfNeeded()
    }

    override func layout() {
        super.layout()
        installBridgeAccessibilityHostIfNeeded()
    }

    func setBridgeVersionForUITests(_ version: String?) {
        bridgeAccessibilityHost.setBridgeVersion(version)
    }

    private func installBridgeAccessibilityHostIfNeeded() {
        guard bridgeAccessibilityHost.superview !== self else { return }
        bridgeAccessibilityHost.translatesAutoresizingMaskIntoConstraints = false
        addSubview(bridgeAccessibilityHost)
        NSLayoutConstraint.activate([
            bridgeAccessibilityHost.leadingAnchor.constraint(equalTo: leadingAnchor),
            bridgeAccessibilityHost.topAnchor.constraint(equalTo: topAnchor),
            bridgeAccessibilityHost.widthAnchor.constraint(equalToConstant: 1),
            bridgeAccessibilityHost.heightAnchor.constraint(equalToConstant: 1),
        ])
    }
}

@MainActor
final class CompassBridgeAccessibilityHost: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityElement(true)
        setAccessibilityIdentifier(CompassWebView.accessibilityContractIdentifier)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    func setBridgeVersion(_ version: String?) {
        setAccessibilityValue(version)
    }
}

import AppKit
import CompassKit
import WebKit

/// Hosts the web app. Navigations off the app origin and every
/// `window.open` go to the default browser.
final class WebViewController: NSViewController, WKNavigationDelegate, WKUIDelegate {
    private let appURL: URL
    private var webView: CompassWebView!
    private let bridgeHandler = CompassBridgeHandler()

    init(appURL: URL) {
        self.appURL = appURL
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()

        let contentController = WKUserContentController()
        contentController.add(bridgeHandler, name: "compass")

        let origin = appURL.originString
        let script = WKUserScript(
            source: BridgeScript.userScriptSource(appOrigin: origin),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true)
        contentController.addUserScript(script)
        configuration.userContentController = contentController

        webView = CompassWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        #if DEBUG
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        #endif
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: appURL))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let compassWebView = webView as? CompassWebView else { return }
        compassWebView.evaluateJavaScript(BridgeScript.readBridgeVersionJavaScript) {
            [weak compassWebView] result, _ in
            Task { @MainActor in
                guard let compassWebView else { return }
                compassWebView.setBridgeVersionForUITests(result as? String)
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        switch AppOrigin.decide(url, isMainFrame: isMainFrame, appURL: appURL) {
        case .allow:
            decisionHandler(.allow)
        case .openExternally:
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}

private extension URL {
    var originString: String {
        guard let host else { return "" }
        if let port {
            return "\(scheme ?? "https")://\(host):\(port)"
        }
        return "\(scheme ?? "https")://\(host)"
    }
}
